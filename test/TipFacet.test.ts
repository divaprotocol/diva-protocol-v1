
import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, ContractReceipt, ContractTransaction } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
  GetterFacet,
  MockERC20,
  PoolFacet,
  TipFacet,
  SettlementFacet,
  GovernanceFacet,
  ClaimFacet,
} from "../typechain-types";
import { LibDIVAStorage } from "../typechain-types/contracts/facets/GetterFacet";

import {
    getPoolIdFromTx,
    calcFee,
    createContingentPool,
    decimals,
    defaultPoolParameters,
    CreateContingentPoolParams
} from "../utils";
import { ONE_DAY, GovParams, Status } from "../constants";
import { deployMain } from "../scripts/deployMain";

import { erc20DeployFixture } from "./fixtures";
import { setNextBlockTimestamp, latest } from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time";

describe("TipFacet", async function () {
    let contractOwner: SignerWithAddress,
        treasury: SignerWithAddress,
        fallbackDataProvider: SignerWithAddress,
        tipper: SignerWithAddress,
        oracle: SignerWithAddress,
        user1: SignerWithAddress,
        user2: SignerWithAddress,
        accounts: SignerWithAddress[];

    let user1StartCollateralTokenBalance: number;
    let user2StartCollateralTokenBalance: number;
    
    let submissionPeriod: number;
    
        let tipAmount: BigNumber,
        tipAmountBefore: BigNumber,
        tipAmountAfter: BigNumber,
        feeClaimAmountBefore: BigNumber,
        feeClaimAmountAfter: BigNumber,
        collateralBalanceTipperBefore: BigNumber,
        collateralBalanceTipperAfter: BigNumber,
        collateralBalanceDiamondBefore: BigNumber,
        collateralBalanceDiamondAfter: BigNumber;

    let diamondAddress: string;
    let poolFacet: PoolFacet,
        tipFacet: TipFacet,
        getterFacet: GetterFacet,
        settlementFacet: SettlementFacet,
        claimFacet: ClaimFacet,
        governanceFacet: GovernanceFacet,
        collateralTokenInstance: MockERC20;

    let nextBlockTimestamp: number;
    let currentBlockTimestamp: number;

    let poolId: string;
    let poolParamsBefore: LibDIVAStorage.PoolStructOutput,
      poolParamsAfter: LibDIVAStorage.PoolStructOutput;
    let govParams: GovParams;

    let tx: ContractTransaction;
    let receipt: ContractReceipt;

    let createContingentPoolParams: CreateContingentPoolParams;

    before(async function () {
        [contractOwner, treasury, fallbackDataProvider, tipper, oracle, user1, user2, ...accounts] =
        await ethers.getSigners(); // keep contractOwner and treasury at first two positions in line with deploy script

        // ---------
        // Setup: Deploy diamond contract (incl. facets) and connect to the diamond contract via facet specific ABI's
        // ---------
        diamondAddress = (await deployMain())[0];
        poolFacet = await ethers.getContractAt("PoolFacet", diamondAddress);
        tipFacet = await ethers.getContractAt("TipFacet", diamondAddress);
        getterFacet = await ethers.getContractAt("GetterFacet", diamondAddress);
        settlementFacet = await ethers.getContractAt("SettlementFacet", diamondAddress);
        claimFacet = await ethers.getContractAt("ClaimFacet", diamondAddress);
        governanceFacet = await ethers.getContractAt("GovernanceFacet", diamondAddress);

        // Update fallback data provider to be independent on the configuration in the deploy script
        await governanceFacet
          .connect(contractOwner)
          .updateFallbackDataProvider(fallbackDataProvider.address);
        currentBlockTimestamp = await latest();

        // Fast forward in time to activate the new fallback data provider
        await setNextBlockTimestamp(currentBlockTimestamp + 60 * ONE_DAY + 1)

        // Get governance parameters
        govParams = await getterFacet.getGovernanceParameters();
        submissionPeriod =
            govParams.currentSettlementPeriods.submissionPeriod; // 7d (initial value)
    });

    beforeEach(async () => {
        // ---------
        // Arrange: Equip user1 and user2 with collateral tokens, approve collateral token for Diamond contract
        // to allow them to create pools and add tip
        // ---------
        user1StartCollateralTokenBalance = 100000;
        user2StartCollateralTokenBalance = 50000;
  
        // Mint ERC20 collateral token with `decimals` decimals and send it to user 1
        collateralTokenInstance = await erc20DeployFixture(
          "DummyCollateralToken",
          "DCT",
          parseUnits(user1StartCollateralTokenBalance.toString(), decimals),
          user1.address,
          decimals,
          "0"
        );
  
        // Transfer half of user1's DCT balance to user2
        await collateralTokenInstance
          .connect(user1)
          .transfer(
            user2.address,
            parseUnits(user2StartCollateralTokenBalance.toString(), decimals)
          );
  
        // Set user1 allowances for Diamond contract
        await collateralTokenInstance
          .connect(user1)
          .approve(
            diamondAddress,
            parseUnits(user1StartCollateralTokenBalance.toString(), decimals)
          );
  
        // Set user2 allowances for Diamond contract
        await collateralTokenInstance
          .connect(user2)
          .approve(
            diamondAddress,
            parseUnits(user2StartCollateralTokenBalance.toString(), decimals)
          );
      });

    describe("addTip", async () => {
        
        beforeEach(async function () {
            // Specify the create contingent pool parameters. Refer to `utils/libDiva.ts` for default values.
            createContingentPoolParams = {
              ...defaultPoolParameters,
              collateralToken: collateralTokenInstance.address,
              dataProvider: oracle.address,
              poolCreater: user1,
              poolFacet: poolFacet,
              longRecipient: user1.address,
              shortRecipient: user1.address,
            }

            // Create a contingent pool
            const tx = await createContingentPool(createContingentPoolParams);
            poolId = await getPoolIdFromTx(tx);
            poolParamsBefore = await getterFacet.getPoolParameters(poolId);
        });

        // -------------------------------------------
        // Functionality
        // -------------------------------------------
        
        it("Adds a tip to an existing pool and updates the corresponding balances correctly", async () => {
            // ---------
            // Arrange: Prepare for tipping call and log relevant variables before tipping
            // ---------
            tipAmount = parseUnits("10", decimals);
            tipper = user2;
            expect(poolParamsBefore.statusFinalReferenceValue).to.eq(Status.Open);
            tipAmountBefore = await getterFacet.getReservedClaim(poolId);
            feeClaimAmountBefore = await getterFacet.getClaim(poolParamsBefore.collateralToken, oracle.address);
            collateralBalanceTipperBefore = await collateralTokenInstance.balanceOf(tipper.address);
            collateralBalanceDiamondBefore = await collateralTokenInstance.balanceOf(diamondAddress);

            // ---------
            // Act: Add tip
            // ---------
            await tipFacet.connect(tipper).addTip(poolId, tipAmount);

            // ---------
            // Assert: Confirm that relevant variables have been updated as expected
            // ---------
            tipAmountAfter = await getterFacet.getReservedClaim(poolId);
            feeClaimAmountAfter = await getterFacet.getClaim(poolParamsBefore.collateralToken, oracle.address);
            collateralBalanceTipperAfter = await collateralTokenInstance.balanceOf(tipper.address);
            collateralBalanceDiamondAfter = await collateralTokenInstance.balanceOf(diamondAddress);

            // Tip amount increased
            expect(tipAmountAfter).to.eq(tipAmountBefore.add(tipAmount));
            
            // Fee claim amount remained unchanged
            expect(feeClaimAmountAfter).to.eq(feeClaimAmountBefore);

            // Reduces the tipper's collateral token balance
            expect(collateralBalanceTipperAfter).to.eq(collateralBalanceTipperBefore.sub(tipAmount));

            // Increases the Diamond contract's collateral token balance
            expect(collateralBalanceDiamondAfter).to.eq(collateralBalanceDiamondBefore.add(tipAmount));
        })

        it("Updates the tips and fee claims after a value has been confirmed", async () => {
            // ---------
            // Arrange: Add tip and fast forward in time post pool expiration
            // ---------
            // Prepare for tipping and log relevant variables before calling the function
            tipAmount = parseUnits("10", decimals);
            tipper = user2;
            tipAmountBefore = await getterFacet.getReservedClaim(poolId);
            feeClaimAmountBefore = await getterFacet.getClaim(poolParamsBefore.collateralToken, oracle.address);
            expect(poolParamsBefore.statusFinalReferenceValue).to.eq(Status.Open);
            expect(tipAmountBefore).to.eq(0);

            // Add tip
            await tipFacet.connect(tipper).addTip(poolId, tipAmount);
            tipAmountAfter = await getterFacet.getReservedClaim(poolId);
            feeClaimAmountAfter = await getterFacet.getClaim(poolParamsBefore.collateralToken, oracle.address);
            expect(tipAmountAfter).to.eq(tipAmountBefore.add(tipAmount));
            expect(feeClaimAmountAfter).to.eq(feeClaimAmountBefore);
            expect(feeClaimAmountAfter).to.eq(0);

            // Calculate fees
            const feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
            const settlementFee = calcFee(
                feesParams.settlementFee,
                poolParamsBefore.collateralBalance,
                decimals
            );
            const protocolFee = calcFee(
                feesParams.protocolFee,
                poolParamsBefore.collateralBalance,
                decimals
            );

            // Fast forward in time post pool expiration
            nextBlockTimestamp = Number(poolParamsBefore.expiryTime) + 1;
            await setNextBlockTimestamp(nextBlockTimestamp);

            // ---------
            // Act 1: Report final reference value and confirm it immediately by disabling
            // the possibility to challenge
            // ---------
            await settlementFacet.connect(oracle).setFinalReferenceValue(poolId, "1", false)

            // ---------
            // Assert 1: Check that relevant variables have been updated correctly
            // ---------
            const tipAmountAfterReporting = await getterFacet.getReservedClaim(poolId);
            const feeClaimAmountAfterReporting = await getterFacet.getClaim(poolParamsBefore.collateralToken, oracle.address);
            const poolParamsAfterReporting = await getterFacet.getPoolParameters(poolId);
            
            // Confirm that the tipping amount has been set to zero
            expect(tipAmountAfterReporting).to.eq(0);

            // Confirm that fee claim is the sum of settlement fee and tip amount
            expect(feeClaimAmountAfterReporting).to.eq(settlementFee.add(tipAmount));

            // Confirm that the pool collateral balance only reduced by the fee portion
            expect(poolParamsAfterReporting.collateralBalance).to.eq(poolParamsBefore.collateralBalance.sub(settlementFee).sub(protocolFee));

            // ---------
            // Act 2: Claim fees
            // ---------
            await claimFacet.connect(oracle).claimFee(poolParamsBefore.collateralToken, oracle.address);

            // ---------
            // Assert 2: Check that relevant variables have been updated correctly
            // ---------
            const tipAmountAfterClaim = await getterFacet.getReservedClaim(poolId);
            const feeClaimAmountAfterClaim = await getterFacet.getClaim(poolParamsBefore.collateralToken, oracle.address);
            const poolParamsAfterClaim = await getterFacet.getPoolParameters(poolId);

            // Confirm that the tipping amount is still zero
            expect(tipAmountAfterClaim).to.eq(0);

            // Confirm that fee claim has been reduced to zero
            expect(feeClaimAmountAfterClaim).to.eq(0);

            // Confirm that pool collateral balance remains unchanged
            expect(poolParamsAfterClaim.collateralBalance).to.eq(poolParamsAfterReporting.collateralBalance);
        })

        it("Should credit the tip to the fallback data provider, if final value is confirmed during the fallback submission period", async () => {
            // ---------
            // Arrange: Prepare for tipping call and log relevant variables before confirming the final reference value
            // with the fallback data provider
            // ---------
            // Tip pool
            tipAmount = parseUnits("10", decimals);
            tipper = user2;
            expect(poolParamsBefore.statusFinalReferenceValue).to.eq(Status.Open);
            await tipFacet.connect(tipper).addTip(poolId, tipAmount);

            // Get tips and fee claim amounts before confirming the final reference value
            const tipAmountBefore = await getterFacet.getReservedClaim(poolId);
            const feeClaimAmountDataProviderBefore = await getterFacet.getClaim(poolParamsBefore.collateralToken, oracle.address);
            const feeClaimAmountFallbackDataProviderBefore = await getterFacet.getClaim(poolParamsBefore.collateralToken, fallbackDataProvider.address);
            expect(tipAmountBefore).to.eq(tipAmount);

            // Calculate fees
            const feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
            const settlementFee = calcFee(
                feesParams.settlementFee,
                poolParamsBefore.collateralBalance,
                decimals
            );
            const protocolFee = calcFee(
                feesParams.protocolFee,
                poolParamsBefore.collateralBalance,
                decimals
            );

            // Fast forward into fallback submission period
            nextBlockTimestamp = Number(poolParamsBefore.expiryTime.add(submissionPeriod)) + 1;
            await setNextBlockTimestamp(nextBlockTimestamp);

            // ---------
            // Act: Set final reference value with fallback data provider during fallback period
            // ---------
            await settlementFacet.connect(fallbackDataProvider).setFinalReferenceValue(poolId, "1", false)
            
            // ---------
            // Assert: Confirm that the tip was credit to the fallback data provider's account and
            // not the data provider
            // ---------
            const tipAmountAfter = await getterFacet.getReservedClaim(poolId);
            const feeClaimAmountDataProviderAfter = await getterFacet.getClaim(poolParamsBefore.collateralToken, oracle.address);
            const feeClaimAmountFallbackDataProviderAfter = await getterFacet.getClaim(poolParamsBefore.collateralToken, fallbackDataProvider.address);
            poolParamsAfter = await getterFacet.getPoolParameters(poolId);

            // Confirm that tip amount is set to zero
            expect(tipAmountAfter).to.eq(0);

            // Confirm that the data provider's fee claim is unchanged
            expect(feeClaimAmountDataProviderAfter).to.eq(feeClaimAmountDataProviderBefore);

            // Confirm that the fallback data provider's fee claim amount includes the tip
            expect(feeClaimAmountFallbackDataProviderAfter).to.eq(feeClaimAmountFallbackDataProviderBefore.add(tipAmount).add(settlementFee));

            // Confirm that the pool collateral balance was reduced by the fee portion only
            expect(poolParamsAfter.collateralBalance).to.eq(poolParamsBefore.collateralBalance.sub(settlementFee).sub(protocolFee));
        });
        
        // -------------------------------------------
        // Events
        // -------------------------------------------

        it("Emits a `TipAdded` event", async () => {
            // ---------
            // Arrange: Prepare for tipping call
            // ---------
            tipAmount = parseUnits("10", decimals);
            tipper = user2;
            expect(poolParamsBefore.statusFinalReferenceValue).to.eq(Status.Open);

            // ---------
            // Act: Add tip
            // ---------
            tx = await tipFacet.connect(tipper).addTip(poolId, tipAmount);
            receipt = await tx.wait();
            const tipAddedEvent = receipt.events?.find(
                (x: any) => x.event === "TipAdded"
              );
            
            // ---------
            // Assert: Check that event returns the expected values
            // --------- 
            expect(tipAddedEvent?.args?.tipper).to.eq(tipper.address);
            expect(tipAddedEvent?.args?.poolId).to.eq(poolId);
            expect(tipAddedEvent?.args?.collateralToken).to.eq(poolParamsBefore.collateralToken);
            expect(tipAddedEvent?.args?.amount).to.eq(tipAmount);
        });

        it("Emits a `ReservedClaimAllocated` event when final value is confirmed", async () => {
            // ---------
            // Arrange: Add tip
            // ---------
            tipAmount = parseUnits("10", decimals);
            tipper = user2;
            expect(poolParamsBefore.statusFinalReferenceValue).to.eq(Status.Open);
            await tipFacet.connect(tipper).addTip(poolId, tipAmount);

            // Fast forward in time post pool expiration
            nextBlockTimestamp = Number(poolParamsBefore.expiryTime) + 1;
            await setNextBlockTimestamp(nextBlockTimestamp);

            // ---------
            // Act: Confirm final value on first submission by disabling the possibility to challenge
            // ---------
            tx = await settlementFacet.connect(oracle).setFinalReferenceValue(poolId, "1", false);
            receipt = await tx.wait();
            const reservedClaimAllocatedEvent = receipt.events?.find(
                (x: any) => x.event === "ReservedClaimAllocated"
            );

            // ---------
            // Assert: Check that event returns the expected values
            // ---------
            expect(reservedClaimAllocatedEvent?.args?.poolId).to.eq(poolId);
            expect(reservedClaimAllocatedEvent?.args?.recipient).to.eq(poolParamsBefore.dataProvider);
            expect(reservedClaimAllocatedEvent?.args?.amount).to.eq(tipAmount);
        })

        // -------------------------------------------
        // Reverts
        // -------------------------------------------

        it("Reverts with `NonExistentPool` if pool doesn't exist", async () => {
          // ---------
          // Arrange: Set a non-existent poolId and prepare parameters for call
          // ---------
          const nonExistentPoolId = ethers.constants.HashZero;
          tipAmount = parseUnits("10", decimals);
          tipper = user2;

          // ---------
          // Act & Assert: Confirm that the call reverts with `NonExistentPool`
          // ---------
          await expect(
              tipFacet
                  .connect(tipper)
                  .addTip(nonExistentPoolId, tipAmount)
          ).to.be.revertedWith("NonExistentPool()");
      })
        
        it("Reverts if statusFinalReferenceValue = Submitted", async () => {
            // ---------
            // Arrange: Prepare for tipping call and fast forward in time after pool expiration time
            // ---------
            tipAmount = parseUnits("10", decimals);
            tipper = user2;

            // Fast forward in time post pool expiration
            nextBlockTimestamp = Number(poolParamsBefore.expiryTime) + 1;
            await setNextBlockTimestamp(nextBlockTimestamp);

            // ---------
            // Act: Submit value such that statusFinalReferenceValue switches to "Submitted"
            // ---------
            await settlementFacet.connect(oracle).setFinalReferenceValue(poolId, "1", true);

            // ---------
            // Assert: Confirm that adding a tip will fail
            // ---------
            await expect(
                tipFacet
                    .connect(tipper)
                    .addTip(poolId, tipAmount)
            ).to.be.revertedWith("FinalValueAlreadySubmitted()");
        })

        it("Reverts if statusFinalReferenceValue = Challenged", async () => {
            // ---------
            // Arrange: Prepare for tipping call and fast forward in time after pool expiration time
            // ---------
            tipAmount = parseUnits("10", decimals);
            tipper = user2;

            // Fast forward in time post pool expiration
            nextBlockTimestamp = Number(poolParamsBefore.expiryTime) + 1;
            await setNextBlockTimestamp(nextBlockTimestamp);

            // ---------
            // Act: Submit value and challenge it to switch statusFinalReferenceValue to "Challenged"
            // ---------
            await settlementFacet.connect(oracle).setFinalReferenceValue(poolId, "1", true);
            await settlementFacet.connect(user1).challengeFinalReferenceValue(poolId, "2");

            // ---------
            // Assert: Confirm that adding a tip will fail
            // ---------
            await expect(
                tipFacet
                    .connect(tipper)
                    .addTip(poolId, tipAmount)
            ).to.be.revertedWith("FinalValueAlreadySubmitted()");
        })

        it("Reverts if statusFinalReferenceValue = Confirmed", async () => {
            // ---------
            // Arrange: Prepare for tipping call and fast forward in time after pool expiration time
            // ---------
            tipAmount = parseUnits("10", decimals);
            tipper = user2;

            // Fast forward in time post pool expiration
            nextBlockTimestamp = Number(poolParamsBefore.expiryTime) + 1;
            await setNextBlockTimestamp(nextBlockTimestamp);

            // ---------
            // Act: Submit value such that statusFinalReferenceValue switches to "Confirmed"
            // ---------
            await settlementFacet.connect(oracle).setFinalReferenceValue(poolId, "1", false);

            // ---------
            // Assert: Confirm that adding a tip will fail
            // ---------
            await expect(
                tipFacet
                    .connect(tipper)
                    .addTip(poolId, tipAmount)
            ).to.be.revertedWith("FinalValueAlreadySubmitted()");
        })

        it("Reverts with `FeeTokensNotSupported` if fees-on-transfer were activated for the underlying collateral token", async () => {
          // ---------
          // Arrange 1: Activate token transfer fees and set tip parameters
          // ---------
          const fee = 100;
          await collateralTokenInstance.setFee(fee);
          expect(await collateralTokenInstance.getFee()).to.eq(fee);
          const tipAmountBefore = await getterFacet.getReservedClaim(poolId);

          tipAmount = parseUnits("10", decimals);
          tipper = user2;
          expect(poolParamsBefore.statusFinalReferenceValue).to.eq(Status.Open);

          // ---------
          // Act & Assert 1: Check that adding a tip fails if a fee is activated
          // ---------
          await expect(
            tipFacet.connect(tipper).addTip(poolId, tipAmount)
          ).to.be.revertedWith("FeeTokensNotSupported()");

          // ---------
          // Reset: Set back fee to zero and test that add tips work again
          // ---------
          await collateralTokenInstance.setFee(0);
          expect(await collateralTokenInstance.getFee()).to.eq(0);

          // Tip pool with `tipAmount`
          await tipFacet.connect(tipper).addTip(poolId, tipAmount);

          // Confirm that reserved claim amount increased by `tipAmount`
          const tipAmountAfter3 = await getterFacet.getReservedClaim(poolId);
          expect(tipAmountAfter3).to.eq(tipAmountBefore.add(tipAmount));
      });

    });

    describe("batchAddTip", async () => {
        let tipAmount1: BigNumber,
            tipAmount2: BigNumber;
        
        let poolId1: string,
            poolId2: string;

        let pool1ParamsBefore: LibDIVAStorage.PoolStructOutput,
            pool2ParamsBefore: LibDIVAStorage.PoolStructOutput;

        beforeEach(async function () {
            // Create contingent pool 1
            const tx1 = await createContingentPool({
              collateralToken: collateralTokenInstance.address,
              dataProvider: oracle.address,
              poolCreater: user1,
              poolFacet: poolFacet,
              longRecipient: user1.address,
              shortRecipient: user1.address,
            });
            poolId1 = await getPoolIdFromTx(tx1);
            pool1ParamsBefore = await getterFacet.getPoolParameters(poolId1);

            // Create contingent pool 2
            const tx2 = await createContingentPool({
              collateralToken: collateralTokenInstance.address,
              dataProvider: oracle.address,
              poolCreater: user1,
              poolFacet: poolFacet,
              longRecipient: user1.address,
              shortRecipient: user1.address,
            });
            poolId2 = await getPoolIdFromTx(tx2);
            pool2ParamsBefore = await getterFacet.getPoolParameters(poolId2);
        });

        // -------------------------------------------
        // Functionality
        // -------------------------------------------

        it("Allows to add multiple tips to the same pool", async () => {
            // ---------
            // Arrange: Prepare for batch tipping call and log relevant variables before tipping
            // ---------
            tipAmount1 = parseUnits("10", decimals);
            tipAmount2 = parseUnits("15", decimals);
            tipper = user2;
            expect(pool1ParamsBefore.statusFinalReferenceValue).to.eq(Status.Open);
            tipAmountBefore = await getterFacet.getReservedClaim(poolId1);
            feeClaimAmountBefore = await getterFacet.getClaim(pool1ParamsBefore.collateralToken, oracle.address);
            collateralBalanceTipperBefore = await collateralTokenInstance.balanceOf(tipper.address);
            collateralBalanceDiamondBefore = await collateralTokenInstance.balanceOf(diamondAddress);

            // ---------
            // Act: Add multiple tips to the same pool
            // ---------
            await tipFacet.connect(tipper).batchAddTip([
                {
                  poolId: poolId1,
                  amount: tipAmount1,
                },
                {
                  poolId: poolId1,
                  amount: tipAmount2,
                },
              ]);

            // ---------
            // Assert: Confirm that relevant variables have been updated as expected
            // ---------
            tipAmountAfter = await getterFacet.getReservedClaim(poolId1);
            feeClaimAmountAfter = await getterFacet.getClaim(pool1ParamsBefore.collateralToken, oracle.address);
            collateralBalanceTipperAfter = await collateralTokenInstance.balanceOf(tipper.address);
            collateralBalanceDiamondAfter = await collateralTokenInstance.balanceOf(diamondAddress);

            // Tip amount increased
            expect(tipAmountAfter).to.eq(tipAmountBefore.add(tipAmount1).add(tipAmount2));

            // Fee claim amount remained unchanged
            expect(feeClaimAmountAfter).to.eq(feeClaimAmountBefore);

            // Reduces the tipper's collateral token balance
            expect(collateralBalanceTipperAfter).to.eq(collateralBalanceTipperBefore.sub(tipAmount1).sub(tipAmount2));

            // Increases the Diamond contract's collateral token balance
            expect(collateralBalanceDiamondAfter).to.eq(collateralBalanceDiamondBefore.add(tipAmount1).add(tipAmount2));
        })

        it("Allows to add multiple tips to the different pools", async () => {
            // ---------
            // Arrange: Prepare for batch tipping call and log relevant variables before tipping
            // ---------
            tipAmount1 = parseUnits("10", decimals);
            tipAmount2 = parseUnits("15", decimals);
            tipper = user2;
            expect(pool1ParamsBefore.statusFinalReferenceValue).to.eq(Status.Open);
            const tipAmountPool1Before = await getterFacet.getReservedClaim(poolId1);
            const tipAmountPool2Before = await getterFacet.getReservedClaim(poolId2);
            feeClaimAmountBefore = await getterFacet.getClaim(pool1ParamsBefore.collateralToken, oracle.address);
            collateralBalanceTipperBefore = await collateralTokenInstance.balanceOf(tipper.address);
            collateralBalanceDiamondBefore = await collateralTokenInstance.balanceOf(diamondAddress);

            // ---------
            // Act: Add multiple tips to the same pool
            // ---------
            await tipFacet.connect(tipper).batchAddTip([
                {
                  poolId: poolId1,
                  amount: tipAmount1,
                },
                {
                  poolId: poolId2,
                  amount: tipAmount2,
                },
              ]);

            // ---------
            // Assert: Confirm that relevant variables have been updated as expected
            // ---------
            const tipAmountPool1After = await getterFacet.getReservedClaim(poolId1);
            const tipAmountPool2After = await getterFacet.getReservedClaim(poolId2);
            feeClaimAmountAfter = await getterFacet.getClaim(pool1ParamsBefore.collateralToken, oracle.address);
            collateralBalanceTipperAfter = await collateralTokenInstance.balanceOf(tipper.address);
            collateralBalanceDiamondAfter = await collateralTokenInstance.balanceOf(diamondAddress);

            // Tip amount increased
            expect(tipAmountPool1After).to.eq(tipAmountPool1Before.add(tipAmount1));
            expect(tipAmountPool2After).to.eq(tipAmountPool2Before.add(tipAmount2));

            // Fee claim amount remained unchanged
            expect(feeClaimAmountAfter).to.eq(feeClaimAmountBefore);

            // Reduces the tipper's collateral token balance
            expect(collateralBalanceTipperAfter).to.eq(collateralBalanceTipperBefore.sub(tipAmount1).sub(tipAmount2));

            // Increases the Diamond contract's collateral token balance
            expect(collateralBalanceDiamondAfter).to.eq(collateralBalanceDiamondBefore.add(tipAmount1).add(tipAmount2));
        })
    });
})
