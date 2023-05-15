import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, BigNumberish, ContractTransaction } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
  GetterFacet,
  GovernanceFacet,
  LiquidityFacet,
  MockERC20,
  DIVAToken,
  PoolFacet,
  SettlementFacet,
  DIVAOwnershipMain,
} from "../typechain-types";
import { LibDIVAStorage } from "../typechain-types/contracts/facets/GetterFacet";

import {
  FeeType,
  GovParams,
  SettlementPeriodType,
  Status,
  ONE_DAY,
} from "../constants";
import {
  mineBlock,
  getLastTimestamp,
  setNextTimestamp,
  calcFee,
  getPoolIdFromTx,
  createContingentPool,
  decimals,
  defaultPoolParameters,
  CreateContingentPoolParams,
} from "../utils";
import { deployMain } from "../scripts/deployMain";

import { erc20DeployFixture } from "./fixtures";

const MAX_UINT = ethers.constants.MaxUint256;

describe("GovernanceFacet", async function () {
  let contractOwner: SignerWithAddress,
    treasury: SignerWithAddress,
    oracle: SignerWithAddress,
    user1: SignerWithAddress,
    user2: SignerWithAddress;

  let diamondAddress: string;
  let poolFacet: PoolFacet,
    getterFacet: GetterFacet,
    governanceFacet: GovernanceFacet,
    liquidityFacet: LiquidityFacet,
    settlementFacet: SettlementFacet,
    ownershipContract: DIVAOwnershipMain,
    divaToken: DIVAToken;

  let collateralTokenInstance: MockERC20;
  let ownershipContractAddress: string;
  let divaTokenAddress: string;

  let protocolFeeDefault: BigNumber,
    settlementFeeDefault: BigNumber,
    submissionPeriodDefault: number,
    challengePeriodDefault: number,
    reviewPeriodDefault: number,
    fallbackSubmissionPeriodDefault: number,
    nextBlockTimestamp: BigNumberish,
    lastBlockTimestamp: number;

  let govParams: GovParams,
    govParamsBefore: GovParams,
    govParamsAfter: GovParams;
  let poolId: string, poolId1: string, poolId2: string;
  let poolParams1: LibDIVAStorage.PoolStructOutput,
    poolParams2: LibDIVAStorage.PoolStructOutput;
  let newFee: BigNumber, newFee1: BigNumber, newFee2: BigNumber;
  let newPeriod: number, newPeriod1: number, newPeriod2: number;
  let feesLengthBefore: BigNumber, feesLengthAfter: BigNumber;
  let settlementPeriodsLengthBefore, settlementPeriodsLengthAfter: BigNumber;
  let governanceDelay: number = 60 * ONE_DAY;
  let treasuryUpdateDelay: number = 2 * ONE_DAY;
  let newFallbackDataProvider: string;
  let fallbackDataProviderInfo: any,
    treasuryInfo: any;

  let newTreasuryAddress: string;

  let createContingentPoolParams: CreateContingentPoolParams;

  before(async function () {
    [contractOwner, treasury, oracle, user1, user2] = await ethers.getSigners(); // keep contractOwner and treasury at first two positions in line with deploy script

    // ---------
    // Setup: Deploy diamond contract (incl. facets) and connect to the diamond contract via facet specific ABI's
    // ---------
    diamondAddress = (await deployMain())[0];
    poolFacet = await ethers.getContractAt("PoolFacet", diamondAddress);
    getterFacet = await ethers.getContractAt("GetterFacet", diamondAddress);
    governanceFacet = await ethers.getContractAt(
      "GovernanceFacet",
      diamondAddress
    );
    liquidityFacet = await ethers.getContractAt(
      "LiquidityFacet",
      diamondAddress
    );
    settlementFacet = await ethers.getContractAt(
      "SettlementFacet",
      diamondAddress
    );

    ownershipContractAddress = await getterFacet.getOwnershipContract();
    ownershipContract = await ethers.getContractAt(
      "DIVAOwnershipMain",
      ownershipContractAddress
    );

    divaTokenAddress = await ownershipContract.getDIVAToken();
    divaToken = await ethers.getContractAt("DIVAToken", divaTokenAddress);

    govParams = await getterFacet.getGovernanceParameters();
    protocolFeeDefault = govParams.currentFees.protocolFee; // 0.25%
    settlementFeeDefault = govParams.currentFees.settlementFee; // 0.05%
    submissionPeriodDefault =
      govParams.currentSettlementPeriods.submissionPeriod; // 7d
    challengePeriodDefault = govParams.currentSettlementPeriods.challengePeriod; // 3d
    reviewPeriodDefault = govParams.currentSettlementPeriods.reviewPeriod; // 5d
    fallbackSubmissionPeriodDefault =
      govParams.currentSettlementPeriods.fallbackSubmissionPeriod; // 10d
    expect(protocolFeeDefault).to.eq(2500000000000000);
    expect(settlementFeeDefault).to.eq(500000000000000);
    expect(submissionPeriodDefault).to.eq(7 * ONE_DAY);
    expect(challengePeriodDefault).to.eq(3 * ONE_DAY);
    expect(reviewPeriodDefault).to.eq(5 * ONE_DAY);
    expect(fallbackSubmissionPeriodDefault).to.eq(10 * ONE_DAY);

    // Approve DIVA token for staking
    await divaToken
      .connect(contractOwner)
      .approve(ownershipContractAddress, ethers.constants.MaxUint256);

    // Stake for contract owner and user 2
    await ownershipContract.stake(contractOwner.address, "100");
    await ownershipContract.stake(user2.address, "101"); // 1 vote more so that user2 can trigger election cycle
  });

  beforeEach(async () => {
    // ---------
    // Arrange: Create a contingent pool and set start pool ids
    // ---------
    const user1StartCollateralTokenBalance = 100000000000;

    // Mint ERC20 collateral token with `decimals` decimals and send it to user 1
    collateralTokenInstance = await erc20DeployFixture(
      "DummyCollateralToken",
      "DCT",
      parseUnits(user1StartCollateralTokenBalance.toString(), decimals),
      user1.address,
      decimals,
      "0"
    );

    // Set user1 allowances for Diamond contract
    await collateralTokenInstance
      .connect(user1)
      .approve(diamondAddress, MAX_UINT);

    // Specify the create contingent pool parameters that don't define a default value.
    // Refer to `utils/libDiva.ts` for default values.
    createContingentPoolParams = {
      ...defaultPoolParameters,
      collateralToken: collateralTokenInstance.address,
      dataProvider: oracle.address,
      poolCreater: user1,
      poolFacet: poolFacet,
      longRecipient: user1.address,
      shortRecipient: user1.address,
    }
  });

  afterEach(async () => {
    // Fast forward in time to activate any pending fees/settlement period updates
    // as otherwise `updateFees` and `updateSettlementPeriods` will revert
    nextBlockTimestamp = (await getLastTimestamp()) + governanceDelay + 1;
    await mineBlock(nextBlockTimestamp);

    // Reset to default values
    await governanceFacet
      .connect(contractOwner)
      .updateFees(protocolFeeDefault, settlementFeeDefault);
    await governanceFacet
      .connect(contractOwner)
      .updateSettlementPeriods(
        submissionPeriodDefault,
        challengePeriodDefault,
        reviewPeriodDefault,
        fallbackSubmissionPeriodDefault
      );

    // Fast forward in time to activate the default settings
    nextBlockTimestamp = (await getLastTimestamp()) + governanceDelay + 1;
    await mineBlock(nextBlockTimestamp);
  });

  describe("updateFees", async () => {
    // -------------------------------------------
    // Functionality
    // -------------------------------------------

    it("Allows the contract owner to set the protocol and settlement fee", async () => {
      // ---------
      // Arrange: Define the new protocol and settlement fee and confirm that it's not equal to the current one
      // ---------
      newFee = parseUnits("0.01"); // 1%, applicable to both for simplicity
      govParamsBefore = await getterFacet.getGovernanceParameters();
      feesLengthBefore = await getterFacet.getFeesHistoryLength();
      expect(govParamsBefore.currentFees.protocolFee).to.not.eq(newFee);
      expect(govParamsBefore.currentFees.settlementFee).to.not.eq(newFee);

      // ---------
      // Act: Contract owner sets protocol and settlement fee
      // ---------
      await governanceFacet.connect(contractOwner).updateFees(newFee, newFee);

      // Get time of `updateFees` transaction for `startTime` variable verification
      lastBlockTimestamp = await getLastTimestamp();

      // Fast forward in time to activate the new fee regime
      nextBlockTimestamp = (await getLastTimestamp()) + governanceDelay + 1;
      await mineBlock(nextBlockTimestamp);

      // ---------
      // Assert: Confirm that the new protocol and settlement fee was set in the
      // governance parameters and the lenght of the fees has reduced
      // ---------
      govParamsAfter = await getterFacet.getGovernanceParameters();
      feesLengthAfter = await getterFacet.getFeesHistoryLength();

      // Confirm that new fees were set
      expect(govParamsAfter.currentFees.protocolFee).to.eq(newFee);
      expect(govParamsAfter.currentFees.settlementFee).to.eq(newFee);
      expect(govParamsAfter.currentFees.startTime).to.eq(
        lastBlockTimestamp + governanceDelay
      );

      // Confirm that length of history has reduced
      expect(feesLengthAfter).to.eq(feesLengthBefore.add(1));
    });

    it("Should apply new fees when liquidity is removed for a new contingent pool created", async () => {
      // ---------
      // Arrange: Create a contingent pool and remove liquidity, and afterwards set a new protocol fee
      // ---------
      // Set token amount to redeem
      const positionTokensToRedeem = createContingentPoolParams.collateralAmount.sub(1);

      // Create a contingent pool before fees are updated
      const tx1 = await createContingentPool(createContingentPoolParams);
      lastBlockTimestamp = await getLastTimestamp();
      poolId1 = await getPoolIdFromTx(tx1);

      // Get pool params and fee params
      poolParams1 = await getterFacet.getPoolParameters(poolId1);
      const feeParams1 = await getterFacet.getFees(poolParams1.indexFees);
      expect(feeParams1.protocolFee).to.eq(protocolFeeDefault);
      expect(feeParams1.settlementFee).to.eq(settlementFeeDefault);
      expect(feeParams1.startTime).to.be.lt(lastBlockTimestamp);

      // Calculate fees for poolId1
      const protocolFee1 = calcFee(
        feeParams1.protocolFee,
        positionTokensToRedeem,
        decimals
      );
      const settlementFee1 = calcFee(
        feeParams1.settlementFee,
        positionTokensToRedeem,
        decimals
      );
      expect(protocolFee1).to.be.gt(0);
      expect(settlementFee1).to.be.gt(0);

      // Define new fee and confirm that it's not equal to the one applicable for the pool just created
      newFee = parseUnits("0.01"); // 1%
      expect(feeParams1.protocolFee).to.not.eq(newFee);
      expect(feeParams1.settlementFee).to.not.eq(newFee);

      // Contract owner updates fees
      await governanceFacet.connect(contractOwner).updateFees(newFee, newFee);

      // Fast forward in time to activate the new fee regime
      nextBlockTimestamp = (await getLastTimestamp()) + governanceDelay + 1;
      await mineBlock(nextBlockTimestamp);

      // Create a new congingent pool under the new fee regime
      const tx2 = await createContingentPool(createContingentPoolParams);
      poolId2 = await getPoolIdFromTx(tx2);

      // Get pool params
      poolParams2 = await getterFacet.getPoolParameters(poolId2);

      // Confirm that the neww fee regime applies to the second pool created
      const feeParams2 = await getterFacet.getFees(poolParams2.indexFees);
      expect(feeParams2.protocolFee).to.eq(newFee);
      expect(feeParams2.settlementFee).to.eq(newFee);

      // Calculate fees for poolId2
      const protocolFee2 = calcFee(
        feeParams2.protocolFee,
        positionTokensToRedeem,
        decimals
      );
      const settlementFee2 = calcFee(
        feeParams2.settlementFee,
        positionTokensToRedeem,
        decimals
      );
      expect(protocolFee2).to.be.gt(0);
      expect(settlementFee2).to.be.gt(0);

      // User1 removes liquidity for poolId1
      await liquidityFacet
        .connect(user1)
        .removeLiquidity(poolId1, positionTokensToRedeem);

      // Check that fees are allocated/reserved correctly to treasury and oracle address
      // according to the previous fee regime
      const treasuryCollateralTokenBalanceBefore = await getterFacet.getClaim(
        poolParams1.collateralToken,
        treasury.address
      );
      expect(treasuryCollateralTokenBalanceBefore).to.eq(protocolFee1);
      const oracleCollateralTokenBalanceBefore = await getterFacet.getClaim(
        poolParams1.collateralToken,
        oracle.address
      );
      expect(oracleCollateralTokenBalanceBefore).to.eq(0);
      expect(await getterFacet.getReservedClaim(poolId1)).to.eq(settlementFee1);

      // ---------
      // Act: User2 removes liquidity for poolId2 which follows the new fee regime
      // ---------
      await liquidityFacet
        .connect(user1)
        .removeLiquidity(poolId2, positionTokensToRedeem);

      // ---------
      // Assert: Confirm that fees are allocated/reserved correctly to treasury and oracle
      // according to the new fee regime
      // ---------
      expect(
        await getterFacet.getClaim(
          poolParams2.collateralToken,
          treasury.address
        )
      ).to.eq(treasuryCollateralTokenBalanceBefore.add(protocolFee2));
      expect(
        await getterFacet.getClaim(poolParams2.collateralToken, oracle.address)
      ).to.eq(0);
      expect(await getterFacet.getReservedClaim(poolId2)).to.eq(settlementFee2);
    });

    // -------------------------------------------
    // Reverts
    // -------------------------------------------

    it("Reverts if triggered by an account other than the contract owner", async () => {
      // ---------
      // Arrange: Define new fee and confirm that user2 is not the contract owner
      // ---------
      newFee = parseUnits("0.01"); // 1%
      expect(contractOwner.address).to.not.eq(user2.address);

      // ---------
      // Act & Assert: Confirm that function call reverts if called by an account other than the contract owner
      // ---------
      await expect(
        governanceFacet.connect(user2).updateFees(newFee, newFee)
      ).to.be.revertedWith(
        `NotContractOwner("${user2.address}", "${contractOwner.address}")`
      );
    });

    it("Reverts if protocol fee is less than 0.01% but higher than 0%", async () => {
      // ---------
      // Arrange: Define new fee
      // ---------
      newFee = parseUnits("0.000099"); // 0.0099%

      // ---------
      // Act & Assert: Confirm that function call reverts if new fee value is less than 0.01%
      // ---------
      await expect(
        governanceFacet
          .connect(contractOwner)
          .updateFees(newFee, settlementFeeDefault)
      ).to.be.revertedWith("FeeBelowMinimum()");
    });

    it("Reverts if protocol fee exceeds 1.5%", async () => {
      // ---------
      // Arrange: Define new fee
      // ---------
      newFee = parseUnits("0.0151"); // 1.51%

      // ---------
      // Act & Assert: Confirm that function call reverts if new settlement fee value exceeds the maximum allowed value of 1.5%
      // ---------
      await expect(
        governanceFacet
          .connect(contractOwner)
          .updateFees(newFee, settlementFeeDefault)
      ).to.be.revertedWith("FeeAboveMaximum()");
    });

    it("Reverts if settlement fee is less than 0.01% but higher than 0%", async () => {
      // ---------
      // Arrange: Define new fee
      // ---------
      newFee = parseUnits("0.000099"); // 0.0099%

      // ---------
      // Act & Assert: Confirm that function call reverts if new fee value is less than 0.01%
      // ---------
      await expect(
        governanceFacet
          .connect(contractOwner)
          .updateFees(protocolFeeDefault, newFee)
      ).to.be.revertedWith("FeeBelowMinimum()");
    });

    it("Reverts if settlement fee exceeds 1.5%", async () => {
      // ---------
      // Arrange: Define new fee
      // ---------
      newFee = parseUnits("0.0151"); // 1.51%

      // ---------
      // Act & Assert: Confirm that function call reverts if new settlement fee value exceeds the maximum allowed value of 1.5%
      // ---------
      await expect(
        governanceFacet
          .connect(contractOwner)
          .updateFees(protocolFeeDefault, newFee)
      ).to.be.revertedWith("FeeAboveMaximum()");
    });

    it("Reverts if contract owner tries to update fees while there is a pending update", async () => {
      // ---------
      // Arrange: Update fees
      // ---------
      newFee = parseUnits("0.01"); // 1%
      await governanceFacet.connect(contractOwner).updateFees(newFee, newFee);

      // Set next block's timestamp and confirm that `startTime` > nextBlockTimestamp
      nextBlockTimestamp = (await getLastTimestamp()) + 1;
      await setNextTimestamp(ethers.provider, nextBlockTimestamp);
      const latestFeesUpdate = await getterFacet.getFeesHistory(1);
      expect(nextBlockTimestamp).to.be.lte(latestFeesUpdate[0].startTime);

      // ---------
      // Act & Assert: Confirm that function call reverts
      // ---------
      await expect(
        governanceFacet.connect(contractOwner).updateFees(newFee, newFee)
      ).to.be.revertedWith(
        `PendingFeesUpdate(${nextBlockTimestamp}, ${latestFeesUpdate[0].startTime})`
      );
    });

    // -------------------------------------------
    // Events
    // -------------------------------------------

    it("Emits FeeUpdated events", async () => {
      // ---------
      // Act: Set new fee
      // ---------
      newFee = parseUnits("0.01"); // 1%

      // ---------
      // Act: Contract owner sets new fees
      // ---------
      const tx = await governanceFacet
        .connect(contractOwner)
        .updateFees(newFee, newFee);
      const receipt = await tx.wait();
      lastBlockTimestamp = await getLastTimestamp();

      // ---------
      // Assert: Check that it emits FeeUpdated events
      // ---------
      const feeUpdatedEvents =
        receipt.events?.filter((item) => item.event === "FeeUpdated") || [];
      expect(feeUpdatedEvents[0].args?.from).to.eq(contractOwner.address);
      expect(feeUpdatedEvents[0].args?.fee).to.eq(newFee);
      expect(feeUpdatedEvents[0].args?.startTime).to.eq(
        lastBlockTimestamp + governanceDelay
      );
      expect(feeUpdatedEvents[0].args?.feeType).to.eq(FeeType.PROTOCOL_FEE);

      expect(feeUpdatedEvents[1].args?.from).to.eq(contractOwner.address);
      expect(feeUpdatedEvents[1].args?.fee).to.eq(newFee);
      expect(feeUpdatedEvents[1].args?.startTime).to.eq(
        lastBlockTimestamp + governanceDelay
      );
      expect(feeUpdatedEvents[1].args?.feeType).to.eq(FeeType.SETTLEMENT_FEE);
    });
  });

  describe("updateSettlementPeriods", async () => {
    // -------------------------------------------
    // Functionality
    // -------------------------------------------

    it("Allows the contract owner to set the settlement periods", async () => {
      // ---------
      // Arrange: Define the new periods and confirm that it's not equal to the current settlement periods
      // ---------
      newPeriod = 4 * ONE_DAY;
      govParamsBefore = await getterFacet.getGovernanceParameters();
      settlementPeriodsLengthBefore =
        await getterFacet.getSettlementPeriodsHistoryLength();
      expect(
        govParamsBefore.currentSettlementPeriods.submissionPeriod
      ).to.not.eq(newPeriod);
      expect(
        govParamsBefore.currentSettlementPeriods.challengePeriod
      ).to.not.eq(newPeriod);
      expect(govParamsBefore.currentSettlementPeriods.reviewPeriod).to.not.eq(
        newPeriod
      );
      expect(
        govParamsBefore.currentSettlementPeriods.fallbackSubmissionPeriod
      ).to.not.eq(newPeriod);

      // ---------
      // Act: Contract owner sets the new settlement periods
      // ---------
      await governanceFacet
        .connect(contractOwner)
        .updateSettlementPeriods(newPeriod, newPeriod, newPeriod, newPeriod);

      // Fast forward in time to activate the new settlement periods
      nextBlockTimestamp = (await getLastTimestamp()) + governanceDelay + 1;
      await mineBlock(nextBlockTimestamp);

      // ---------
      // Assert: Confirm that the new period was set in the governance parameters and the length
      // of the history has reduced
      // ---------
      govParamsAfter = await getterFacet.getGovernanceParameters();
      settlementPeriodsLengthAfter =
        await getterFacet.getSettlementPeriodsHistoryLength();

      // Confirm that new settlement periods were set
      expect(govParamsAfter.currentSettlementPeriods.submissionPeriod).to.eq(
        newPeriod
      );
      expect(govParamsAfter.currentSettlementPeriods.challengePeriod).to.eq(
        newPeriod
      );
      expect(govParamsAfter.currentSettlementPeriods.reviewPeriod).to.eq(
        newPeriod
      );
      expect(
        govParamsAfter.currentSettlementPeriods.fallbackSubmissionPeriod
      ).to.eq(newPeriod);
      expect(govParamsAfter.currentSettlementPeriods.startTime).to.eq(
        nextBlockTimestamp - 1
      );

      // Confirm that length of history has reduced
      expect(settlementPeriodsLengthAfter).to.eq(
        settlementPeriodsLengthBefore.add(1)
      );
    });

    it("Should apply the new submission period when final reference value is set for a new contingent pool created", async () => {
      // ---------
      // Arrange: Set new submission period and create a new contingent pool
      // ---------
      // Get current settlement periods params
      govParamsBefore = await getterFacet.getGovernanceParameters();

      // Define new submission period and confirm that it's not equal to current one
      newPeriod = 8 * ONE_DAY;
      expect(
        govParamsBefore.currentSettlementPeriods.submissionPeriod
      ).to.be.lt(newPeriod);

      // Contract owner sets new submission period
      await governanceFacet
        .connect(contractOwner)
        .updateSettlementPeriods(
          newPeriod,
          govParamsBefore.currentSettlementPeriods.challengePeriod,
          govParamsBefore.currentSettlementPeriods.reviewPeriod,
          govParamsBefore.currentSettlementPeriods.fallbackSubmissionPeriod
        );

      // Fast forward in time to activate the new submission period
      nextBlockTimestamp = (await getLastTimestamp()) + governanceDelay + 1;
      await mineBlock(nextBlockTimestamp);

      // Get current settlement periods again after new submission period was activated
      govParamsAfter = await getterFacet.getGovernanceParameters();

      // Create a contingent pool
      const tx = await createContingentPool(createContingentPoolParams);
      poolId = await getPoolIdFromTx(tx);

      // Get pool params with pool id
      const poolParams = await getterFacet.getPoolParameters(poolId);
      expect(poolParams.statusFinalReferenceValue).to.eq(Status.Open); // no final value set yet
      expect(poolParams.finalReferenceValue).to.eq(0);
      const periodsParams = await getterFacet.getSettlementPeriods(
        poolParams.indexSettlementPeriods
      );
      expect(periodsParams.submissionPeriod).to.eq(newPeriod);

      // Set next block timestamp larger than the submission period end time under the previous settlement regime
      // and smaller than the submission period end time under the new submission period
      const submissionPeriodEndTimeBefore = poolParams.expiryTime.add(
        govParamsBefore.currentSettlementPeriods.submissionPeriod
      );
      const submissionPeriodEndTimeAfter = poolParams.expiryTime.add(
        govParamsAfter.currentSettlementPeriods.submissionPeriod
      );
      nextBlockTimestamp = submissionPeriodEndTimeBefore.add(1);
      expect(nextBlockTimestamp).to.be.gt(submissionPeriodEndTimeBefore);
      expect(nextBlockTimestamp).to.be.lt(submissionPeriodEndTimeAfter);
      await mineBlock(nextBlockTimestamp.toNumber());

      // Check that pool is expired but still within submission period
      const currentBlockTimestamp = await getLastTimestamp();
      expect(poolParams.expiryTime).to.be.lte(currentBlockTimestamp); // pool expired
      expect(currentBlockTimestamp).to.be.lte(submissionPeriodEndTimeAfter); // still within submission period

      // Set final reference value and allowChallenge
      const finalReferenceValue = parseUnits("1605.33");
      const allowChallenge = true;

      // ---------
      // Act: Contract owner sets final reference value
      // ---------
      await settlementFacet
        .connect(oracle)
        .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge);

      // ---------
      // Assert: Confirm that the final reference value has been set and the status updated to 1 = Submitted
      // ---------
      const poolParamsAfter = await getterFacet.getPoolParameters(poolId);
      expect(poolParamsAfter.finalReferenceValue).to.eq(finalReferenceValue);
      expect(poolParamsAfter.statusFinalReferenceValue).to.eq(Status.Submitted);
    });

    // -------------------------------------------
    // Reverts
    // -------------------------------------------

    it("Reverts if triggered by an account other than the contract owner", async () => {
      // ---------
      // Arrange: Define new period and confirm that user2 is not the contract owner
      // ---------
      newPeriod = 3 * ONE_DAY;
      expect(contractOwner.address).to.not.eq(user2.address);

      // ---------
      // Act & Assert: Confirm that function call reverts if called by an account other than the contract owner
      // ---------
      await expect(
        governanceFacet
          .connect(user2)
          .updateSettlementPeriods(newPeriod, newPeriod, newPeriod, newPeriod)
      ).to.be.revertedWith(
        `NotContractOwner("${user2.address}", "${contractOwner.address}")`
      );
    });

    it("Reverts if submission period is less than 3 days", async () => {
      // ---------
      // Arrange: Set new submission period to less than 3 days
      // ---------
      newPeriod = 3 * ONE_DAY - 1;

      // ---------
      // Act & Assert: Confirm that function call reverts if submission period is less than 3 days
      // ---------
      await expect(
        governanceFacet
          .connect(contractOwner)
          .updateSettlementPeriods(
            newPeriod,
            challengePeriodDefault,
            reviewPeriodDefault,
            fallbackSubmissionPeriodDefault
          )
      ).to.be.revertedWith("OutOfBounds()");
    });

    it("Reverts if submission period is more than 15 days", async () => {
      // ---------
      // Arrange: Set new submission period to more than 15 days
      // ---------
      newPeriod = 15 * ONE_DAY + 1;

      // ---------
      // Act & Assert: Confirm that function call reverts if submission period is more than 15 days
      // ---------
      await expect(
        governanceFacet
          .connect(contractOwner)
          .updateSettlementPeriods(
            newPeriod,
            challengePeriodDefault,
            reviewPeriodDefault,
            fallbackSubmissionPeriodDefault
          )
      ).to.be.revertedWith("OutOfBounds()");
    });

    it("Reverts if challenge period is less than 3 days", async () => {
      // ---------
      // Arrange: Set new challenge period to less than 3 days
      // ---------
      newPeriod = 3 * ONE_DAY - 1;

      // ---------
      // Act & Assert: Confirm that function call reverts if challenge period is less than 3 days
      // ---------
      await expect(
        governanceFacet
          .connect(contractOwner)
          .updateSettlementPeriods(
            submissionPeriodDefault,
            newPeriod,
            reviewPeriodDefault,
            fallbackSubmissionPeriodDefault
          )
      ).to.be.revertedWith("OutOfBounds()");
    });

    it("Reverts if challenge period is more than 15 days", async () => {
      // ---------
      // Arrange: Set new challenge period to more than 15 days
      // ---------
      newPeriod = 15 * ONE_DAY + 1;

      // ---------
      // Act & Assert: Confirm that function call reverts if challenge period is more than 15 days
      // ---------
      await expect(
        governanceFacet
          .connect(contractOwner)
          .updateSettlementPeriods(
            submissionPeriodDefault,
            newPeriod,
            reviewPeriodDefault,
            fallbackSubmissionPeriodDefault
          )
      ).to.be.revertedWith("OutOfBounds()");
    });

    it("Reverts if review period is less than 3 days", async () => {
      // ---------
      // Arrange: Set new review period to less than 3 days
      // ---------
      newPeriod = 3 * ONE_DAY - 1;

      // ---------
      // Act & Assert: Confirm that function call reverts if review period is less than 3 days
      // ---------
      await expect(
        governanceFacet
          .connect(contractOwner)
          .updateSettlementPeriods(
            submissionPeriodDefault,
            challengePeriodDefault,
            newPeriod,
            fallbackSubmissionPeriodDefault
          )
      ).to.be.revertedWith("OutOfBounds()");
    });

    it("Reverts if review period is more than 15 days", async () => {
      // ---------
      // Arrange: Set new review period to more than 15 days
      // ---------
      newPeriod = 15 * ONE_DAY + 1;

      // ---------
      // Act & Assert: Confirm that function call reverts if review period is more than 15 days
      // ---------
      await expect(
        governanceFacet
          .connect(contractOwner)
          .updateSettlementPeriods(
            submissionPeriodDefault,
            challengePeriodDefault,
            newPeriod,
            fallbackSubmissionPeriodDefault
          )
      ).to.be.revertedWith("OutOfBounds()");
    });

    it("Reverts if fallback period is less than 3 days", async () => {
      // ---------
      // Arrange: Set new fallback period to less than 3 days
      // ---------
      newPeriod = 3 * ONE_DAY - 1;

      // ---------
      // Act & Assert: Confirm that function call reverts if fallback period is less than 3 days
      // ---------
      await expect(
        governanceFacet
          .connect(contractOwner)
          .updateSettlementPeriods(
            submissionPeriodDefault,
            challengePeriodDefault,
            reviewPeriodDefault,
            newPeriod
          )
      ).to.be.revertedWith("OutOfBounds()");
    });

    it("Reverts if fallback period is more than 15 days", async () => {
      // ---------
      // Arrange: Set new fallback period to more than 15 days
      // ---------
      newPeriod = 15 * ONE_DAY + 1;

      // ---------
      // Act & Assert: Confirm that function call reverts if fallback period is more than 15 days
      // ---------
      await expect(
        governanceFacet
          .connect(contractOwner)
          .updateSettlementPeriods(
            submissionPeriodDefault,
            challengePeriodDefault,
            reviewPeriodDefault,
            newPeriod
          )
      ).to.be.revertedWith("OutOfBounds()");
    });

    it("Reverts if contract owner tries to update settlement periods while there is a pending update", async () => {
      // ---------
      // Arrange: Update settlement periods
      // ---------
      newPeriod = 4 * ONE_DAY;
      await governanceFacet
        .connect(contractOwner)
        .updateSettlementPeriods(newPeriod, newPeriod, newPeriod, newPeriod);

      // Set next block's timestamp and confirm that `startTime` > nextBlockTimestamp
      nextBlockTimestamp = (await getLastTimestamp()) + 1;
      await setNextTimestamp(ethers.provider, nextBlockTimestamp);
      const latestPeriodsUpdate = await getterFacet.getSettlementPeriodsHistory(
        1
      );
      expect(nextBlockTimestamp).to.be.lte(latestPeriodsUpdate[0].startTime);

      // ---------
      // Act & Assert: Confirm that function call reverts
      // ---------
      await expect(
        governanceFacet
          .connect(contractOwner)
          .updateSettlementPeriods(
            submissionPeriodDefault,
            challengePeriodDefault,
            reviewPeriodDefault,
            newPeriod
          )
      ).to.be.revertedWith(
        `PendingSettlementPeriodsUpdate(${nextBlockTimestamp}, ${latestPeriodsUpdate[0].startTime})`
      );
    });

    // -------------------------------------------
    // Events
    // -------------------------------------------

    it("Emits SettlementPeriodUpdated events", async () => {
      // ---------
      // Arrange: Define new period
      // ---------
      newPeriod = 3 * ONE_DAY;

      // ---------
      // Act: Contract owner sets new periods
      // ---------
      const tx = await governanceFacet
        .connect(contractOwner)
        .updateSettlementPeriods(newPeriod, newPeriod, newPeriod, newPeriod);
      const receipt = await tx.wait();
      lastBlockTimestamp = await getLastTimestamp();

      // ---------
      // Assert: Check that it emits SettlementPeriodUpdated events
      // ---------
      const settlementPeriodUpdatedEvents =
        receipt.events?.filter(
          (item) => item.event === "SettlementPeriodUpdated"
        ) || [];
      expect(settlementPeriodUpdatedEvents[0].args?.from).to.eq(
        contractOwner.address
      );
      expect(settlementPeriodUpdatedEvents[0].args?.period).to.eq(newPeriod);
      expect(settlementPeriodUpdatedEvents[0].args?.startTime).to.eq(
        lastBlockTimestamp + governanceDelay
      );
      expect(settlementPeriodUpdatedEvents[0].args?.periodType).to.eq(
        SettlementPeriodType.SUBMISSION_PERIOD
      );

      expect(settlementPeriodUpdatedEvents[1].args?.from).to.eq(
        contractOwner.address
      );
      expect(settlementPeriodUpdatedEvents[1].args?.period).to.eq(newPeriod);
      expect(settlementPeriodUpdatedEvents[1].args?.startTime).to.eq(
        lastBlockTimestamp + governanceDelay
      );
      expect(settlementPeriodUpdatedEvents[1].args?.periodType).to.eq(
        SettlementPeriodType.CHALLENGE_PERIOD
      );

      expect(settlementPeriodUpdatedEvents[2].args?.from).to.eq(
        contractOwner.address
      );
      expect(settlementPeriodUpdatedEvents[2].args?.period).to.eq(newPeriod);
      expect(settlementPeriodUpdatedEvents[2].args?.startTime).to.eq(
        lastBlockTimestamp + governanceDelay
      );
      expect(settlementPeriodUpdatedEvents[2].args?.periodType).to.eq(
        SettlementPeriodType.REVIEW_PERIOD
      );

      expect(settlementPeriodUpdatedEvents[3].args?.from).to.eq(
        contractOwner.address
      );
      expect(settlementPeriodUpdatedEvents[3].args?.period).to.eq(newPeriod);
      expect(settlementPeriodUpdatedEvents[3].args?.startTime).to.eq(
        lastBlockTimestamp + governanceDelay
      );
      expect(settlementPeriodUpdatedEvents[3].args?.periodType).to.eq(
        SettlementPeriodType.FALLBACK_SUBMISSION_PERIOD
      );
    });
  });

  describe("updateTreasury", async () => {

    // -------------------------------------------
    // Functionality
    // -------------------------------------------

    it("Allows the contract owner to set a new treasury address", async () => {
      // ---------
      // Arrange: Define a new treasury address and confirm that it's not equal to the current one
      // ---------
      newTreasuryAddress = user2.address;
      govParamsBefore = await getterFacet.getGovernanceParameters();
      expect(govParamsBefore.treasury).to.not.eq(newTreasuryAddress);

      // ---------
      // Act: Contract owner sets a new treasury address
      // ---------
      await governanceFacet
        .connect(contractOwner)
        .updateTreasury(newTreasuryAddress);

      // Fast forward in time to activate the new address
      nextBlockTimestamp = (await getLastTimestamp()) + treasuryUpdateDelay + 1;
      await mineBlock(nextBlockTimestamp);

      // ---------
      // Assert: Confirm that the new treasury address was set in the governance parameters
      // ---------
      govParamsAfter = await getterFacet.getGovernanceParameters();
      expect(govParamsAfter.treasury).to.eq(newTreasuryAddress);
    });

    it("Returns the previous treasury address if the activation time hasn't passed yet", async () => {
      // ---------
      // Arrange: Define a new treasury address and confirm that it's not equal to the current one
      // ---------
      newTreasuryAddress = user1.address;
      govParamsBefore = await getterFacet.getGovernanceParameters();
      const currentTreasuryAddress = govParamsBefore.treasury;
      expect(currentTreasuryAddress).to.not.eq(newTreasuryAddress);

      // ---------
      // Act: Contract owner sets a new treasury address
      // ---------
      await governanceFacet
        .connect(contractOwner)
        .updateTreasury(newTreasuryAddress);

      // ---------
      // Assert: Confirm that the new treasury address was set in the governance parameters
      // ---------
      govParamsAfter = await getterFacet.getGovernanceParameters();
      expect(govParamsAfter.treasury).to.eq(currentTreasuryAddress);

      // ---------
      // Reset: Fast forward in time to activate the new address to avoid any effects
      // on following tests
      // ---------
      nextBlockTimestamp = (await getLastTimestamp()) + treasuryUpdateDelay + 1;
      await mineBlock(nextBlockTimestamp);
    });

    // -------------------------------------------
    // Reverts
    // -------------------------------------------

    it("Reverts if triggered by an account other than the contract owner", async () => {
      // ---------
      // Arrange: Define new treasury address
      // ---------
      newTreasuryAddress = user2.address;

      // ---------
      // Act & Assert: Confirm that function call reverts if called by an account other than the contract owner
      // ---------
      await expect(
        governanceFacet.connect(user2).updateTreasury(newTreasuryAddress)
      ).to.be.revertedWith(
        `NotContractOwner("${user2.address}", "${contractOwner.address}")`
      );
    });

    it("Reverts if new treasury address is zero address", async () => {
      // ---------
      // Arrange: Set new treasury address to zero address
      // ---------
      newTreasuryAddress = ethers.constants.AddressZero;

      // ---------
      // Act & Assert: Confirm that function call reverts
      // ---------
      await expect(
        governanceFacet
          .connect(contractOwner)
          .updateTreasury(newTreasuryAddress)
      ).to.be.revertedWith("ZeroAddress()");
    });

    it("Reverts if contract owner tries to set a treasury address while there is a pending update", async () => {
      // ---------
      // Arrange: Update treasury address
      // ---------
      newTreasuryAddress = user2.address;
      await governanceFacet
        .connect(contractOwner)
        .updateTreasury(newTreasuryAddress);

      // Set next block's timestamp and confirm that `startTime` > nextBlockTimestamp
      nextBlockTimestamp = (await getLastTimestamp()) + 1;
      await setNextTimestamp(ethers.provider, nextBlockTimestamp);
      treasuryInfo =
        await getterFacet.getTreasuryInfo();
      expect(nextBlockTimestamp).to.be.lte(
        treasuryInfo.startTimeTreasury
      );

      // ---------
      // Act & Assert: Confirm that function call reverts
      // ---------
      await expect(
        governanceFacet
          .connect(contractOwner)
          .updateTreasury(newTreasuryAddress)
      ).to.be.revertedWith(
        `PendingTreasuryUpdate(${nextBlockTimestamp}, ${treasuryInfo.startTimeTreasury})`
      );
    });

    // -------------------------------------------
    // Events
    // -------------------------------------------

    it("Emits a TreasuryUpdated event", async () => {
      // ---------
      // Arrange: Define new treasury address
      // ---------
      newTreasuryAddress = user2.address;

      // ---------
      // Act: Contract owner sets new treasury address
      // ---------
      const tx = await governanceFacet
        .connect(contractOwner)
        .updateTreasury(newTreasuryAddress);
      const receipt = await tx.wait();
      const startTimeTreasury = (await getLastTimestamp()) + treasuryUpdateDelay;
      // ---------
      // Assert: Check that it emits a TreasuryUpdated event
      // ---------
      const treasuryUpdatedEvent = receipt.events?.find(
        (item) => item.event === "TreasuryUpdated"
      );
      expect(treasuryUpdatedEvent?.args?.from).to.eq(contractOwner.address);
      expect(treasuryUpdatedEvent?.args?.treasury).to.eq(newTreasuryAddress);
      expect(treasuryUpdatedEvent?.args?.startTimeTreasury).to.eq(startTimeTreasury);
    });
  });

  describe("updateFallbackDataProvider", async () => {
    // -------------------------------------------
    // Functionality
    // -------------------------------------------

    it("Allows the contract owner to set a new fallback data provider", async () => {
      // ---------
      // Arrange: Define a new fallback data provider and confirm that it's not equal to the current one
      // ---------
      newFallbackDataProvider = user2.address;
      govParamsBefore = await getterFacet.getGovernanceParameters();
      expect(govParamsBefore.fallbackDataProvider).to.not.eq(
        newFallbackDataProvider
      );

      // ---------
      // Act: Contract owner sets a new fallback data provider address
      // ---------
      await governanceFacet
        .connect(contractOwner)
        .updateFallbackDataProvider(newFallbackDataProvider);

      // Fast forward in time to activate the new fallback data provider
      nextBlockTimestamp = (await getLastTimestamp()) + governanceDelay + 1;
      await mineBlock(nextBlockTimestamp);

      // ---------
      // Assert: Confirm that the new fallback data provider was set in the governance parameters
      // ---------
      govParamsAfter = await getterFacet.getGovernanceParameters();
      expect(govParamsAfter.fallbackDataProvider).to.eq(
        newFallbackDataProvider
      );
    });

    it("Returns the previous fallback data provider if the activation time hasn't passed yet", async () => {
      // ---------
      // Arrange: Define a new fallback data provider and confirm that it's not equal to the current one
      // ---------
      newFallbackDataProvider = user1.address;
      govParamsBefore = await getterFacet.getGovernanceParameters();
      const currentFallbackDataProvider = govParamsBefore.fallbackDataProvider;
      expect(currentFallbackDataProvider).to.not.eq(
        newFallbackDataProvider
      );

      // ---------
      // Act: Contract owner sets a new fallback data provider address
      // ---------
      await governanceFacet
        .connect(contractOwner)
        .updateFallbackDataProvider(newFallbackDataProvider);

      // ---------
      // Assert: Confirm that the new fallback data provider was set in the governance parameters
      // ---------
      govParamsAfter = await getterFacet.getGovernanceParameters();
      expect(govParamsAfter.fallbackDataProvider).to.eq(
        currentFallbackDataProvider
      );

      // ---------
      // Reset: Fast forward in time to activate the new fallback data provider
      // ---------
      nextBlockTimestamp = (await getLastTimestamp()) + governanceDelay + 1;
      await mineBlock(nextBlockTimestamp);
    });

    // -------------------------------------------
    // Reverts
    // -------------------------------------------

    it("Reverts if triggered by an account other than the contract owner", async () => {
      // ---------
      // Arrange: Define new fallback data provider
      // ---------
      newFallbackDataProvider = user2.address;

      // ---------
      // Act & Assert: Confirm that function call reverts if called by an account other than the contract owner
      // ---------
      await expect(
        governanceFacet
          .connect(user2)
          .updateFallbackDataProvider(newFallbackDataProvider)
      ).to.be.revertedWith(
        `NotContractOwner("${user2.address}", "${contractOwner.address}")`
      );
    });

    it("Reverts if fallback data provider is zero address", async () => {
      // ---------
      // Arrange: Set new fallback data provider to zero address
      // ---------
      newFallbackDataProvider = ethers.constants.AddressZero;

      // ---------
      // Act & Assert: Confirm that function call reverts
      // ---------
      await expect(
        governanceFacet
          .connect(contractOwner)
          .updateFallbackDataProvider(newFallbackDataProvider)
      ).to.be.revertedWith("ZeroAddress()");
    });

    it("Reverts if contract owner tries to set a fallback provider while there is a pending update", async () => {
      // ---------
      // Arrange: Set fallback data provider
      // ---------
      newFallbackDataProvider = user2.address;
      await governanceFacet
        .connect(contractOwner)
        .updateFallbackDataProvider(newFallbackDataProvider);

      // Set next block's timestamp and confirm that `startTime` > nextBlockTimestamp
      nextBlockTimestamp = (await getLastTimestamp()) + 1;
      await setNextTimestamp(ethers.provider, nextBlockTimestamp);
      fallbackDataProviderInfo =
        await getterFacet.getFallbackDataProviderInfo();
      expect(nextBlockTimestamp).to.be.lte(
        fallbackDataProviderInfo.startTimeFallbackDataProvider
      );

      // ---------
      // Act & Assert: Confirm that function call reverts
      // ---------
      await expect(
        governanceFacet
          .connect(contractOwner)
          .updateFallbackDataProvider(newFallbackDataProvider)
      ).to.be.revertedWith(
        `PendingFallbackDataProviderUpdate(${nextBlockTimestamp}, ${fallbackDataProviderInfo.startTimeFallbackDataProvider})`
      );
    });

    // -------------------------------------------
    // Events
    // -------------------------------------------

    it("Emits a FallbackDataProviderUpdated event", async () => {
      // ---------
      // Arrange: Define new fallback data provider
      // ---------
      newFallbackDataProvider = user2.address;

      // ---------
      // Act: Contract owner sets new fallback data provider
      // ---------
      const tx = await governanceFacet
        .connect(contractOwner)
        .updateFallbackDataProvider(newFallbackDataProvider);
      const receipt = await tx.wait();
      const startTimeFallbackDataProvider = (await getLastTimestamp()) + governanceDelay;

      // ---------
      // Assert: Check that it emits a FallbackDataProviderUpdated event
      // ---------
      const fallbackDataProviderUpdatedEvent = receipt.events?.find(
        (item) => item.event === "FallbackDataProviderUpdated"
      );
      expect(fallbackDataProviderUpdatedEvent?.args?.from).to.eq(
        contractOwner.address
      );
      expect(fallbackDataProviderUpdatedEvent?.args?.fallbackDataProvider).to.eq(
        newFallbackDataProvider
      );
      expect(fallbackDataProviderUpdatedEvent?.args?.startTimeFallbackDataProvider).to.eq(
        startTimeFallbackDataProvider
      );
    });
  });

  describe("revokePendingFeesUpdate", async () => {
    // -------------------------------------------
    // Functionality
    // -------------------------------------------

    it("Revokes pending fees update", async () => {
      // ---------
      // Arrange: Trigger fees update
      // ---------
      // Get current fees
      const govParamsBefore = await getterFacet.getGovernanceParameters();

      // Define new fee and confirm that it is different than existing fees
      newFee = parseUnits("0.01"); // 1%
      expect(govParamsBefore.currentFees.protocolFee).to.not.eq(newFee);
      expect(govParamsBefore.currentFees.settlementFee).to.not.eq(newFee);

      // Update fees
      await governanceFacet.connect(contractOwner).updateFees(newFee, newFee);

      // Get length of fees history
      feesLengthBefore = await getterFacet.getFeesHistoryLength();

      // ---------
      // Act: Revoke fees update
      // ---------
      await governanceFacet.connect(contractOwner).revokePendingFeesUpdate();

      // ---------
      // Assert: Confirm that the fees history length reduced and the current fees are unchanged
      // ---------
      // Check that fees array length reduced by 1
      feesLengthAfter = await getterFacet.getFeesHistoryLength();
      expect(feesLengthAfter).to.eq(feesLengthBefore.sub(1));

      // Confirm that `getGovernanceParameters` still returns the previous set
      const govParamsAfter = await getterFacet.getGovernanceParameters();
      expect(govParamsBefore.currentFees.protocolFee).to.eq(
        govParamsAfter.currentFees.protocolFee
      );
      expect(govParamsBefore.currentFees.settlementFee).to.eq(
        govParamsAfter.currentFees.settlementFee
      );
    });

    // -------------------------------------------
    // Events
    // -------------------------------------------

    it("Emits two `PendingFeeUpdateRevoked` events", async () => {
      // ---------
      // Arrange: Trigger fees update
      // ---------
      // Get current fees
      const govParamsBefore = await getterFacet.getGovernanceParameters();

      // Define new fee and confirm that it is different than existing fees
      newFee = parseUnits("0.01"); // 1%
      expect(govParamsBefore.currentFees.protocolFee).to.not.eq(newFee);
      expect(govParamsBefore.currentFees.settlementFee).to.not.eq(newFee);

      // Update fees
      await governanceFacet.connect(contractOwner).updateFees(newFee, newFee);

      // ---------
      // Act: Revoke fees update
      // ---------
      const tx = await governanceFacet
        .connect(contractOwner)
        .revokePendingFeesUpdate();
      const receipt = await tx.wait();

      // ---------
      // Assert: Check that it emits two `PendingFeeUpdateRevoked` events
      // ---------
      // Catch event
      const pendingFeeUpdateRevokedEvents =
        receipt.events?.filter(
          (item) => item.event === "PendingFeeUpdateRevoked"
        ) || [];

      // Event for protocol fee
      expect(pendingFeeUpdateRevokedEvents[0].args?.revokedBy).to.eq(
        contractOwner.address
      );
      expect(pendingFeeUpdateRevokedEvents[0].args?.revokedFee).to.eq(newFee);
      expect(pendingFeeUpdateRevokedEvents[0].args?.restoredFee).to.eq(
        govParamsBefore.currentFees.protocolFee
      );
      expect(pendingFeeUpdateRevokedEvents[0].args?.feeType).to.eq(
        FeeType.PROTOCOL_FEE
      );

      // Event for settlement fee
      expect(pendingFeeUpdateRevokedEvents[1].args?.revokedBy).to.eq(
        contractOwner.address
      );
      expect(pendingFeeUpdateRevokedEvents[1].args?.revokedFee).to.eq(newFee);
      expect(pendingFeeUpdateRevokedEvents[1].args?.restoredFee).to.eq(
        govParamsBefore.currentFees.settlementFee
      );
      expect(pendingFeeUpdateRevokedEvents[1].args?.feeType).to.eq(
        FeeType.SETTLEMENT_FEE
      );
    });

    // -------------------------------------------
    // Reverts
    // -------------------------------------------

    it("Reverts if triggered by an account other than the contract owner", async () => {
      // ---------
      // Act & Assert: Confirm that function call reverts if called by an account other than the contract owner
      // ---------
      await expect(
        governanceFacet.connect(user2).revokePendingFeesUpdate()
      ).to.be.revertedWith(
        `NotContractOwner("${user2.address}", "${contractOwner.address}")`
      );
    });

    it("Reverts with `FeesAlreadyActive` if the latest fee update is already active", async () => {
      // ---------
      // Arrange: Trigger fees update
      // ---------
      newFee = parseUnits("0.01"); // 1%
      await governanceFacet.connect(contractOwner).updateFees(newFee, newFee);

      // Set next block's timestamp after the activation time
      nextBlockTimestamp = (await getLastTimestamp()) + governanceDelay + 1;
      await setNextTimestamp(ethers.provider, nextBlockTimestamp);

      // Get the latest fees update
      const latestFeesUpdate = await getterFacet.getFeesHistory(1);

      // ---------
      // Act & Assert: Revoke fees update
      // ---------
      await expect(
        governanceFacet.connect(contractOwner).revokePendingFeesUpdate()
      ).to.be.revertedWith(
        `FeesAlreadyActive(${nextBlockTimestamp}, ${latestFeesUpdate[0].startTime})`
      );
    });
  });

  describe("revokePendingSettlementPeriodsUpdate", async () => {
    // -------------------------------------------
    // Functionality
    // -------------------------------------------

    it("Revokes pending settlement periods update", async () => {
      // ---------
      // Arrange: Trigger settlement periods update
      // ---------
      // Get current settlement periods
      const govParamsBefore = await getterFacet.getGovernanceParameters();

      // Define new fee and confirm that it is different than existing fees
      newPeriod = 4 * ONE_DAY;
      expect(
        govParamsBefore.currentSettlementPeriods.submissionPeriod
      ).to.not.eq(newPeriod);
      expect(
        govParamsBefore.currentSettlementPeriods.challengePeriod
      ).to.not.eq(newPeriod);
      expect(govParamsBefore.currentSettlementPeriods.reviewPeriod).to.not.eq(
        newPeriod
      );
      expect(
        govParamsBefore.currentSettlementPeriods.fallbackSubmissionPeriod
      ).to.not.eq(newPeriod);

      // Update settlement periods
      await governanceFacet
        .connect(contractOwner)
        .updateSettlementPeriods(newPeriod, newPeriod, newPeriod, newPeriod);

      // Get length of settlement periods history
      settlementPeriodsLengthBefore =
        await getterFacet.getSettlementPeriodsHistoryLength();

      // ---------
      // Act: Revoke settlement periods update
      // ---------
      await governanceFacet
        .connect(contractOwner)
        .revokePendingSettlementPeriodsUpdate();

      // ---------
      // Assert: Confirm that the settlement periods history length reduced and the current settlement periods are unchanged
      // ---------
      // Check that settlement periods array length reduced by 1
      settlementPeriodsLengthAfter =
        await getterFacet.getSettlementPeriodsHistoryLength();
      expect(settlementPeriodsLengthAfter).to.eq(
        settlementPeriodsLengthBefore.sub(1)
      );

      // Confirm that `getGovernanceParameters` still returns the previous set
      const govParamsAfter = await getterFacet.getGovernanceParameters();
      expect(govParamsBefore.currentSettlementPeriods.submissionPeriod).to.eq(
        govParamsAfter.currentSettlementPeriods.submissionPeriod
      );
      expect(govParamsBefore.currentSettlementPeriods.challengePeriod).to.eq(
        govParamsAfter.currentSettlementPeriods.challengePeriod
      );
      expect(govParamsBefore.currentSettlementPeriods.reviewPeriod).to.eq(
        govParamsAfter.currentSettlementPeriods.reviewPeriod
      );
      expect(
        govParamsBefore.currentSettlementPeriods.fallbackSubmissionPeriod
      ).to.eq(govParamsAfter.currentSettlementPeriods.fallbackSubmissionPeriod);
    });

    // -------------------------------------------
    // Events
    // -------------------------------------------

    it("Emits four `PendingSettlementPeriodUpdateRevoked` events", async () => {
      // ---------
      // Arrange: Trigger settlement periods update
      // ---------
      // Get current settlement periods
      const govParamsBefore = await getterFacet.getGovernanceParameters();

      // Define new fee and confirm that it is different than existing fees
      newPeriod = 4 * ONE_DAY;
      expect(
        govParamsBefore.currentSettlementPeriods.submissionPeriod
      ).to.not.eq(newPeriod);
      expect(
        govParamsBefore.currentSettlementPeriods.challengePeriod
      ).to.not.eq(newPeriod);
      expect(govParamsBefore.currentSettlementPeriods.reviewPeriod).to.not.eq(
        newPeriod
      );
      expect(
        govParamsBefore.currentSettlementPeriods.fallbackSubmissionPeriod
      ).to.not.eq(newPeriod);

      // Update settlement periods
      await governanceFacet
        .connect(contractOwner)
        .updateSettlementPeriods(newPeriod, newPeriod, newPeriod, newPeriod);

      // ---------
      // Act: Revoke settlement periods update
      // ---------
      const tx = await governanceFacet
        .connect(contractOwner)
        .revokePendingSettlementPeriodsUpdate();
      const receipt = await tx.wait();

      // ---------
      // Assert: Check that it emits four `PendingSettlementPeriodUpdateRevoked` events
      // ---------
      // Catch event
      const pendingSettlementPeriodUpdateRevokedEvents =
        receipt.events?.filter(
          (item) => item.event === "PendingSettlementPeriodUpdateRevoked"
        ) || [];

      // Event for submission period
      expect(
        pendingSettlementPeriodUpdateRevokedEvents[0].args?.revokedBy
      ).to.eq(contractOwner.address);
      expect(
        pendingSettlementPeriodUpdateRevokedEvents[0].args?.revokedPeriod
      ).to.eq(newPeriod);
      expect(
        pendingSettlementPeriodUpdateRevokedEvents[0].args?.restoredPeriod
      ).to.eq(govParamsBefore.currentSettlementPeriods.submissionPeriod);
      expect(
        pendingSettlementPeriodUpdateRevokedEvents[0].args?.periodType
      ).to.eq(FeeType.PROTOCOL_FEE);

      // Event for challenge period
      expect(
        pendingSettlementPeriodUpdateRevokedEvents[1].args?.revokedBy
      ).to.eq(contractOwner.address);
      expect(
        pendingSettlementPeriodUpdateRevokedEvents[1].args?.revokedPeriod
      ).to.eq(newPeriod);
      expect(
        pendingSettlementPeriodUpdateRevokedEvents[1].args?.restoredPeriod
      ).to.eq(govParamsBefore.currentSettlementPeriods.challengePeriod);
      expect(
        pendingSettlementPeriodUpdateRevokedEvents[1].args?.periodType
      ).to.eq(SettlementPeriodType.CHALLENGE_PERIOD);

      // Event for review period
      expect(
        pendingSettlementPeriodUpdateRevokedEvents[2].args?.revokedBy
      ).to.eq(contractOwner.address);
      expect(
        pendingSettlementPeriodUpdateRevokedEvents[2].args?.revokedPeriod
      ).to.eq(newPeriod);
      expect(
        pendingSettlementPeriodUpdateRevokedEvents[2].args?.restoredPeriod
      ).to.eq(govParamsBefore.currentSettlementPeriods.reviewPeriod);
      expect(
        pendingSettlementPeriodUpdateRevokedEvents[2].args?.periodType
      ).to.eq(SettlementPeriodType.REVIEW_PERIOD);

      // Event for fallback submission period
      expect(
        pendingSettlementPeriodUpdateRevokedEvents[3].args?.revokedBy
      ).to.eq(contractOwner.address);
      expect(
        pendingSettlementPeriodUpdateRevokedEvents[3].args?.revokedPeriod
      ).to.eq(newPeriod);
      expect(
        pendingSettlementPeriodUpdateRevokedEvents[3].args?.restoredPeriod
      ).to.eq(
        govParamsBefore.currentSettlementPeriods.fallbackSubmissionPeriod
      );
      expect(
        pendingSettlementPeriodUpdateRevokedEvents[3].args?.periodType
      ).to.eq(SettlementPeriodType.FALLBACK_SUBMISSION_PERIOD);
    });

    // -------------------------------------------
    // Reverts
    // -------------------------------------------

    it("Reverts if triggered by an account other than the contract owner", async () => {
      // ---------
      // Act & Assert: Confirm that function call reverts if called by an account other than the contract owner
      // ---------
      await expect(
        governanceFacet.connect(user2).revokePendingSettlementPeriodsUpdate()
      ).to.be.revertedWith(
        `NotContractOwner("${user2.address}", "${contractOwner.address}")`
      );
    });

    it("Reverts with `SettlementPeriodsAlreadyActive` if the latest settlement periods update is already active", async () => {
      // ---------
      // Arrange: Trigger settlement periods update
      // ---------
      newPeriod = 4 * ONE_DAY;
      await governanceFacet
        .connect(contractOwner)
        .updateSettlementPeriods(newPeriod, newPeriod, newPeriod, newPeriod);

      // Set next block's timestamp after the activation time
      nextBlockTimestamp = (await getLastTimestamp()) + governanceDelay + 1;
      await setNextTimestamp(ethers.provider, nextBlockTimestamp);

      // Get the latest settlement periods update
      const latestSettlementPeriodsUpdate =
        await getterFacet.getSettlementPeriodsHistory(1);

      // ---------
      // Act & Assert: Revoke settlement periods update
      // ---------
      await expect(
        governanceFacet
          .connect(contractOwner)
          .revokePendingSettlementPeriodsUpdate()
      ).to.be.revertedWith(
        `SettlementPeriodsAlreadyActive(${nextBlockTimestamp}, ${latestSettlementPeriodsUpdate[0].startTime})`
      );
    });
  });

  describe("revokePendingFallbackDataProviderUpdate", async () => {
    // -------------------------------------------
    // Functionality
    // -------------------------------------------

    it("Revokes pending fallback data provider update", async () => {
      // ---------
      // Arrange: Trigger fallback data provider update
      // ---------
      // Get current fallback data provider
      const govParamsBefore = await getterFacet.getGovernanceParameters();

      // Define a new fallback data provider and confirm that it is different than the existing one
      newFallbackDataProvider = user1.address;
      expect(govParamsBefore.fallbackDataProvider).to.not.eq(
        newFallbackDataProvider
      );

      // Set fallback data provider
      await governanceFacet
        .connect(contractOwner)
        .updateFallbackDataProvider(newFallbackDataProvider);
      lastBlockTimestamp = await getLastTimestamp();

      // Check that fallback data provider info is updated as expected
      fallbackDataProviderInfo =
        await getterFacet.getFallbackDataProviderInfo();
      expect(fallbackDataProviderInfo.previousFallbackDataProvider).to.eq(
        govParamsBefore.fallbackDataProvider
      );
      expect(fallbackDataProviderInfo.fallbackDataProvider).to.eq(
        newFallbackDataProvider
      );
      expect(fallbackDataProviderInfo.startTimeFallbackDataProvider).to.eq(
        lastBlockTimestamp + governanceDelay
      );

      // ---------
      // Act: Revoke fallback data provider update
      // ---------
      await governanceFacet
        .connect(contractOwner)
        .revokePendingFallbackDataProviderUpdate();
      lastBlockTimestamp = await getLastTimestamp();

      // ---------
      // Assert: Check that fallback data provider info is updated as expected
      // ---------
      fallbackDataProviderInfo =
        await getterFacet.getFallbackDataProviderInfo();
      expect(fallbackDataProviderInfo.previousFallbackDataProvider).to.eq(
        govParamsBefore.fallbackDataProvider
      );
      expect(fallbackDataProviderInfo.fallbackDataProvider).to.eq(
        govParamsBefore.fallbackDataProvider
      );
      expect(fallbackDataProviderInfo.startTimeFallbackDataProvider).to.eq(
        lastBlockTimestamp
      );

      // Confirm that `getGovernanceParameters` still returns the previous fallback data provider
      const govParamsAfter = await getterFacet.getGovernanceParameters();
      expect(govParamsBefore.fallbackDataProvider).to.eq(
        govParamsAfter.fallbackDataProvider
      );
    });

    // -------------------------------------------
    // Events
    // -------------------------------------------

    it("Emits a `PendingFallbackDataProviderUpdateRevoked` event", async () => {
      // ---------
      // Arrange: Trigger fallback data provider update
      // ---------
      // Get current fallback data provider
      const govParamsBefore = await getterFacet.getGovernanceParameters();

      // Define a new fallback data provider and confirm that it is different than the existing one
      newFallbackDataProvider = user1.address;
      expect(govParamsBefore.fallbackDataProvider).to.not.eq(
        newFallbackDataProvider
      );

      // Set fallback data provider
      await governanceFacet
        .connect(contractOwner)
        .updateFallbackDataProvider(newFallbackDataProvider);
      lastBlockTimestamp = await getLastTimestamp();

      // ---------
      // Act: Revoke fallback data provider update
      // ---------
      const tx = await governanceFacet
        .connect(contractOwner)
        .revokePendingFallbackDataProviderUpdate();
      const receipt = await tx.wait();

      // ---------
      // Assert: Check that it emits a `PendingFallbackDataProviderUpdateRevoked` event
      // ---------
      const pendingFallbackDataProviderUpdateRevokedEvent =
        receipt.events?.find(
          (item) => item.event === "PendingFallbackDataProviderUpdateRevoked"
        );
      expect(
        pendingFallbackDataProviderUpdateRevokedEvent?.args?.revokedBy
      ).to.eq(contractOwner.address);
      expect(
        pendingFallbackDataProviderUpdateRevokedEvent?.args
          ?.revokedFallbackDataProvider
      ).to.eq(newFallbackDataProvider);
      expect(
        pendingFallbackDataProviderUpdateRevokedEvent?.args
          ?.restoredFallbackDataProvider
      ).to.eq(govParamsBefore.fallbackDataProvider);
    });

    // -------------------------------------------
    // Reverts
    // -------------------------------------------

    it("Reverts if triggered by an account other than the contract owner", async () => {
      // ---------
      // Act & Assert: Confirm that function call reverts if called by an account other than the contract owner
      // ---------
      await expect(
        governanceFacet.connect(user2).revokePendingFallbackDataProviderUpdate()
      ).to.be.revertedWith(
        `NotContractOwner("${user2.address}", "${contractOwner.address}")`
      );
    });

    it("Reverts with `FallbackProviderAlreadyActive` if the latest fallback data provider update is already active", async () => {
      // ---------
      // Arrange: Trigger fallback data provider update
      // ---------
      newFallbackDataProvider = user2.address;
      await governanceFacet
        .connect(contractOwner)
        .updateFallbackDataProvider(newFallbackDataProvider);

      // Set next block's timestamp after the activation time
      nextBlockTimestamp = (await getLastTimestamp()) + governanceDelay + 1;
      await setNextTimestamp(ethers.provider, nextBlockTimestamp);

      // Get fallback data provider info
      fallbackDataProviderInfo =
        await getterFacet.getFallbackDataProviderInfo();

      // ---------
      // Act & Assert: Revoke fallback data provider update
      // ---------
      await expect(
        governanceFacet
          .connect(contractOwner)
          .revokePendingFallbackDataProviderUpdate()
      ).to.be.revertedWith(
        `FallbackProviderAlreadyActive(${nextBlockTimestamp}, ${fallbackDataProviderInfo.startTimeFallbackDataProvider})`
      );
    });
  });

  describe("revokePendingTreasuryUpdate", async () => {
    // -------------------------------------------
    // Functionality
    // -------------------------------------------

    it("Revokes pending treasury address update", async () => {
      // ---------
      // Arrange: Trigger treasury address update
      // ---------
      // Get current treasury address
      const govParamsBefore = await getterFacet.getGovernanceParameters();

      // Define a new treasury address and confirm that it is different than the existing one
      newTreasuryAddress = user1.address;
      expect(govParamsBefore.treasury).to.not.eq(
        newTreasuryAddress
      );

      // Update treasury address
      await governanceFacet
        .connect(contractOwner)
        .updateTreasury(newTreasuryAddress);
      lastBlockTimestamp = await getLastTimestamp();

      // Check that treasury info is updated as expected
      treasuryInfo =
        await getterFacet.getTreasuryInfo();
      expect(treasuryInfo.previousTreasury).to.eq(
        govParamsBefore.treasury
      );
      expect(treasuryInfo.treasury).to.eq(
        newTreasuryAddress
      );
      expect(treasuryInfo.startTimeTreasury).to.eq(
        lastBlockTimestamp + treasuryUpdateDelay
      );

      // ---------
      // Act: Revoke treasury address update
      // ---------
      await governanceFacet
        .connect(contractOwner)
        .revokePendingTreasuryUpdate();
      lastBlockTimestamp = await getLastTimestamp();

      // ---------
      // Assert: Check that treasury info is updated as expected
      // ---------
      treasuryInfo =
        await getterFacet.getTreasuryInfo();
      expect(treasuryInfo.previousTreasury).to.eq(
        govParamsBefore.treasury
      );
      expect(treasuryInfo.treasury).to.eq(
        govParamsBefore.treasury
      );
      expect(treasuryInfo.startTimeTreasury).to.eq(
        lastBlockTimestamp
      );

      // Confirm that `getGovernanceParameters` still returns the previous treasury address
      const govParamsAfter = await getterFacet.getGovernanceParameters();
      expect(govParamsBefore.treasury).to.eq(
        govParamsAfter.treasury
      );
    });

    // -------------------------------------------
    // Events
    // -------------------------------------------

    it("Emits a `PendingTreasuryUpdateRevoked` event", async () => {
      // ---------
      // Arrange: Trigger treasury address update
      // ---------
      // Get current treasury address
      const govParamsBefore = await getterFacet.getGovernanceParameters();

      // Define a new treasury address and confirm that it is different than the existing one
      newTreasuryAddress = user1.address;
      expect(govParamsBefore.treasury).to.not.eq(
        newTreasuryAddress
      );

      // Update treasury address
      await governanceFacet
        .connect(contractOwner)
        .updateTreasury(newTreasuryAddress);
      lastBlockTimestamp = await getLastTimestamp();

      // ---------
      // Act: Revoke treasury address update
      // ---------
      const tx = await governanceFacet
        .connect(contractOwner)
        .revokePendingTreasuryUpdate();
      const receipt = await tx.wait();

      // ---------
      // Assert: Check that it emits a `PendingTreasuryUpdateRevoked` event
      // ---------
      const pendingTreasuryUpdateRevokedEvent =
        receipt.events?.find(
          (item) => item.event === "PendingTreasuryUpdateRevoked"
        );
      expect(
        pendingTreasuryUpdateRevokedEvent?.args?.revokedBy
      ).to.eq(contractOwner.address);
      expect(
        pendingTreasuryUpdateRevokedEvent?.args
          ?.revokedTreasury
      ).to.eq(newTreasuryAddress);
      expect(
        pendingTreasuryUpdateRevokedEvent?.args
          ?.restoredTreasury
      ).to.eq(govParamsBefore.treasury);
    });

    // -------------------------------------------
    // Reverts
    // -------------------------------------------

    it("Reverts if triggered by an account other than the contract owner", async () => {
      // ---------
      // Act & Assert: Confirm that function call reverts if called by an account other than the contract owner
      // ---------
      await expect(
        governanceFacet.connect(user2).revokePendingTreasuryUpdate()
      ).to.be.revertedWith(
        `NotContractOwner("${user2.address}", "${contractOwner.address}")`
      );
    });

    it("Reverts with `TreasuryAlreadyActive` if the latest treasury address update is already active", async () => {
      // ---------
      // Arrange: Trigger treasury address update
      // ---------
      newTreasuryAddress = user2.address;
      await governanceFacet
        .connect(contractOwner)
        .updateTreasury(newTreasuryAddress);

      // Set next block's timestamp after the activation time
      nextBlockTimestamp = (await getLastTimestamp()) + treasuryUpdateDelay + 1;
      await setNextTimestamp(ethers.provider, nextBlockTimestamp);

      // Get treasury info
      treasuryInfo =
        await getterFacet.getTreasuryInfo();

      // ---------
      // Act & Assert: Revoke treasury address update
      // ---------
      await expect(
        governanceFacet
          .connect(contractOwner)
          .revokePendingTreasuryUpdate()
      ).to.be.revertedWith(
        `TreasuryAlreadyActive(${nextBlockTimestamp}, ${treasuryInfo.startTimeTreasury})`
      );
    });
  });

  describe("pauseReturnCollateral/unpauseReturnCollateral", async () => {
    let blockTimestamp: number;
    let nextBlockTimestamp: number;

    it("Sets `pauseReturnCollateralUntil` 8 days after current block timestamp if triggered the first time", async () => {
      // ---------
      // Arrange: Confirm that `pauseReturnCollateralUntil` is zero initially
      // ---------
      govParamsBefore = await getterFacet.getGovernanceParameters();
      expect(govParamsBefore.pauseReturnCollateralUntil).to.be.eq(0);

      // ---------
      // Act: Pause `redeemPositionToken` and `removeLiquidity` functions
      // ---------
      await governanceFacet
        .connect(contractOwner)
        .pauseReturnCollateral();

      // ---------
      // Assert: Check that `pauseReturnCollateralUntil` was set to 8 days after current block timestamp
      // ---------
      blockTimestamp = await getLastTimestamp();
      govParamsAfter = await getterFacet.getGovernanceParameters();
      expect(govParamsAfter.pauseReturnCollateralUntil).to.be.eq(
        blockTimestamp + 8 * ONE_DAY
      );
    });

    it("Sets `pauseReturnCollateralUntil` to current block timestamp if the pause is deactivated", async () => {
      // ---------
      // Arrange: Confirm that withdrawals are not paused (pause in previous `it` block is deactivated due to
      // the 60 days move in time in `afterEach` block) and set the next block's timestamp shortly after the pause event
      // ---------
      // Confirm that `pauseReturnCollateralUntil` is in the past
      blockTimestamp = await getLastTimestamp();
      govParamsBefore = await getterFacet.getGovernanceParameters();
      expect(blockTimestamp).to.be.gt(
        govParamsBefore.pauseReturnCollateralUntil
      );

      // Pause
      await governanceFacet
        .connect(contractOwner)
        .pauseReturnCollateral();

      // Increment next block's timestamp by 1
      nextBlockTimestamp = (await getLastTimestamp()) + 1;
      govParamsBefore = await getterFacet.getGovernanceParameters();
      expect(govParamsBefore.pauseReturnCollateralUntil).to.be.gt(
        nextBlockTimestamp
      );
      await setNextTimestamp(ethers.provider, nextBlockTimestamp);

      // ---------
      // Act: Unpause functions
      // ---------
      await governanceFacet
        .connect(contractOwner)
        .unpauseReturnCollateral();

      // ---------
      // Assert: Check that `pauseReturnCollateralUntil` was set to the current block timestamp
      // ---------
      blockTimestamp = await getLastTimestamp();
      govParamsAfter = await getterFacet.getGovernanceParameters();
      expect(govParamsAfter.pauseReturnCollateralUntil).to.be.eq(
        blockTimestamp
      );
    });

    // -------------------------------------------
    // Reverts
    // -------------------------------------------

    it("Reverts if contract owner tries to pause before the 2 day waiting period expired", async () => {
      // ---------
      // Arrange: Pause and unpause withdrawals and set the following block's timestamp such that it's within
      // the 2 day waiting window
      // ---------
      // Confirm that `pauseReturnCollateralUntil` is in the past
      blockTimestamp = await getLastTimestamp();
      govParamsBefore = await getterFacet.getGovernanceParameters();
      expect(blockTimestamp).to.be.gt(
        govParamsBefore.pauseReturnCollateralUntil
      );

      // Pause
      await governanceFacet
        .connect(contractOwner)
        .pauseReturnCollateral();

      // Unpause
      await governanceFacet
        .connect(contractOwner)
        .unpauseReturnCollateral();

      // Set the next block's timestamp shortly after the unpause but within then 2 day waiting window
      nextBlockTimestamp = (await getLastTimestamp()) + 1;
      govParams = await getterFacet.getGovernanceParameters();
      expect(govParams.pauseReturnCollateralUntil).to.be.lt(
        nextBlockTimestamp + 1
      );
      expect(nextBlockTimestamp + 1).to.be.lt(
        govParams.pauseReturnCollateralUntil.add(2 * ONE_DAY)
      );
      await setNextTimestamp(ethers.provider, nextBlockTimestamp);

      // ---------
      // Act & Assert: Confirm that the contract owner cannot pause the contract again before the 2 day window has passed
      // ---------
      await expect(
        governanceFacet.connect(contractOwner).pauseReturnCollateral()
      ).to.be.revertedWith("TooEarlyToPauseAgain()");
    });

    it("Reverts if `pauseReturnCollateral` is triggered by an account other than the contract owner", async () => {
      // ---------
      // Act & Assert: Confirm that it reverts if triggered by an account other than the contract owner
      // ---------
      await expect(
        governanceFacet.connect(user2).pauseReturnCollateral()
      ).to.be.revertedWith(
        `NotContractOwner("${user2.address}", "${contractOwner.address}")`
      );
    });

    it("Reverts if `unpauseReturnCollateral` is triggered by an account other than the contract owner", async () => {
      // ---------
      // Act & Assert: Confirm that it reverts if triggered by an account other than the contract owner
      // ---------
      await expect(
        governanceFacet.connect(user2).unpauseReturnCollateral()
      ).to.be.revertedWith(
        `NotContractOwner("${user2.address}", "${contractOwner.address}")`
      );
    });

    it("Reverts with `AlreadyUnpaused` if contract owner attempts to unpause after the contract was already unpaused (scenario with early manual unpause)", async () => {
      // ---------
      // Arrange: Pause and unpause withdrawals early (i.e. before 8 days expired)
      // ---------
      // Confirm that `pauseReturnCollateralUntil` is in the past to ensure that `pauseReturnCollateral` will work
      blockTimestamp = await getLastTimestamp();
      govParamsBefore = await getterFacet.getGovernanceParameters();
      expect(blockTimestamp).to.be.gt(
        govParamsBefore.pauseReturnCollateralUntil
      );

      // Pause
      await governanceFacet
        .connect(contractOwner)
        .pauseReturnCollateral();

      // Unpause
      await governanceFacet
        .connect(contractOwner)
        .unpauseReturnCollateral();

      // ---------
      // Act & Assert: Confirm that the contract owner cannot unpause again
      // ---------
      await expect(
        governanceFacet.connect(contractOwner).unpauseReturnCollateral()
      ).to.be.revertedWith("AlreadyUnpaused()");

      // ---------
      // Reset: Fast forward 2 days in time to enable the possibility a pause for the next tests
      // ---------
      nextBlockTimestamp = (await getLastTimestamp()) + 2 * ONE_DAY;
      await mineBlock(nextBlockTimestamp);
    });

    it("Reverts with `AlreadyUnpaused` if contract owner attempts to unpause after the contract was already unpaused (scenario with automatic unpause after 8 days)", async () => {
      // ---------
      // Arrange: Pause withdrawals and unpause by waiting for more than 8 days
      // ---------
      // Confirm that `pauseReturnCollateralUntil` is in the past to ensure that `pauseReturnCollateral` will work
      blockTimestamp = await getLastTimestamp();
      govParamsBefore = await getterFacet.getGovernanceParameters();
      expect(blockTimestamp).to.be.gt(
        govParamsBefore.pauseReturnCollateralUntil
      );

      // Pause
      await governanceFacet
        .connect(contractOwner)
        .pauseReturnCollateral();

      // Fast forward 9 days in time to automatically unpause the contract      
      govParamsAfter = await getterFacet.getGovernanceParameters();
      nextBlockTimestamp = (govParamsAfter.pauseReturnCollateralUntil).toNumber() + ONE_DAY;
      await mineBlock(nextBlockTimestamp);

      // At this point withdrawals are already unpaused as the 8 days have passed

      // ---------
      // Act & Assert: Confirm that the contract owner cannot unpause again
      // ---------
      await expect(
        governanceFacet.connect(contractOwner).unpauseReturnCollateral()
      ).to.be.revertedWith("AlreadyUnpaused()");

      // ---------
      // Reset: Fast forward 2 days in time to enable the possibility a pause for the next tests
      // ---------
      nextBlockTimestamp = (await getLastTimestamp()) + 2 * ONE_DAY;
      await mineBlock(nextBlockTimestamp);
    });

    // -------------------------------------------
    // Events
    // -------------------------------------------

    it("Emits a `ReturnCollateralUnpaused` event", async () => {
      // ---------
      // Arrange: Pause withdrawals
      // ---------      
      // Confirm that `pauseReturnCollateralUntil` is in the past to ensure that `pauseReturnCollateral` will work
      blockTimestamp = await getLastTimestamp();
      govParamsBefore = await getterFacet.getGovernanceParameters();
      expect(blockTimestamp).to.be.gt(
        govParamsBefore.pauseReturnCollateralUntil.add(2 * ONE_DAY)
      );

      // Pause
      await governanceFacet
        .connect(contractOwner)
        .pauseReturnCollateral();

      // ---------
      // Act: Unpause withdrawals
      // ---------
      const tx = await governanceFacet
        .connect(contractOwner)
        .unpauseReturnCollateral();
      const receipt = await tx.wait();

      lastBlockTimestamp = await getLastTimestamp();

      // ---------
      // Assert: Check that it emits a `ReturnCollateralUnpaused` event
      // ---------
      govParams = await getterFacet.getGovernanceParameters();
      const returnCollateralUnpausedEvent = receipt.events?.find(
        (item) => item.event === "ReturnCollateralUnpaused"
      );
      expect(returnCollateralUnpausedEvent?.args?.from).to.eq(
        contractOwner.address
      );
      expect(returnCollateralUnpausedEvent?.args?.timestamp).to.eq(
        lastBlockTimestamp
      );
    });

    it("Emits a `ReturnCollateralPaused` event", async () => {
      // ---------
      // Act: Pause withdrawals
      // ---------
      const tx = await governanceFacet
        .connect(contractOwner)
        .pauseReturnCollateral();
      const receipt = await tx.wait();

      // ---------
      // Assert: Check that it emits a ReturnCollateralPaused event
      // ---------
      govParams = await getterFacet.getGovernanceParameters();
      const returnCollateralPausedEvent = receipt.events?.find(
        (item) => item.event === "ReturnCollateralPaused"
      );
      expect(returnCollateralPausedEvent?.args?.from).to.eq(
        contractOwner.address
      );
      expect(returnCollateralPausedEvent?.args?.pausedUntil).to.eq(
        govParams.pauseReturnCollateralUntil
      );

      // ---------
      // Reset: Unpause to avoid any effects on following tests
      // ---------
      await governanceFacet
        .connect(contractOwner)
        .unpauseReturnCollateral();
    });
  });

  describe("getFeesHistory", async () => {
    it("Should return the correct number of historical fee updates", async () => {
      // ---------
      // Arrange: Define the new protocol and settlement fee and confirm that it's not equal to the current one
      // ---------
      // Fast forward in time to skip any pending fees update
      nextBlockTimestamp = (await getLastTimestamp()) + governanceDelay + 1;

      // Define new parameters and get current fees history length
      newFee1 = parseUnits("0.01"); // 1%, applicable to both for simplicity
      newFee2 = parseUnits("0.015"); // 1.5%, applicable to both for simplicity
      govParamsBefore = await getterFacet.getGovernanceParameters();
      feesLengthBefore = await getterFacet.getFeesHistoryLength();
      expect(govParamsBefore.currentFees.protocolFee).to.not.eq(newFee1);
      expect(govParamsBefore.currentFees.settlementFee).to.not.eq(newFee1);
      expect(govParamsBefore.currentFees.protocolFee).to.not.eq(newFee2);
      expect(govParamsBefore.currentFees.settlementFee).to.not.eq(newFee2);

      // ---------
      // Act: Contract owner sets protocol and settlement fee twice
      // ---------
      // Update fees first time
      await governanceFacet.connect(contractOwner).updateFees(newFee1, newFee1);

      // Fast forward in time to be able to update fees again
      nextBlockTimestamp = (await getLastTimestamp()) + governanceDelay + 1;
      await setNextTimestamp(ethers.provider, nextBlockTimestamp);

      // Update fees second time
      await governanceFacet.connect(contractOwner).updateFees(newFee2, newFee2);

      // ---------
      // Assert: Check return values of `getFeesHistory` function using different inputs
      // ---------
      // Get the new history length
      feesLengthAfter = await getterFacet.getFeesHistoryLength();

      // Should return undefined
      const feeHistory0 = await getterFacet.getFeesHistory(0);
      expect(feeHistory0).to.be.empty;

      // Should return newFee2
      const feeHistory1 = await getterFacet.getFeesHistory(1);
      expect(feeHistory1[0].protocolFee).to.eq(newFee2);
      expect(feeHistory1[0].settlementFee).to.eq(newFee2);

      // Should return newFee1
      const feeHistory2 = await getterFacet.getFeesHistory(2);
      expect(feeHistory2[0].protocolFee).to.eq(newFee2);
      expect(feeHistory2[0].settlementFee).to.eq(newFee2);
      expect(feeHistory2[1].protocolFee).to.eq(newFee1);
      expect(feeHistory2[1].settlementFee).to.eq(newFee1);

      // Confirm that it returns the full history if the input parameter exceeds the history length
      const feeHistory3 = await getterFacet.getFeesHistory(
        feesLengthAfter.add(1)
      );
      expect(feeHistory3.length).to.eq(feesLengthAfter);
      const feeHistory4 = await getterFacet.getFeesHistory(
        feesLengthAfter.add(10)
      );
      expect(feeHistory4.length).to.eq(feesLengthAfter);
    });
  });

  describe("getSettlementPeriodsHistory", async () => {
    it("Should return the correct number of historical settlement period updates", async () => {
      // ---------
      // Arrange: Define the new settlement periods and confirm that it's not equal to the current one
      // ---------
      // Fast forward in time to skip any pending settlement periods update
      nextBlockTimestamp = (await getLastTimestamp()) + governanceDelay + 1;

      // Define new parameters and get current settlement periods history length
      newPeriod1 = 4 * ONE_DAY;
      newPeriod2 = 4.5 * ONE_DAY;
      govParamsBefore = await getterFacet.getGovernanceParameters();
      settlementPeriodsLengthBefore =
        await getterFacet.getSettlementPeriodsHistoryLength();
      expect(
        govParamsBefore.currentSettlementPeriods.submissionPeriod
      ).to.not.eq(newPeriod1);
      expect(
        govParamsBefore.currentSettlementPeriods.challengePeriod
      ).to.not.eq(newPeriod1);
      expect(govParamsBefore.currentSettlementPeriods.reviewPeriod).to.not.eq(
        newPeriod1
      );
      expect(
        govParamsBefore.currentSettlementPeriods.fallbackSubmissionPeriod
      ).to.not.eq(newPeriod1);
      expect(
        govParamsBefore.currentSettlementPeriods.submissionPeriod
      ).to.not.eq(newPeriod2);
      expect(
        govParamsBefore.currentSettlementPeriods.challengePeriod
      ).to.not.eq(newPeriod2);
      expect(govParamsBefore.currentSettlementPeriods.reviewPeriod).to.not.eq(
        newPeriod2
      );
      expect(
        govParamsBefore.currentSettlementPeriods.fallbackSubmissionPeriod
      ).to.not.eq(newPeriod2);

      // ---------
      // Act: Contract owner sets settlement periods twice
      // ---------
      // Update settlement periods first time
      await governanceFacet
        .connect(contractOwner)
        .updateSettlementPeriods(newPeriod1, newPeriod1, newPeriod1, newPeriod1);

      // Fast forward in time to be able to update settlement periods again
      nextBlockTimestamp = (await getLastTimestamp()) + governanceDelay + 1;
      await setNextTimestamp(ethers.provider, nextBlockTimestamp);

      // Update settlement periods second time
      await governanceFacet
        .connect(contractOwner)
        .updateSettlementPeriods(newPeriod2, newPeriod2, newPeriod2, newPeriod2);

      // ---------
      // Assert: Check return values of `getSettlementPeriodsHistoryLength` function using different inputs
      // ---------
      // Get the new history length
      settlementPeriodsLengthAfter =
        await getterFacet.getSettlementPeriodsHistoryLength();

      // Should return undefined
      const settlementPeriodsHistory0 =
        await getterFacet.getSettlementPeriodsHistory(0);
      expect(settlementPeriodsHistory0).to.be.empty;

      // Should return newPeriod2
      const settlementPeriodsHistory1 =
        await getterFacet.getSettlementPeriodsHistory(1);
      expect(settlementPeriodsHistory1[0].submissionPeriod).to.eq(newPeriod2);
      expect(settlementPeriodsHistory1[0].challengePeriod).to.eq(newPeriod2);
      expect(settlementPeriodsHistory1[0].reviewPeriod).to.eq(newPeriod2);
      expect(settlementPeriodsHistory1[0].fallbackSubmissionPeriod).to.eq(
        newPeriod2
      );

      // Should return newPeriod1
      const settlementPeriodsHistory2 =
        await getterFacet.getSettlementPeriodsHistory(2);
      expect(settlementPeriodsHistory2[1].submissionPeriod).to.eq(newPeriod1);
      expect(settlementPeriodsHistory2[1].challengePeriod).to.eq(newPeriod1);
      expect(settlementPeriodsHistory2[1].reviewPeriod).to.eq(newPeriod1);
      expect(settlementPeriodsHistory2[1].fallbackSubmissionPeriod).to.eq(
        newPeriod1
      );

      const settlementPeriodsHistory3 =
        await getterFacet.getSettlementPeriodsHistory(
          settlementPeriodsLengthAfter.add(1)
        );
      expect(settlementPeriodsHistory3.length).to.eq(
        settlementPeriodsLengthAfter
      );

      const settlementPeriodsHistory4 =
        await getterFacet.getSettlementPeriodsHistory(
          settlementPeriodsLengthAfter.add(10)
        );
      expect(settlementPeriodsHistory4.length).to.eq(
        settlementPeriodsLengthAfter
      );
    });
  });

  describe("getGovernanceParameters", async () => {
    it("Should return the right parameters", async () => {
      // ---------
      // Arrange: Define the new protocol parameters
      // ---------
      govParamsBefore = await getterFacet.getGovernanceParameters();

      // Define new fees and make sure it's not equal to the current ones
      newFee = parseUnits("0.01"); // 1%
      expect(govParamsBefore.currentFees.protocolFee).to.not.eq(newFee);
      expect(govParamsBefore.currentFees.settlementFee).to.not.eq(newFee);

      // Define new settlement related periods and make sure it's not equal to the current ones
      newPeriod = 4 * ONE_DAY;
      expect(
        govParamsBefore.currentSettlementPeriods.submissionPeriod
      ).to.not.eq(newPeriod);
      expect(
        govParamsBefore.currentSettlementPeriods.challengePeriod
      ).to.not.eq(newPeriod);
      expect(govParamsBefore.currentSettlementPeriods.reviewPeriod).to.not.eq(
        newPeriod
      );
      expect(
        govParamsBefore.currentSettlementPeriods.fallbackSubmissionPeriod
      ).to.not.eq(newPeriod);

      // Define new treasury address and make sure it's not equal to the current one
      newTreasuryAddress = user1.address;
      expect(govParamsBefore.treasury).to.not.eq(newTreasuryAddress);

      // Define new fallback data provider and make sure it's not equal to the current one
      newFallbackDataProvider = user1.address;
      expect(govParamsBefore.fallbackDataProvider).to.not.eq(
        newFallbackDataProvider
      );

      // ---------
      // Act 1: Trigger updates of protocol settings
      // ---------

      // Update fees
      await governanceFacet.connect(contractOwner).updateFees(newFee, newFee);

      // Update settlement periods
      await governanceFacet
        .connect(contractOwner)
        .updateSettlementPeriods(newPeriod, newPeriod, newPeriod, newPeriod);

      // Update treasury address
      await governanceFacet
        .connect(contractOwner)
        .updateTreasury(newTreasuryAddress);

      // Update fallback data provider
      await governanceFacet
        .connect(contractOwner)
        .updateFallbackDataProvider(newFallbackDataProvider);

      // ---------
      // Assert 1: Confirm that governance parameters return the previous values and not
      // the pending ones
      // ---------
      govParamsAfter = await getterFacet.getGovernanceParameters();
      expect(govParamsAfter.currentFees.protocolFee).to.eq(govParamsBefore.currentFees.protocolFee);
      expect(govParamsAfter.currentFees.settlementFee).to.eq(govParamsBefore.currentFees.settlementFee);
      expect(govParamsAfter.currentSettlementPeriods.submissionPeriod).to.eq(govParamsBefore.currentSettlementPeriods.submissionPeriod);
      expect(govParamsAfter.currentSettlementPeriods.challengePeriod).to.eq(govParamsBefore.currentSettlementPeriods.challengePeriod);
      expect(govParamsAfter.currentSettlementPeriods.reviewPeriod).to.eq(govParamsBefore.currentSettlementPeriods.reviewPeriod);
      expect(govParamsAfter.currentSettlementPeriods.fallbackSubmissionPeriod).to.eq(govParamsBefore.currentSettlementPeriods.fallbackSubmissionPeriod);
      expect(govParamsAfter.treasury).to.eq(govParamsBefore.treasury);
      expect(govParamsAfter.fallbackDataProvider).to.eq(govParamsBefore.fallbackDataProvider);
      // Note: No need to test `pauseReturnCollateralUntil` as it's updated without delay

      // ---------
      // Act 2: Fast forward in time to activate the new settings
      // ---------
      nextBlockTimestamp = (await getLastTimestamp()) + governanceDelay + 1;
      await mineBlock(nextBlockTimestamp);

      // ---------
      // Assert 2: Confirm that governance parameters return the new values now
      // ---------
      govParamsAfter = await getterFacet.getGovernanceParameters();
      expect(govParamsAfter.currentFees.protocolFee).to.eq(newFee);
      expect(govParamsAfter.currentFees.settlementFee).to.eq(newFee);
      expect(govParamsAfter.currentSettlementPeriods.submissionPeriod).to.eq(newPeriod);
      expect(govParamsAfter.currentSettlementPeriods.challengePeriod).to.eq(newPeriod);
      expect(govParamsAfter.currentSettlementPeriods.reviewPeriod).to.eq(newPeriod);
      expect(govParamsAfter.currentSettlementPeriods.fallbackSubmissionPeriod).to.eq(newPeriod);
      expect(govParamsAfter.treasury).to.eq(newTreasuryAddress);
      expect(govParamsAfter.fallbackDataProvider).to.eq(newFallbackDataProvider);
    })
  });
});
