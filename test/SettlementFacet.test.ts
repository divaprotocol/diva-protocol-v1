import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, ContractTransaction } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
  GetterFacet,
  GovernanceFacet,
  LiquidityFacet,
  MockERC20,
  MockERC721,
  PoolFacet,
  PositionToken,
  SettlementFacet,
} from "../typechain-types";
import { LibDIVAStorage } from "../typechain-types/contracts/facets/GetterFacet";

import {
  getExpiryTime,
  getLastTimestamp,
  setNextTimestamp,
  mineBlock,
  calcFee,
  calcPayoffPerToken,
  calcPayout,
  getPoolIdFromTx,
} from "../utils";
import { GovParams, PayoffsPerToken, ONE_DAY } from "../constants";
import { deployMain } from "../scripts/deployMain";

import {
  erc20DeployFixture,
  erc721DeployFixture,
  positionTokenAttachFixture,
  fakePositionTokenDeployFixture,
  erc20AttachFixture,
} from "./fixtures";

// -------
// Input: Collateral token decimals (>= 6 && <= 18)
// -------
const decimals = 6;

const MAX_UINT = ethers.constants.MaxUint256;

describe("SettlementFacet", async function () {
  let contractOwner: SignerWithAddress,
    treasury: SignerWithAddress,
    oracle: SignerWithAddress,
    user1: SignerWithAddress,
    user2: SignerWithAddress,
    fallbackOracle: SignerWithAddress,
    accounts: SignerWithAddress[];

  let diamondAddress: string;
  let poolFacet: PoolFacet,
    getterFacet: GetterFacet,
    settlementFacet: SettlementFacet,
    liquidityFacet: LiquidityFacet,
    governanceFacet: GovernanceFacet;

  let submissionPeriod: number,
    challengePeriod: number,
    reviewPeriod: number,
    fallbackSubmissionPeriod: number;
  let currentBlockTimestamp: number;
  let nextBlockTimestamp: number;
  let submissionPeriodEndTime: BigNumber;

  let poolId: BigNumber;
  let poolId1: BigNumber;
  let poolId2: BigNumber;
  let poolParams: LibDIVAStorage.PoolStructOutput,
    poolParamsBefore: LibDIVAStorage.PoolStructOutput,
    poolParamsBefore1: LibDIVAStorage.PoolStructOutput,
    poolParamsBefore2: LibDIVAStorage.PoolStructOutput,
    poolParamsAfter: LibDIVAStorage.PoolStructOutput,
    poolParamsAfter1: LibDIVAStorage.PoolStructOutput,
    poolParamsAfter2: LibDIVAStorage.PoolStructOutput;

  let govParams: GovParams,
    govParamsBefore: GovParams,
    govParamsAfter: GovParams;

  let finalReferenceValue: BigNumber,
    finalReferenceValue1: BigNumber,
    finalReferenceValue2: BigNumber;
  let allowChallenge: boolean;

  let shortTokenInstance: PositionToken,
    longTokenInstance: PositionToken,
    collateralTokenInstance: MockERC20;

  let shortTokenBalanceBefore: BigNumber;
  let longTokenBalanceBefore: BigNumber;

  let fee: BigNumber;
  let protocolFee: BigNumber;
  let settlementFee: BigNumber;
  let payoffsPerToken: PayoffsPerToken;

  let fallbackPeriodEndTime: BigNumber;
  let governanceDelay: number = 60 * ONE_DAY;

  before(async function () {
    [
      contractOwner,
      treasury,
      oracle,
      fallbackOracle,
      user1,
      user2,
      ...accounts
    ] = await ethers.getSigners(); // keep contractOwner and treasury at first two positions in line with deploy script

    // ---------
    // Setup: Deploy diamond contract (incl. facets) and connect to the diamond contract via facet specific ABI's
    // ---------
    diamondAddress = (await deployMain())[0];
    poolFacet = await ethers.getContractAt("PoolFacet", diamondAddress);
    liquidityFacet = await ethers.getContractAt(
      "LiquidityFacet",
      diamondAddress
    );
    settlementFacet = await ethers.getContractAt(
      "SettlementFacet",
      diamondAddress
    );
    getterFacet = await ethers.getContractAt("GetterFacet", diamondAddress);
    governanceFacet = await ethers.getContractAt(
      "GovernanceFacet",
      diamondAddress
    );

    govParams = await getterFacet.getGovernanceParameters();
    submissionPeriod = govParams.currentSettlementPeriods.submissionPeriod; // 7d (initial value)
    challengePeriod = govParams.currentSettlementPeriods.challengePeriod; // 2d (initial value)
    reviewPeriod = govParams.currentSettlementPeriods.reviewPeriod; // 5d (initial value)
    fallbackSubmissionPeriod =
      govParams.currentSettlementPeriods.fallbackSubmissionPeriod; // 10d (initial value)

    // Fast forward in time to activate any changes done in previous tests outside of this file
    nextBlockTimestamp = (await getLastTimestamp()) + governanceDelay + 1;
    await mineBlock(nextBlockTimestamp);

    // Use fallbackOracle as the fallback data provider in these tests instead of first account
    await governanceFacet
        .connect(contractOwner)
        .updateFallbackDataProvider(fallbackOracle.address);
    nextBlockTimestamp = (await getLastTimestamp()) + governanceDelay + 1;
    await mineBlock(nextBlockTimestamp);
  });

  describe("settlement related functions", async () => {
    let user1StartCollateralTokenBalance: number;
    let feesParams: LibDIVAStorage.FeesStructOutput;
    let reviewPeriodEndTime: BigNumber;
    let challengePeriodEndTime: BigNumber;
    let timeOfChallenge: number;
    let proposedFinalReferenceValue: BigNumber;
    let proposedFinalReferenceValue1: BigNumber;
    let proposedFinalReferenceValue2: BigNumber;
    let tokensToRedeem: BigNumber;

    beforeEach(async () => {      
      // ---------
      // Arrange: Equip user1 with collateral tokens, approve collateral token for diamond contract, and specify default parameters for test
      // ---------
      user1StartCollateralTokenBalance = 100000;

      // Mint ERC20 collateral token with `decimals` decimals and send it to user 1
      collateralTokenInstance = await erc20DeployFixture(
        "DummyCollateralToken",
        "DCT",
        parseUnits(user1StartCollateralTokenBalance.toString(), decimals),
        user1.address,
        decimals
      );

      // Set user1 allowances for Diamond contract
      await collateralTokenInstance
        .connect(user1)
        .approve(
          diamondAddress,
          parseUnits(user1StartCollateralTokenBalance.toString(), decimals)
        );
    });

    // Function to create a contingent pool pre-populated with default values that can be overwritten depending on the test case
    async function createContingentPool({
      referenceAsset = "BTC/USD",
      expireInSeconds = 0,
      floor = 1198.53,
      inflection = 1605.33,
      cap = 2001.17,
      gradient = 0.33,
      collateralAmount = 15001.358,
      collateralToken = collateralTokenInstance.address,
      dataProvider = oracle.address,
      capacity = MAX_UINT,
      longRecipient = user1.address,
      shortRecipient = user1.address, // set equal to longRecipient as non-equal case is covered in PoolFacet.test.js
      permissionedERC721Token = ethers.constants.AddressZero,
      poolCreater = user1,
    } = {}): Promise<ContractTransaction> {
      if (typeof cap === 'number') {
        cap = parseUnits(cap.toString());
      }
      return await poolFacet.connect(poolCreater).createContingentPool({
        referenceAsset,
        expiryTime: await getExpiryTime(expireInSeconds),
        floor: parseUnits(floor.toString()),
        inflection: parseUnits(inflection.toString()),
        cap: cap,
        gradient: parseUnits(gradient.toString(), decimals),
        collateralAmount: parseUnits(collateralAmount.toString(), decimals),
        collateralToken,
        dataProvider,
        capacity,
        longRecipient,
        shortRecipient,
        permissionedERC721Token,
      });
    }

    describe("setFinalReferenceValue", async () => {
      beforeEach(async () => {
        // ---------
        // Arrange: Create a contingent pool and fast forward in time post pool expiration
        // ---------
        const tx = await createContingentPool({
          expireInSeconds: 2,
        });
        poolId = await getPoolIdFromTx(tx);
        poolParamsBefore = await getterFacet.getPoolParameters(poolId);
                
        // Fast forward in time past pool expiration
        nextBlockTimestamp = Number(poolParamsBefore.expiryTime) + 1;
        await mineBlock(nextBlockTimestamp);

        currentBlockTimestamp = await getLastTimestamp();
      });

      // -------------------------------------------
      // Functionality
      // -------------------------------------------

      it("Should set the final value and update the status to 1 = Submitted when the data provider submits within the submission period and possibility to challenge is enabled", async () => {
        // ---------
        // Arrange: Check that pool has expired, we are still within the submission period and no final value has been set yet
        // ---------
        expect(poolParamsBefore.expiryTime).to.be.lte(currentBlockTimestamp); // pool expired
        submissionPeriodEndTime =
          poolParamsBefore.expiryTime.add(submissionPeriod);
        expect(currentBlockTimestamp).to.be.lte(submissionPeriodEndTime); // still within submission period
        expect(poolParamsBefore.statusFinalReferenceValue).to.eq(0); // no final value set yet
        expect(poolParamsBefore.finalReferenceValue).to.eq(0);

        // ---------
        // Act: Set final reference value and allow challenge
        // ---------
        finalReferenceValue = parseUnits("1605.33");
        allowChallenge = true;
        await settlementFacet
          .connect(oracle)
          .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge);

        // ---------
        // Assert: Check that the final reference value has been set and the status updated to 1 = Submitted
        // ---------
        poolParamsAfter = await getterFacet.getPoolParameters(poolId);
        expect(poolParamsAfter.finalReferenceValue).to.eq(finalReferenceValue);
        expect(poolParamsAfter.statusFinalReferenceValue).to.eq(1); // 1 = Submitted
      });

      it("Should set the final value and update the status to 3 = Confirmed when the data provider submits within the submission period and the possibility to challenge is disabled", async () => {
        // ---------
        // Arrange: Check that pool has expired, we are still within the submission period and no final value has been set yet
        // ---------
        expect(poolParamsBefore.expiryTime).to.be.lte(currentBlockTimestamp); // pool expired
        submissionPeriodEndTime =
          poolParamsBefore.expiryTime.add(submissionPeriod);
        expect(currentBlockTimestamp).to.be.lte(submissionPeriodEndTime); // still within submission period
        expect(poolParamsBefore.statusFinalReferenceValue).to.eq(0); // no final value set yet
        expect(poolParamsBefore.finalReferenceValue).to.eq(0);

        // ---------
        // Act: Set final reference value and DO NOT allow challenge
        // ---------
        finalReferenceValue = parseUnits("1605.33");
        allowChallenge = false;
        await settlementFacet
          .connect(oracle)
          .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge);

        // ---------
        // Assert: Check that the final reference value has been set and the status updated to 3 = Confirmed
        // ---------
        poolParamsAfter = await getterFacet.getPoolParameters(poolId);
        expect(poolParamsAfter.finalReferenceValue).to.eq(finalReferenceValue);
        expect(poolParamsAfter.statusFinalReferenceValue).to.eq(3); // 3 = Confirmed
      });

      describe("Tests requiring final value submission within the submission period without the possibility to challenge", async () => {
        beforeEach(async () => {
          // ---------
          // Arrange: Data provider submits a value during the submission period and disables the possibility to challenge
          // ---------
          expect(poolParamsBefore.expiryTime).to.be.lte(currentBlockTimestamp); // pool expired
          submissionPeriodEndTime =
            poolParamsBefore.expiryTime.add(submissionPeriod);
          expect(currentBlockTimestamp).to.be.lte(submissionPeriodEndTime); // still within submission period
          expect(poolParamsBefore.statusFinalReferenceValue).to.eq(0); // no final value set yet
          expect(poolParamsBefore.finalReferenceValue).to.eq(0);

          finalReferenceValue = parseUnits("1605.33");
          allowChallenge = false;
        });

        it("Should set the payout amounts for long and short token", async () => {
          // ---------
          // Arrange: Check that both `payoutLong` and `payoutShort` are zero (initial state when pool is created)
          // ---------
          expect(poolParamsBefore.payoutLong).to.be.eq(0);
          expect(poolParamsBefore.payoutShort).to.be.eq(0);

          // ---------
          // Act: Data provider confirms final reference value by submitting it and disabling the possibility to challenge
          // ---------
          await settlementFacet
            .connect(oracle)
            .setFinalReferenceValue(
              poolId,
              finalReferenceValue,
              allowChallenge
            );

          // ---------
          // Assert: Confirm that the payout amount per long and short token (net of fees) is set correctly
          // ---------
          poolParamsAfter = await getterFacet.getPoolParameters(poolId);
          feesParams = await getterFacet.getFees(poolParamsAfter.indexFees);
          fee = feesParams.protocolFee.add(feesParams.settlementFee);
          payoffsPerToken = calcPayoffPerToken(
            poolParamsBefore.floor,
            poolParamsBefore.inflection,
            poolParamsBefore.cap,
            poolParamsAfter.gradient,
            finalReferenceValue,
            decimals,
            fee
          );

          expect(poolParamsAfter.payoutLong).to.eq(
            payoffsPerToken.payoffLongNet
          );
          expect(poolParamsAfter.payoutShort).to.eq(
            payoffsPerToken.payoffShortNet
          );
        });

        it("Should allocate protocol fees to DIVA treasury", async () => {
          // ---------
          // Arrange: Confirm that DIVA treasury fee claim is zero
          // ---------
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              treasury.address
            )
          ).to.eq(0);

          // ---------
          // Act: Data provider confirms final reference value by submitting it and disabling the possibility to challenge
          // ---------
          await settlementFacet
            .connect(oracle)
            .setFinalReferenceValue(
              poolId,
              finalReferenceValue,
              allowChallenge
            );

          // ---------
          // Assert: Confirm that the protocol fees have been allocated to the DIVA treasury
          // ---------
          feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
          protocolFee = calcFee(
            feesParams.protocolFee,
            poolParamsBefore.collateralBalance,
            decimals
          );
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              treasury.address
            )
          ).to.eq(protocolFee);
        });

        it("Should allocate protocol fees to new DIVA treasury if it changes before the pool gets confirmed", async () => {
          // ---------
          // Arrange: Confirm that DIVA treasury fee claim is zero for both current and new address,
          // and update treasury address and activate it by fast forwarding in time
          // ---------
          // Define a new treasury address and confirm that it's not equal to the current one
          const newTreasuryAddress = user2.address;
          govParamsBefore = await getterFacet.getGovernanceParameters();
          const currentTreasuryAddress = govParamsBefore.treasury
          expect(currentTreasuryAddress).to.not.eq(newTreasuryAddress);
          
          // Get fee claim for current treasury
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              currentTreasuryAddress
            )
          ).to.eq(0);

          // Get fee claim for new treasury
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              newTreasuryAddress
            )
          ).to.eq(0);

          // Update of treasury address
          await governanceFacet
            .connect(contractOwner)
            .updateTreasury(newTreasuryAddress);

          // Fast forward in time to activate the new treasury address
          nextBlockTimestamp = (await getterFacet.getTreasuryInfo()).startTimeTreasury.toNumber();
          await mineBlock(nextBlockTimestamp);

          // ---------
          // Act: Data provider confirms final reference value by submitting it and disabling the possibility to challenge
          // ---------
          await settlementFacet
            .connect(oracle)
            .setFinalReferenceValue(
              poolId,
              finalReferenceValue,
              allowChallenge
            );

          // ---------
          // Assert: Confirm that the protocol fees have been allocated to the new DIVA treasury
          // ---------
          feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
          protocolFee = calcFee(
            feesParams.protocolFee,
            poolParamsBefore.collateralBalance,
            decimals
          );
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              currentTreasuryAddress
            )
          ).to.eq(0);
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              newTreasuryAddress
            )
          ).to.eq(protocolFee);

          // ---------
          // Reset: Update treasury address to the one expected by other tests
          // ---------
          await governanceFacet
            .connect(contractOwner)
            .updateTreasury(treasury.address);

          // Fast forward in time to activate the new treasury address
          nextBlockTimestamp = (await getterFacet.getTreasuryInfo()).startTimeTreasury.toNumber();
          await mineBlock(nextBlockTimestamp);
        });

        it("Should allocate protocol fees to previous DIVA treasury if an update of the treasury address was triggered but not yet activated", async () => {
          // ---------
          // Arrange: Confirm that DIVA treasury fee claim is zero for both current and new address,
          // and update treasury address but do not fast forward in time to have it pending
          // ---------
          // Define a new treasury address and confirm that it's not equal to the current one
          const newTreasuryAddress = user1.address;
          govParamsBefore = await getterFacet.getGovernanceParameters();
          const currentTreasuryAddress = govParamsBefore.treasury
          expect(currentTreasuryAddress).to.not.eq(newTreasuryAddress);
          
          // Get fee claim for current treasury
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              currentTreasuryAddress
            )
          ).to.eq(0);

          // Get fee claim for new treasury
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              newTreasuryAddress
            )
          ).to.eq(0);

          // Update of treasury address
          await governanceFacet
            .connect(contractOwner)
            .updateTreasury(newTreasuryAddress);

          // Note: Not fast forwarding in time here as opposed to the previous test to not activate the new treasury address
          
          // ---------
          // Act: Data provider confirms final reference value by submitting it and disabling the possibility to challenge
          // ---------
          await settlementFacet
            .connect(oracle)
            .setFinalReferenceValue(
              poolId,
              finalReferenceValue,
              allowChallenge
            );

          // ---------
          // Assert: Confirm that the protocol fees have been allocated to the previous DIVA treasury
          // and not the new one
          // ---------
          feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
          protocolFee = calcFee(
            feesParams.protocolFee,
            poolParamsBefore.collateralBalance,
            decimals
          );
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              currentTreasuryAddress
            )
          ).to.eq(protocolFee);
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              newTreasuryAddress
            )
          ).to.eq(0);

          // ---------
          // Reset: Revoke pending treasury address change to use the one expected by other tests
          // ---------
          await governanceFacet
            .connect(contractOwner)
            .revokePendingTreasuryUpdate();            
        });

        it("Should allocate settlement fees to data provider", async () => {
          // ---------
          // Arrange: Confirms that DIVA treasury fee claim is zero
          // ---------
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              oracle.address
            )
          ).to.eq(0);

          // ---------
          // Act: Data provider confirms final reference value by submitting it and disabling the possibility to challenge
          // ---------
          await settlementFacet
            .connect(oracle)
            .setFinalReferenceValue(
              poolId,
              finalReferenceValue,
              allowChallenge
            );

          // ---------
          // Assert: Confirm that the settlement fees have been allocated to the data provider
          // ---------
          feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
          settlementFee = calcFee(
            feesParams.settlementFee,
            poolParamsBefore.collateralBalance,
            decimals
          );
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              oracle.address
            )
          ).to.eq(settlementFee);
        });
      });

      it("Should allow the fallback data provider to set a final reference value during the fallback period", async () => {
        // ---------
        // Arrange: Check that pool has expired and the submission period expired without any input
        // ---------
        expect(poolParamsBefore.expiryTime).to.be.lte(currentBlockTimestamp); // pool expired
        submissionPeriodEndTime =
          poolParamsBefore.expiryTime.add(submissionPeriod); // set submission period end
        expect(poolParamsBefore.statusFinalReferenceValue).to.eq(0); // no final value set yet
        expect(poolParamsBefore.finalReferenceValue).to.eq(0); // status is 0 = Open

        // ---------
        // Act: Fallback data provider submits a final value (enabling the possibility to challenge should not have any impact)
        // ---------
        finalReferenceValue = parseUnits("1688.17");
        allowChallenge = true;
        await setNextTimestamp(
          ethers.provider,
          submissionPeriodEndTime.add(1).toNumber()
        ); // set timestamp of next block such that it's outside of the submission period and inside the fallback period
        await settlementFacet
          .connect(fallbackOracle)
          .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge);

        // ---------
        // Assert: Check that final value is confirmed and equal to finalReferenceValue
        // ---------
        poolParamsAfter = await getterFacet.getPoolParameters(poolId);
        expect(poolParamsAfter.finalReferenceValue).to.eq(finalReferenceValue);
        expect(poolParamsAfter.statusFinalReferenceValue).to.eq(3); // 3 = Confirmed
      });

      describe("Tests requiring to be within the fallback submission period", async () => {
        beforeEach(async () => {
          // ---------
          // Arrange: The submission period expired without any input and fallback data provider submits a value
          // ---------
          expect(poolParamsBefore.expiryTime).to.be.lte(currentBlockTimestamp); // pool expired
          submissionPeriodEndTime =
            poolParamsBefore.expiryTime.add(submissionPeriod); // set submission period end
          expect(poolParamsBefore.statusFinalReferenceValue).to.eq(0); // no final value set yet
          expect(poolParamsBefore.finalReferenceValue).to.eq(0); // status is 0 = Open

          finalReferenceValue = parseUnits("1717.17");
          allowChallenge = true; // is not relevant what to put here
          await setNextTimestamp(
            ethers.provider,
            submissionPeriodEndTime.add(1).toNumber()
          ); // set timestamp of next block such that it's outside of the submission period and inside the fallback period
        });

        it("Should set the payout amounts for long and short token", async () => {
          // ---------
          // Arrange: Check that both `payoutLong` and `payoutShort` are zero (initial state when pool is created)
          // ---------
          expect(poolParamsBefore.payoutLong).to.be.eq(0);
          expect(poolParamsBefore.payoutShort).to.be.eq(0);

          // ---------
          // Act: Fallback data provider submits final reference value and thereby confirms it
          // ---------
          await settlementFacet
            .connect(fallbackOracle)
            .setFinalReferenceValue(
              poolId,
              finalReferenceValue,
              allowChallenge
            );

          // ---------
          // Assert: Confirm that the payout amount per long and short token (net of fees) is set correctly
          // ---------
          poolParamsAfter = await getterFacet.getPoolParameters(poolId);
          feesParams = await getterFacet.getFees(poolParamsAfter.indexFees);
          fee = feesParams.protocolFee.add(feesParams.settlementFee);
          payoffsPerToken = calcPayoffPerToken(
            poolParamsBefore.floor,
            poolParamsBefore.inflection,
            poolParamsBefore.cap,
            poolParamsAfter.gradient,
            finalReferenceValue,
            decimals,
            fee
          );

          expect(poolParamsAfter.payoutLong).to.eq(
            payoffsPerToken.payoffLongNet
          );
          expect(poolParamsAfter.payoutShort).to.eq(
            payoffsPerToken.payoffShortNet
          );
        });

        it("Should allocate protocol fees to DIVA treasury", async () => {
          // ---------
          // Arrange: Confirms that DIVA treasury fee claim is zero
          // ---------
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              treasury.address
            )
          ).to.eq(0);

          // ---------
          // Act: Fallback data provider submits final reference value and thereby confirms it
          // ---------
          await settlementFacet
            .connect(fallbackOracle)
            .setFinalReferenceValue(
              poolId,
              finalReferenceValue,
              allowChallenge
            );

          // ---------
          // Assert: Confirm that the protocol fees have been allocated to the DIVA treasury
          // ---------
          feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
          protocolFee = calcFee(
            feesParams.protocolFee,
            poolParamsBefore.collateralBalance,
            decimals
          );
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              treasury.address
            )
          ).to.eq(protocolFee);
        });

        it("Should allocate settlement fees to fallback data provider", async () => {
          // ---------
          // Arrange: Confirms that DIVA treasury fee claim is zero
          // ---------
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              fallbackOracle.address
            )
          ).to.eq(0);

          // ---------
          // Act: Fallback data provider submits final reference value and thereby confirms it
          // ---------
          await settlementFacet
            .connect(fallbackOracle)
            .setFinalReferenceValue(
              poolId,
              finalReferenceValue,
              allowChallenge
            );

          // ---------
          // Assert: Confirm that the settlement fees have been allocated to the fallback data provider
          // ---------
          feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
          settlementFee = calcFee(
            feesParams.settlementFee,
            poolParamsBefore.collateralBalance,
            decimals
          );
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              fallbackOracle.address
            )
          ).to.eq(settlementFee);
        });

        it("Should allocate settlement fees to the previous fallback data provider if a fallback data provider update was just triggered by the contract owner", async () => {
          // ---------
          // Arrange: Prepare and trigger update of fallback data provider address with contract owner's account
          // ---------
          // Define a new fallback data provider address and make sure it's not equal to the current one
          const newFallbackDataProvider = user1.address;
          const govParamsBefore = await getterFacet.getGovernanceParameters();
          const currentFallbackDataProvider = govParamsBefore.fallbackDataProvider;
          expect(newFallbackDataProvider).to.not.eq(currentFallbackDataProvider);

          // Confirm that new fallback data provider has zero fee claim balance
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              newFallbackDataProvider
            )
          ).to.eq(0);

          // Get current fallback data provider's fee claim balance
          const currentFallbackDataProviderClaimBalanceBefore = await getterFacet.getClaim(
            poolParamsBefore.collateralToken,
            currentFallbackDataProvider
          );

          // Contract owner triggers an update of the treasury address
          await governanceFacet
            .connect(contractOwner)
            .updateFallbackDataProvider(newFallbackDataProvider);

          // ---------
          // Act: Submit final reference with previous fallback provider shortly after `updateFallbackDataProvider`
          // (we can be sure that the new fallback data provider has not been activated yet at this stage)
          // ---------
          await settlementFacet
            .connect(fallbackOracle)
            .setFinalReferenceValue(
              poolId,
              finalReferenceValue,
              allowChallenge
            );

          // ---------
          // Assert: Confirm that the settlement fees have been allocated to the previous fallback data provider
          // and not to the pending one
          // ---------
          feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
          settlementFee = calcFee(
            feesParams.settlementFee,
            poolParamsBefore.collateralBalance,
            decimals
          );
          expect(settlementFee).to.be.gt(0);
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              newFallbackDataProvider
            )
          ).to.eq(0);
          
          // Get current fallback data provider's fee claim balance after the final value submission
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              fallbackOracle.address
            )
          ).to.eq(currentFallbackDataProviderClaimBalanceBefore.add(settlementFee));

          // ---------
          // Reset: Revoke fallback data provider address update to avoid any impact on the tests below
          // ---------
          await governanceFacet
            .connect(contractOwner)
            .revokePendingFallbackDataProviderUpdate();
        });
      });

      it("Should set the final reference value equal to inflection if submission and fallback period expired without any input (can be triggered by any user)", async () => {
        // ---------
        // Arrange: Check that pool has expired and both the submission and fallback period expired without any input
        // ---------
        expect(poolParamsBefore.expiryTime).to.be.lte(currentBlockTimestamp); // pool expired
        
        // Set fallback period end
        fallbackPeriodEndTime = poolParamsBefore.expiryTime
          .add(submissionPeriod)
          .add(fallbackSubmissionPeriod);
        expect(poolParamsBefore.statusFinalReferenceValue).to.eq(0); // no final value set yet
        expect(poolParamsBefore.finalReferenceValue).to.eq(0); // status is 0 = Open

        // ---------
        // Act: User1 triggers the `setFinalReferenceValue` function. `finalReferenceValue` and `allowChallenge` are required as inputs for `setFinalReferenceValue`, but their values don't matter in that particular scenario.
        // ---------
        finalReferenceValue = parseUnits("1688.17");
        allowChallenge = true;
        
        // Set timestamp of next block such that it's outside of the fallback submission period
        await setNextTimestamp(
          ethers.provider,
          fallbackPeriodEndTime.add(1).toNumber()
        );
        await settlementFacet
          .connect(user1)
          .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge);

        // ---------
        // Assert: Check that final value is confirmed and equal to inflection
        // ---------
        poolParamsAfter = await getterFacet.getPoolParameters(poolId);
        expect(poolParamsAfter.finalReferenceValue).to.eq(
          poolParamsAfter.inflection
        );
        expect(poolParamsAfter.statusFinalReferenceValue).to.eq(3); // 3 = Confirmed
      });

      describe("Tests requiring that both the submission and fallback submission period have passed", async () => {
        beforeEach(async () => {
          // ---------
          // Arrange: Pool expired and both the submission and fallback submission period have passed without any input
          // ---------
          expect(poolParamsBefore.expiryTime).to.be.lte(currentBlockTimestamp); // pool expired
          
          // Set fallback period end
          fallbackPeriodEndTime = poolParamsBefore.expiryTime
            .add(submissionPeriod)
            .add(fallbackSubmissionPeriod);
          expect(poolParamsBefore.statusFinalReferenceValue).to.eq(0); // no final value set yet
          expect(poolParamsBefore.finalReferenceValue).to.eq(0); // status is 0 = Open
          // `finalReferenceValue` and `allowChallenge` are required as inputs for `setFinalReferenceValue`, but their values don't matter in that particular scenario.
          finalReferenceValue = parseUnits("1.17");
          allowChallenge = true;
          // Set timestamp of next block such that it's outside of the fallback submission period
          await setNextTimestamp(
            ethers.provider,
            fallbackPeriodEndTime.add(1).toNumber()
          );
        });

        it("Should set the payout amounts for long and short token", async () => {
          // ---------
          // Arrange: Check that both `payoutLong` and `payoutShort` are zero (initial state when pool is created)
          // ---------
          expect(poolParamsBefore.payoutLong).to.be.eq(0);
          expect(poolParamsBefore.payoutShort).to.be.eq(0);

          // ---------
          // Act: User1 triggers the `setFinalReferenceValue` function. `finalReferenceValue` and `allowChallenge` are required as inputs for `setFinalReferenceValue`, but their values don't matter in that particular scenario.
          // ---------
          await settlementFacet
            .connect(user1)
            .setFinalReferenceValue(
              poolId,
              finalReferenceValue,
              allowChallenge
            );

          // ---------
          // Assert: Confirm that the payout amount per long and short token (net of fees) is set correctly
          // ---------
          poolParamsAfter = await getterFacet.getPoolParameters(poolId);
          feesParams = await getterFacet.getFees(poolParamsAfter.indexFees);
          fee = feesParams.protocolFee.add(feesParams.settlementFee);
          payoffsPerToken = calcPayoffPerToken(
            poolParamsBefore.floor,
            poolParamsBefore.inflection,
            poolParamsBefore.cap,
            poolParamsAfter.gradient,
            poolParamsBefore.inflection,
            decimals,
            fee
          );

          expect(poolParamsAfter.payoutLong).to.eq(
            payoffsPerToken.payoffLongNet
          );
          expect(poolParamsAfter.payoutShort).to.eq(
            payoffsPerToken.payoffShortNet
          );
        });

        it("Should allocate both settlement and protocol fees to DIVA treasury", async () => {
          // ---------
          // Arrange: Confirms that DIVA treasury fee claim is zero
          // ---------
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              treasury.address
            )
          ).to.eq(0);

          // ---------
          // Act: User1 triggers the `setFinalReferenceValue` function (value for `finalReferenceValue` and `allowChallenge` doesn't matter)
          // ---------
          await settlementFacet
            .connect(user1)
            .setFinalReferenceValue(
              poolId,
              finalReferenceValue,
              allowChallenge
            );

          // ---------
          // Assert: Confirm that both protocol and settlement fees have been allocated to the DIVA treasury
          // ---------
          feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
          protocolFee = calcFee(
            feesParams.protocolFee,
            poolParamsBefore.collateralBalance,
            decimals
          );
          settlementFee = calcFee(
            feesParams.settlementFee,
            poolParamsBefore.collateralBalance,
            1 // decimalsallowChallenge
          );
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              treasury.address
            )
          ).to.eq(protocolFee.add(settlementFee));
        });
      });

      it("Should confirm the final value when the data provider submits a value during the review period and disables the possibility to challenge", async () => {
        // ---------
        // Arrange: The data provider submits a value within the submission period and it gets challenged
        // ---------
        expect(poolParamsBefore.expiryTime).to.be.lte(currentBlockTimestamp); // pool expired
        submissionPeriodEndTime =
          poolParamsBefore.expiryTime.add(submissionPeriod);
        expect(currentBlockTimestamp).to.be.lte(submissionPeriodEndTime); // still within submission period
        // Data provider submits a value
        finalReferenceValue = parseUnits("1700");
        allowChallenge = true;
        await settlementFacet
          .connect(oracle)
          .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge);
        // Position token holder (user1) challenges the submitted value
        await settlementFacet
          .connect(user1)
          .challengeFinalReferenceValue(poolId, finalReferenceValue);
        // Status gets updated to 2 = Challenged
        poolParams = await getterFacet.getPoolParameters(poolId);

        reviewPeriodEndTime = poolParams.statusTimestamp.add(reviewPeriod);
        expect(poolParams.statusFinalReferenceValue).to.eq(2);

        // ---------
        // Act: The data provider submits a new value during review period and disables the possibility to challenge
        // ---------
        finalReferenceValue = parseUnits("1777"); // value doesn't play a role here
        allowChallenge = false;
        await settlementFacet
          .connect(oracle)
          .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge);

        // ---------
        // Assert: Check that final value is confirmed and equal
        // ---------
        poolParamsAfter = await getterFacet.getPoolParameters(poolId);
        expect(poolParamsAfter.finalReferenceValue).to.eq(finalReferenceValue);
        expect(poolParamsAfter.statusFinalReferenceValue).to.eq(3); // 3 = Confirmed
      });

      describe("Tests requiring the data provider to confirm the value during the review period", async () => {
        beforeEach(async () => {
          // ---------
          // Arrange: The data provider submits a value within the submission period and it gets challenged
          // ---------
          expect(poolParamsBefore.expiryTime).to.be.lte(currentBlockTimestamp); // pool expired
          submissionPeriodEndTime =
            poolParamsBefore.expiryTime.add(submissionPeriod);
          expect(currentBlockTimestamp).to.be.lte(submissionPeriodEndTime); // still within submission period
          // Data provider submits a value enabling the possibility to challenge it
          finalReferenceValue = parseUnits("1700");
          allowChallenge = true;
          await settlementFacet
            .connect(oracle)
            .setFinalReferenceValue(
              poolId,
              finalReferenceValue,
              allowChallenge
            );
          // Position token holder (user1) challenges the submitted value
          await settlementFacet
            .connect(user1)
            .challengeFinalReferenceValue(poolId, finalReferenceValue);
          // Status gets updated to 2 = Challenged
          poolParams = await getterFacet.getPoolParameters(poolId);
          reviewPeriodEndTime = poolParams.statusTimestamp.add(reviewPeriod);
          expect(poolParams.statusFinalReferenceValue).to.eq(2);

          finalReferenceValue = parseUnits("1777");
          allowChallenge = false;
        });

        it("Should set the payout amounts for long and short token", async () => {
          // ---------
          // Arrange: Check that both `payoutLong` and `payoutShort` are zero (initial state when pool is created)
          // ---------
          expect(poolParamsBefore.payoutLong).to.be.eq(0);
          expect(poolParamsBefore.payoutShort).to.be.eq(0);

          // ---------
          // Act: Data provider triggers the `setFinalReferenceValue` function and disables the challenge functionality this time
          // ---------
          await settlementFacet
            .connect(oracle)
            .setFinalReferenceValue(
              poolId,
              finalReferenceValue,
              allowChallenge
            );

          // ---------
          // Assert: Confirm that the payout amount per long and short token (net of fees) is set correctly
          // ---------
          poolParamsAfter = await getterFacet.getPoolParameters(poolId);
          feesParams = await getterFacet.getFees(poolParamsAfter.indexFees);
          fee = feesParams.protocolFee.add(feesParams.settlementFee);
          payoffsPerToken = calcPayoffPerToken(
            poolParamsBefore.floor,
            poolParamsBefore.inflection,
            poolParamsBefore.cap,
            poolParamsAfter.gradient,
            finalReferenceValue,
            decimals,
            fee
          );

          expect(poolParamsAfter.payoutLong).to.eq(
            payoffsPerToken.payoffLongNet
          );
          expect(poolParamsAfter.payoutShort).to.eq(
            payoffsPerToken.payoffShortNet
          );
        });

        it("Should allocate protocol fees to DIVA treasury", async () => {
          // ---------
          // Arrange: Confirms that DIVA treasury fee claim is zero
          // ---------
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              treasury.address
            )
          ).to.eq(0);

          // ---------
          // Act: Data provider submits final reference value without the possibility to challenge it and thereby confirms it
          // ---------
          await settlementFacet
            .connect(oracle)
            .setFinalReferenceValue(
              poolId,
              finalReferenceValue,
              allowChallenge
            );

          // ---------
          // Assert: Confirm that the protocol fees have been allocated to the DIVA treasury
          // ---------
          feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
          protocolFee = calcFee(
            feesParams.protocolFee,
            poolParamsBefore.collateralBalance,
            decimals
          );
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              treasury.address
            )
          ).to.eq(protocolFee);
        });

        it("Should allocate settlement fees to fallback data provider", async () => {
          // ---------
          // Arrange: Confirms that DIVA treasury fee claim is zero
          // ---------
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              oracle.address
            )
          ).to.eq(0);

          // ---------
          // Act: Data provider submits final reference value without the possibility to challenge it and thereby confirms it
          // ---------
          await settlementFacet
            .connect(oracle)
            .setFinalReferenceValue(
              poolId,
              finalReferenceValue,
              allowChallenge
            );

          // ---------
          // Assert: Confirm that the settlement fees have been allocated to the fallback data provider
          // ---------
          feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
          settlementFee = calcFee(
            feesParams.settlementFee,
            poolParamsBefore.collateralBalance,
            decimals
          );
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              oracle.address
            )
          ).to.eq(settlementFee);
        });
      });

      it("Should confirm the final value when the data provider submits a THE SAME value as before during the review period", async () => {
        // ---------
        // Arrange: The data provider submits a value within the submission period and it gets challenged
        // ---------
        expect(poolParamsBefore.expiryTime).to.be.lte(currentBlockTimestamp); // pool expired
        submissionPeriodEndTime =
          poolParamsBefore.expiryTime.add(submissionPeriod);
        expect(currentBlockTimestamp).to.be.lte(submissionPeriodEndTime); // still within submission period
        // Data provider submits a value
        finalReferenceValue = parseUnits("1700");
        allowChallenge = true;
        await settlementFacet
          .connect(oracle)
          .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge);
        // Position token holder (user1) challenges the submitted value
        await settlementFacet
          .connect(user1)
          .challengeFinalReferenceValue(poolId, finalReferenceValue);
        // Status gets updated to 2 = Challenged
        poolParams = await getterFacet.getPoolParameters(poolId);
        reviewPeriodEndTime = poolParams.statusTimestamp.add(reviewPeriod);
        expect(poolParams.statusFinalReferenceValue).to.eq(2);

        // ---------
        // Act: The data provider submits THE SAME value as before during the review period
        // ---------
        allowChallenge = true; // shouldn't matter, but put to 1 to demonstrate that it doesn't impact the status
        await settlementFacet
          .connect(oracle)
          .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge);

        // ---------
        // Assert: Check that final value is confirmed and equal to the previously submitted value
        // ---------
        poolParamsAfter = await getterFacet.getPoolParameters(poolId);
        expect(poolParamsAfter.finalReferenceValue).to.eq(finalReferenceValue);
        expect(poolParamsAfter.statusFinalReferenceValue).to.eq(3); // 3 = Confirmed
      });

      it("Should set the status back to Submitted and update the final value when the data provider submits a NEW value during the review period", async () => {
        // ---------
        // Arrange: The data provider submits a value within the submission period and it gets challenged
        // ---------
        expect(poolParamsBefore.expiryTime).to.be.lte(currentBlockTimestamp); // pool expired
        submissionPeriodEndTime =
          poolParamsBefore.expiryTime.add(submissionPeriod);
        expect(currentBlockTimestamp).to.be.lte(submissionPeriodEndTime); // still within submission period
        // Data provider submits a value
        finalReferenceValue = parseUnits("1700");
        allowChallenge = true;
        await settlementFacet
          .connect(oracle)
          .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge);
        // Position token holder (user1) challenges the submitted value
        await settlementFacet
          .connect(user1)
          .challengeFinalReferenceValue(poolId, finalReferenceValue);
        // Status gets updated to 2 = Challenged
        poolParams = await getterFacet.getPoolParameters(poolId);
        reviewPeriodEndTime = poolParams.statusTimestamp.add(reviewPeriod);
        expect(poolParams.statusFinalReferenceValue).to.eq(2);

        // ---------
        // Act: The data provider submits a NEW value during the review period and enables the possibility to challenge
        // ---------
        const newFinalReferenceValue = parseUnits("1800");
        expect(newFinalReferenceValue).to.not.eq(finalReferenceValue);
        allowChallenge = true;
        await settlementFacet
          .connect(oracle)
          .setFinalReferenceValue(
            poolId,
            newFinalReferenceValue,
            allowChallenge
          );

        // ---------
        // Assert: Check that final value is set to 1 = Submitted and the final value is updated to the new value in the pool parameters
        // ---------
        poolParamsAfter = await getterFacet.getPoolParameters(poolId);
        expect(poolParamsAfter.finalReferenceValue).to.eq(
          newFinalReferenceValue
        );
        expect(poolParamsAfter.statusFinalReferenceValue).to.eq(1); // 1 = Submitted
      });

      // -------------------------------------------
      // Events
      // -------------------------------------------

      it("Emits a StatusChanged event", async () => {
        // ---------
        // Act: Set final reference value
        // ---------
        finalReferenceValue = parseUnits("1605.33");
        allowChallenge = false;
        const tx = await settlementFacet
          .connect(oracle)
          .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge);
        const receipt = await tx.wait();

        // ---------
        // Assert: Check that it emits a StatusChanged event
        // ---------
        const statusChangedEvent = receipt.events?.find(
          (item: any) => item.event === "StatusChanged"
        );
        expect(statusChangedEvent?.args?.statusFinalReferenceValue).to.eq(3); // 3 = Confirmed
        expect(statusChangedEvent?.args?.by).to.eq(oracle.address);
        expect(statusChangedEvent?.args?.poolId).to.eq(poolId);
        expect(statusChangedEvent?.args?.proposedFinalReferenceValue).to.eq(
          finalReferenceValue
        );
      });

      it("Emits a FeeClaimAllocated event", async () => {
        // ---------
        // Act: Set final reference value
        // ---------
        finalReferenceValue = parseUnits("1605.33");
        allowChallenge = false;
        const tx = await settlementFacet
          .connect(oracle)
          .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge);
        const receipt = await tx.wait();

        // ---------
        // Assert: Check that it emits a FeeClaimAllocated event
        // ---------
        feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
        protocolFee = calcFee(
          feesParams.protocolFee,
          poolParamsBefore.collateralBalance,
          decimals
        );
        settlementFee = calcFee(
          feesParams.settlementFee,
          poolParamsBefore.collateralBalance,
          decimals
        );

        // ---------
        // Assert: Check that it emits a FeeClaimAllocated event
        // ---------
        const feeClaimAllocatedEvents =
          receipt.events?.filter(
            (item: any) => item.event === "FeeClaimAllocated"
          ) || [];

        expect(feeClaimAllocatedEvents[0].args?.poolId).to.equal(poolId);
        expect(feeClaimAllocatedEvents[0].args?.recipient).to.equal(
          treasury.address
        );
        expect(feeClaimAllocatedEvents[0].args?.amount).to.equal(protocolFee);

        expect(feeClaimAllocatedEvents[1].args?.poolId).to.equal(poolId);
        expect(feeClaimAllocatedEvents[1].args?.recipient).to.equal(
          oracle.address
        );
        expect(feeClaimAllocatedEvents[1].args?.amount).to.equal(settlementFee);
      });

      // -------------------------------------------
      // Reverts
      // -------------------------------------------

      it("Reverts if status is already submitted", async () => {
        // ---------
        // Arrange: Data provider submits a value for an already expired pool where a final value has been already submitted
        // ---------
        expect(poolParamsBefore.expiryTime).to.be.lte(currentBlockTimestamp); // pool expired
        submissionPeriodEndTime =
          poolParamsBefore.expiryTime.add(submissionPeriod);
        expect(currentBlockTimestamp).to.be.lte(submissionPeriodEndTime); // still within submission period
        expect(poolParamsBefore.statusFinalReferenceValue).to.eq(0); // no final value set yet
        expect(poolParamsBefore.finalReferenceValue).to.eq(0); // status is 0 = Open
        // Data provider submits a value
        finalReferenceValue = parseUnits("1605.33");
        allowChallenge = true;
        await settlementFacet
          .connect(oracle)
          .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge);
        poolParamsAfter = await getterFacet.getPoolParameters(poolId);
        expect(poolParamsAfter.statusFinalReferenceValue).to.eq(1); // status changes to 1 = Submitted

        // ---------
        // Act & Assert: Check that data provider cannot submit another value
        // ---------
        finalReferenceValue = parseUnits("1800");
        await expect(
          settlementFacet
            .connect(oracle)
            .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge)
        ).to.be.revertedWith("AlreadySubmittedOrConfirmed()");
      });

      it("Reverts if status is already confirmed", async () => {
        // ---------
        // Arrange: Data provider submits a value for an already expired pool where a final value has been already confirmed
        // ---------
        expect(poolParamsBefore.expiryTime).to.be.lte(currentBlockTimestamp); // pool expired
        submissionPeriodEndTime =
          poolParamsBefore.expiryTime.add(submissionPeriod);
        expect(currentBlockTimestamp).to.be.lte(submissionPeriodEndTime); // still within submission period
        expect(poolParamsBefore.statusFinalReferenceValue).to.eq(0); // no final value set yet
        expect(poolParamsBefore.finalReferenceValue).to.eq(0); // status is 0 = Open
        // Data provider submits a value
        finalReferenceValue = parseUnits("1605.33");
        allowChallenge = false; // with that configuration, the first value submitted will be confirmed
        await settlementFacet
          .connect(oracle)
          .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge);
        poolParamsAfter = await getterFacet.getPoolParameters(poolId);
        expect(poolParamsAfter.statusFinalReferenceValue).to.eq(3); // status changes to 3 = Confirmed

        // ---------
        // Act & Assert: Check that data provider cannot submit another value
        // ---------
        finalReferenceValue = parseUnits("1800");
        await expect(
          settlementFacet
            .connect(oracle)
            .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge)
        ).to.be.revertedWith("AlreadySubmittedOrConfirmed()");
      });

      it("Reverts if pool hasn`t expired yet", async () => {
        // ---------
        // Arrange: Mint a set of position tokens with expiry time in the future
        // ---------
        await mineBlock();
        const tx = await createContingentPool({
          expireInSeconds: 1000,
        });
        poolId = await getPoolIdFromTx(tx);
        poolParams = await getterFacet.getPoolParameters(poolId);
        expect(await getLastTimestamp()).to.be.lt(poolParams.expiryTime); // < here as `require(block.timestamp >= _pool.expiryTime)` in code
        expect(poolParams.statusFinalReferenceValue).to.eq(0); // 0 = Open

        // ---------
        // Act & Assert: Check that setting final value fails when triggered before pool expiration
        // ---------
        finalReferenceValue = parseUnits("1605.33");
        allowChallenge = false;
        await expect(
          settlementFacet
            .connect(oracle)
            .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge)
        ).to.be.revertedWith("PoolNotExpired()");
        expect(await getLastTimestamp()).to.be.lt(poolParams.expiryTime); // < here as `require(block.timestamp >= _pool.expiryTime)` in code
      });

      it("Reverts if called by an account other than the data provider during the submission period", async () => {
        // ---------
        // Arrange: Check that pool has expired, we are still within the submission period and no final value has been submitted yet
        // ---------
        expect(poolParamsBefore.expiryTime).to.be.lte(currentBlockTimestamp); // pool expired
        submissionPeriodEndTime =
          poolParamsBefore.expiryTime.add(submissionPeriod);
        expect(currentBlockTimestamp).to.be.lte(submissionPeriodEndTime); // still within submission period
        expect(poolParamsBefore.statusFinalReferenceValue).to.eq(0); // no final value set yet
        expect(poolParamsBefore.finalReferenceValue).to.eq(0); // status is 0 = Open

        // ---------
        // Act & Assert: Check that no account other than the data provider can submit a value
        // ---------
        finalReferenceValue = parseUnits("1605.33");
        allowChallenge = false;
        await expect(
          settlementFacet
            .connect(user1)
            .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge)
        ).to.be.revertedWith("NotDataProvider()");
      });

      it("Reverts if any account other than the fallback data provider submits a value within the fallback period", async () => {
        // ---------
        // Arrange: Check that pool has expired, the submission period expired without any submission
        // ---------
        expect(poolParamsBefore.expiryTime).to.be.lte(currentBlockTimestamp); // pool expired
        submissionPeriodEndTime =
          poolParamsBefore.expiryTime.add(submissionPeriod); // set submission period end
        expect(poolParamsBefore.statusFinalReferenceValue).to.eq(0); // no final value set yet
        expect(poolParamsBefore.finalReferenceValue).to.eq(0); // status is 0 = Open

        // ---------
        // Act & Assert: Check that no account other than the fallback data provider is able to submit a final value within the fallback period;
        // ---------
        finalReferenceValue = parseUnits("1605.33");
        allowChallenge = false;
        await setNextTimestamp(
          ethers.provider,
          submissionPeriodEndTime.add(1).toNumber()
        ); // set timestamp of next block such that it's outside of the submission period and inside the fallback period
        await expect(
          settlementFacet
            .connect(oracle)
            .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge)
        ).to.be.revertedWith("NotFallbackDataProvider()");
        await expect(
          settlementFacet
            .connect(user1)
            .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge)
        ).to.be.revertedWith("NotFallbackDataProvider()");
      });

      describe("Payoff calculations", async () => {
        describe("floor = inflection = cap", async () => {
          beforeEach(async () => {
            // ---------
            // Arrange: Create a contingent pool where floor = inflection = cap which shortly expires
            // ---------
            nextBlockTimestamp = (await getLastTimestamp()) + 1;
            await setNextTimestamp(ethers.provider, nextBlockTimestamp);
            const tx = await createContingentPool({
              floor: 1600,
              inflection: 1600,
              cap: 1600,
              gradient: 0.5,
              collateralAmount: 200,
              expireInSeconds: 20,
            });
            poolId = await getPoolIdFromTx(tx);
            poolParamsBefore = await getterFacet.getPoolParameters(poolId);
            
            // Fast forward in time post pool expiration
            nextBlockTimestamp = Number(poolParamsBefore.expiryTime) + 1;
            await mineBlock(nextBlockTimestamp);

            currentBlockTimestamp = await getLastTimestamp();
          });

          it("Final reference value = inflection", async () => {
            // ---------
            // Act: Set final reference value = inflection
            // ---------
            finalReferenceValue = parseUnits("1600");
            allowChallenge = false;
            await settlementFacet
              .connect(oracle)
              .setFinalReferenceValue(
                poolId,
                finalReferenceValue,
                allowChallenge
              );

            // ---------
            // Assert: Confirm that payout amounts (net of fees) are correct
            // ---------
            poolParamsAfter = await getterFacet.getPoolParameters(poolId);
            expect(poolParamsAfter.payoutLong).to.eq(
              parseUnits("0.4985", decimals)
            ); // gradient * (1- 0.3% fee)
            expect(poolParamsAfter.payoutShort).to.eq(
              parseUnits("0.4985", decimals)
            ); // gradient * (1- 0.3% fee)
          });

          it("Final reference value < inflection", async () => {
            // ---------
            // Act: Set final reference value < inflection
            // ---------
            finalReferenceValue = parseUnits("1590");
            allowChallenge = false;
            await settlementFacet
              .connect(oracle)
              .setFinalReferenceValue(
                poolId,
                finalReferenceValue,
                allowChallenge
              );

            // ---------
            // Assert: Confirm that payout amounts (net of fees) are correct
            // ---------
            poolParamsAfter = await getterFacet.getPoolParameters(poolId);
            expect(poolParamsAfter.payoutLong).to.eq(parseUnits("0", decimals));
            expect(poolParamsAfter.payoutShort).to.eq(
              parseUnits("0.997", decimals)
            ); // (1- 0.3% fee)
          });

          it("Final reference value > inflection", async () => {
            // ---------
            // Act: Set final reference value > inflection
            // ---------
            finalReferenceValue = parseUnits("1610");
            allowChallenge = false;
            await settlementFacet
              .connect(oracle)
              .setFinalReferenceValue(
                poolId,
                finalReferenceValue,
                allowChallenge
              );

            // ---------
            // Assert: Confirm that payout amounts (net of fees) are correct
            // ---------
            poolParamsAfter = await getterFacet.getPoolParameters(poolId);
            expect(poolParamsAfter.payoutLong).to.eq(
              parseUnits("0.997", decimals)
            ); // (1- 0.3% fee)
            expect(poolParamsAfter.payoutShort).to.eq(
              parseUnits("0", decimals)
            );
          });
        });

        describe("floor = inflection = cap = 0", async () => {
          beforeEach(async () => {
            // ---------
            // Arrange: Create a contingent pool where floor = inflection = cap = 0 which shortly expires
            // ---------
            nextBlockTimestamp = (await getLastTimestamp()) + 1;
            await setNextTimestamp(ethers.provider, nextBlockTimestamp);
            const tx = await createContingentPool({
              floor: 0,
              inflection: 0,
              cap: 0,
              gradient: 0.5,
              collateralAmount: 200,
              expireInSeconds: 2,
            });
            poolId = await getPoolIdFromTx(tx);
            poolParamsBefore = await getterFacet.getPoolParameters(poolId);
            currentBlockTimestamp = await getLastTimestamp();
          });

          it("Final reference value = inflection", async () => {
            // ---------
            // Act: Set final reference value = inflection
            // ---------
            finalReferenceValue = parseUnits("0");
            allowChallenge = false;
            await settlementFacet
              .connect(oracle)
              .setFinalReferenceValue(
                poolId,
                finalReferenceValue,
                allowChallenge
              );

            // ---------
            // Assert: Confirm that payout amounts (net of fees) are correct
            // ---------
            poolParamsAfter = await getterFacet.getPoolParameters(poolId);
            expect(poolParamsAfter.payoutLong).to.eq(
              parseUnits("0.4985", decimals)
            ); // gradient * (1- 0.3% fee)
            expect(poolParamsAfter.payoutShort).to.eq(
              parseUnits("0.4985", decimals)
            ); // gradient * (1- 0.3% fee)
          });

          it("Final reference value > inflection", async () => {
            // ---------
            // Act: Set final reference value > inflection
            // ---------
            finalReferenceValue = parseUnits("10");
            allowChallenge = false;
            await settlementFacet
              .connect(oracle)
              .setFinalReferenceValue(
                poolId,
                finalReferenceValue,
                allowChallenge
              );

            // ---------
            // Assert: Confirm that payout amounts (net of fees) are correct
            // ---------
            poolParamsAfter = await getterFacet.getPoolParameters(poolId);
            expect(poolParamsAfter.payoutLong).to.eq(
              parseUnits("0.997", decimals)
            ); // (1- 0.3% fee)
            expect(poolParamsAfter.payoutShort).to.eq(
              parseUnits("0", decimals)
            );
          });
        });

        describe("floor = inflection < cap", async () => {
          beforeEach(async () => {
            // ---------
            // Arrange: Create a contingent pool where floor = inflection < cap which shortly expires
            // ---------
            nextBlockTimestamp = (await getLastTimestamp()) + 1;
            await setNextTimestamp(ethers.provider, nextBlockTimestamp);
            const tx = await createContingentPool({
              floor: 1600,
              inflection: 1600,
              cap: 1800,
              gradient: 0.5,
              collateralAmount: 200,
              expireInSeconds: 2,
            });
            poolId = await getPoolIdFromTx(tx);
            poolParamsBefore = await getterFacet.getPoolParameters(poolId);
            currentBlockTimestamp = await getLastTimestamp();
          });

          it("Final reference value = inflection", async () => {
            // ---------
            // Act: Set final reference value = inflection
            // ---------
            finalReferenceValue = parseUnits("1600");
            allowChallenge = false;
            await settlementFacet
              .connect(oracle)
              .setFinalReferenceValue(
                poolId,
                finalReferenceValue,
                allowChallenge
              );

            // ---------
            // Assert: Confirm that payout amounts (net of fees) are correct
            // ---------
            poolParamsAfter = await getterFacet.getPoolParameters(poolId);
            expect(poolParamsAfter.payoutLong).to.eq(
              parseUnits("0.4985", decimals)
            ); // gradient * (1- 0.3% fee)
            expect(poolParamsAfter.payoutShort).to.eq(
              parseUnits("0.4985", decimals)
            ); // gradient * (1- 0.3% fee)
          });

          it("Final reference value < inflection", async () => {
            // ---------
            // Act: Set final reference value < inflection
            // ---------
            finalReferenceValue = parseUnits("1590");
            allowChallenge = false;
            await settlementFacet
              .connect(oracle)
              .setFinalReferenceValue(
                poolId,
                finalReferenceValue,
                allowChallenge
              );

            // ---------
            // Assert: Confirm that payout amounts (net of fees) are correct
            // ---------
            poolParamsAfter = await getterFacet.getPoolParameters(poolId);
            expect(poolParamsAfter.payoutLong).to.eq(parseUnits("0", decimals));
            expect(poolParamsAfter.payoutShort).to.eq(
              parseUnits("0.997", decimals)
            ); // (1- 0.3% fee)
          });

          it("Cap > final reference value > inflection", async () => {
            // ---------
            // Act: Set final reference value such that cap > final reference value > inflection
            // ---------
            finalReferenceValue = parseUnits("1700");
            allowChallenge = false;
            await settlementFacet
              .connect(oracle)
              .setFinalReferenceValue(
                poolId,
                finalReferenceValue,
                allowChallenge
              );

            // ---------
            // Assert: Confirm that payout amounts (net of fees) are correct
            // ---------
            poolParamsAfter = await getterFacet.getPoolParameters(poolId);
            expect(poolParamsAfter.payoutLong).to.eq(
              parseUnits("0.74775", decimals)
            ); // (0.5 * (1 - gradient) + gradient) * (1- 0.3% fee)
            expect(poolParamsAfter.payoutShort).to.eq(
              parseUnits("0.24925", decimals)
            ); // (0.5 * (1 - gradient))) * (1- 0.3% fee)
          });

          it("Final reference value = cap", async () => {
            // ---------
            // Act: Set final reference value = cap
            // ---------
            finalReferenceValue = parseUnits("1800");
            allowChallenge = false;
            await settlementFacet
              .connect(oracle)
              .setFinalReferenceValue(
                poolId,
                finalReferenceValue,
                allowChallenge
              );

            // ---------
            // Assert: Confirm that payout amounts (net of fees) are correct
            // ---------
            poolParamsAfter = await getterFacet.getPoolParameters(poolId);
            expect(poolParamsAfter.payoutLong).to.eq(
              parseUnits("0.997", decimals)
            ); // (1- 0.3% fee)
            expect(poolParamsAfter.payoutShort).to.eq(
              parseUnits("0", decimals)
            );
          });

          it("Final reference value > cap", async () => {
            // ---------
            // Act: Set final reference value > cap
            // ---------
            finalReferenceValue = parseUnits("1810");
            allowChallenge = false;
            await settlementFacet
              .connect(oracle)
              .setFinalReferenceValue(
                poolId,
                finalReferenceValue,
                allowChallenge
              );

            // ---------
            // Assert: Confirm that payout amounts (net of fees) are correct
            // ---------
            poolParamsAfter = await getterFacet.getPoolParameters(poolId);
            expect(poolParamsAfter.payoutLong).to.eq(
              parseUnits("0.997", decimals)
            ); // (1- 0.3% fee)
            expect(poolParamsAfter.payoutShort).to.eq(
              parseUnits("0", decimals)
            );
          });
        });

        describe("Floor < inflection = cap", async () => {
          beforeEach(async () => {
            // ---------
            // Arrange: Create a contingent pool where floor < inflection = cap which shortly expires
            // ---------
            nextBlockTimestamp = (await getLastTimestamp()) + 1;
            await setNextTimestamp(ethers.provider, nextBlockTimestamp);
            const tx = await createContingentPool({
              floor: 1400,
              inflection: 1600,
              cap: 1600,
              gradient: 0.5,
              collateralAmount: 200,
              expireInSeconds: 2,
            });
            poolId = await getPoolIdFromTx(tx);
            poolParamsBefore = await getterFacet.getPoolParameters(poolId);
            currentBlockTimestamp = await getLastTimestamp();
          });

          it("Final reference value = inflection", async () => {
            // ---------
            // Act: Set final reference value = inflection
            // ---------
            finalReferenceValue = parseUnits("1600");
            allowChallenge = false;
            await settlementFacet
              .connect(oracle)
              .setFinalReferenceValue(
                poolId,
                finalReferenceValue,
                allowChallenge
              );

            // ---------
            // Assert: Confirm that payout amounts (net of fees) are correct
            // ---------
            poolParamsAfter = await getterFacet.getPoolParameters(poolId);
            expect(poolParamsAfter.payoutLong).to.eq(
              parseUnits("0.4985", decimals)
            ); // gradient * ( 1- 0.3% fee)
            expect(poolParamsAfter.payoutShort).to.eq(
              parseUnits("0.4985", decimals)
            ); // gradient * ( 1- 0.3% fee)
          });

          it("Final reference value > cap", async () => {
            // ---------
            // Act: Set final reference value > cap
            // ---------
            finalReferenceValue = parseUnits("1610");
            allowChallenge = false;
            await settlementFacet
              .connect(oracle)
              .setFinalReferenceValue(
                poolId,
                finalReferenceValue,
                allowChallenge
              );

            // ---------
            // Assert: Confirm that payout amounts (net of fees) are correct
            // ---------
            poolParamsAfter = await getterFacet.getPoolParameters(poolId);
            expect(poolParamsAfter.payoutLong).to.eq(
              parseUnits("0.997", decimals)
            ); // (1- 0.3% fee)
            expect(poolParamsAfter.payoutShort).to.eq(
              parseUnits("0", decimals)
            );
          });

          it("Floor < final reference value < inflection", async () => {
            // ---------
            // Act: Set final reference value such that floor < final reference value < inflection
            // ---------
            finalReferenceValue = parseUnits("1500");
            allowChallenge = false;
            await settlementFacet
              .connect(oracle)
              .setFinalReferenceValue(
                poolId,
                finalReferenceValue,
                allowChallenge
              );

            // ---------
            // Assert: Confirm that payout amounts (net of fees) are correct
            // ---------
            poolParamsAfter = await getterFacet.getPoolParameters(poolId);
            expect(poolParamsAfter.payoutLong).to.eq(
              parseUnits("0.24925", decimals)
            ); // (0.5 * (1 - gradient))) * (1- 0.3% fee)
            expect(poolParamsAfter.payoutShort).to.eq(
              parseUnits("0.74775", decimals)
            ); // (0.5 * (1 - gradient)) + gradient) / supply * (1- 0.3% fee)
          });

          it("Final reference value = floor", async () => {
            // ---------
            // Act: Set final reference value = floor
            // ---------
            finalReferenceValue = parseUnits("1400");
            allowChallenge = false;
            await settlementFacet
              .connect(oracle)
              .setFinalReferenceValue(
                poolId,
                finalReferenceValue,
                allowChallenge
              );

            // ---------
            // Assert: Confirm that payout amounts (net of fees) are correct
            // ---------
            poolParamsAfter = await getterFacet.getPoolParameters(poolId);
            expect(poolParamsAfter.payoutLong).to.eq(parseUnits("0", decimals));
            expect(poolParamsAfter.payoutShort).to.eq(
              parseUnits("0.997", decimals)
            ); // (1- 0.3% fee)
          });

          it("Final reference value < floor", async () => {
            // ---------
            // Act: Set final reference value < floor
            // ---------
            finalReferenceValue = parseUnits("1");
            allowChallenge = false;
            await settlementFacet
              .connect(oracle)
              .setFinalReferenceValue(
                poolId,
                finalReferenceValue,
                allowChallenge
              );

            // ---------
            // Assert: Confirm that payout amounts (net of fees) are correct
            // ---------
            poolParamsAfter = await getterFacet.getPoolParameters(poolId);
            expect(poolParamsAfter.payoutLong).to.eq(parseUnits("0", decimals));
            expect(poolParamsAfter.payoutShort).to.eq(
              parseUnits("0.997", decimals)
            ); // (1- 0.3% fee)
          });
        });

        describe("cap = 1e59 and finalReferenceValue = cap - 1", async () => {
          it("Should calculate the correct payoffs for max cap value and final reference value very close to the cap", async () => {
            // ---------
            // Arrange: Create a contingent pool where cap = 1e59 which shortly expires
            // ---------
            const tx = await createContingentPool({
              floor: 0,
              inflection: 0,
              cap: parseUnits("1", 59),
              gradient: 0,
              collateralAmount: 200,
              expireInSeconds: 2,
            });
            poolId = await getPoolIdFromTx(tx);
            poolParamsBefore = await getterFacet.getPoolParameters(poolId);

            // ---------
            // Act: Set final reference value to cap - 1
            // ---------
            finalReferenceValue = poolParamsBefore.cap.sub(1);
            allowChallenge = false;
            await settlementFacet
              .connect(oracle)
              .setFinalReferenceValue(
                poolId,
                finalReferenceValue,
                allowChallenge
              );

            // ---------
            // Assert: Confirm that payout tx does not revert and amounts (net of fees) are correct
            // ---------
            poolParamsAfter = await getterFacet.getPoolParameters(poolId);            
            expect(poolParamsAfter.payoutLong).to.eq(
              parseUnits("0.996999", decimals) // Note: will pass with decimals = 6; adjust precision of value 0.996999 otherwise
            ); // gradient * (1- 0.3% fee)
            expect(poolParamsAfter.payoutShort).to.eq(
              parseUnits("0", decimals)
            ); // gradient * (1- 0.3% fee)
          });
        });
      });

      describe("Reverts that require status = Challenged", async () => {
        beforeEach(async () => {
          // ---------
          // Arrange: The data provider submits a value within the submission period and the value gets challenged
          // ---------
          expect(poolParamsBefore.expiryTime).to.be.lte(currentBlockTimestamp); // pool expired
          submissionPeriodEndTime =
            poolParamsBefore.expiryTime.add(submissionPeriod);
          expect(currentBlockTimestamp).to.be.lte(submissionPeriodEndTime); // still within submission period
          // Data provider submits value
          finalReferenceValue = parseUnits("1700");
          allowChallenge = true;
          await settlementFacet
            .connect(oracle)
            .setFinalReferenceValue(
              poolId,
              finalReferenceValue,
              allowChallenge
            );
          // Position token holder (user1) challenges the submitted value
          await settlementFacet
            .connect(user1)
            .challengeFinalReferenceValue(poolId, finalReferenceValue);
          // Status gets updated to 2 = Challenged
          poolParams = await getterFacet.getPoolParameters(poolId);
          reviewPeriodEndTime = poolParams.statusTimestamp.add(reviewPeriod);
          expect(poolParams.statusFinalReferenceValue).to.eq(2);
        });

        it("Reverts if data provider tries to submit a value after the review period expired", async () => {
          // ---------
          // Arrange: Advance time to simulate that the review period expired without any input from the data provider
          // ---------
          await setNextTimestamp(
            ethers.provider,
            reviewPeriodEndTime.add(1).toNumber()
          );

          // ---------
          // Act & Assert: Confirm that data provider is not able to submit a final value after the review period expired
          // ---------
          await expect(
            settlementFacet
              .connect(oracle)
              .setFinalReferenceValue(
                poolId,
                finalReferenceValue,
                allowChallenge
              )
          ).to.be.revertedWith("ReviewPeriodExpired()");
        });

        it("Reverts if an account other than the data provider tries to submit a value within the review period", async () => {
          // ---------
          // Arrange: Check that we are still within the review period
          // ---------
          expect(await getLastTimestamp()).to.lte(reviewPeriodEndTime);

          // ---------
          // Act & Assert: Confirm that no account other than the data provider can submit a value within the review period
          // ---------
          await expect(
            settlementFacet
              .connect(user2)
              .setFinalReferenceValue(
                poolId,
                finalReferenceValue,
                allowChallenge
              )
          ).to.be.revertedWith("NotDataProvider()");
          await expect(
            settlementFacet
              .connect(fallbackOracle)
              .setFinalReferenceValue(
                poolId,
                finalReferenceValue,
                allowChallenge
              )
          ).to.be.revertedWith("NotDataProvider()");
        });
      });

      describe("Tests that require the pool to be open and not yet expired", async () => {
        it("Sets the final payout amount when pool liquidity was reduced to zero before", async () => {
          // ---------
          // Arrange: Mint new position tokens and remove all liquidity
          // ---------
          const tx = await createContingentPool({
            expireInSeconds: 7200,
          });
          poolId = await getPoolIdFromTx(tx);
          poolParamsBefore = await getterFacet.getPoolParameters(poolId);
          console.log("expiryTime: " + poolParamsBefore.expiryTime);
          console.log("last block timestamp:" + (await getLastTimestamp()));
          shortTokenInstance = await positionTokenAttachFixture(
            poolParamsBefore.shortToken
          );
          longTokenInstance = await positionTokenAttachFixture(
            poolParamsBefore.longToken
          );
          // Remove liquidity
          const positionTokenBalance = await shortTokenInstance.balanceOf(
            user1.address
          ); // long token balance is equal, so it's sufficient to derive it from the short token
          expect(positionTokenBalance).to.be.gt(0);
          await liquidityFacet
            .connect(user1)
            .removeLiquidity(poolId, positionTokenBalance);
          poolParamsBefore = await getterFacet.getPoolParameters(poolId);
          // Confirm that token supply and collateral balance dropped to zero
          expect(await shortTokenInstance.totalSupply()).to.eq(0);
          expect(await longTokenInstance.totalSupply()).to.eq(0);
          expect(poolParamsBefore.collateralBalance).to.eq(0);
          // Set next timestamp
          await setNextTimestamp(
            ethers.provider,
            poolParamsBefore.expiryTime.toNumber()
          ); // set next block timestamp equal to expiryTime

          // ---------
          // Act: Set final reference value
          // ---------
          finalReferenceValue = parseUnits("1605.33");
          allowChallenge = false;
          await settlementFacet
            .connect(oracle)
            .setFinalReferenceValue(
              poolId,
              finalReferenceValue,
              allowChallenge
            );

          // ---------
          // Assert: Check that payout amounts are set
          // ---------
          poolParamsAfter = await getterFacet.getPoolParameters(poolId);
          expect(poolParamsAfter.payoutLong).to.be.gt(0); // sufficient to check that for that particular case; true in that particular case because finalReferenceValue = inflection
          expect(poolParamsAfter.payoutShort).to.be.gt(0); // sufficient to check that for that particular case; true in that particular case because finalReferenceValue = inflection

          console.log("payoutLong: " + poolParamsAfter.payoutLong);
          console.log("payoutShort: " + poolParamsAfter.payoutShort);
        });
      });
    });

    describe("batchSetFinalReferenceValue", async () => {
      beforeEach(async () => {
        // ---------
        // Arrange: Create 2 contingent pools that expire shortly
        // ---------
        // Pool 1
        nextBlockTimestamp = (await getLastTimestamp()) + 1;
        await setNextTimestamp(ethers.provider, nextBlockTimestamp);
        let tx = await createContingentPool({
          expireInSeconds: 2,
        });
        poolId1 = await getPoolIdFromTx(tx);
        poolParamsBefore1 = await getterFacet.getPoolParameters(poolId1);

        // Pool 2
        nextBlockTimestamp = (await getLastTimestamp()) + 1;
        await setNextTimestamp(ethers.provider, nextBlockTimestamp);
        tx = await createContingentPool({
          expireInSeconds: 2,
        });
        poolId2 = await getPoolIdFromTx(tx);
        poolParamsBefore2 = await getterFacet.getPoolParameters(poolId2);

        await mineBlock();
        currentBlockTimestamp = await getLastTimestamp();
      });

      // -------------------------------------------
      // Functionality
      // -------------------------------------------

      it("Should set the final values with batch set final reference value function", async () => {
        // ---------
        // Arrange: Check that pools have expired, we are still within the submission period and no final values have been set yet
        // ---------
        // Pool 1
        expect(poolParamsBefore1.expiryTime).to.be.lte(currentBlockTimestamp); // pool expired
        submissionPeriodEndTime =
          poolParamsBefore1.expiryTime.add(submissionPeriod);
        expect(currentBlockTimestamp).to.be.lte(submissionPeriodEndTime); // still within submission period
        expect(poolParamsBefore1.statusFinalReferenceValue).to.eq(0); // no final value set yet
        expect(poolParamsBefore1.finalReferenceValue).to.eq(0);

        // Pool 2
        expect(poolParamsBefore2.expiryTime).to.be.lte(currentBlockTimestamp); // pool expired
        submissionPeriodEndTime =
          poolParamsBefore2.expiryTime.add(submissionPeriod);
        expect(currentBlockTimestamp).to.be.lte(submissionPeriodEndTime); // still within submission period
        expect(poolParamsBefore2.statusFinalReferenceValue).to.eq(0); // no final value set yet
        expect(poolParamsBefore2.finalReferenceValue).to.eq(0);

        // ---------
        // Act: Set final reference values and allow challenge
        // ---------
        finalReferenceValue1 = parseUnits("1605.33");
        finalReferenceValue2 = parseUnits("1805.33");
        allowChallenge = true;
        await settlementFacet.connect(oracle).batchSetFinalReferenceValue([
          {
            poolId: poolId1,
            finalReferenceValue: finalReferenceValue1,
            allowChallenge,
          },
          {
            poolId: poolId2,
            finalReferenceValue: finalReferenceValue2,
            allowChallenge,
          },
        ]);

        // ---------
        // Assert: Check that the final reference values have been set and the status updated to 1 = Submitted
        // ---------
        poolParamsAfter1 = await getterFacet.getPoolParameters(poolId1);
        expect(poolParamsAfter1.finalReferenceValue).to.eq(
          finalReferenceValue1
        );
        expect(poolParamsAfter1.statusFinalReferenceValue).to.eq(1); // 1 = Submitted

        poolParamsAfter2 = await getterFacet.getPoolParameters(poolId2);
        expect(poolParamsAfter2.finalReferenceValue).to.eq(
          finalReferenceValue2
        );
        expect(poolParamsAfter2.statusFinalReferenceValue).to.eq(1); // 1 = Submitted
      });
    });

    describe("challengeFinalReferenceValue", async () => {
      let timeOfChallenge1: BigNumber;
      let timeOfChallenge2: BigNumber;

      beforeEach(async () => {
        // ---------
        // Arrange: Create a contingent pool that shortly expires. User1 is the default pool creator.
        // ---------
        nextBlockTimestamp = (await getLastTimestamp()) + 1;
        await setNextTimestamp(ethers.provider, nextBlockTimestamp);
        const tx = await createContingentPool({
          expireInSeconds: 2,
        });
        poolId = await getPoolIdFromTx(tx);
        poolParamsBefore = await getterFacet.getPoolParameters(poolId);
        currentBlockTimestamp = await getLastTimestamp();
        shortTokenInstance = await positionTokenAttachFixture(
          poolParamsBefore.shortToken
        );
        longTokenInstance = await positionTokenAttachFixture(
          poolParamsBefore.longToken
        );

        // Data provider submits value and enables the possibility to challenge
        finalReferenceValue = parseUnits("1715.18");
        allowChallenge = true;
        await settlementFacet
          .connect(oracle)
          .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge);
        poolParamsBefore = await getterFacet.getPoolParameters(poolId);
      });

      // -------------------------------------------
      // Functionality
      // -------------------------------------------
      it("Allows to challenge at the very end of the challenge period", async () => {
        // ---------
        // Arrange: Set timestamp of next block equal to the end of the challenge period
        // ---------
        expect(poolParamsBefore.statusFinalReferenceValue).to.eq(1); // Submitted
        challengePeriodEndTime =
          poolParamsBefore.statusTimestamp.add(challengePeriod);
        timeOfChallenge = challengePeriodEndTime.toNumber();
        await setNextTimestamp(ethers.provider, timeOfChallenge);

        // ---------
        // Act: Challenge final reference value
        // ---------
        proposedFinalReferenceValue = parseUnits("1700.27"); // Value is not stored anywhere but emitted as part of the StatusChanged event
        await settlementFacet
          .connect(user1)
          .challengeFinalReferenceValue(poolId, proposedFinalReferenceValue);

        // ---------
        // Assert: Confirm that status and timestamp are updated but final reference value remains unchanged
        // ---------
        poolParamsAfter = await getterFacet.getPoolParameters(poolId);
        expect(poolParamsAfter.statusFinalReferenceValue).to.eq(2); // Challenged
        expect(poolParamsAfter.statusTimestamp).to.eq(timeOfChallenge); // Timestamp updated
        expect(poolParamsAfter.finalReferenceValue).to.eq(
          poolParamsBefore.finalReferenceValue
        ); // Final reference value doesn't change
      });

      it("Allows to challenge one second after the start of the challenge period", async () => {
        // ---------
        // Arrange: Set timestamp of next block one second after the start of the challenge period (< end of challenge period)
        // ---------
        expect(poolParamsBefore.statusFinalReferenceValue).to.eq(1); // Submitted
        challengePeriodEndTime =
          poolParamsBefore.statusTimestamp.add(challengePeriod);
        timeOfChallenge = poolParamsBefore.statusTimestamp.add(1).toNumber(); // 1 sec after submission (= start of challenged period)
        expect(timeOfChallenge).to.be.lt(challengePeriodEndTime); // still within challenge period
        await setNextTimestamp(ethers.provider, timeOfChallenge);

        // ---------
        // Act: Challenge final reference value
        // ---------
        proposedFinalReferenceValue = parseUnits("1700.27"); // Value is not stored anywhere but emitted as part of the StatusChanged event
        await settlementFacet
          .connect(user1)
          .challengeFinalReferenceValue(poolId, proposedFinalReferenceValue);

        // ---------
        // Assert: Confirm that status and timestamp are updated but final reference value remains unchanged
        // ---------
        poolParamsAfter = await getterFacet.getPoolParameters(poolId);
        expect(poolParamsAfter.statusFinalReferenceValue).to.eq(2); // Challenged
        expect(poolParamsAfter.statusTimestamp).to.eq(timeOfChallenge); // Timestamp updated
        expect(poolParamsAfter.finalReferenceValue).to.eq(
          poolParamsBefore.finalReferenceValue
        ); // Final reference value remains unchanged
      });

      it("Allows to submit a second challenge at the very end of the review period", async () => {
        // ---------
        // Arrange: Challenge once and prepare for a second challenge within the review period
        // ---------
        expect(poolParamsBefore.statusFinalReferenceValue).to.eq(1); // Submitted
        // Challenge 1
        challengePeriodEndTime =
          poolParamsBefore.statusTimestamp.add(challengePeriod);
        timeOfChallenge1 = poolParamsBefore.statusTimestamp.add(1); // 1 sec after submission
        expect(timeOfChallenge1).to.be.lte(challengePeriodEndTime); // still within challenge period
        await setNextTimestamp(ethers.provider, timeOfChallenge1.toNumber());

        proposedFinalReferenceValue1 = parseUnits("1700.27"); // Value is not stored anywhere but emitted as part of the StatusChanged event
        await settlementFacet
          .connect(user1)
          .challengeFinalReferenceValue(poolId, proposedFinalReferenceValue1);

        poolParamsAfter1 = await getterFacet.getPoolParameters(poolId);
        expect(poolParamsAfter1.statusFinalReferenceValue).to.eq(2); // Challenged

        // Prepare challenge 2
        reviewPeriodEndTime =
          poolParamsAfter1.statusTimestamp.add(reviewPeriod);
        timeOfChallenge2 = reviewPeriodEndTime;
        await setNextTimestamp(ethers.provider, reviewPeriodEndTime.toNumber());

        // ---------
        // Act: Second challenge of final reference value
        // ---------
        proposedFinalReferenceValue2 = parseUnits("1700.27");
        await settlementFacet
          .connect(user1)
          .challengeFinalReferenceValue(poolId, proposedFinalReferenceValue2);

        // ---------
        // Assert: Confirm that status, timestamp and final reference value remain unchanged
        // ---------
        poolParamsAfter2 = await getterFacet.getPoolParameters(poolId);
        expect(poolParamsAfter2.statusFinalReferenceValue).to.eq(
          poolParamsAfter1.statusFinalReferenceValue
        ); // Status unchanged
        expect(poolParamsAfter2.statusTimestamp).to.eq(
          poolParamsAfter1.statusTimestamp
        ); // Timestamp unchanged
        expect(poolParamsAfter2.finalReferenceValue).to.eq(
          poolParamsAfter1.finalReferenceValue
        ); // Final reference value unchanged
      });

      it("Allows to submit a second challenge one second after the start of the review period", async () => {
        // ---------
        // Arrange: Challenge once and prepare for a second challenge within the review period
        // ---------
        expect(poolParamsBefore.statusFinalReferenceValue).to.eq(1); // Submitted
        
        // Challenge 1
        challengePeriodEndTime =
          poolParamsBefore.statusTimestamp.add(challengePeriod);
        timeOfChallenge1 = poolParamsBefore.statusTimestamp.add(1); // 1 sec after submission (= start of challenge period)
        expect(timeOfChallenge1).to.be.lte(challengePeriodEndTime); // still within challenge period
        await setNextTimestamp(ethers.provider, timeOfChallenge1.toNumber());

        proposedFinalReferenceValue1 = parseUnits("1700.27"); // Value is not stored anywhere but emitted as part of the StatusChanged event
        await settlementFacet
          .connect(user1)
          .challengeFinalReferenceValue(poolId, proposedFinalReferenceValue1);

        poolParamsAfter1 = await getterFacet.getPoolParameters(poolId);
        expect(poolParamsAfter1.statusFinalReferenceValue).to.eq(2); // Challenged

        // Prepare challenge 2
        reviewPeriodEndTime =
          poolParamsAfter1.statusTimestamp.add(reviewPeriod);
        timeOfChallenge2 = poolParamsAfter1.statusTimestamp.add(1); // 1 sec after start of review period
        expect(timeOfChallenge2).to.be.lt(reviewPeriodEndTime); // still within review period
        await setNextTimestamp(ethers.provider, reviewPeriodEndTime.toNumber());

        // ---------
        // Act: Execute challenge 2
        // ---------
        proposedFinalReferenceValue2 = parseUnits("1700.27");
        await settlementFacet
          .connect(user1)
          .challengeFinalReferenceValue(poolId, proposedFinalReferenceValue2);

        // ---------
        // Assert: Confirm that status, timestamp and final reference value remain unchanged
        // ---------
        poolParamsAfter2 = await getterFacet.getPoolParameters(poolId);
        expect(poolParamsAfter2.statusFinalReferenceValue).to.eq(
          poolParamsAfter1.statusFinalReferenceValue
        ); // Status unchanged
        expect(poolParamsAfter2.statusTimestamp).to.eq(
          poolParamsAfter1.statusTimestamp
        ); // Timestamp unchanged
        expect(poolParamsAfter2.finalReferenceValue).to.eq(
          poolParamsAfter1.finalReferenceValue
        ); // Final reference value unchanged
      });

      // -------------------------------------------
      // Events
      // -------------------------------------------

      it("Emits a StatusChanged event when status switches from Submitted to Challenged", async () => {
        // ---------
        // Act: Challenge final reference value
        // ---------
        proposedFinalReferenceValue = parseUnits("1700.27");
        const tx = await settlementFacet
          .connect(user1)
          .challengeFinalReferenceValue(poolId, proposedFinalReferenceValue);
        const receipt = await tx.wait();

        // ---------
        // Assert: Check that it emits a StatusChanged event
        // ---------
        const statusChangedEvent = receipt.events?.find(
          (item: any) => item.event === "StatusChanged"
        );
        expect(statusChangedEvent?.args?.statusFinalReferenceValue).to.eq(2); // 2 = Challenged
        expect(statusChangedEvent?.args?.by).to.eq(user1.address);
        expect(statusChangedEvent?.args?.poolId).to.eq(poolId);
        expect(statusChangedEvent?.args?.proposedFinalReferenceValue).to.eq(
          proposedFinalReferenceValue
        );
      });

      it("Emits a StatusChanged event when a second challenge is submitted during the review period", async () => {
        // ---------
        // Arrange: First challenge of final reference value
        // ---------
        proposedFinalReferenceValue1 = parseUnits("1700.27");
        await settlementFacet
          .connect(user1)
          .challengeFinalReferenceValue(poolId, proposedFinalReferenceValue1);
        poolParamsAfter1 = await getterFacet.getPoolParameters(poolId);
        expect(poolParamsAfter1.statusFinalReferenceValue).to.eq(2); // Challenged

        // ---------
        // Act: Second challenge of final reference value
        // ---------
        proposedFinalReferenceValue2 = parseUnits("1800.03");
        const tx = await settlementFacet
          .connect(user1)
          .challengeFinalReferenceValue(poolId, proposedFinalReferenceValue2);
        const receipt = await tx.wait();

        // ---------
        // Assert: Check that StatusChanged event is emitted
        // ---------
        const statusChangedEvent = receipt.events?.find(
          (item: any) => item.event === "StatusChanged"
        );
        expect(statusChangedEvent?.args?.statusFinalReferenceValue).to.eq(2); // 2 = Challenged
        expect(statusChangedEvent?.args?.by).to.eq(user1.address);
        expect(statusChangedEvent?.args?.poolId).to.eq(poolId);
        expect(statusChangedEvent?.args?.proposedFinalReferenceValue).to.eq(
          proposedFinalReferenceValue2
        );
      });

      // -------------------------------------------
      // Reverts
      // -------------------------------------------

      it("Reverts if user doesn`t hold any position tokens", async () => {
        // ---------
        // Arrange: Confirm that user2 does not own any long or short tokens
        // ---------
        expect(await shortTokenInstance.balanceOf(user2.address)).to.eq(0);
        expect(await longTokenInstance.balanceOf(user2.address)).to.eq(0);

        // ---------
        // Act & Assert: Check that user2 cannot submit a challenge
        // ---------
        proposedFinalReferenceValue = parseUnits("1800.03");
        await expect(
          settlementFacet
            .connect(user2)
            .challengeFinalReferenceValue(poolId, proposedFinalReferenceValue)
        ).to.be.revertedWith("NoPositionTokens()");
      });

      it("Reverts if challenge period has passed", async () => {
        // ---------
        // Arrange: Set block timestamp 1 sec after challenge period end
        // ---------
        expect(poolParamsBefore.statusFinalReferenceValue).to.eq(1); // Submitted
        challengePeriodEndTime =
          poolParamsBefore.statusTimestamp.add(challengePeriod);
        timeOfChallenge = challengePeriodEndTime.add(1).toNumber(); // 1 sec after challenge period end
        await setNextTimestamp(ethers.provider, timeOfChallenge);

        // ---------
        // Act & Assert: Check that user1 cannot submit a challenge after the challenge period has passed
        // ---------
        await expect(
          settlementFacet
            .connect(user1)
            .challengeFinalReferenceValue(poolId, proposedFinalReferenceValue)
        ).to.be.revertedWith("ChallengePeriodExpired()");
      });

      it("Reverts if second challenge is outside of review period", async () => {
        // ---------
        // Arrange: Challenge once and set block timestamp 1 sec after review period end
        // ---------
        expect(poolParamsBefore.statusFinalReferenceValue).to.eq(1); // Submitted
        // Challenge 1
        challengePeriodEndTime =
          poolParamsBefore.statusTimestamp.add(challengePeriod);
        timeOfChallenge1 = poolParamsBefore.statusTimestamp.add(1); // 1 sec after submission (= start of challenge period)
        expect(timeOfChallenge1).to.be.lte(challengePeriodEndTime); // still within challenge period
        await setNextTimestamp(ethers.provider, timeOfChallenge1.toNumber());

        proposedFinalReferenceValue1 = parseUnits("1700.27"); // Value is not stored anywhere but emitted as part of the StatusChanged event
        await settlementFacet
          .connect(user1)
          .challengeFinalReferenceValue(poolId, proposedFinalReferenceValue1);

        poolParamsAfter1 = await getterFacet.getPoolParameters(poolId);
        expect(poolParamsAfter1.statusFinalReferenceValue).to.eq(2); // Challenged

        // Prepare challenge 2
        reviewPeriodEndTime =
          poolParamsAfter1.statusTimestamp.add(reviewPeriod);
        timeOfChallenge2 = reviewPeriodEndTime.add(1); // 1 sec after review period end
        await setNextTimestamp(ethers.provider, timeOfChallenge2.toNumber());

        // ---------
        // Act & Assert: Check that challenge reverts if triggered after the end of the review period
        // ---------
        proposedFinalReferenceValue2 = parseUnits("1650.27");
        await expect(
          settlementFacet
            .connect(user1)
            .challengeFinalReferenceValue(poolId, proposedFinalReferenceValue2)
        ).to.be.revertedWith("ReviewPeriodExpired()");
      });

      it("Reverts if status is Open", async () => {
        // ---------
        // Arrange: Create a contingent pool where no value has been submitted yet, i.e. status is Open
        // ---------
        nextBlockTimestamp = (await getLastTimestamp()) + 1;
        await setNextTimestamp(ethers.provider, nextBlockTimestamp);
        const tx = await createContingentPool({
          expireInSeconds: 2,
        });
        poolId = await getPoolIdFromTx(tx);
        poolParams = await getterFacet.getPoolParameters(poolId);
        currentBlockTimestamp = await getLastTimestamp();
        expect(poolParams.statusFinalReferenceValue).to.eq(0); // Open

        // ---------
        // Act & Assert: Check that user cannot challenge if status of final reference value is Open
        // ---------
        proposedFinalReferenceValue = parseUnits("1650.27");
        await expect(
          settlementFacet
            .connect(user1)
            .challengeFinalReferenceValue(poolId, proposedFinalReferenceValue)
        ).to.be.revertedWith("NothingToChallenge()");
      });

      it("Reverts if status is Confirmed", async () => {
        // ---------
        // Arrange: Create a contingent pool which shortly expires and confirm final reference value
        // ---------
        nextBlockTimestamp = (await getLastTimestamp()) + 1;
        await setNextTimestamp(ethers.provider, nextBlockTimestamp);
        const tx = await createContingentPool({
          expireInSeconds: 2,
        });
        poolId = await getPoolIdFromTx(tx);
        currentBlockTimestamp = await getLastTimestamp();

        // Data provider submits and confirms value by disabling a challenge
        finalReferenceValue = parseUnits("100.33");
        allowChallenge = false;
        await settlementFacet
          .connect(oracle)
          .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge);
        poolParams = await getterFacet.getPoolParameters(poolId);
        expect(poolParams.statusFinalReferenceValue).to.eq(3); // confirmed

        // ---------
        // Act & Assert: Check that user cannot challenge if status of final reference value is Open
        // ---------
        proposedFinalReferenceValue = parseUnits("1650.27");
        await expect(
          settlementFacet
            .connect(user1)
            .challengeFinalReferenceValue(poolId, proposedFinalReferenceValue)
        ).to.be.revertedWith("NothingToChallenge()");
      });
    });

    describe("batchChallengeFinalReferenceValue", async () => {
      beforeEach(async () => {
        // ---------
        // Arrange: Create two contingent pools that shortly expire. User1 is the default pool creator.
        // ---------
        // Pool 1
        nextBlockTimestamp = (await getLastTimestamp()) + 1;
        await setNextTimestamp(ethers.provider, nextBlockTimestamp);
        let tx = await createContingentPool({
          expireInSeconds: 2,
        });
        poolId1 = await getPoolIdFromTx(tx);
        poolParamsBefore1 = await getterFacet.getPoolParameters(poolId1);

        // Pool 2
        nextBlockTimestamp = (await getLastTimestamp()) + 1;
        await setNextTimestamp(ethers.provider, nextBlockTimestamp);
        tx = await createContingentPool({
          expireInSeconds: 2,
        });
        poolId2 = await getPoolIdFromTx(tx);
        poolParamsBefore2 = await getterFacet.getPoolParameters(poolId2);

        currentBlockTimestamp = await getLastTimestamp();

        // Data provider submits values and enables the possibility to challenge
        finalReferenceValue1 = parseUnits("1715.18");
        finalReferenceValue2 = parseUnits("1745.18");
        allowChallenge = true;
        await settlementFacet.connect(oracle).batchSetFinalReferenceValue([
          {
            poolId: poolId1,
            finalReferenceValue: finalReferenceValue1,
            allowChallenge,
          },
          {
            poolId: poolId2,
            finalReferenceValue: finalReferenceValue2,
            allowChallenge,
          },
        ]);
        poolParamsBefore1 = await getterFacet.getPoolParameters(poolId1);
        poolParamsBefore2 = await getterFacet.getPoolParameters(poolId2);
      });

      // -------------------------------------------
      // Functionality
      // -------------------------------------------
      it("Allows to challenge at the very end of the challenge period with batchChallengeFinalReferenceValue func", async () => {
        // ---------
        // Arrange: Set timestamp of next block equal to the end of the challenge period
        // ---------
        expect(poolParamsBefore1.statusFinalReferenceValue).to.eq(1); // Submitted
        expect(poolParamsBefore2.statusFinalReferenceValue).to.eq(1); // Submitted

        const challengePeriodEndTime1 =
          poolParamsBefore1.statusTimestamp.add(challengePeriod);
        const challengePeriodEndTime2 =
          poolParamsBefore2.statusTimestamp.add(challengePeriod);
        timeOfChallenge = Math.min(
          challengePeriodEndTime1.toNumber(),
          challengePeriodEndTime2.toNumber()
        );

        await setNextTimestamp(ethers.provider, timeOfChallenge);

        // ---------
        // Act: Challenge final reference value
        // ---------
        const proposedFinalReferenceValue1 = parseUnits("1700.27"); // Value is not stored anywhere but emitted as part of the StatusChanged event
        const proposedFinalReferenceValue2 = parseUnits("1710.27"); // Value is not stored anywhere but emitted as part of the StatusChanged event
        await settlementFacet.connect(user1).batchChallengeFinalReferenceValue([
          {
            poolId: poolId1,
            proposedFinalReferenceValue: proposedFinalReferenceValue1,
          },
          {
            poolId: poolId2,
            proposedFinalReferenceValue: proposedFinalReferenceValue2,
          },
        ]);

        // ---------
        // Assert: Confirm that status and timestamp are updated but final reference value remains unchanged
        // ---------
        poolParamsAfter1 = await getterFacet.getPoolParameters(poolId1);
        expect(poolParamsAfter1.statusFinalReferenceValue).to.eq(2); // Challenged
        expect(poolParamsAfter1.statusTimestamp).to.eq(timeOfChallenge); // Timestamp updated
        expect(poolParamsAfter1.finalReferenceValue).to.eq(
          poolParamsBefore1.finalReferenceValue
        ); // Final reference value doesn't change

        poolParamsAfter2 = await getterFacet.getPoolParameters(poolId2);
        expect(poolParamsAfter2.statusFinalReferenceValue).to.eq(2); // Challenged
        expect(poolParamsAfter2.statusTimestamp).to.eq(timeOfChallenge); // Timestamp updated
        expect(poolParamsAfter2.finalReferenceValue).to.eq(
          poolParamsBefore2.finalReferenceValue
        ); // Final reference value doesn't change
      });
    });

    describe("redeemPositionToken", async () => {
      let collateralAmountInitial: BigNumber;

      beforeEach(async () => {
        // ---------
        // Arrange: Mint a set of position tokens with expiry shortly after the last block's timestamp
        // ---------
        nextBlockTimestamp = (await getLastTimestamp()) + 1;
        await setNextTimestamp(ethers.provider, nextBlockTimestamp);
        const tx = await createContingentPool({
          expireInSeconds: 2,
        });
        poolId = await getPoolIdFromTx(tx);
        poolParams = await getterFacet.getPoolParameters(poolId);
        shortTokenInstance = await positionTokenAttachFixture(
          poolParams.shortToken
        );
        longTokenInstance = await positionTokenAttachFixture(
          poolParams.longToken
        );
        collateralTokenInstance = await erc20AttachFixture(
          poolParams.collateralToken
        );
        collateralAmountInitial = poolParams.collateralBalance;
      });

      // -------------------------------------------
      // Functionality
      // -------------------------------------------
      describe("redeemPositionToken where final value is already confirmed", async () => {
        let collateralTokenBalanceUserBefore: BigNumber;
        let collateralTokenBalanceDiamondBefore: BigNumber;
        let totalPayout: BigNumber;

        beforeEach(async () => {
          // ---------
          // Arrange: Note that fees are already deducated after `setFinalReferenceValue`.
          // ---------
          finalReferenceValue = parseUnits("1700");
          allowChallenge = false;
          await settlementFacet
            .connect(oracle)
            .setFinalReferenceValue(
              poolId,
              finalReferenceValue,
              allowChallenge
            );
          // Note that fees have been subtracted
          poolParamsBefore = await getterFacet.getPoolParameters(poolId);
          expect(poolParamsBefore.statusFinalReferenceValue).to.eq(3);
          shortTokenBalanceBefore = await shortTokenInstance.balanceOf(
            user1.address
          );
          longTokenBalanceBefore = await longTokenInstance.balanceOf(
            user1.address
          );
        });

        it("Reduces the short token supply to zero if user redeems all their short tokens", async () => {
          // ---------
          // Arrange: Confirm that short token balance is equal to `shortTokenBalanceBefore` (>0 ensured insided `createContingentPool`)
          // ---------
          expect(await shortTokenInstance.totalSupply()).to.eq(
            shortTokenBalanceBefore
          );

          // ---------
          // Act: User redeems all their short position tokens
          // ---------
          tokensToRedeem = shortTokenBalanceBefore;
          await settlementFacet
            .connect(user1)
            .redeemPositionToken(shortTokenInstance.address, tokensToRedeem);

          // ---------
          // Assert: Short token supply is reduced
          // ---------
          expect(await shortTokenInstance.totalSupply()).to.eq(0);
        });

        it("Reduces the short token supply if user redeems all short tokens except for one", async () => {
          // ---------
          // Arrange: Confirm that short token balance is equal to `shortTokenBalanceBefore` (>0 ensured insided `createContingentPool`)
          // ---------
          expect(await shortTokenInstance.totalSupply()).to.eq(
            shortTokenBalanceBefore
          );

          // ---------
          // Act: User redeems all short position tokens except for one
          // ---------
          tokensToRedeem = shortTokenBalanceBefore.sub(1);
          await settlementFacet
            .connect(user1)
            .redeemPositionToken(shortTokenInstance.address, tokensToRedeem);

          // ---------
          // Assert: Short token supply is reduced
          // ---------
          expect(await shortTokenInstance.totalSupply()).to.eq(1);
        });

        it("Reduces the collateral balance of the diamond contract after ALL short tokens have been redeemed", async () => {
          // ---------
          // Arrange: Get collateral token balance of diamond contract before short tokens are redeemed, calculate collateral to return
          // ---------
          collateralTokenBalanceDiamondBefore =
            await collateralTokenInstance.balanceOf(diamondAddress);
          expect(collateralTokenBalanceDiamondBefore).to.be.gt(0);
          tokensToRedeem = shortTokenBalanceBefore;
          feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
          fee = feesParams.protocolFee.add(feesParams.settlementFee);
          payoffsPerToken = calcPayoffPerToken(
            poolParamsBefore.floor,
            poolParamsBefore.inflection,
            poolParamsBefore.cap,
            poolParamsBefore.gradient,
            poolParamsBefore.finalReferenceValue,
            decimals,
            fee
          );
          expect(poolParamsBefore.payoutShort).to.eq(
            payoffsPerToken.payoffShortNet
          );
          totalPayout = calcPayout(
            payoffsPerToken.payoffShortNet,
            tokensToRedeem,
            decimals
          );

          // ---------
          // Act: Redeem short position tokens
          // ---------
          await settlementFacet
            .connect(user1)
            .redeemPositionToken(shortTokenInstance.address, tokensToRedeem);

          // ---------
          // Assert: Check that the collateral token balance of the diamond contract and collateralBalance in pool parameters are reduced by `totalPayout`
          // ---------
          poolParamsAfter = await getterFacet.getPoolParameters(poolId);
          expect(await collateralTokenInstance.balanceOf(diamondAddress)).to.eq(
            collateralTokenBalanceDiamondBefore.sub(totalPayout)
          );
          expect(poolParamsAfter.collateralBalance).to.eq(
            poolParamsBefore.collateralBalance.sub(totalPayout)
          );
        });

        it("Reduces the collateral balance of the diamond contract after HALF of the short tokens have been redeemed", async () => {
          // ---------
          // Arrange: Get collateral token balance of diamond contract before short tokens are redeemed, calculate collateral to return
          // ---------
          collateralTokenBalanceDiamondBefore =
            await collateralTokenInstance.balanceOf(diamondAddress);
          expect(collateralTokenBalanceDiamondBefore).to.be.gt(0);
          tokensToRedeem = shortTokenBalanceBefore.div(2);
          feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
          fee = feesParams.protocolFee.add(feesParams.settlementFee);
          payoffsPerToken = calcPayoffPerToken(
            poolParamsBefore.floor,
            poolParamsBefore.inflection,
            poolParamsBefore.cap,
            poolParamsBefore.gradient,
            poolParamsBefore.finalReferenceValue,
            decimals,
            fee
          );
          expect(poolParamsBefore.payoutShort).to.eq(
            payoffsPerToken.payoffShortNet
          );
          totalPayout = calcPayout(
            payoffsPerToken.payoffShortNet,
            tokensToRedeem,
            decimals
          );

          // ---------
          // Act: Redeem short position tokens
          // ---------
          await settlementFacet
            .connect(user1)
            .redeemPositionToken(shortTokenInstance.address, tokensToRedeem);

          // ---------
          // Assert: Check that the collateral token balance of the diamond contract and collateralBalance in pool parameters are reduced by `totalPayout`
          // ---------
          poolParamsAfter = await getterFacet.getPoolParameters(poolId);
          expect(await collateralTokenInstance.balanceOf(diamondAddress)).to.eq(
            collateralTokenBalanceDiamondBefore.sub(totalPayout)
          );
          expect(poolParamsAfter.collateralBalance).to.eq(
            poolParamsBefore.collateralBalance.sub(totalPayout)
          );
        });

        it("Reduces the user`s short token balance to zero if user redeems ALL their short tokens", async () => {
          // ---------
          // Act: User redeems all their short position tokens
          // ---------
          tokensToRedeem = shortTokenBalanceBefore;
          await settlementFacet
            .connect(user1)
            .redeemPositionToken(shortTokenInstance.address, tokensToRedeem);

          // ---------
          // Assert: User's short token balance is reduced to zero
          // ---------
          expect(await shortTokenInstance.balanceOf(user1.address)).to.eq(0);
        });

        it("Reduces the user`s short token balance if user redeems HALF of their short tokens", async () => {
          // ---------
          // Act: User redeems half of their short position tokens
          // ---------
          tokensToRedeem = shortTokenBalanceBefore.div(2);
          await settlementFacet
            .connect(user1)
            .redeemPositionToken(shortTokenInstance.address, tokensToRedeem);

          // ---------
          // Assert: User's short token balance is reduced by `tokensToRedeem`
          // ---------
          expect(await shortTokenInstance.balanceOf(user1.address)).to.eq(
            shortTokenBalanceBefore.sub(tokensToRedeem)
          );
        });

        it("Increases the users collateral token balance if ALL short tokens are redeemed", async () => {
          // ---------
          // Arrange: Get user's collateral token balance before short tokens are redeemed, calculate collateral to return
          // ---------
          collateralTokenBalanceUserBefore =
            await collateralTokenInstance.balanceOf(user1.address);
          tokensToRedeem = shortTokenBalanceBefore;
          feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
          fee = feesParams.protocolFee.add(feesParams.settlementFee);
          payoffsPerToken = calcPayoffPerToken(
            poolParamsBefore.floor,
            poolParamsBefore.inflection,
            poolParamsBefore.cap,
            poolParamsBefore.gradient,
            poolParamsBefore.finalReferenceValue,
            decimals,
            fee
          );
          expect(poolParamsBefore.payoutShort).to.eq(
            payoffsPerToken.payoffShortNet
          );
          totalPayout = calcPayout(
            payoffsPerToken.payoffShortNet,
            tokensToRedeem,
            decimals
          );

          // ---------
          // Act: User redeems all of their short position tokens
          // ---------
          await settlementFacet
            .connect(user1)
            .redeemPositionToken(shortTokenInstance.address, tokensToRedeem);

          // ---------
          // Assert: Check that user's collateral token balance increases by `totalPayout`
          // ---------
          expect(await collateralTokenInstance.balanceOf(user1.address)).to.eq(
            collateralTokenBalanceUserBefore.add(totalPayout)
          );
        });

        it("Increases the users collateral token balance if HALF of their short tokens are redeemed", async () => {
          // ---------
          // Arrange: Get user's collateral token balance before short tokens are redeemed, calculate collateral to return
          // ---------
          collateralTokenBalanceUserBefore =
            await collateralTokenInstance.balanceOf(user1.address);
          tokensToRedeem = shortTokenBalanceBefore.div(2);
          feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
          fee = feesParams.protocolFee.add(feesParams.settlementFee);
          payoffsPerToken = calcPayoffPerToken(
            poolParamsBefore.floor,
            poolParamsBefore.inflection,
            poolParamsBefore.cap,
            poolParamsBefore.gradient,
            poolParamsBefore.finalReferenceValue,
            decimals,
            fee
          );
          expect(poolParamsBefore.payoutShort).to.eq(
            payoffsPerToken.payoffShortNet
          );
          totalPayout = calcPayout(
            payoffsPerToken.payoffShortNet,
            tokensToRedeem,
            decimals
          );

          // ---------
          // Act: User redeems half of their short position tokens
          // ---------
          await settlementFacet
            .connect(user1)
            .redeemPositionToken(shortTokenInstance.address, tokensToRedeem);

          // ---------
          // Assert: Check that user's collateral token balance increases by `totalPayout`
          // ---------
          expect(await collateralTokenInstance.balanceOf(user1.address)).to.eq(
            collateralTokenBalanceUserBefore.add(totalPayout)
          );
        });

        // ---------
        // Same tests but with long instead of short tokens
        // ---------
        it("Reduces the long token supply to zero if user redeems all their long tokens", async () => {
          // ---------
          // Arrange: Confirm that long token balance is equal to `longTokenBalanceBefore` (>0 ensured inside `createContingentPool`)
          // ---------
          expect(await longTokenInstance.totalSupply()).to.eq(
            longTokenBalanceBefore
          );

          // ---------
          // Act: User redeems all their long position tokens
          // ---------
          tokensToRedeem = longTokenBalanceBefore;
          await settlementFacet
            .connect(user1)
            .redeemPositionToken(longTokenInstance.address, tokensToRedeem);

          // ---------
          // Assert: Long token supply is reduced
          // ---------
          expect(await longTokenInstance.totalSupply()).to.eq(0);
        });

        it("Reduces the long token supply if user redeems all long tokens except for one", async () => {
          // ---------
          // Arrange: Confirm that long token balance is equal to `longTokenBalanceBefore` (>0 ensured inside `createContingentPool`)
          // ---------
          expect(await longTokenInstance.totalSupply()).to.eq(
            longTokenBalanceBefore
          );

          // ---------
          // Act: User redeems all long position tokens except for one
          // ---------
          tokensToRedeem = longTokenBalanceBefore.sub(1);
          await settlementFacet
            .connect(user1)
            .redeemPositionToken(longTokenInstance.address, tokensToRedeem);

          // ---------
          // Assert: Long token supply is reduced
          // ---------
          expect(await longTokenInstance.totalSupply()).to.eq(1);
        });

        it("Reduces the collateral balance of the diamond contract after ALL long tokens have been redeemed", async () => {
          // ---------
          // Arrange: Get collateral token balance of diamond contract before long tokens are redeemed, calculate collateral to return
          // ---------
          collateralTokenBalanceDiamondBefore =
            await collateralTokenInstance.balanceOf(diamondAddress);
          expect(collateralTokenBalanceDiamondBefore).to.be.gt(0);
          tokensToRedeem = longTokenBalanceBefore;
          feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
          fee = feesParams.protocolFee.add(feesParams.settlementFee);
          payoffsPerToken = calcPayoffPerToken(
            poolParamsBefore.floor,
            poolParamsBefore.inflection,
            poolParamsBefore.cap,
            poolParamsBefore.gradient,
            poolParamsBefore.finalReferenceValue,
            decimals,
            fee
          );
          expect(poolParamsBefore.payoutLong).to.eq(
            payoffsPerToken.payoffLongNet
          );
          totalPayout = calcPayout(
            payoffsPerToken.payoffLongNet,
            tokensToRedeem,
            decimals
          );

          // ---------
          // Act: Redeem long position tokens
          // ---------
          await settlementFacet
            .connect(user1)
            .redeemPositionToken(longTokenInstance.address, tokensToRedeem);

          // ---------
          // Assert: Check that the collateral token balance of the diamond contract and collateralBalance in pool parameters are reduced by `totalPayout`
          // ---------
          poolParamsAfter = await getterFacet.getPoolParameters(poolId);
          expect(await collateralTokenInstance.balanceOf(diamondAddress)).to.eq(
            collateralTokenBalanceDiamondBefore.sub(totalPayout)
          );
          expect(poolParamsAfter.collateralBalance).to.eq(
            poolParamsBefore.collateralBalance.sub(totalPayout)
          );
        });

        it("Reduces the collateral balance of the diamond contract after HALF of the long tokens have been redeemed", async () => {
          // ---------
          // Arrange: Get collateral token balance of diamond contract before long tokens are redeemed, calculate collateral to return
          // ---------
          collateralTokenBalanceDiamondBefore =
            await collateralTokenInstance.balanceOf(diamondAddress);
          expect(collateralTokenBalanceDiamondBefore).to.be.gt(0);
          tokensToRedeem = longTokenBalanceBefore.div(2);
          feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
          fee = feesParams.protocolFee.add(feesParams.settlementFee);
          payoffsPerToken = calcPayoffPerToken(
            poolParamsBefore.floor,
            poolParamsBefore.inflection,
            poolParamsBefore.cap,
            poolParamsBefore.gradient,
            poolParamsBefore.finalReferenceValue,
            decimals,
            fee
          );
          expect(poolParamsBefore.payoutLong).to.eq(
            payoffsPerToken.payoffLongNet
          );
          totalPayout = calcPayout(
            payoffsPerToken.payoffLongNet,
            tokensToRedeem,
            decimals
          );

          // ---------
          // Act: Redeem long position tokens
          // ---------
          await settlementFacet
            .connect(user1)
            .redeemPositionToken(longTokenInstance.address, tokensToRedeem);

          // ---------
          // Assert: Check that the collateral token balance of the diamond contract and collateralBalance in pool parameters are reduced by `totalPayout`
          // ---------
          poolParamsAfter = await getterFacet.getPoolParameters(poolId);
          expect(await collateralTokenInstance.balanceOf(diamondAddress)).to.eq(
            collateralTokenBalanceDiamondBefore.sub(totalPayout)
          );
          expect(poolParamsAfter.collateralBalance).to.eq(
            poolParamsBefore.collateralBalance.sub(totalPayout)
          );
        });

        it("Reduces the user`s long token balance to zero if user redeems ALL their long tokens", async () => {
          // ---------
          // Act: User redeems all their long position tokens
          // ---------
          tokensToRedeem = longTokenBalanceBefore;
          await settlementFacet
            .connect(user1)
            .redeemPositionToken(longTokenInstance.address, tokensToRedeem);

          // ---------
          // Assert: User's long token balance is reduced to zero
          // ---------
          expect(await longTokenInstance.balanceOf(user1.address)).to.eq(0);
        });

        it("Reduces the user`s long token balance if user redeems HALF of their long tokens", async () => {
          // ---------
          // Act: User redeems half of their long position tokens
          // ---------
          tokensToRedeem = longTokenBalanceBefore.div(2);
          await settlementFacet
            .connect(user1)
            .redeemPositionToken(longTokenInstance.address, tokensToRedeem);

          // ---------
          // Assert: User's long token balance is reduced by `tokensToRedeem`
          // ---------
          expect(await longTokenInstance.balanceOf(user1.address)).to.eq(
            longTokenBalanceBefore.sub(tokensToRedeem)
          );
        });

        it("Increases the users collateral token balance if ALL long tokens are redeemed", async () => {
          // ---------
          // Arrange: Get user's collateral token balance before long tokens are redeemed, calculate collateral to return
          // ---------
          collateralTokenBalanceUserBefore =
            await collateralTokenInstance.balanceOf(user1.address);
          tokensToRedeem = longTokenBalanceBefore;
          feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
          fee = feesParams.protocolFee.add(feesParams.settlementFee);
          payoffsPerToken = calcPayoffPerToken(
            poolParamsBefore.floor,
            poolParamsBefore.inflection,
            poolParamsBefore.cap,
            poolParamsBefore.gradient,
            poolParamsBefore.finalReferenceValue,
            decimals,
            fee
          );
          expect(poolParamsBefore.payoutLong).to.eq(
            payoffsPerToken.payoffLongNet
          );
          totalPayout = calcPayout(
            payoffsPerToken.payoffLongNet,
            tokensToRedeem,
            decimals
          );

          // ---------
          // Act: User redeems all of their long position tokens
          // ---------
          await settlementFacet
            .connect(user1)
            .redeemPositionToken(longTokenInstance.address, tokensToRedeem);

          // ---------
          // Assert: Check that user's collateral token balance increases by `totalPayout`
          // ---------
          expect(await collateralTokenInstance.balanceOf(user1.address)).to.eq(
            collateralTokenBalanceUserBefore.add(totalPayout)
          );
        });

        it("Increases the users collateral token balance if HALF of their long tokens are redeemed", async () => {
          // ---------
          // Arrange: Get user's collateral token balance before long tokens are redeemed, calculate collateral to return
          // ---------
          collateralTokenBalanceUserBefore =
            await collateralTokenInstance.balanceOf(user1.address);
          tokensToRedeem = longTokenBalanceBefore.div(2);
          feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
          fee = feesParams.protocolFee.add(feesParams.settlementFee);
          payoffsPerToken = calcPayoffPerToken(
            poolParamsBefore.floor,
            poolParamsBefore.inflection,
            poolParamsBefore.cap,
            poolParamsBefore.gradient,
            poolParamsBefore.finalReferenceValue,
            decimals,
            fee
          );
          expect(poolParamsBefore.payoutLong).to.eq(
            payoffsPerToken.payoffLongNet
          );
          totalPayout = calcPayout(
            payoffsPerToken.payoffLongNet,
            tokensToRedeem,
            decimals
          );

          // ---------
          // Act: User redeems half of their long position tokens
          // ---------
          await settlementFacet
            .connect(user1)
            .redeemPositionToken(longTokenInstance.address, tokensToRedeem);

          // ---------
          // Assert: Check that user's collateral token balance increases by `totalPayout`
          // ---------
          expect(await collateralTokenInstance.balanceOf(user1.address)).to.eq(
            collateralTokenBalanceUserBefore.add(totalPayout)
          );
        });

        it("Returns zero collateral if zero `_amount` is passed as argument", async () => {
          // ---------
          // Arrange: Confirm that user1 owns short position tokens
          // ---------
          expect(await shortTokenInstance.balanceOf(user1.address)).to.eq(
            collateralAmountInitial
          );
          collateralTokenBalanceDiamondBefore =
            await collateralTokenInstance.balanceOf(diamondAddress);
          collateralTokenBalanceUserBefore =
            await collateralTokenInstance.balanceOf(user1.address);

          // ---------
          // Act: User1 redeems 0 short tokens
          // ---------
          tokensToRedeem = BigNumber.from(0);
          await settlementFacet
            .connect(user1)
            .redeemPositionToken(poolParamsBefore.shortToken, tokensToRedeem);

          // ---------
          // Assert: Check that nothing has changed
          // ---------
          poolParamsAfter = await getterFacet.getPoolParameters(poolId);
          expect(poolParamsAfter.collateralBalance).to.eq(
            poolParamsBefore.collateralBalance
          );
          expect(await shortTokenInstance.balanceOf(user1.address)).to.eq(
            collateralAmountInitial
          );
          expect(await shortTokenInstance.totalSupply()).to.eq(
            collateralAmountInitial
          );
          expect(await collateralTokenInstance.balanceOf(diamondAddress)).to.eq(
            collateralTokenBalanceDiamondBefore
          );
          expect(await collateralTokenInstance.balanceOf(user1.address)).to.eq(
            collateralTokenBalanceUserBefore
          );
        });

        // -------------------------------------------
        // Events
        // -------------------------------------------

        it("Emits a PositionTokenRedeemed event", async () => {
          // ---------
          // Arrange: Redeem position tokens and calculate payout to user net of fees
          // ---------
          tokensToRedeem = await shortTokenInstance.balanceOf(user1.address);
          const tx = await settlementFacet
            .connect(user1)
            .redeemPositionToken(poolParamsBefore.shortToken, tokensToRedeem);
          const receipt = await tx.wait();

          feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
          fee = feesParams.protocolFee.add(feesParams.settlementFee);
          payoffsPerToken = calcPayoffPerToken(
            poolParamsBefore.floor,
            poolParamsBefore.inflection,
            poolParamsBefore.cap,
            poolParamsBefore.gradient,
            poolParamsBefore.finalReferenceValue,
            decimals,
            fee
          );
          expect(poolParamsBefore.payoutShort).to.eq(
            payoffsPerToken.payoffShortNet
          );
          totalPayout = calcPayout(
            payoffsPerToken.payoffShortNet,
            tokensToRedeem,
            decimals
          );

          // ---------
          // Act & Assert: Check that it emits a PositionTokenRedeemed event
          // ---------
          const positionTokenRedeemedEvent = receipt.events?.find(
            (item: any) => item.event === "PositionTokenRedeemed"
          );
          expect(positionTokenRedeemedEvent?.args?.poolId).to.eq(poolId);
          expect(positionTokenRedeemedEvent?.args?.positionToken).to.eq(
            poolParamsBefore.shortToken
          );
          expect(positionTokenRedeemedEvent?.args?.amountPositionToken).to.eq(
            tokensToRedeem
          );
          expect(
            positionTokenRedeemedEvent?.args?.collateralAmountReturned
          ).to.eq(totalPayout);
          expect(positionTokenRedeemedEvent?.args?.returnedTo).to.eq(
            user1.address
          );
        });

        // -------------------------------------------
        // Reverts
        // -------------------------------------------

        it("Reverts if user has insufficient short position tokens", async () => {
          // ---------
          // Arrange: Confirm that user2 has no short position tokens
          // ---------
          expect(await shortTokenInstance.balanceOf(user2.address)).to.eq(0);
          // ---------
          // Act & Assert: User2 tries to redeem short position tokens
          // ---------
          await expect(
            settlementFacet
              .connect(user2)
              .redeemPositionToken(poolParamsBefore.shortToken, 1)
          ).to.be.revertedWith("ERC20: burn amount exceeds balance");
        });

        it("Reverts if user has insufficient long position tokens", async () => {
          // ---------
          // Arrange: Confirm that user2 has no long position tokens
          // ---------
          expect(await longTokenInstance.balanceOf(user2.address)).to.eq(0);
          // ---------
          // Act & Assert: User2 tries to redeem long position tokens
          // ---------
          await expect(
            settlementFacet
              .connect(user2)
              .redeemPositionToken(poolParamsBefore.longToken, 1)
          ).to.be.revertedWith("ERC20: burn amount exceeds balance");
        });

        it("Reverts if the redemption was paused", async () => {
          // ---------
          // Arrange: Pause the functionality to redeem position tokens
          // ---------
          await governanceFacet
            .connect(contractOwner)
            .pauseReturnCollateral();
          govParams = await getterFacet.getGovernanceParameters();
          nextBlockTimestamp = (await getLastTimestamp()) + 1;
          await setNextTimestamp(ethers.provider, nextBlockTimestamp);
          expect(govParams.pauseReturnCollateralUntil).to.be.gt(
            nextBlockTimestamp
          );

          // ---------
          // Act & Assert: Confirm that the redemption of position tokens is not possible if contract is paused
          // ---------
          await expect(
            settlementFacet
              .connect(user1)
              .redeemPositionToken(poolParamsBefore.longToken, 1)
          ).to.be.revertedWith("ReturnCollateralPaused()");

          // ---------
          // Reset: Unpause again so that the remaining tests go through
          // ---------
          await governanceFacet
            .connect(contractOwner)
            .unpauseReturnCollateral();
        });
      });

      describe("redeemPositionToken where final value was submitted and not challenged", async () => {
        beforeEach(async () => {
          // ---------
          // Arrange: Data provider submits and it doesn't get challenged.
          // Given that the value has not been confiremd yet, fees were not allocated yet.
          // ---------
          finalReferenceValue = parseUnits("1700");
          allowChallenge = true;
          await settlementFacet
            .connect(oracle)
            .setFinalReferenceValue(
              poolId,
              finalReferenceValue,
              allowChallenge
            );
          poolParamsBefore = await getterFacet.getPoolParameters(poolId);
          challengePeriodEndTime =
            poolParamsBefore.statusTimestamp.add(challengePeriod);
          await setNextTimestamp(
            ethers.provider,
            challengePeriodEndTime.add(1).toNumber()
          ); // fast forward time to the end of the challenge period
          // Note that fees have been subtracted
          expect(poolParamsBefore.statusFinalReferenceValue).to.eq(1);
          shortTokenBalanceBefore = await shortTokenInstance.balanceOf(
            user1.address
          );
          longTokenBalanceBefore = await longTokenInstance.balanceOf(
            user1.address
          );
        });

        it("Confirms final reference value on first redeem after challenge period expired without a challenge", async () => {
          // ---------
          // Act: User redeems all their short position tokens
          // ---------
          tokensToRedeem = shortTokenBalanceBefore;
          await settlementFacet
            .connect(user1)
            .redeemPositionToken(shortTokenInstance.address, tokensToRedeem);

          // ---------
          // Assert: Check that status of final reference value is confirmed, statusTimestamp is updated and finalReferenceValue is unchanged
          // ---------
          poolParamsAfter = await getterFacet.getPoolParameters(poolId);
          expect(poolParamsAfter.statusFinalReferenceValue).to.eq(3); // Confirmed
          expect(poolParamsAfter.statusTimestamp).to.eq(
            await getLastTimestamp()
          ); // equal to block timestamp
          expect(poolParamsAfter.finalReferenceValue).to.eq(
            poolParamsBefore.finalReferenceValue
          ); // unchanged
        });

        it("Allocates fees to the DIVA treasury and the data provider", async () => {
          // ---------
          // Arrange: Confirm that DIVA treasury and data provider fee claim is zero
          // ---------
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              treasury.address
            )
          ).to.eq(0);
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              oracle.address
            )
          ).to.eq(0);

          // ---------
          // Act: User redeems all their short position tokens
          // ---------
          tokensToRedeem = shortTokenBalanceBefore;
          await settlementFacet
            .connect(user1)
            .redeemPositionToken(shortTokenInstance.address, tokensToRedeem);

          // ---------
          // Assert: Confirm that the protocol and settlement fees have been allocated to the DIVA treasury and data provider, respectively
          // ---------
          feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
          protocolFee = calcFee(
            feesParams.protocolFee,
            poolParamsBefore.collateralBalance,
            decimals
          );
          settlementFee = calcFee(
            feesParams.settlementFee,
            poolParamsBefore.collateralBalance,
            decimals
          );
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              treasury.address
            )
          ).to.eq(protocolFee);
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              oracle.address
            )
          ).to.eq(settlementFee);
        });

        it("Allocates fees to the new DIVA treasury if it changes before the pool gets confirmed", async () => {
          // ---------
          // Arrange: Confirm that DIVA treasury fee claim is zero for both current and new address,
          // and update treasury address and activate it by fast forwarding in time
          // ---------
          // Define a new treasury address and confirm that it's not equal to the current one
          const newTreasuryAddress = user2.address;
          govParamsBefore = await getterFacet.getGovernanceParameters();
          const currentTreasuryAddress = govParamsBefore.treasury
          expect(currentTreasuryAddress).to.not.eq(newTreasuryAddress);

          // Get fee claim for current treasury
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              currentTreasuryAddress
            )
          ).to.eq(0);

          // Get fee claim for new treasury
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              newTreasuryAddress
            )
          ).to.eq(0);

          // Update of treasury address
          await governanceFacet
            .connect(contractOwner)
            .updateTreasury(newTreasuryAddress);

          // Fast forward in time to activate the new treasury address
          nextBlockTimestamp = (await getterFacet.getTreasuryInfo()).startTimeTreasury.toNumber();
          await mineBlock(nextBlockTimestamp);

          // ---------
          // Act: User redeems their short position tokens. In this test, the final value will be
          // confirmed during that transaction as a value was already submitted and not challenged
          // ---------
          tokensToRedeem = shortTokenBalanceBefore;
          await settlementFacet
            .connect(user1)
            .redeemPositionToken(shortTokenInstance.address, tokensToRedeem);

          // ---------
          // Assert: Confirm that the protocol fee has been allocated to the new DIVA treasury and not the previous one
          // ---------
          feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
          protocolFee = calcFee(
            feesParams.protocolFee,
            poolParamsBefore.collateralBalance,
            decimals
          );
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              currentTreasuryAddress
            )
          ).to.eq(0);
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              newTreasuryAddress
            )
          ).to.eq(protocolFee);

          // ---------
          // Reset: Update treasury address to the one expected by other tests
          // ---------
          await governanceFacet
            .connect(contractOwner)
            .updateTreasury(treasury.address);

          // Fast forward in time to activate the new treasury address
          nextBlockTimestamp = (await getterFacet.getTreasuryInfo()).startTimeTreasury.toNumber();
          await mineBlock(nextBlockTimestamp);
        });

        it("Allocates fees to the previous DIVA treasury if an update of the treasury address was triggered but not yet activated", async () => {
          // ---------
          // Arrange: Confirm that DIVA treasury fee claim is zero for both current and new address,
          // and update treasury address but do not fast forward in time to have it pending
          // ---------
          // Define a new treasury address and confirm that it's not equal to the current one
          const newTreasuryAddress = user2.address;
          govParamsBefore = await getterFacet.getGovernanceParameters();
          const currentTreasuryAddress = govParamsBefore.treasury
          expect(currentTreasuryAddress).to.not.eq(newTreasuryAddress);

          // Get fee claim for current treasury
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              currentTreasuryAddress
            )
          ).to.eq(0);

          // Get fee claim for new treasury
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              newTreasuryAddress
            )
          ).to.eq(0);

          // Update of treasury address
          await governanceFacet
            .connect(contractOwner)
            .updateTreasury(newTreasuryAddress);

          // Note: Not fast forwarding in time here as opposed to the previous test to not activate the new treasury address

          // ---------
          // Act: User redeems their short position tokens. In this test, the final value will be
          // confirmed during that transaction as a value was already submitted and not challenged
          // ---------
          tokensToRedeem = shortTokenBalanceBefore;
          await settlementFacet
            .connect(user1)
            .redeemPositionToken(shortTokenInstance.address, tokensToRedeem);

          // ---------
          // Assert: Confirm that the protocol fee has been allocated to the new DIVA treasury and not the previous one
          // ---------
          feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
          protocolFee = calcFee(
            feesParams.protocolFee,
            poolParamsBefore.collateralBalance,
            decimals
          );
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              currentTreasuryAddress
            )
          ).to.eq(protocolFee);
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              newTreasuryAddress
            )
          ).to.eq(0);

          // ---------
          // Reset: Revoke pending treasury address change to use the one expected by other tests
          // ---------
          await governanceFacet
            .connect(contractOwner)
            .revokePendingTreasuryUpdate();  
        });

        it("Sets the payout amounts for long and short token", async () => {
          // ---------
          // Arrange: Check that both `payoutLong` and `payoutShort` are zero (initial state when pool is created)
          // ---------
          expect(poolParamsBefore.payoutLong).to.be.eq(0);
          expect(poolParamsBefore.payoutShort).to.be.eq(0);
          feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
          settlementFee = calcFee(
            feesParams.settlementFee,
            poolParamsBefore.collateralBalance,
            decimals
          );
          protocolFee = calcFee(
            feesParams.protocolFee,
            poolParamsBefore.collateralBalance,
            decimals
          );

          // ---------
          // Act: User redeems all their short position tokens
          // ---------
          tokensToRedeem = shortTokenBalanceBefore;
          await settlementFacet
            .connect(user1)
            .redeemPositionToken(shortTokenInstance.address, tokensToRedeem);

          // ---------
          // Assert: Confirm that the payout amount per long and short token (net of fees) is set correctly
          // ---------
          poolParamsAfter = await getterFacet.getPoolParameters(poolId);
          fee = feesParams.protocolFee.add(feesParams.settlementFee);
          payoffsPerToken = calcPayoffPerToken(
            poolParamsBefore.floor,
            poolParamsBefore.inflection,
            poolParamsBefore.cap,
            poolParamsAfter.gradient,
            finalReferenceValue,
            decimals,
            fee
          );

          expect(poolParamsAfter.payoutLong).to.eq(
            payoffsPerToken.payoffLongNet
          );
          expect(poolParamsAfter.payoutShort).to.eq(
            payoffsPerToken.payoffShortNet
          );
        });

        it("Does not allocate fees twice", async () => {
          // ---------
          // Arrange: Confirm the final reference value by calling the `redeemPositionToken` function the first time and get the allocated fee claims
          // ---------
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              oracle.address
            )
          ).to.eq(0);

          // Redeem position token
          tokensToRedeem = shortTokenBalanceBefore.div(3);
          await settlementFacet
            .connect(user1)
            .redeemPositionToken(longTokenInstance.address, tokensToRedeem);
          // Get fees
          feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
          protocolFee = calcFee(
            feesParams.protocolFee,
            poolParamsBefore.collateralBalance,
            decimals
          );
          settlementFee = calcFee(
            feesParams.settlementFee,
            poolParamsBefore.collateralBalance,
            decimals
          );

          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              treasury.address
            )
          ).to.eq(protocolFee);
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              oracle.address
            )
          ).to.eq(settlementFee);

          // ---------
          // Act: Second protocol
          // ---------
          await settlementFacet
            .connect(user1)
            .redeemPositionToken(longTokenInstance.address, tokensToRedeem);

          // ---------
          // Assert: Check that fee claims are unchanged
          // ---------
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              treasury.address
            )
          ).to.eq(protocolFee);
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              oracle.address
            )
          ).to.eq(settlementFee);
        });

        // -------------------------------------------
        // Events
        // -------------------------------------------

        it("Emits a StatusChanged event", async () => {
          // ---------
          // Act: First redeem of position tokens
          // ---------
          tokensToRedeem = shortTokenBalanceBefore;
          const tx = await settlementFacet
            .connect(user1)
            .redeemPositionToken(shortTokenInstance.address, tokensToRedeem);
          const receipt = await tx.wait();

          // ---------
          // Assert: Check that it emits a StatusChanged event
          // ---------
          const statusChangedEvent = receipt.events?.find(
            (item: any) => item.event === "StatusChanged"
          );
          expect(statusChangedEvent?.args?.statusFinalReferenceValue).to.eq(3); // 3 = Confirmed
          expect(statusChangedEvent?.args?.by).to.eq(user1.address);
          expect(statusChangedEvent?.args?.poolId).to.eq(poolId);
          expect(statusChangedEvent?.args?.proposedFinalReferenceValue).to.eq(
            poolParamsBefore.finalReferenceValue
          );
        });
      });

      describe("redeemPositionToken where final value was submitted, challenged but data provider didn`t respond", async () => {
        beforeEach(async () => {
          // ---------
          // Arrange: Data provider submits and it doesn't get challenged.
          // Given that the value has not been confiremd yet, fees were not allocated yet.
          // ---------
          finalReferenceValue = parseUnits("1700");
          allowChallenge = true;
          await settlementFacet
            .connect(oracle)
            .setFinalReferenceValue(
              poolId,
              finalReferenceValue,
              allowChallenge
            );
          await settlementFacet
            .connect(user1)
            .challengeFinalReferenceValue(poolId, finalReferenceValue);

          poolParamsBefore = await getterFacet.getPoolParameters(poolId);
          reviewPeriodEndTime =
            poolParamsBefore.statusTimestamp.add(reviewPeriod);
          await setNextTimestamp(
            ethers.provider,
            reviewPeriodEndTime.add(1).toNumber()
          ); // fast forward time to the end of the review period
          // Note that fees have been subtracted
          expect(poolParamsBefore.statusFinalReferenceValue).to.eq(2);
          shortTokenBalanceBefore = await shortTokenInstance.balanceOf(
            user1.address
          );
          longTokenBalanceBefore = await longTokenInstance.balanceOf(
            user1.address
          );
        });

        it("Confirms final reference value on first redeem after review period expired without another submission", async () => {
          // ---------
          // Act: User redeems all their short position tokens
          // ---------
          tokensToRedeem = shortTokenBalanceBefore;
          await settlementFacet
            .connect(user1)
            .redeemPositionToken(shortTokenInstance.address, tokensToRedeem);

          // ---------
          // Assert: Check that status of final reference value is confirmed, statusTimestamp is updated and finalReferenceValue is unchanged
          // ---------
          poolParamsAfter = await getterFacet.getPoolParameters(poolId);
          expect(poolParamsAfter.statusFinalReferenceValue).to.eq(3); // Confirmed
          expect(poolParamsAfter.statusTimestamp).to.eq(
            await getLastTimestamp()
          ); // equal to block timestamp
          expect(poolParamsAfter.finalReferenceValue).to.eq(
            poolParamsBefore.finalReferenceValue
          ); // unchanged
        });

        it("Allocates fees to the DIVA treasury and the data provider", async () => {
          // ---------
          // Arrange: Confirm that DIVA treasury and data provider fee claim is zero
          // ---------
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              treasury.address
            )
          ).to.eq(0);
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              oracle.address
            )
          ).to.eq(0);

          // ---------
          // Act: User redeems all their short position tokens
          // ---------
          tokensToRedeem = shortTokenBalanceBefore;
          await settlementFacet
            .connect(user1)
            .redeemPositionToken(shortTokenInstance.address, tokensToRedeem);

          // ---------
          // Assert: Confirm that the protocol and settlement fees have been allocated to the DIVA treasury and data provider, respectively
          // ---------
          feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
          protocolFee = calcFee(
            feesParams.protocolFee,
            poolParamsBefore.collateralBalance,
            decimals
          );
          settlementFee = calcFee(
            feesParams.settlementFee,
            poolParamsBefore.collateralBalance,
            decimals
          );
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              treasury.address
            )
          ).to.eq(protocolFee);
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              oracle.address
            )
          ).to.eq(settlementFee);
        });

        it("Allocates fees to the new DIVA treasury if it changes before the pool gets confirmed", async () => {
          // ---------
          // Arrange: Confirm that DIVA treasury fee claim is zero for both current and new address,
          // and update treasury address and activate it by fast forwarding in time
          // ---------
          // Define a new treasury address and confirm that it's not equal to the current one
          const newTreasuryAddress = user2.address;
          govParamsBefore = await getterFacet.getGovernanceParameters();
          const currentTreasuryAddress = govParamsBefore.treasury
          expect(currentTreasuryAddress).to.not.eq(newTreasuryAddress);

          // Get fee claim for current treasury
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              currentTreasuryAddress
            )
          ).to.eq(0);

          // Get fee claim for new treasury
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              newTreasuryAddress
            )
          ).to.eq(0);

          // Update of treasury address
          await governanceFacet
            .connect(contractOwner)
            .updateTreasury(newTreasuryAddress);

          // Fast forward in time to activate the new treasury address
          nextBlockTimestamp = (await getterFacet.getTreasuryInfo()).startTimeTreasury.toNumber();
          await mineBlock(nextBlockTimestamp);

          // ---------
          // Act: User redeems their short position tokens. In this test, the final value will be
          // confirmed during that transaction as the first submitted value is challenged by data provider
          // doesn't submit a new one
          // ---------
          tokensToRedeem = shortTokenBalanceBefore;
          await settlementFacet
            .connect(user1)
            .redeemPositionToken(shortTokenInstance.address, tokensToRedeem);

          // ---------
          // Assert: Confirm that the protocol fee has been allocated to the new DIVA treasury and not the previous one
          // ---------
          feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
          protocolFee = calcFee(
            feesParams.protocolFee,
            poolParamsBefore.collateralBalance,
            decimals
          );
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              currentTreasuryAddress
            )
          ).to.eq(0);
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              newTreasuryAddress
            )
          ).to.eq(protocolFee);

          // ---------
          // Reset: Update treasury address to the one expected by other tests
          // ---------
          await governanceFacet
            .connect(contractOwner)
            .updateTreasury(treasury.address);

          // Fast forward in time to activate the new treasury address
          nextBlockTimestamp = (await getterFacet.getTreasuryInfo()).startTimeTreasury.toNumber();
          await mineBlock(nextBlockTimestamp);
        });

        it("Allocates fees to the new DIVA treasury if an update of the treasury address was triggered but not yet activated", async () => {
          // ---------
          // Arrange: Confirm that DIVA treasury fee claim is zero for both current and new address,
          // and update treasury address but do not fast forward in time to have it pending
          // ---------
          // Define a new treasury address and confirm that it's not equal to the current one
          const newTreasuryAddress = user2.address;
          govParamsBefore = await getterFacet.getGovernanceParameters();
          const currentTreasuryAddress = govParamsBefore.treasury
          expect(currentTreasuryAddress).to.not.eq(newTreasuryAddress);

          // Get fee claim for current treasury
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              currentTreasuryAddress
            )
          ).to.eq(0);

          // Get fee claim for new treasury
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              newTreasuryAddress
            )
          ).to.eq(0);

          // Update of treasury address
          await governanceFacet
            .connect(contractOwner)
            .updateTreasury(newTreasuryAddress);

          // Note: Not fast forwarding in time here as opposed to the previous test to not activate the new treasury address

          // ---------
          // Act: User redeems their short position tokens. In this test, the final value will be
          // confirmed during that transaction as the first submitted value is challenged by data provider
          // doesn't submit a new one
          // ---------
          tokensToRedeem = shortTokenBalanceBefore;
          await settlementFacet
            .connect(user1)
            .redeemPositionToken(shortTokenInstance.address, tokensToRedeem);

          // ---------
          // Assert: Confirm that the protocol fee has been allocated to the new DIVA treasury and not the previous one
          // ---------
          feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
          protocolFee = calcFee(
            feesParams.protocolFee,
            poolParamsBefore.collateralBalance,
            decimals
          );
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              currentTreasuryAddress
            )
          ).to.eq(protocolFee);
          expect(
            await getterFacet.getClaim(
              poolParamsBefore.collateralToken,
              newTreasuryAddress
            )
          ).to.eq(0);

          // ---------
          // Reset: Revoke pending treasury address change to use the one expected by other tests
          // ---------
          await governanceFacet
            .connect(contractOwner)
            .revokePendingTreasuryUpdate();
        });
      });

      // -------------------------------------------
      // Reverts
      // -------------------------------------------

      it("Reverts if position token is zero address", async () => {
        // ---------
        // Act & Assert: Confirm that position token redemption reverts
        // ---------
        await expect(
          settlementFacet
            .connect(user1)
            .redeemPositionToken(ethers.constants.AddressZero, 1)
        ).to.be.reverted;
      });

      it("Reverts if status is Open", async () => {
        // ---------
        // Arrange: Confirm that status is Open
        // ---------
        expect(await poolParams.statusFinalReferenceValue).to.be.eq(0); // Open

        // ---------
        // Act & Assert: Confirm that position token redemption reverts
        // ---------
        await expect(
          settlementFacet
            .connect(user1)
            .redeemPositionToken(poolParams.shortToken, 1)
        ).to.be.revertedWith("FinalReferenceValueNotSet()");
      });

      it("Reverts if an fake position token with a valid poolId is provided", async () => {
        // ---------
        // Arrange: A user creates a fake position token with a valid poolId and data provider confirms the final reference value
        // which allows position token holders to redeem their position tokens
        // ---------
        // Create position token with an existing poolId
        const fakePositionTokenInstance = await fakePositionTokenDeployFixture(
          "L1",
          "L1",
          poolId,
          user1.address
        );
        const initialFakePositionTokenBalance = "10000";
        await fakePositionTokenInstance
          .connect(user1)
          .mint(user1.address, initialFakePositionTokenBalance);
        expect(await fakePositionTokenInstance.balanceOf(user1.address)).to.eq(
          initialFakePositionTokenBalance
        );

        // Data provider confirms final reference value
        finalReferenceValue = parseUnits("1700");
        allowChallenge = false;
        await settlementFacet
          .connect(oracle)
          .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge);

        // ---------
        // Act & Assert: User tries to redeem fake position tokens
        // ---------
        await expect(
          settlementFacet
            .connect(user1)
            .redeemPositionToken(fakePositionTokenInstance.address, 1)
        ).to.be.revertedWith("InvalidPositionToken()");
      });

      it("Reverts if triggered before challenge period end", async () => {
        // ---------
        // Arrange: Data provider submits a value and enables the possibility to challenge
        // ---------
        finalReferenceValue = parseUnits("1700");
        allowChallenge = true;
        await settlementFacet
          .connect(oracle)
          .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge);
        poolParamsBefore = await getterFacet.getPoolParameters(poolId);
        expect(poolParamsBefore.statusFinalReferenceValue).to.eq(1); // Submitted

        challengePeriodEndTime =
          poolParamsBefore.statusTimestamp.add(challengePeriod);
        await setNextTimestamp(
          ethers.provider,
          challengePeriodEndTime.toNumber()
        ); // set timestamp of next block to the last possible moment to challenge

        // ---------
        // Act & Assert: Confirm that redeeming position tokens fails
        // ---------
        await expect(
          settlementFacet
            .connect(user1)
            .redeemPositionToken(poolParamsBefore.shortToken, 1)
        ).to.be.revertedWith("ChallengePeriodNotExpired()");
      });

      it("Reverts if triggered before review period end", async () => {
        // ---------
        // Arrange: Data provider submits a value and enables the possibility to challenge
        // ---------
        // Data provider submits a value
        finalReferenceValue = parseUnits("1700");
        allowChallenge = true;
        await settlementFacet
          .connect(oracle)
          .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge);
        // Position token holder (user1) challenges the submitted value
        await settlementFacet
          .connect(user1)
          .challengeFinalReferenceValue(poolId, finalReferenceValue);
        poolParamsBefore = await getterFacet.getPoolParameters(poolId);
        expect(poolParamsBefore.statusFinalReferenceValue).to.eq(2); // Challenged

        reviewPeriodEndTime =
          poolParamsBefore.statusTimestamp.add(reviewPeriod);
        await setNextTimestamp(ethers.provider, reviewPeriodEndTime.toNumber()); // set timestamp of next block to the last possible moment to submit another value

        // ---------
        // Act & Assert: Confirm that redeeming position tokens fails
        // ---------
        await expect(
          settlementFacet
            .connect(user1)
            .redeemPositionToken(poolParamsBefore.shortToken, 1)
        ).to.be.revertedWith("ReviewPeriodNotExpired()");
      });
    });

    describe("redeemPositionToken tests with permissioned position token", async () => {
      let permissionedERC721TokenInstance: MockERC721;
      let permissionedERC721Token: string;

      beforeEach(async () => {
        // ---------
        // Arrange: Mint a set of position tokens with expiry shortly after the last block's timestamp and note that fees are already deducated after `setFinalReferenceValue`.
        // ---------
        permissionedERC721TokenInstance = await erc721DeployFixture(
          "PermissionedERC721Token",
          "PNFT"
        );
        await permissionedERC721TokenInstance.connect(user1).mint();
        await permissionedERC721TokenInstance.connect(user2).mint();
        permissionedERC721Token = permissionedERC721TokenInstance.address;

        nextBlockTimestamp = (await getLastTimestamp()) + 1;
        await setNextTimestamp(ethers.provider, nextBlockTimestamp);
        const tx = await createContingentPool({
          expireInSeconds: 2,
          permissionedERC721Token,
        });
        poolId = await getPoolIdFromTx(tx);

        finalReferenceValue = parseUnits("1700");
        allowChallenge = false;
        await settlementFacet
          .connect(oracle)
          .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge);
        // Note that fees have been subtracted
        poolParamsBefore = await getterFacet.getPoolParameters(poolId);
        expect(poolParamsBefore.statusFinalReferenceValue).to.eq(3);
        shortTokenInstance = await positionTokenAttachFixture(
          poolParamsBefore.shortToken
        );
      });

      // -------------------------------------------
      // Functionality
      // -------------------------------------------
      it("Should allow permissioned recipients to redeem", async () => {
        // ---------
        // Arrange: Set amount to redeem and confirm that user1 is permissioned
        // ---------
        tokensToRedeem = await shortTokenInstance.balanceOf(user1.address);
        expect(await shortTokenInstance.totalSupply()).to.eq(tokensToRedeem);

        expect(
          await permissionedERC721TokenInstance.balanceOf(user1.address)
        ).to.gt(0);

        // ---------
        // Act: User (permissioned recipient) redeems all their short position tokens
        // ---------
        await settlementFacet
          .connect(user1)
          .redeemPositionToken(shortTokenInstance.address, tokensToRedeem);

        // ---------
        // Assert: Short token supply is reduced
        // ---------
        expect(await shortTokenInstance.totalSupply()).to.eq(0);
      });

      it("Should allow non-permissioned recipients to redeem", async () => {
        // ---------
        // Arrange: Set amount to redeem and transfer all permissionedERC721Token from user1 to other account (account[0]) to render user1 non-permissioned
        // ---------
        tokensToRedeem = await shortTokenInstance.balanceOf(user1.address);
        expect(await shortTokenInstance.totalSupply()).to.eq(tokensToRedeem);

        const recipient = accounts[0].address;
        await permissionedERC721TokenInstance
          .connect(user1)
          .transferFrom(user1.address, recipient, 1);
        expect(
          await permissionedERC721TokenInstance.balanceOf(user1.address)
        ).to.eq(0);

        // ---------
        // Act: User (non-permissioned recipient) redeems all their short position tokens
        // ---------
        await settlementFacet
          .connect(user1)
          .redeemPositionToken(shortTokenInstance.address, tokensToRedeem);

        // ---------
        // Assert: Short token supply is reduced
        // ---------
        expect(await shortTokenInstance.totalSupply()).to.eq(0);
      });
    });

    describe("batchRedeemPositionToken", async () => {
      beforeEach(async () => {
        // ---------
        // Arrange: Mint a set of position tokens with expiry shortly after the last block's timestamp and set final reference value for that
        // ---------
        nextBlockTimestamp = (await getLastTimestamp()) + 1;
        await setNextTimestamp(ethers.provider, nextBlockTimestamp);
        const tx = await createContingentPool({
          expireInSeconds: 2,
        });
        poolId = await getPoolIdFromTx(tx);
        poolParams = await getterFacet.getPoolParameters(poolId);

        shortTokenInstance = await positionTokenAttachFixture(
          poolParams.shortToken
        );
        longTokenInstance = await positionTokenAttachFixture(
          poolParams.longToken
        );

        // Note that fees are already deducated after `setFinalReferenceValue`.
        finalReferenceValue = parseUnits("1700");
        allowChallenge = false;
        await settlementFacet
          .connect(oracle)
          .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge);

        poolParamsBefore = await getterFacet.getPoolParameters(poolId);
        expect(poolParamsBefore.statusFinalReferenceValue).to.eq(3);
        shortTokenBalanceBefore = await shortTokenInstance.balanceOf(
          user1.address
        );
        longTokenBalanceBefore = await longTokenInstance.balanceOf(
          user1.address
        );
      });

      // -------------------------------------------
      // Functionality
      // -------------------------------------------

      it("Reduces the position token supply to zero if user redeems all their position tokens using batchRedeemPositionToken function", async () => {
        // ---------
        // Arrange: Confirm that position token balances are equal to `shortTokenBalanceBefore` and longTokenBalanceBefore (>0 ensured insided `createContingentPool`)
        // ---------
        expect(await shortTokenInstance.totalSupply()).to.eq(
          shortTokenBalanceBefore
        );
        expect(await longTokenInstance.totalSupply()).to.eq(
          longTokenBalanceBefore
        );

        // ---------
        // Act: User redeems all their position tokens
        // ---------
        const tokensToRedeem1 = shortTokenBalanceBefore;
        const tokensToRedeem2 = longTokenBalanceBefore;
        await settlementFacet.connect(user1).batchRedeemPositionToken([
          {
            positionToken: shortTokenInstance.address,
            amount: tokensToRedeem1,
          },
          {
            positionToken: longTokenInstance.address,
            amount: tokensToRedeem2,
          },
        ]);

        // ---------
        // Assert: Position token supply is reduced
        // ---------
        expect(await shortTokenInstance.totalSupply()).to.eq(0);
        expect(await longTokenInstance.totalSupply()).to.eq(0);
      });
    });
  });
});