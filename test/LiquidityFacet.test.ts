import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, ContractTransaction } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
  ClaimFacet,
  GetterFacet,
  GovernanceFacet,
  LiquidityFacet,
  MockERC20,
  MockERC721,
  PermissionedPositionToken,
  PoolFacet,
  TipFacet,
  PositionToken,
  SettlementFacet,
} from "../typechain-types";
import { LibDIVAStorage } from "../typechain-types/contracts/facets/GetterFacet";

import {
  getExpiryTime,
  getLastTimestamp,
  setNextTimestamp,
  calcFee,
  getPoolIdFromTx,
  mineBlock,
} from "../utils";
import { GovParams, ONE_DAY } from "../constants";
import { deployMain } from "../scripts/deployMain";

import {
  erc20DeployFixture,
  erc721DeployFixture,
  positionTokenAttachFixture,
  permissionedPositionTokenAttachFixture,
} from "./fixtures";

// -------
// Input: Collateral token decimals (>= 6 && <= 18)
// -------
const decimals = 6;

describe("LiquidityFacet", async function () {
  let contractOwner: SignerWithAddress,
    treasury: SignerWithAddress,
    oracle: SignerWithAddress,
    user1: SignerWithAddress,
    user2: SignerWithAddress,
    user3: SignerWithAddress;

  let diamondAddress: string;
  let poolFacet: PoolFacet,
    tipFacet: TipFacet,
    liquidityFacet: LiquidityFacet,
    getterFacet: GetterFacet,
    claimFacet: ClaimFacet,
    governanceFacet: GovernanceFacet,
    settlementFacet: SettlementFacet;

  let collateralTokenInstance: MockERC20;
  let governanceDelay: number = 60 * ONE_DAY;

  const MAX_UINT = ethers.constants.MaxUint256;

  before(async function () {
    [contractOwner, treasury, oracle, user1, user2, user3] =
      await ethers.getSigners(); // keep contractOwner and treasury at first two positions in line with deploy script

    // ---------
    // Setup: Deploy diamond contract (incl. facets) and connect to the diamond contract via facet specific ABI's
    // ---------
    diamondAddress = (await deployMain())[0];
    poolFacet = await ethers.getContractAt("PoolFacet", diamondAddress);
    tipFacet = await ethers.getContractAt("TipFacet", diamondAddress);
    liquidityFacet = await ethers.getContractAt(
      "LiquidityFacet",
      diamondAddress
    );
    getterFacet = await ethers.getContractAt("GetterFacet", diamondAddress);
    claimFacet = await ethers.getContractAt("ClaimFacet", diamondAddress);
    settlementFacet = await ethers.getContractAt(
      "SettlementFacet",
      diamondAddress
    );
    governanceFacet = await ethers.getContractAt(
      "GovernanceFacet",
      diamondAddress
    );
  });

  describe("add and remove liquidity", async () => {
    let user1StartCollateralTokenBalance: number;
    let user2StartCollateralTokenBalance: number;
    let additionalCollateralAmount: BigNumber;
    let newCollateralBalance: BigNumber;

    let positionTokensToRedeem: BigNumber;
    let collateralToReturnGross: BigNumber;
    let collateralToReturnNet: BigNumber;

    let feesParams: LibDIVAStorage.FeesStructOutput;
    let govParams: GovParams;
    let poolFees: LibDIVAStorage.FeesStructOutput;
    let poolSettlementPeriods: LibDIVAStorage.SettlementPeriodsStructOutput;
    let permissionedERC721TokenInstance: MockERC721;
    let permissionedERC721Token: string;

    let poolId: BigNumber;
    let poolParams: LibDIVAStorage.PoolStructOutput,
      poolParamsBefore: LibDIVAStorage.PoolStructOutput,
      poolParamsAfter: LibDIVAStorage.PoolStructOutput;

    let protocolFee: BigNumber;
    let settlementFee: BigNumber;
    let fees: BigNumber;
    let nextBlockTimestamp: number;

    beforeEach(async () => {
      // ---------
      // Arrange: Equip user1 and user2 with collateral tokens, approve collateral token for Diamond contract,
      // and specify default parameters for test
      // ---------
      user1StartCollateralTokenBalance = 100000;
      user2StartCollateralTokenBalance = 50000;
      additionalCollateralAmount = parseUnits("5000", decimals);
      positionTokensToRedeem = parseUnits("66", decimals);

      // Mint ERC20 collateral token with `decimals` decimals and send it to user 1
      collateralTokenInstance = await erc20DeployFixture(
        "DummyCollateralToken",
        "DCT",
        parseUnits(user1StartCollateralTokenBalance.toString(), decimals),
        user1.address,
        decimals,
        "0"
      );

      // Transfer half of user1's DCT balance to user2 who will add liquidity
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

    // Function to create a contingent pool pre-populated with default values that can be overwritten depending on the test case
    async function createContingentPool({
      referenceAsset = "BTC/USD",
      expireInSeconds = 7200,
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
      return await poolFacet.connect(poolCreater).createContingentPool({
        referenceAsset,
        expiryTime: await getExpiryTime(expireInSeconds),
        floor: parseUnits(floor.toString()),
        inflection: parseUnits(inflection.toString()),
        cap: parseUnits(cap.toString()),
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

    describe("addLiquidity with zero permissionedERC721Token", async () => {
      let maxPoolCapacity: BigNumber;
      let shortTokenInstance: PositionToken;
      let longTokenInstance: PositionToken;

      beforeEach(async function () {
        if (
          this.currentTest?.title !==
            "Adds liquidity to an existing pool, updates the pool parameters and increases position token supply" &&
          this.currentTest?.title !==
            "Allows to add liquidity if pool has a max capacity defined but added amount does not exceed it"
        ) {
          // ---------
          // Arrange: Create a contingent pool
          // ---------
          const tx = await createContingentPool();
          poolId = await getPoolIdFromTx(tx);
          poolParamsBefore = await getterFacet.getPoolParameters(poolId);
          shortTokenInstance = await positionTokenAttachFixture(
            poolParamsBefore.shortToken
          );
          longTokenInstance = await positionTokenAttachFixture(
            poolParamsBefore.longToken
          );
        }
      });

      // -------------------------------------------
      // Functionality
      // -------------------------------------------

      it("Adds liquidity to an existing pool, updates the pool parameters and increases position token supply", async () => {
        // ---------
        // Arrange: Create a contingent pool
        // ---------
        const tx = await createContingentPool();
        poolId = await getPoolIdFromTx(tx);
        poolParamsBefore = await getterFacet.getPoolParameters(poolId);
        shortTokenInstance = await positionTokenAttachFixture(
          poolParamsBefore.shortToken
        );
        longTokenInstance = await positionTokenAttachFixture(
          poolParamsBefore.longToken
        );

        // ---------
        // Act: Add liquidity
        // ---------
        await liquidityFacet.connect(user2).addLiquidity(
          poolId,
          additionalCollateralAmount,
          user1.address, // longRecipient
          user2.address // shortRecipient
        );

        // ---------
        // Assert: Check that the relevant pool parameters are updated correctly and the others remain unchanged
        // ---------
        poolParamsAfter = await getterFacet.getPoolParameters(poolId);
        newCollateralBalance = poolParamsBefore.collateralBalance.add(
          additionalCollateralAmount
        );
        // Parameters expected to be updated
        expect(await shortTokenInstance.totalSupply()).to.eq(
          poolParamsAfter.collateralBalance
        );
        expect(await longTokenInstance.totalSupply()).to.eq(
          poolParamsAfter.collateralBalance
        );
        expect(poolParamsAfter.collateralBalance).to.eq(newCollateralBalance);
        // Parameters expected to remain unchanged
        expect(poolParamsAfter.referenceAsset).to.eq(
          poolParamsBefore.referenceAsset
        );
        expect(poolParamsAfter.expiryTime).to.eq(poolParamsBefore.expiryTime);
        expect(poolParamsAfter.floor).to.eq(poolParamsBefore.floor);
        expect(poolParamsAfter.inflection).to.eq(poolParamsBefore.inflection);
        expect(poolParamsAfter.cap).to.eq(poolParamsBefore.cap);
        expect(poolParamsAfter.collateralToken).to.eq(
          poolParamsBefore.collateralToken
        );
        expect(poolParamsAfter.gradient).to.eq(poolParamsBefore.gradient);
        expect(poolParamsAfter.shortToken).to.eq(poolParamsBefore.shortToken);
        expect(poolParamsAfter.longToken).to.eq(poolParamsBefore.longToken);
        expect(poolParamsAfter.finalReferenceValue).to.eq(0);
        expect(poolParamsAfter.statusFinalReferenceValue).to.eq(0);
        expect(poolParamsAfter.payoutLong).to.eq(0);
        expect(poolParamsAfter.payoutShort).to.eq(0);
        expect(poolParamsAfter.statusTimestamp).to.eq(
          poolParamsBefore.statusTimestamp
        );
        expect(poolParamsAfter.dataProvider).to.eq(
          poolParamsBefore.dataProvider
        );
        expect(poolParamsAfter.capacity).to.eq(poolParamsBefore.capacity);
      });

      it("Sends short and long tokens to user2 and user3, respectively", async () => {
        // ---------
        // Arrange: Confirm that user2's short and long token balances are zero
        // ---------
        expect(await shortTokenInstance.balanceOf(user3.address)).to.eq(0);
        expect(await longTokenInstance.balanceOf(user2.address)).to.eq(0);

        // ---------
        // Act: Add liquidity
        // ---------
        await liquidityFacet.connect(user2).addLiquidity(
          poolId,
          additionalCollateralAmount,
          user2.address, // longRecipient
          user3.address // shortRecipient
        );

        // ---------
        // Assert: Check that user2's long and user3's short token balance increased
        // ---------
        poolParamsAfter = await getterFacet.getPoolParameters(poolId);
        expect(await shortTokenInstance.balanceOf(user3.address)).to.eq(
          additionalCollateralAmount
        );
        expect(await longTokenInstance.balanceOf(user2.address)).to.eq(
          additionalCollateralAmount
        );
      });

      it("Reduces user2`s collateral token balance", async () => {
        // ---------
        // Arrange: Confirm that user2's collateral token balance equals `user2StartCollateralTokenBalance`
        // ---------
        expect(await collateralTokenInstance.balanceOf(user2.address)).to.eq(
          parseUnits(user2StartCollateralTokenBalance.toString(), decimals)
        );

        // ---------
        // Act: Add liquidity
        // ---------
        await liquidityFacet.connect(user2).addLiquidity(
          poolId,
          additionalCollateralAmount,
          user2.address, // longRecipient
          user3.address // shortRecipient
        );

        // ---------
        // Assert: Check that user2's (msg.sender) collateral token balance reduced
        // ---------
        const user2CollateralTokenBalanceAfter =
          await collateralTokenInstance.balanceOf(user2.address);
        expect(user2CollateralTokenBalanceAfter).to.eq(
          parseUnits(user2StartCollateralTokenBalance.toString(), decimals).sub(
            additionalCollateralAmount
          )
        );
      });

      it("Increases diamond contract`s collateral token balance", async () => {
        // ---------
        // Arrange: Get diamond contract's current collateral token balance
        // ---------
        const diamondCollateralTokenBalanceBefore =
          await collateralTokenInstance.balanceOf(diamondAddress);
        expect(diamondCollateralTokenBalanceBefore).to.eq(
          poolParamsBefore.collateralBalance
        );

        // ---------
        // Act: Add liquidity
        // ---------
        await liquidityFacet.connect(user2).addLiquidity(
          poolId,
          additionalCollateralAmount,
          user2.address, // longRecipient
          user3.address // shortRecipient
        );

        // ---------
        // Assert: Check that diamond contract's collateral token balance increased
        // ---------
        const diamondCollateralTokenBalanceAfter =
          await collateralTokenInstance.balanceOf(diamondAddress);
        expect(diamondCollateralTokenBalanceAfter).to.eq(
          diamondCollateralTokenBalanceBefore.add(additionalCollateralAmount)
        );
      });

      it("Allows to add liquidity if pool has a max capacity defined but added amount does not exceed it", async () => {
        // ---------
        // Arrange: Create a pool with capacity > 0 (chosen to be 100 collateral units higher than the initial collateral amount (15000.358))
        // ---------
        maxPoolCapacity = parseUnits("15001.358", decimals).add(
          parseUnits("100", decimals)
        );
        const tx = await createContingentPool({
          capacity: maxPoolCapacity,
        });
        poolId = await getPoolIdFromTx(tx);
        poolParamsBefore = await getterFacet.getPoolParameters(poolId);
        shortTokenInstance = await positionTokenAttachFixture(
          poolParamsBefore.shortToken
        );
        longTokenInstance = await positionTokenAttachFixture(
          poolParamsBefore.longToken
        );

        // ---------
        // Act: Add liquidity
        // ---------
        additionalCollateralAmount = parseUnits("100", decimals);
        await liquidityFacet.connect(user2).addLiquidity(
          poolId,
          additionalCollateralAmount,
          user2.address, // longRecipient
          user3.address // shortRecipient
        );

        // ---------
        // Assert: Check that the relevant pool parameters are updated correctly and the others remain unchanged
        // ---------
        poolParamsAfter = await getterFacet.getPoolParameters(poolId);
        newCollateralBalance = poolParamsBefore.collateralBalance.add(
          additionalCollateralAmount
        );
        // Parameters expected to be updated
        expect(await shortTokenInstance.totalSupply()).to.eq(
          poolParamsAfter.collateralBalance
        );
        expect(await longTokenInstance.totalSupply()).to.eq(
          poolParamsAfter.collateralBalance
        );
        expect(poolParamsAfter.collateralBalance).to.eq(newCollateralBalance);
        // Parameters expected to remain unchanged
        expect(poolParamsAfter.referenceAsset).to.eq(
          poolParamsBefore.referenceAsset
        );
        expect(poolParamsAfter.expiryTime).to.eq(poolParamsBefore.expiryTime);
        expect(poolParamsAfter.floor).to.eq(poolParamsBefore.floor);
        expect(poolParamsAfter.inflection).to.eq(poolParamsBefore.inflection);
        expect(poolParamsAfter.cap).to.eq(poolParamsBefore.cap);
        expect(poolParamsAfter.collateralToken).to.eq(
          poolParamsBefore.collateralToken
        );
        expect(poolParamsAfter.gradient).to.eq(poolParamsBefore.gradient);
        expect(poolParamsAfter.shortToken).to.eq(poolParamsBefore.shortToken);
        expect(poolParamsAfter.longToken).to.eq(poolParamsBefore.longToken);
        expect(poolParamsAfter.finalReferenceValue).to.eq(0);
        expect(poolParamsAfter.statusFinalReferenceValue).to.eq(0);
        expect(poolParamsAfter.payoutLong).to.eq(0);
        expect(poolParamsAfter.payoutShort).to.eq(0);
        expect(poolParamsAfter.statusTimestamp).to.eq(
          poolParamsBefore.statusTimestamp
        );
        expect(poolParamsAfter.dataProvider).to.eq(
          poolParamsBefore.dataProvider
        );
        expect(poolParamsAfter.capacity).to.eq(poolParamsBefore.capacity);
      });

      it("Allows to add zero liquidity to the pool without affecting the pool parameters and position token supply", async () => {
        // ---------
        // Act: Add liquidity
        // ---------
        additionalCollateralAmount = parseUnits("0", decimals);
        await liquidityFacet.connect(user2).addLiquidity(
          poolId,
          additionalCollateralAmount,
          user2.address, // longRecipient
          user3.address // shortRecipient
        );

        // ---------
        // Assert: Check that the relevant pool parameters are unchanged
        // ---------
        poolParamsAfter = await getterFacet.getPoolParameters(poolId);
        expect(await shortTokenInstance.totalSupply()).to.eq(
          poolParamsBefore.collateralBalance
        );
        expect(await longTokenInstance.totalSupply()).to.eq(
          poolParamsBefore.collateralBalance
        );
        expect(poolParamsAfter.collateralBalance).to.eq(
          poolParamsBefore.collateralBalance
        );
      });

      it("Adds the smallest unit of the collateral token as liquidity to an existing pool and updates the pool parameters", async () => {
        // ---------
        // Act: Add liquidity
        // ---------
        additionalCollateralAmount = BigNumber.from(1);
        await liquidityFacet.connect(user2).addLiquidity(
          poolId,
          additionalCollateralAmount,
          user2.address, // longRecipient
          user3.address // shortRecipient
        );

        // ---------
        // Assert: Check that the relevant pool parameters are unchanged
        // ---------
        poolParamsAfter = await getterFacet.getPoolParameters(poolId);
        newCollateralBalance = poolParamsBefore.collateralBalance.add(
          additionalCollateralAmount
        );

        expect(await shortTokenInstance.totalSupply()).to.eq(
          poolParamsAfter.collateralBalance
        );
        expect(await longTokenInstance.totalSupply()).to.eq(
          poolParamsAfter.collateralBalance
        );
        expect(poolParamsAfter.collateralBalance).to.eq(newCollateralBalance);
      });

      // -------------------------------------------
      // Events
      // -------------------------------------------

      it("Emits a LiquidityAdded event", async () => {
        // ---------
        // Act: Add liquidity
        // ---------
        additionalCollateralAmount = parseUnits("10", decimals);
        const tx = await liquidityFacet.connect(user2).addLiquidity(
          poolId,
          additionalCollateralAmount,
          user2.address, // longRecipient
          user3.address // shortRecipient
        );
        const receipt = await tx.wait();

        // ---------
        // Assert: Check that it emits a LiquidityAdded event
        // ---------
        const liquidityAddedEvent = receipt.events?.find(
          (item: any) => item.event === "LiquidityAdded"
        );
        expect(liquidityAddedEvent?.args?.poolId).to.eq(poolId);
        expect(liquidityAddedEvent?.args?.longRecipient).to.eq(user2.address);
        expect(liquidityAddedEvent?.args?.shortRecipient).to.eq(user3.address);
        expect(liquidityAddedEvent?.args?.collateralAmount).to.eq(
          additionalCollateralAmount
        );
      });

      // -------------------------------------------
      // Reverts
      // -------------------------------------------

      it("Reverts if pool is already expired (block.timestamp > expiryTime)", async () => {
        // ---------
        // Arrange: Create a set of position tokens that shortly expire
        // ---------
        nextBlockTimestamp = (await getLastTimestamp()) + 1;
        await setNextTimestamp(ethers.provider, nextBlockTimestamp);
        const tx = await createContingentPool({
          expireInSeconds: 2,
        });
        poolId = await getPoolIdFromTx(tx);
        poolParams = await getterFacet.getPoolParameters(poolId);

        // Set next block's timestamp after expiryTime
        await setNextTimestamp(
          ethers.provider,
          poolParams.expiryTime.add(1).toNumber()
        );

        // ---------
        // Act & Assert: Check that adding liquidity fails when position tokens are expired
        // ---------
        additionalCollateralAmount = parseUnits("10", decimals);
        await expect(
          liquidityFacet.connect(user2).addLiquidity(
            poolId,
            additionalCollateralAmount,
            user2.address, // longRecipient
            user3.address // shortRecipient
          )
        ).to.be.revertedWith("PoolExpired()");
      });

      it("Reverts if pool is already expired (block.timestamp = expiryTime)", async () => {
        // ---------
        // Arrange: Create position tokens that expire shortly
        // ---------
        nextBlockTimestamp = (await getLastTimestamp()) + 1;
        await setNextTimestamp(ethers.provider, nextBlockTimestamp);
        const tx = await createContingentPool({
          expireInSeconds: 2,
        });
        poolId = await getPoolIdFromTx(tx);
        poolParams = await getterFacet.getPoolParameters(poolId);

        // Set next block timestamp equal to expiryTime
        await setNextTimestamp(
          ethers.provider,
          poolParams.expiryTime.toNumber()
        );

        // ---------
        // Act & Assert: Check that adding liquidity fails when executed right at pool expiry
        // ---------
        additionalCollateralAmount = parseUnits("10", decimals);
        await expect(
          liquidityFacet.connect(user2).addLiquidity(
            poolId,
            additionalCollateralAmount,
            user2.address, // longRecipient
            user3.address // shortRecipient
          )
        ).to.be.revertedWith("PoolExpired()");
      });

      it("Reverts if pool capacity is exceeded", async () => {
        // ---------
        // Arrange: Create pool with capacity > 0 (chosen to be equal to collateral amount in the pool)
        // ---------
        maxPoolCapacity = parseUnits("15001.358", decimals);
        const tx = await createContingentPool({
          capacity: maxPoolCapacity,
        });
        poolId = await getPoolIdFromTx(tx);

        // ---------
        // Act & Assert: Check that adding liquidity fails if the pool capacity is exceeded
        // ---------
        additionalCollateralAmount = parseUnits("1", decimals);
        await expect(
          liquidityFacet.connect(user2).addLiquidity(
            poolId,
            additionalCollateralAmount,
            user2.address, // longRecipient
            user3.address // shortRecipient
          )
        ).to.be.revertedWith("PoolCapacityExceeded()");
      });

      it("Reverts if a very large collateral amount is added that causes the `multiplyDecimal` function in SafeDecimalMath to overflow", async () => {
        // ---------
        // Act & Assert
        // ---------
        // Add a large amount that will cause the formula in SafeDecimalMath's `multiplyDecimal` function to overflow
        additionalCollateralAmount = ethers.constants.MaxUint256;
        await expect(
          liquidityFacet.connect(user2).addLiquidity(
            poolId,
            additionalCollateralAmount,
            user2.address, // longRecipient
            user3.address // shortRecipient
          )
        ).to.be.reverted;
      });

      it("Reverts if longRecipient is the zero address", async () => {
        // ---------
      // Arrange: Set longRecipient to zero address
      // ---------
      const zeroXLongRecipient = ethers.constants.AddressZero;
      const shortRecipient = user3.address;
      expect(shortRecipient).to.not.eq(ethers.constants.AddressZero);

        // ---------
        // Act & Assert: Check that adding liquidity fails
        // ---------
        await expect(
          liquidityFacet.connect(user2).addLiquidity(
            poolId,
            additionalCollateralAmount,
            zeroXLongRecipient, // longRecipient
            shortRecipient // shortRecipient
          )
        ).to.be.revertedWith("ERC20: mint to the zero address");
      });

      it("Reverts if shortRecipient is the zero address", async () => {
        // ---------
        // Arrange: Set shortRecipient to zero address
        // ---------
        const zeroXShortRecipient = ethers.constants.AddressZero;
        const longRecipient = user2.address;
        expect(longRecipient).to.not.eq(ethers.constants.AddressZero);

        // ---------
        // Act & Assert: Check that adding liquidity fails
        // ---------
        await expect(
          liquidityFacet.connect(user2).addLiquidity(
            poolId,
            additionalCollateralAmount,
            longRecipient, // longRecipient
            zeroXShortRecipient // shortRecipient
          )
        ).to.be.revertedWith("ERC20: mint to the zero address");
      });
    });

    describe("addLiquidity with non-zero permissionedERC721Token", async () => {
      let shortTokenInstance: PermissionedPositionToken;
      let longTokenInstance: PermissionedPositionToken;

      beforeEach(async function () {
        // ---------
        // Arrange: Create a contingent pool with non-zero permissionedERC721Token and set additional collateral amount
        // ---------
        permissionedERC721TokenInstance = await erc721DeployFixture(
          "PermissionedERC721Token",
          "PNFT"
        );
        await permissionedERC721TokenInstance.connect(user1).mint();
        await permissionedERC721TokenInstance.connect(user2).mint();
        permissionedERC721Token = permissionedERC721TokenInstance.address;

        const tx = await createContingentPool({ permissionedERC721Token });
        poolId = await getPoolIdFromTx(tx);
        poolParamsBefore = await getterFacet.getPoolParameters(poolId);
        shortTokenInstance = await permissionedPositionTokenAttachFixture(
          poolParamsBefore.shortToken
        );
        longTokenInstance = await permissionedPositionTokenAttachFixture(
          poolParamsBefore.longToken
        );

        additionalCollateralAmount = parseUnits("10", decimals);
      });

      // -------------------------------------------
      // Functionality
      // -------------------------------------------

      it("Should allow to add liquidity with permissioned recipients", async () => {
        // ---------
        // Arrange: Check that user1 and user2 have permissioned ERC721 token
        // ---------
        expect(
          await permissionedERC721TokenInstance.balanceOf(user1.address)
        ).to.gt(0);
        expect(
          await permissionedERC721TokenInstance.balanceOf(user2.address)
        ).to.gt(0);

        // ---------
        // Act: Add liquidity
        // ---------
        await liquidityFacet.connect(user2).addLiquidity(
          poolId,
          additionalCollateralAmount,
          user1.address, // longRecipient
          user2.address // shortRecipient
        );

        // ---------
        // Assert: Check that the relevant pool parameters are updated correctly and the others remain unchanged
        // ---------
        poolParamsAfter = await getterFacet.getPoolParameters(poolId);
        newCollateralBalance = poolParamsBefore.collateralBalance.add(
          additionalCollateralAmount
        );
        // Parameters expected to be updated
        expect(await shortTokenInstance.totalSupply()).to.eq(
          poolParamsAfter.collateralBalance
        );
        expect(await longTokenInstance.totalSupply()).to.eq(
          poolParamsAfter.collateralBalance
        );
        expect(poolParamsAfter.collateralBalance).to.eq(newCollateralBalance);
        // Parameters expected to remain unchanged
        expect(poolParamsAfter.referenceAsset).to.eq(
          poolParamsBefore.referenceAsset
        );
        expect(poolParamsAfter.expiryTime).to.eq(poolParamsBefore.expiryTime);
        expect(poolParamsAfter.floor).to.eq(poolParamsBefore.floor);
        expect(poolParamsAfter.inflection).to.eq(poolParamsBefore.inflection);
        expect(poolParamsAfter.cap).to.eq(poolParamsBefore.cap);
        expect(poolParamsAfter.collateralToken).to.eq(
          poolParamsBefore.collateralToken
        );
        expect(poolParamsAfter.gradient).to.eq(poolParamsBefore.gradient);
        expect(poolParamsAfter.shortToken).to.eq(poolParamsBefore.shortToken);
        expect(poolParamsAfter.longToken).to.eq(poolParamsBefore.longToken);
        expect(poolParamsAfter.finalReferenceValue).to.eq(0);
        expect(poolParamsAfter.statusFinalReferenceValue).to.eq(0);
        expect(poolParamsAfter.payoutLong).to.eq(0);
        expect(poolParamsAfter.payoutShort).to.eq(0);
        expect(poolParamsAfter.statusTimestamp).to.eq(
          poolParamsBefore.statusTimestamp
        );
        expect(poolParamsAfter.dataProvider).to.eq(
          poolParamsBefore.dataProvider
        );
        expect(poolParamsAfter.capacity).to.eq(poolParamsBefore.capacity);
      });

      // -------------------------------------------
      // Reverts
      // -------------------------------------------

      it("Reverts if liquidity is added with non-permissioned short token recipient)", async () => {
        // ---------
        // Arrange: Check that user3 is not holding any permissioned ERC721 token
        // ---------
        expect(
          await permissionedERC721TokenInstance.balanceOf(user3.address)
        ).to.eq(0);

        // ---------
        // Act & Assert: Check that adding liquidity fails
        // ---------
        await expect(
          liquidityFacet.connect(user2).addLiquidity(
            poolId,
            additionalCollateralAmount,
            user1.address, // longRecipient
            user3.address // shortRecipient
          )
        ).to.be.revertedWith("PositionToken: invalid recipient");
      });

      it("Reverts if liquidity is added with non-permissioned long token recipient)", async () => {
        // ---------
        // Arrange: Check that user3 is not holding any permissioned ERC721 token
        // ---------
        expect(
          await permissionedERC721TokenInstance.balanceOf(user3.address)
        ).to.eq(0);

        // ---------
        // Act & Assert: Check that adding liquidity fails
        // ---------
        await expect(
          liquidityFacet.connect(user2).addLiquidity(
            poolId,
            additionalCollateralAmount,
            user3.address, // longRecipient
            user1.address // shortRecipient
          )
        ).to.be.revertedWith("PositionToken: invalid recipient");
      });
    });

    describe("batchAddLiquidity", async () => {
      // -------------------------------------------
      // Functionality
      // -------------------------------------------
      it("Adds liquidity to an existing pool, updates the pool parameters and increases position token supply", async () => {
        // ---------
        // Arrange: Create 2 contingent pools and set additional collateral amount
        // ---------
        let tx = await createContingentPool();
        const poolId1 = await getPoolIdFromTx(tx);
        const poolParamsBefore1 = await getterFacet.getPoolParameters(poolId1);
        const shortTokenInstance1 = await positionTokenAttachFixture(
          poolParamsBefore1.shortToken
        );
        const longTokenInstance1 = await positionTokenAttachFixture(
          poolParamsBefore1.longToken
        );

        tx = await createContingentPool();
        const poolId2 = await getPoolIdFromTx(tx);
        const poolParamsBefore2 = await getterFacet.getPoolParameters(poolId2);
        const shortTokenInstance2 = await positionTokenAttachFixture(
          poolParamsBefore2.shortToken
        );
        const longTokenInstance2 = await positionTokenAttachFixture(
          poolParamsBefore2.longToken
        );

        const additionalCollateralAmount1 = parseUnits("5000", decimals);
        const additionalCollateralAmount2 = parseUnits("6000", decimals);

        // ---------
        // Act: Add liquidity
        // ---------
        await liquidityFacet.connect(user2).batchAddLiquidity([
          {
            poolId: poolId1,
            collateralAmountIncr: additionalCollateralAmount1,
            longRecipient: user1.address, // longRecipient
            shortRecipient: user2.address, // shortRecipient
          },
          {
            poolId: poolId2,
            collateralAmountIncr: additionalCollateralAmount2,
            longRecipient: user1.address, // longRecipient
            shortRecipient: user2.address, // shortRecipient
          },
        ]);

        // ---------
        // Assert: Check that the relevant pool parameters are updated correctly and the others remain unchanged
        // ---------
        const poolParamsAfter1 = await getterFacet.getPoolParameters(poolId1);
        const newCollateralBalance1 = poolParamsBefore1.collateralBalance.add(
          additionalCollateralAmount1
        );

        // Parameters expected to be updated
        expect(await shortTokenInstance1.totalSupply()).to.eq(
          poolParamsAfter1.collateralBalance
        );
        expect(await longTokenInstance1.totalSupply()).to.eq(
          poolParamsAfter1.collateralBalance
        );
        expect(poolParamsAfter1.collateralBalance).to.eq(newCollateralBalance1);

        const poolParamsAfter2 = await getterFacet.getPoolParameters(poolId2);
        const newCollateralBalance2 = poolParamsBefore2.collateralBalance.add(
          additionalCollateralAmount2
        );

        // Parameters expected to be updated
        expect(await shortTokenInstance2.totalSupply()).to.eq(
          poolParamsAfter2.collateralBalance
        );
        expect(await longTokenInstance2.totalSupply()).to.eq(
          poolParamsAfter2.collateralBalance
        );
        expect(poolParamsAfter2.collateralBalance).to.eq(newCollateralBalance2);
      });
    });

    describe("removeLiquidity with zero permissionedERC721Token", async () => {
      let userCollateralTokenBalanceBefore: BigNumber;
      let shortTokenInstance: PositionToken;
      let longTokenInstance: PositionToken;

      beforeEach(async function () {
        if (
          this.currentTest?.title !==
          "Removes liquidity from an existing pool and updates the pool parameters and fee claims through various stages of the settlement process"
        ) {
          // ---------
          // Arrange: Create a contingent pool, set amount of position tokens to redeem and calculate fees to be paid
          // ---------
          const tx = await createContingentPool(); // expires in 7200 seconds
          poolId = await getPoolIdFromTx(tx);
          poolParamsBefore = await getterFacet.getPoolParameters(poolId);
          shortTokenInstance = await positionTokenAttachFixture(
            poolParamsBefore.shortToken
          );
          longTokenInstance = await positionTokenAttachFixture(
            poolParamsBefore.longToken
          );

          // Collateral to return gross of fees
          collateralToReturnGross = positionTokensToRedeem;

          // Get applicable fees for pool
          feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
          protocolFee = calcFee(
            feesParams.protocolFee,
            collateralToReturnGross,
            decimals
          );
          settlementFee = calcFee(
            feesParams.settlementFee,
            collateralToReturnGross,
            decimals
          );
          fees = protocolFee.add(settlementFee);
          
          // Collateral to return net of fees
          collateralToReturnNet = collateralToReturnGross.sub(fees);

          // Claim all fees to start with 0 fee claim in each test
          await claimFacet.claimFee(
            poolParamsBefore.collateralToken,
            treasury.address
          );
          await claimFacet.claimFee(
            poolParamsBefore.collateralToken,
            oracle.address
          );
          await claimFacet.claimFee(
            poolParamsBefore.collateralToken,
            contractOwner.address // fallback data provider
          );
        }
      });

      // -------------------------------------------
      // Functionality
      // -------------------------------------------
      it("Removes liquidity from an existing pool and updates the pool parameters and fee claims through various stages of the settlement process", async () => {
        // Note: In this test, the pool is confirmed with the assigned data provider by submitting the same value
        // in response to a challenge.

        // ========================
        // Remove liquidity
        // ========================
        
        // ---------
        // Arrange: Create a contingent pool, set amount of position tokens to redeem and calculate fees to be paid
        // ---------
        const tx = await createContingentPool();
        poolId = await getPoolIdFromTx(tx);

        // Get status before removing liquidity (after the pool has been created)        
        poolParamsBefore = await getterFacet.getPoolParameters(poolId);
        shortTokenInstance = await positionTokenAttachFixture(
          poolParamsBefore.shortToken
        );
        longTokenInstance = await positionTokenAttachFixture(
          poolParamsBefore.longToken
        );
        userCollateralTokenBalanceBefore =
          await collateralTokenInstance.balanceOf(user1.address);

        // Confirm that fee claims are zero
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

        // Calculate collateral to return gross of fees (calculated inside `removeLiquidity` function)
        collateralToReturnGross = positionTokensToRedeem;

        // Calculate fees
        feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
        protocolFee = calcFee(
          feesParams.protocolFee,
          collateralToReturnGross,
          decimals
        );
        settlementFee = calcFee(
          feesParams.settlementFee,
          collateralToReturnGross,
          decimals
        );
        fees = protocolFee.add(settlementFee);

        // Calculate collateral to return net of fees
        collateralToReturnNet = collateralToReturnGross.sub(fees);

        // ---------
        // Act: Remove liquidity
        // ---------
        await liquidityFacet
          .connect(user1)
          .removeLiquidity(poolId, positionTokensToRedeem);

        // ---------
        // Assert: Check that relevant pool parameters and balances were updated as expected and others
        // remained unchanged
        // ---------
        poolParamsAfter = await getterFacet.getPoolParameters(poolId);

        // Parameters expected to be updated
        expect(await shortTokenInstance.totalSupply()).to.eq(
          poolParamsBefore.collateralBalance.sub(positionTokensToRedeem)
        );
        expect(await longTokenInstance.totalSupply()).to.eq(
          poolParamsBefore.collateralBalance.sub(positionTokensToRedeem)
        );
        expect(poolParamsAfter.collateralBalance).to.eq(
          poolParamsBefore.collateralBalance.sub(collateralToReturnGross)
        );
        expect(await collateralTokenInstance.balanceOf(user1.address)).to.eq(
          userCollateralTokenBalanceBefore.add(collateralToReturnNet)
        );

        // Check that user1's short and long token balance got reduced
        expect(await shortTokenInstance.balanceOf(user1.address)).to.eq(
          poolParamsBefore.collateralBalance.sub(positionTokensToRedeem)
        );
        expect(await longTokenInstance.balanceOf(user1.address)).to.eq(
          poolParamsBefore.collateralBalance.sub(positionTokensToRedeem)
        );

        // Check that DIVA contract's collateral token balance was reduced.
        // Note that protocol and settlement fees remain inside DIVA contract until
        // claimed by treasury and data provider.
        expect(await collateralTokenInstance.balanceOf(diamondAddress)).to.eq(
          poolParamsBefore.collateralBalance.sub(collateralToReturnNet)
        );

        // Fee related parameters updated are as expected
        expect(
          await getterFacet.getClaim(
            collateralTokenInstance.address,
            treasury.address
          )
        ).to.eq(protocolFee);
        expect(await getterFacet.getClaim(
          collateralTokenInstance.address,
          oracle.address
          )
        ).to.eq(0);
        
        // Settlement fee is put in reserve and will be allocated to the actual data provider
        // when the final value is confirmed
        expect(await getterFacet.getReservedClaim(poolId)).to.eq(settlementFee);

        // Parameters expected to remain unchanged
        expect(poolParamsAfter.referenceAsset).to.eq(
          poolParamsBefore.referenceAsset
        );
        expect(poolParamsAfter.expiryTime).to.eq(poolParamsBefore.expiryTime);
        expect(poolParamsAfter.floor).to.eq(poolParamsBefore.floor);
        expect(poolParamsAfter.inflection).to.eq(poolParamsBefore.inflection);
        expect(poolParamsAfter.cap).to.eq(poolParamsBefore.cap);
        expect(poolParamsAfter.collateralToken).to.eq(
          poolParamsBefore.collateralToken
        );
        expect(poolParamsAfter.gradient).to.eq(poolParamsBefore.gradient);
        expect(poolParamsAfter.shortToken).to.eq(poolParamsBefore.shortToken);
        expect(poolParamsAfter.longToken).to.eq(poolParamsBefore.longToken);
        expect(poolParamsAfter.finalReferenceValue).to.eq(0);
        expect(poolParamsAfter.statusFinalReferenceValue).to.eq(0);
        expect(poolParamsAfter.payoutLong).to.eq(0);
        expect(poolParamsAfter.payoutShort).to.eq(0);
        expect(poolParamsAfter.statusTimestamp).to.eq(
          poolParamsBefore.statusTimestamp
        );
        expect(poolParamsAfter.dataProvider).to.eq(
          poolParamsBefore.dataProvider
        );
        expect(poolParamsAfter.capacity).to.eq(poolParamsBefore.capacity);
        
        // ========================
        // Treasury claims protocol fee
        // ========================

        // ---------
        // Act: Claim protocol fee with treasury
        // ---------
        await claimFacet.claimFee(
          poolParamsBefore.collateralToken,
          treasury.address
        );

        // ---------
        // Assert: Confirm that DIVA contract's collateral token balance is reduced by
        // the protocol fee amount and data provider claim amount and reserve remain unchanged
        // ---------
        expect(await collateralTokenInstance.balanceOf(diamondAddress)).to.eq(
          poolParamsBefore.collateralBalance.sub(collateralToReturnNet).sub(protocolFee)
        );
        expect(await getterFacet.getReservedClaim(poolId)).to.eq(settlementFee);
        expect(
          await getterFacet.getClaim(
            collateralTokenInstance.address,
            treasury.address
          )
        ).to.eq(0);
        expect(
          await getterFacet.getClaim(
            collateralTokenInstance.address,
            oracle.address
          )
        ).to.eq(0);

        // ========================
        // Submit final reference value with the possibility to challenge
        // ========================

        // ---------
        // Arrange: Fast forward in time post pool expiration
        // ---------
        nextBlockTimestamp = Number(poolParamsBefore.expiryTime) + 1;
        await mineBlock(nextBlockTimestamp);

        // ---------
        // Act: Confirm final reference value
        // ---------
        const finalReferenceValue = parseUnits("1605.33");
        const allowChallenge = true;
        await settlementFacet
          .connect(oracle)
          .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge);
        
        // ---------
        // Assert: Confirm that DIVA contract's collateral token balance, fee claim and reserve
        // for data provider are unchanged
        // ---------
        expect(await collateralTokenInstance.balanceOf(diamondAddress)).to.eq(
          poolParamsBefore.collateralBalance.sub(collateralToReturnNet).sub(protocolFee)
        );
        expect(await getterFacet.getReservedClaim(poolId)).to.eq(settlementFee);
        expect(await getterFacet.getClaim(
          collateralTokenInstance.address,
          oracle.address
          )
        ).to.eq(0);

        // ========================
        // Challenge submitted value
        // ========================

        // ---------
        // Act: Challenge final reference value
        // ---------
        await settlementFacet
          .connect(user1)
          .challengeFinalReferenceValue(poolId, finalReferenceValue.add(1));

        // ---------
        // Assert: Confirm that DIVA contract's collateral token balance, fee claim and reserve
        // for data provider are unchanged
        // ---------
        expect(await collateralTokenInstance.balanceOf(diamondAddress)).to.eq(
          poolParamsBefore.collateralBalance.sub(collateralToReturnNet).sub(protocolFee)
        );
        expect(await getterFacet.getReservedClaim(poolId)).to.eq(settlementFee);
        expect(await getterFacet.getClaim(
          collateralTokenInstance.address,
          oracle.address
          )
        ).to.eq(0);

        // ========================
        // Data provider resubmits the same value again and with that confirms the pool
        // ========================

        // ---------
        // Arrange: Calculate settlement fee based on the remaining collateral balance of the pool.
        // The reserved fee claim for the data provider should be added to that when the final value is confirmed.
        // ---------
        const settlementFeeRemainingCollateral = calcFee(
          feesParams.settlementFee,
          poolParamsAfter.collateralBalance,
          decimals
        );

        // ---------
        // Act: Submit the same value as before to confirm the pool
        // ---------
        await settlementFacet
          .connect(oracle)
          .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge); // allowChallenge is irrelevant here, as final value will be confirmed
        expect((await getterFacet.getPoolParameters(poolId)).statusFinalReferenceValue).to.eq(3); // 3 == Confirmed

        // ---------
        // Assert: Confirm that DIVA contract's collateral token balance is unchanged but reserved
        // fee claim as well as the settlement fee based on the remaining pool collateral have been credited to
        // the data provider.
        // ---------
        expect(await collateralTokenInstance.balanceOf(diamondAddress)).to.eq(
          poolParamsBefore.collateralBalance.sub(collateralToReturnNet).sub(protocolFee)
        );
        expect(await getterFacet.getReservedClaim(poolId)).to.eq(0);        
        expect(await getterFacet.getClaim(
          collateralTokenInstance.address,
          oracle.address
          )
        ).to.eq(settlementFeeRemainingCollateral.add(settlementFee));

        // ========================
        // Data provider claims fee
        // ========================

        // ---------
        // Act: Data provider claims the fee
        // ---------
        await claimFacet.claimFee(
          poolParamsBefore.collateralToken,
          oracle.address
        );

        // ---------
        // Assert: Confirm that DIVA contract's collateral token balance has reduced the fee claim
        // dropped to zero
        // ---------
        expect(await collateralTokenInstance.balanceOf(diamondAddress)).to.eq(
          poolParamsBefore.collateralBalance
            .sub(collateralToReturnNet)
            .sub(protocolFee)
            .sub(settlementFee)
            .sub(settlementFeeRemainingCollateral)
        );
        // Note: treasury hasn't claimed the protocol fee received on the remaining pool collateral at this point.
        // Hence, no need to calculate and deduct `protocolFeeRemainingCollateral`.

        expect(await getterFacet.getReservedClaim(poolId)).to.eq(0);
        expect(await getterFacet.getClaim(
          collateralTokenInstance.address,
          oracle.address
          )
        ).to.eq(0);
      });

      it("Should decrease the DIVA contract`s collateral token balance down to zero after treasury and data provider have claimed their fees", async () => {
        // Note: In this test, the pool is confirmed with the fallback data provider.

        // ========================
        // Remove liquidity
        // ========================

        // ---------
        // Arrange: Confirm that DIVA contract's balance equals that stored in the pool parameters
        // and all fee claims are zero
        // ---------
        expect(await collateralTokenInstance.balanceOf(diamondAddress)).to.eq(
          poolParamsBefore.collateralBalance
        );
        expect(await getterFacet.getReservedClaim(poolId)).to.eq(0);
        expect(await getterFacet.getClaim(collateralTokenInstance.address, treasury.address)).to.eq(0);
        expect(await getterFacet.getClaim(collateralTokenInstance.address, oracle.address)).to.eq(0);        

        // Calculate fee based on pool's collateral balance
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
        // Act: Remove all liquidity
        // ---------
        await liquidityFacet
          .connect(user1)
          .removeLiquidity(poolId, poolParamsBefore.collateralBalance);
        
        // ---------
        // Assert: Confirm that pool balance, DIVA contract's collateral balance as well as
        // (reserved) fee claims are updated correctly
        // ---------
        // Confirm that the pool's balance and the position token supply reduced to zero
        poolParamsAfter = await getterFacet.getPoolParameters(poolId);
        expect(poolParamsAfter.collateralBalance).to.eq(0);
        expect(await shortTokenInstance.totalSupply()).to.eq(0);
        expect(await longTokenInstance.totalSupply()).to.eq(0);

        // Confirm that the DIVA contract's collateral balance includes the unclaimed protocol and settlement fee
        expect(await collateralTokenInstance.balanceOf(diamondAddress)).to.eq(
          protocolFee.add(settlementFee)
        );

        // Confirm that (reserved) fee claims are updated correctly
        expect(await getterFacet.getReservedClaim(poolId)).to.eq(settlementFee);
        expect(await getterFacet.getClaim(collateralTokenInstance.address, treasury.address)).to.eq(protocolFee);
        expect(await getterFacet.getClaim(collateralTokenInstance.address, oracle.address)).to.eq(0);

        // ========================
        // Confirm pool with fallback data provider
        // ========================

        // ---------
        // Arrange: Fast forward in time into the fallback submission period
        // ---------
        govParams = await getterFacet.getGovernanceParameters();
        const submissionPeriod = govParams.currentSettlementPeriods.submissionPeriod; // 7d (initial value)
        nextBlockTimestamp = Number(poolParamsBefore.expiryTime.add(submissionPeriod)) + 1;
        await mineBlock(nextBlockTimestamp);

        // ---------
        // Act: Confirm pool with fallback data provider (which is equal to `contractOwner.address`)
        // ---------
        const finalReferenceValue = parseUnits("1605.33");
        await settlementFacet
          .connect(contractOwner)
          .setFinalReferenceValue(poolId, finalReferenceValue, false);
        expect((await getterFacet.getPoolParameters(poolId)).statusFinalReferenceValue).to.eq(3); // 3 == Confirmed
        
        // ---------
        // Assert: Confirm that the DIVA contract's collateral balance is unchanged and the reserved fee claim
        // has been allocated to the fallback data provider instead of the assigned data provider
        // ---------
        expect(await collateralTokenInstance.balanceOf(diamondAddress)).to.eq(
          protocolFee.add(settlementFee)
        );
        expect(await getterFacet.getReservedClaim(poolId)).to.eq(0);
        expect(await getterFacet.getClaim(collateralTokenInstance.address, treasury.address)).to.eq(protocolFee);
        expect(await getterFacet.getClaim(collateralTokenInstance.address, oracle.address)).to.eq(0); 
        expect(await getterFacet.getClaim(collateralTokenInstance.address, contractOwner.address)).to.eq(settlementFee); 

        // ========================
        // Treasury and fallback data provider claim all fees
        // ========================

        // ---------
        // Act: Treasury and fallback data provider claim their fees
        // ---------
        await claimFacet.claimFee(
          poolParamsBefore.collateralToken,
          treasury.address
        );
        await claimFacet.claimFee(
          poolParamsBefore.collateralToken,
          contractOwner.address
        );

        // ---------
        // Assert: Confirm that all fee claims and DIVA contract's collateral token balance are zero
        // ---------
        expect(await collateralTokenInstance.balanceOf(diamondAddress)).to.eq(0);
        expect(await getterFacet.getReservedClaim(poolId)).to.eq(0);
        expect(await getterFacet.getClaim(collateralTokenInstance.address, treasury.address)).to.eq(0);
        expect(await getterFacet.getClaim(collateralTokenInstance.address, oracle.address)).to.eq(0); 
        expect(await getterFacet.getClaim(collateralTokenInstance.address, contractOwner.address)).to.eq(0); 
      });

      it("Should allocate the protocol fee to the previous treasury address if a treasury address update was just triggered by the contract owner", async () => {
        // ---------
        // Arrange: Prepare and trigger update of treasury address with contract owner's account
        // ---------      
        // Define a new treasury address and make sure it's not equal to the current one
        const newTreasuryAddress = user2.address;
        const govParamsBefore = await getterFacet.getGovernanceParameters();
        const currentTreasuryAddress = govParamsBefore.treasury;
        expect(newTreasuryAddress).to.not.eq(currentTreasuryAddress)
        
        // Confirm that new treasury address has zero fee claim balance
        expect(
          await getterFacet.getClaim(
            poolParamsBefore.collateralToken,
            newTreasuryAddress
          )
        ).to.eq(0);
        
        // Get current treasury's fee claim balance
        const currentTreasuryFeeClaimBalanceBefore = await getterFacet.getClaim(
          poolParamsBefore.collateralToken,
          currentTreasuryAddress
        );

        // Contract owner triggers an update of the treasury address
        await governanceFacet
          .connect(contractOwner)
          .updateTreasury(newTreasuryAddress);

        // ---------
        // Act: Remove liquidity shortly after `updateTreasury` (we can be sure that
        // the new treasury address has not been activated yet at this stage)
        // ---------
        await liquidityFacet
          .connect(user1)
          .removeLiquidity(poolId, positionTokensToRedeem);

        // ---------
        // Assert: Check that the fee claim amount was allocated to the previous treasury
        // and not to the pending one
        // ---------
        expect(
          await getterFacet.getClaim(
            poolParamsBefore.collateralToken,
            newTreasuryAddress
          )
        ).to.eq(0);

        // Get current treasury's fee claim balance after liquidity was removed
        expect(
          await getterFacet.getClaim(
            poolParamsBefore.collateralToken,
            currentTreasuryAddress
          )
        ).to.eq(currentTreasuryFeeClaimBalanceBefore.add(protocolFee));
        
        // ---------
        // Reset: Revoke treasury address update to avoid any impact on the following tests
        // ---------
        await governanceFacet
          .connect(contractOwner)
          .revokePendingTreasuryUpdate();
      });

      it("Should remove liquidity and allocate fee claims correctly on first redemption after the review period expires", async () => {
        // Note: In this test, the final value is confirmed on first redemption after the review period
        // expires following a challenge.

        // ---------
        // Arrange: Set position token amount to redeem and calculate fees
        // ---------
        positionTokensToRedeem = poolParamsBefore.collateralBalance.sub(10); // Leaving 10 position tokens so that user can redeem and confirm final value
        protocolFee = calcFee(
          feesParams.protocolFee,
          positionTokensToRedeem,
          decimals
        );
        settlementFee = calcFee(
          feesParams.settlementFee,
          positionTokensToRedeem,
          decimals
        );

        // ---------
        // Act: Remove liquidity
        // ---------
        await liquidityFacet
          .connect(user1)
          .removeLiquidity(poolId, positionTokensToRedeem);

        // ========================
        // Confirm pool on first redemption after the review period expired
        // ========================

        // ---------
        // Arrange: Fast forward in time post pool expiration, submit and challenge final reference value.
        // ---------
        // Fast forward in time post pool expiration
        nextBlockTimestamp = Number(poolParamsBefore.expiryTime) + 1;
        await mineBlock(nextBlockTimestamp);
      
        // ---------
        // Act: Confirm final value on first redeem after the review period
        // ---------
        // Submit final reference value and enable challenge functionality
        await settlementFacet
          .connect(oracle)
          .setFinalReferenceValue(poolId, "1", true);
      
        // Challenge final reference value
        await settlementFacet
          .connect(user1)
          .challengeFinalReferenceValue(poolId, "2");

        // Fast forward in time post review period
        govParams = await getterFacet.getGovernanceParameters();
        const reviewSubmissionPeriod = govParams.currentSettlementPeriods.reviewPeriod; // 5d (initial value)
        poolParamsAfter = await getterFacet.getPoolParameters(poolId);
        nextBlockTimestamp = Number(poolParamsAfter.statusTimestamp.add(reviewSubmissionPeriod)) + 1;
        await mineBlock(nextBlockTimestamp);

        // Redeem and confirm final reference value
        await settlementFacet
            .connect(user1)
            .redeemPositionToken(shortTokenInstance.address, "1");

        // ---------
        // Assert: Confirm that the reserved fee claim has been allocated to the treasury and not to the assigned data provider
        // or fallback data provider
        // ---------
        expect(await getterFacet.getReservedClaim(poolId)).to.eq(0);
        expect(await getterFacet.getClaim(collateralTokenInstance.address, treasury.address)).to.eq(protocolFee);
        expect(await getterFacet.getClaim(collateralTokenInstance.address, oracle.address)).to.eq(settlementFee); 
        expect(await getterFacet.getClaim(collateralTokenInstance.address, contractOwner.address)).to.eq(0); // fallback data provider 
      });

      it("Should allocate reserved settlement fees (incurred during removeLiquidity) and tips to the data provider when final value is confirmed on first redemption after submission", async () => {
        // Note: In this test, the final value is confirmed on first redemption after the challenge period expired without a challenge

        // ---------
        // Arrange: Set position token amount to redeem, calculate fees and add a tip
        // ---------
        positionTokensToRedeem = poolParamsBefore.collateralBalance.sub(10); // Leaving 10 position tokens so that user can redeem and confirm final value
        protocolFee = calcFee(
          feesParams.protocolFee,
          positionTokensToRedeem,
          decimals
        );
        settlementFee = calcFee(
          feesParams.settlementFee,
          positionTokensToRedeem,
          decimals
        );

        // Add tip
        const tipAmount = parseUnits("1", decimals);
        await tipFacet.connect(user2).addTip(poolId, tipAmount);
        expect(await getterFacet.getReservedClaim(poolId)).to.eq(tipAmount);

        // ---------
        // Act1: Remove liquidity
        // ---------
        await liquidityFacet
          .connect(user1)
          .removeLiquidity(poolId, positionTokensToRedeem);

        // ---------
        // Assert: Confirm that the reserved fee increased
        // ---------
        expect(await getterFacet.getReservedClaim(poolId)).to.eq(tipAmount.add(settlementFee));
        
        // ========================
        // Confirm pool on first redeem after the challenge period expired
        // ========================

        // ---------
        // Arrange: Fast forward in time after pool expiration
        // ---------
        nextBlockTimestamp = Number(poolParamsBefore.expiryTime) + 1;
        await mineBlock(nextBlockTimestamp);

        // ---------
        // Act: redeem with user to confirm the final value
        // ---------
        // Submit final reference value with data provider
        const finalReferenceValue = parseUnits("1605.33");
        const allowChallenge = true;
        await settlementFacet
          .connect(oracle)
          .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge);

        // Fast forward in time post challenge period
        govParams = await getterFacet.getGovernanceParameters();
        poolParamsAfter = await getterFacet.getPoolParameters(poolId);
        const challengePeriod = govParams.currentSettlementPeriods.challengePeriod; // 3d (initial value)
        nextBlockTimestamp = Number(poolParamsAfter.statusTimestamp.add(challengePeriod)) + 1;
        await mineBlock(nextBlockTimestamp);

        // Redeem with user to confirm the final reference value
        await settlementFacet
            .connect(user1)
            .redeemPositionToken(shortTokenInstance.address, "1");

        // ---------
        // Assert: Confirm that the reserved fee claim and tip have been allocated to the data provider
        // ---------
        expect(await getterFacet.getReservedClaim(poolId)).to.eq(0);
        expect(await getterFacet.getClaim(collateralTokenInstance.address, treasury.address)).to.eq(protocolFee);
        expect(await getterFacet.getClaim(collateralTokenInstance.address, oracle.address)).to.eq(settlementFee.add(tipAmount)); 
        expect(await getterFacet.getClaim(collateralTokenInstance.address, contractOwner.address)).to.eq(0); // fallback data provider 
      });

      it("Leaves the pool parameters unchanged if zero position tokens are redeemed (only works if protocol and settlement fee are 0%)", async () => {
        // ---------
        // Arrange: Set protocol and settlement fees to zero (that's the only scenario where amount is not subject to a minimum fee of 1).
        // Set positiont token amount to redeem equal to zero.
        // ---------
        // Update fees to 0%
        await governanceFacet.connect(contractOwner).updateFees(0, 0);

        // Fast forward in time to activate the new fee regime
        nextBlockTimestamp = (await getLastTimestamp()) + governanceDelay + 1;
        await mineBlock(nextBlockTimestamp);

        // Get governance parameters including the new fees
        govParams = await getterFacet.getGovernanceParameters();

        // Create new pool that adopts the new fees
        const tx = await createContingentPool();
        poolId = await getPoolIdFromTx(tx);
        poolParamsBefore = await getterFacet.getPoolParameters(poolId);
        positionTokensToRedeem = parseUnits("0", decimals);

        // ---------
        // Act: Remove liquidity using zero amount
        // ---------
        await liquidityFacet
          .connect(user1)
          .removeLiquidity(poolId, positionTokensToRedeem);

        // ---------
        // Assert: Check that all parameters remain unchanged
        // ---------
        poolParamsAfter = await getterFacet.getPoolParameters(poolId);
        expect(await shortTokenInstance.totalSupply()).to.eq(
          poolParamsBefore.collateralBalance
        );
        expect(await longTokenInstance.totalSupply()).to.eq(
          poolParamsBefore.collateralBalance
        );
        expect(poolParamsAfter.collateralBalance).to.eq(
          poolParamsBefore.collateralBalance
        );
        expect(poolParamsAfter.referenceAsset).to.eq(
          poolParamsBefore.referenceAsset
        );
        expect(poolParamsAfter.expiryTime).to.eq(poolParamsBefore.expiryTime);
        expect(poolParamsAfter.floor).to.eq(poolParamsBefore.floor);
        expect(poolParamsAfter.inflection).to.eq(poolParamsBefore.inflection);
        expect(poolParamsAfter.cap).to.eq(poolParamsBefore.cap);
        expect(poolParamsAfter.collateralToken).to.eq(
          poolParamsBefore.collateralToken
        );
        expect(poolParamsAfter.gradient).to.eq(poolParamsBefore.gradient);
        expect(poolParamsAfter.shortToken).to.eq(poolParamsBefore.shortToken);
        expect(poolParamsAfter.longToken).to.eq(poolParamsBefore.longToken);
        expect(poolParamsAfter.finalReferenceValue).to.eq(0);
        expect(poolParamsAfter.statusFinalReferenceValue).to.eq(0);
        expect(poolParamsAfter.payoutLong).to.eq(0);
        expect(poolParamsAfter.payoutShort).to.eq(0);
        expect(poolParamsAfter.statusTimestamp).to.eq(
          poolParamsBefore.statusTimestamp
        );
        expect(poolParamsAfter.dataProvider).to.eq(
          poolParamsBefore.dataProvider
        );
        expect(poolParamsAfter.capacity).to.eq(poolParamsBefore.capacity);

        // Check that the pool has the correct fees set
        poolFees = await getterFacet.getFees(poolParamsAfter.indexFees);
        expect(poolFees.protocolFee).to.eq(govParams.currentFees.protocolFee);
        expect(poolFees.settlementFee).to.eq(
          govParams.currentFees.settlementFee
        );

        // Check that the pool has the correct settlement periods set
        poolSettlementPeriods = await getterFacet.getSettlementPeriods(
          poolParamsAfter.indexSettlementPeriods
        );
        expect(poolSettlementPeriods.submissionPeriod).to.eq(
          govParams.currentSettlementPeriods.submissionPeriod
        );
        expect(poolSettlementPeriods.challengePeriod).to.eq(
          govParams.currentSettlementPeriods.challengePeriod
        );
        expect(poolSettlementPeriods.reviewPeriod).to.eq(
          govParams.currentSettlementPeriods.reviewPeriod
        );
        expect(poolSettlementPeriods.fallbackSubmissionPeriod).to.eq(
          govParams.currentSettlementPeriods.fallbackSubmissionPeriod
        );

        // ---------
        // Reset: Reset settlement and protocol fee to their original values for the following tests
        // ---------
        // Reset fees
        await governanceFacet
          .connect(contractOwner)
          .updateFees(parseUnits("0.0025"), parseUnits("0.0005"));

        // Fast forward in time to activate the new fee regime
        nextBlockTimestamp = (await getLastTimestamp()) + governanceDelay + 1;
        await mineBlock(nextBlockTimestamp);

        // Get governance parameters
        govParams = await getterFacet.getGovernanceParameters();
      });

      it("Allows to add liquidity after it has been removed entirely", async () => {
        // ---------
        // Arrange: Remove all liquidity from a pool and claim all fees to make sure that diamond contract has a zero collateral token balance
        // ---------
        // Get the reserved fee claim before removing liquidity
        const reservedClaimBefore = await getterFacet.getReservedClaim(poolId);

        // Remove all liquidity in the pool
        await liquidityFacet
          .connect(user1)
          .removeLiquidity(poolId, poolParamsBefore.collateralBalance);
        poolParamsAfter = await getterFacet.getPoolParameters(poolId);
        expect(await shortTokenInstance.totalSupply()).to.eq(0);
        expect(await longTokenInstance.totalSupply()).to.eq(0);
        expect(poolParamsAfter.collateralBalance).to.eq(0);
        
        // Confirm that the settlemet fee was added as reserved fee claim, which is only
        // allocated and claimable following final reference value confirmation.
        const reservedClaimAfter = await getterFacet.getReservedClaim(poolId);
        expect(reservedClaimAfter).to.be.gt(0);
        feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
        settlementFee = calcFee(
          feesParams.settlementFee,
          poolParamsBefore.collateralBalance,
          decimals
        );
        expect(reservedClaimAfter).to.eq(reservedClaimBefore.add(settlementFee))

        // Treasury and data provider claim their fees (except for the reserved claims) to
        // simplify the test without losing generality
        await claimFacet.claimFee(
          poolParamsAfter.collateralToken,
          treasury.address
        );
        await claimFacet.claimFee(
          poolParamsAfter.collateralToken,
          oracle.address
        );
        expect(
          await getterFacet.getClaim(
            poolParamsAfter.collateralToken,
            treasury.address
          )
        ).to.eq(0);
        expect(
          await getterFacet.getClaim(
            poolParamsAfter.collateralToken,
            oracle.address
          )
        ).to.eq(0);
        userCollateralTokenBalanceBefore =
          await collateralTokenInstance.balanceOf(user1.address);

        // ---------
        // Act: Add liquidity
        // ---------
        const collateralToAdd = poolParamsBefore.collateralBalance;
        expect(collateralToAdd).to.not.eq(0);
        await liquidityFacet.connect(user1).addLiquidity(
          poolId,
          collateralToAdd,
          user1.address, // longRecipient
          user1.address // shortRecipient; same as longRecipient/msg.sender in this example for the sake of simplicity
        );

        // ---------
        // Assert: Check that pool parameters, the supply of short and long tokens and the user1's and diamond contract's balances have been updated correctly
        // ---------
        poolParamsAfter = await getterFacet.getPoolParameters(poolId);
        expect(poolParamsAfter.collateralBalance).to.eq(
          poolParamsBefore.collateralBalance
        );
        expect(await shortTokenInstance.totalSupply()).to.eq(
          poolParamsBefore.collateralBalance
        );
        expect(await longTokenInstance.totalSupply()).to.eq(
          poolParamsBefore.collateralBalance
        );
        expect(await shortTokenInstance.balanceOf(user1.address)).to.eq(
          poolParamsBefore.collateralBalance
        );
        expect(await longTokenInstance.balanceOf(user1.address)).to.eq(
          poolParamsBefore.collateralBalance
        );
        expect(await collateralTokenInstance.balanceOf(diamondAddress)).to.eq(
          collateralToAdd.add(settlementFee)
        ); // Added `settlementFee` here as it was not yet claimed by the data provider
        expect(await collateralTokenInstance.balanceOf(user1.address)).to.eq(
          userCollateralTokenBalanceBefore.sub(collateralToAdd)
        );
      });

      // -------------------------------------------
      // Events
      // -------------------------------------------

      it("Emits a `LiquidityRemoved`, `FeeClaimAllocated`, and `FeeClaimReserved` event", async () => {
        // ---------
        // Arrange: Get applicable fees for pool based on amount to be removed (`Get applicable fees for pool`)
        // ---------
        feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
        protocolFee = calcFee(
          feesParams.protocolFee,
          positionTokensToRedeem,
          decimals
        );
        settlementFee = calcFee(
          feesParams.settlementFee,
          positionTokensToRedeem,
          decimals
        );
        
        // ---------
        // Act: Remove liquidity
        // ---------        
        const tx = await liquidityFacet
          .connect(user1)
          .removeLiquidity(poolId, positionTokensToRedeem);
        const receipt = await tx.wait();      

        // ---------
        // Assert: Check that the corresponding events are emitted
        // ---------
        const liquidityRemovedEvent = receipt.events?.find(
          (item: any) => item.event === "LiquidityRemoved"
        );
        expect(liquidityRemovedEvent?.args?.poolId).to.eq(poolId);
        expect(liquidityRemovedEvent?.args?.longTokenHolder).to.eq(
          user1.address
        );
        expect(liquidityRemovedEvent?.args?.shortTokenHolder).to.eq(
          user1.address
        );
        expect(liquidityRemovedEvent?.args?.collateralAmount).to.eq(
          collateralToReturnGross
        );

        // `FeeClaimAllocated` event
        const feeClaimAllocatedEvent = receipt.events?.find(
          (item: any) => item.event === "FeeClaimAllocated"
        );
        expect(feeClaimAllocatedEvent?.args?.poolId).to.eq(poolId);
        expect(feeClaimAllocatedEvent?.args?.recipient).to.eq(treasury.address);
        expect(feeClaimAllocatedEvent?.args?.amount).to.eq(protocolFee);

        // `FeeClaimReserved` event
        const feeClaimReservedEvent = receipt.events?.find(
          (item: any) => item.event === "FeeClaimReserved"
        );
        expect(feeClaimReservedEvent?.args?.poolId).to.eq(poolId);
        expect(feeClaimReservedEvent?.args?.amount).to.eq(settlementFee);
      });

      // -------------------------------------------
      // Reverts
      // -------------------------------------------

      it("Reverts if final reference value is already confirmed", async () => {
        // ---------
        // Arrange: Create a set of position tokens that shortly expires and set final reference value
        // ---------
        nextBlockTimestamp = (await getLastTimestamp()) + 1;
        await setNextTimestamp(ethers.provider, nextBlockTimestamp);
        const tx = await createContingentPool({
          expireInSeconds: 2,
        });
        poolId = await getPoolIdFromTx(tx);
        poolParams = await getterFacet.getPoolParameters(poolId);

        // Set next block's timestamp after expiryTime
        await setNextTimestamp(
          ethers.provider,
          poolParams.expiryTime.add(1).toNumber()
        );

        const finalReferenceValue = parseUnits("1605.33");
        const allowChallenge = false; // with that configuration, the first value submitted will be directly confirmed
        await settlementFacet
          .connect(oracle)
          .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge);
        poolParams = await getterFacet.getPoolParameters(poolId);
        expect(poolParams.statusFinalReferenceValue).to.eq(3); // status changes to 3 = Confirmed

        // ---------
        // Act & Assert: Check that removing liquidity fails when the status is already Confirmed
        // ---------
        await expect(
          liquidityFacet
            .connect(user1)
            .removeLiquidity(poolId, poolParamsBefore.collateralBalance)
        ).to.be.revertedWith("FinalValueAlreadyConfirmed()");
      });

      it("Reverts if user tries to redeem more long tokens than there are in existence", async () => {
        // ---------
        // Arrange: Set amount of position tokens to redeem higher than total position token supply
        // ---------
        positionTokensToRedeem = poolParamsBefore.collateralBalance.add(1);

        // ---------
        // Act & Assert: Check that remove liquidity fails
        // ---------
        await expect(
          liquidityFacet
            .connect(user1)
            .removeLiquidity(poolId, positionTokensToRedeem)
        ).to.be.revertedWith("InsufficientShortOrLongBalance()");
      });

      it("Reverts if user has insufficient long token balance", async () => {
        // ---------
        // Arrange: Reduce user1's long token balance by sending 1 unit to user2
        // ---------
        const userLongTokenBalance = await longTokenInstance.balanceOf(
          user1.address
        );
        await longTokenInstance.connect(user1).transfer(user2.address, 1);
        positionTokensToRedeem = userLongTokenBalance.add(1);

        // ---------
        // Act & Assert: Check that remove liquidity fails
        // ---------
        await expect(
          liquidityFacet
            .connect(user1)
            .removeLiquidity(poolId, positionTokensToRedeem)
        ).to.be.revertedWith("InsufficientShortOrLongBalance()");
      });

      it("Reverts if user has insufficient short token balance", async () => {
        // ---------
        // Arrange: Reduce user1's short token balance by sending all short tokens to user2
        // ---------
        const userShortTokenBalance = await shortTokenInstance.balanceOf(
          user1.address
        );
        positionTokensToRedeem = userShortTokenBalance;
        await shortTokenInstance
          .connect(user1)
          .transfer(user2.address, userShortTokenBalance);

        // ---------
        // Act & Assert: Check that remove liquidity fails
        // ---------
        await expect(
          liquidityFacet
            .connect(user1)
            .removeLiquidity(poolId, positionTokensToRedeem)
        ).to.be.revertedWith("InsufficientShortOrLongBalance()");
      });

      it("Reverts if the amount to remove is too small (protocol fee amount zero)", async () => {
        // ---------
        // Arrange: Remove small amount such that the implied protocol fee amount is zero
        // ---------
        poolParams = await getterFacet.getPoolParameters(poolId);
        feesParams = await getterFacet.getFees(poolParams.indexFees);
        expect(feesParams.protocolFee.gt(0));
        positionTokensToRedeem = BigNumber.from(1);

        // ---------
        // Act & Assert: Check that remove liquidity fails
        // ---------
        await expect(
          liquidityFacet
            .connect(user1)
            .removeLiquidity(poolId, positionTokensToRedeem)
        ).to.be.revertedWith("ZeroProtocolFee()");
      });

      it("Reverts if the amount to remove is too small (settlement fee amount zero)", async () => {
        // ---------
        // Arrange: Set protocol fee to zero to pass the protocol fee amount check and then remove
        // small amount such that the implied settlement fee amount is zero
        // ---------
        // Get governance parameters and update fees
        govParams = await getterFacet.getGovernanceParameters();
        await governanceFacet
          .connect(contractOwner)
          .updateFees(0, govParams.currentFees.settlementFee);

        // Fast forward in time to activate the new fees
        nextBlockTimestamp = (await getLastTimestamp()) + governanceDelay + 1;
        await mineBlock(nextBlockTimestamp);

        // Create new pool that adopts the new fees
        const tx = await createContingentPool();
        poolId = await getPoolIdFromTx(tx);

        poolParams = await getterFacet.getPoolParameters(poolId);
        feesParams = await getterFacet.getFees(poolParams.indexFees);
        expect(feesParams.protocolFee).to.eq(0);
        expect(feesParams.settlementFee.gt(0));
        positionTokensToRedeem = BigNumber.from(1);

        // ---------
        // Act & Assert: Check that remove liquidity fails
        // ---------
        await expect(
          liquidityFacet
            .connect(user1)
            .removeLiquidity(poolId, positionTokensToRedeem)
        ).to.be.revertedWith("ZeroSettlementFee");
      });

      // keep this test at the end, otherwise you will have to unpause the contract again
      it("Reverts if the removal of liquidity was paused", async () => {
        // ---------
        // Arrange: Pause the functionality to remove liquidity
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
        // Act & Assert: Confirm that removal of liquidty is not possible if contract is paused
        // ---------
        await expect(
          liquidityFacet.connect(user2).removeLiquidity(poolId, 1)
        ).to.be.revertedWith("ReturnCollateralPaused()");

        // ---------
        // Reset: Unpause again so that the remaining tests go through
        // ---------
        await governanceFacet
          .connect(contractOwner)
          .unpauseReturnCollateral();
      });
    });

    describe("removeLiquidity with non-zero permissionedERC721Token", async () => {
      let shortTokenInstance: PositionToken;
      let longTokenInstance: PositionToken;

      beforeEach(async function () {
        // ---------
        // Arrange: Create a contingent pool, set amount of position tokens to redeem
        // ---------
        permissionedERC721TokenInstance = await erc721DeployFixture(
          "PermissionedERC721Token",
          "PNFT"
        );
        await permissionedERC721TokenInstance.connect(user1).mint();
        await permissionedERC721TokenInstance.connect(user2).mint();
        permissionedERC721Token = permissionedERC721TokenInstance.address;
        expect(permissionedERC721Token).to.not.eq(ethers.constants.AddressZero);

        const tx = await createContingentPool({ permissionedERC721Token });
        poolId = await getPoolIdFromTx(tx);
        poolParamsBefore = await getterFacet.getPoolParameters(poolId);
        shortTokenInstance = await positionTokenAttachFixture(
          poolParamsBefore.shortToken
        );
        longTokenInstance = await positionTokenAttachFixture(
          poolParamsBefore.longToken
        );

        positionTokensToRedeem = parseUnits("66", decimals);
      });

      // -------------------------------------------
      // Functionality
      // -------------------------------------------
      it("Should allow permissioned recipients to remove liquidity", async () => {
        // ---------
        // Arrange: Confirm that user1 is permissioned
        // ---------
        expect(
          await permissionedERC721TokenInstance.balanceOf(user1.address)
        ).to.gt(0);

        // ---------
        // Act: Remove liquidity with user1 (permissioned recipient)
        // ---------
        await liquidityFacet
          .connect(user1)
          .removeLiquidity(poolId, positionTokensToRedeem);

        // ---------
        // Assert: Check that relevant pool parameters were updated and others remained unchanged
        // ---------
        poolParamsAfter = await getterFacet.getPoolParameters(poolId);
        // Parameters expected to be updated
        expect(await shortTokenInstance.totalSupply()).to.eq(
          poolParamsBefore.collateralBalance.sub(positionTokensToRedeem)
        );
        expect(await longTokenInstance.totalSupply()).to.eq(
          poolParamsBefore.collateralBalance.sub(positionTokensToRedeem)
        );
        expect(poolParamsAfter.collateralBalance).to.eq(
          poolParamsBefore.collateralBalance.sub(positionTokensToRedeem)
        );
      });

      it("Should allow non-permissioned recipients to remove liquidity", async () => {
        // ---------
        // Arrange: Transfer permissioned ERC721 token from user1 to user3 to render user1 non-permissioned
        // ---------
        await permissionedERC721TokenInstance
          .connect(user1)
          .transferFrom(user1.address, user3.address, 1);
        expect(
          await permissionedERC721TokenInstance.balanceOf(user1.address)
        ).to.eq(0);

        // ---------
        // Act: Remove liquidity with user3 (non-permissioned recipient)
        // ---------
        await liquidityFacet
          .connect(user1)
          .removeLiquidity(poolId, positionTokensToRedeem);

        // ---------
        // Assert: Check that relevant pool parameters were updated and others remained unchanged
        // ---------
        poolParamsAfter = await getterFacet.getPoolParameters(poolId);
        // Parameters expected to be updated
        expect(await shortTokenInstance.totalSupply()).to.eq(
          poolParamsBefore.collateralBalance.sub(positionTokensToRedeem)
        );
        expect(await longTokenInstance.totalSupply()).to.eq(
          poolParamsBefore.collateralBalance.sub(positionTokensToRedeem)
        );
        expect(poolParamsAfter.collateralBalance).to.eq(
          poolParamsBefore.collateralBalance.sub(positionTokensToRedeem)
        );
      });
    });

    describe("batchRemoveLiquidity", async () => {
      // -------------------------------------------
      // Functionality
      // -------------------------------------------
      it("Removes liquidity from existing pools and updates parameters", async () => {
        // ---------
        // Arrange: Create 2 contingent pools, set amount of position tokens to redeem and calculate
        // ---------
        let tx = await createContingentPool();
        // Status of first pool before removing liquidity (after the pool has been created)
        const poolId1 = await getPoolIdFromTx(tx);
        const poolParamsBefore1 = await getterFacet.getPoolParameters(poolId1);
        const shortTokenInstance1 = await positionTokenAttachFixture(
          poolParamsBefore1.shortToken
        );
        const longTokenInstance1 = await positionTokenAttachFixture(
          poolParamsBefore1.longToken
        );
        // Fee claims are zero
        expect(
          await getterFacet.getClaim(
            poolParamsBefore1.collateralToken,
            treasury.address
          )
        ).to.eq(0);
        expect(
          await getterFacet.getClaim(
            poolParamsBefore1.collateralToken,
            oracle.address
          )
        ).to.eq(0);

        tx = await createContingentPool({
          collateralAmount: 25001.358,
        });
        // Status of second pool before removing liquidity (after the pool has been created)
        const poolId2 = await getPoolIdFromTx(tx);
        const poolParamsBefore2 = await getterFacet.getPoolParameters(poolId2);
        const shortTokenInstance2 = await positionTokenAttachFixture(
          poolParamsBefore2.shortToken
        );
        const longTokenInstance2 = await positionTokenAttachFixture(
          poolParamsBefore2.longToken
        );
        // Fee claims are zero
        expect(
          await getterFacet.getClaim(
            poolParamsBefore2.collateralToken,
            treasury.address
          )
        ).to.eq(0);
        expect(
          await getterFacet.getClaim(
            poolParamsBefore2.collateralToken,
            oracle.address
          )
        ).to.eq(0);

        // Format `batchRemoveLiquidity` function input to BigNumber with the right number of decimals
        const positionTokensToRedeem1 = parseUnits("66", decimals);
        const positionTokensToRedeem2 = parseUnits("76", decimals);

        // ---------
        // Act: Remove liquidity
        // ---------
        await liquidityFacet.connect(user1).batchRemoveLiquidity([
          {
            poolId: poolId1,
            amount: positionTokensToRedeem1,
          },
          {
            poolId: poolId2,
            amount: positionTokensToRedeem2,
          },
        ]);

        // ---------
        // Assert: Check that relevant pools' parameters were updated and others remained unchanged
        // ---------
        const poolParamsAfter1 = await getterFacet.getPoolParameters(poolId1);
        // Parameters expected to be updated
        expect(await shortTokenInstance1.totalSupply()).to.eq(
          poolParamsBefore1.collateralBalance.sub(positionTokensToRedeem1)
        );
        expect(await longTokenInstance1.totalSupply()).to.eq(
          poolParamsBefore1.collateralBalance.sub(positionTokensToRedeem1)
        );
        expect(poolParamsAfter1.collateralBalance).to.eq(
          poolParamsBefore1.collateralBalance.sub(positionTokensToRedeem1)
        );
        // Parameters expected to remain unchanged
        expect(poolParamsAfter1.referenceAsset).to.eq(
          poolParamsBefore1.referenceAsset
        );
        expect(poolParamsAfter1.expiryTime).to.eq(poolParamsBefore1.expiryTime);
        expect(poolParamsAfter1.floor).to.eq(poolParamsBefore1.floor);
        expect(poolParamsAfter1.inflection).to.eq(poolParamsBefore1.inflection);
        expect(poolParamsAfter1.cap).to.eq(poolParamsBefore1.cap);
        expect(poolParamsAfter1.collateralToken).to.eq(
          poolParamsBefore1.collateralToken
        );
        expect(poolParamsAfter1.gradient).to.eq(poolParamsBefore1.gradient);
        expect(poolParamsAfter1.shortToken).to.eq(poolParamsBefore1.shortToken);
        expect(poolParamsAfter1.longToken).to.eq(poolParamsBefore1.longToken);
        expect(poolParamsAfter1.finalReferenceValue).to.eq(0);
        expect(poolParamsAfter1.statusFinalReferenceValue).to.eq(0);
        expect(poolParamsAfter1.payoutLong).to.eq(0);
        expect(poolParamsAfter1.payoutShort).to.eq(0);
        expect(poolParamsAfter1.statusTimestamp).to.eq(
          poolParamsBefore1.statusTimestamp
        );
        expect(poolParamsAfter1.dataProvider).to.eq(
          poolParamsBefore1.dataProvider
        );
        expect(poolParamsAfter1.capacity).to.eq(poolParamsBefore1.capacity);

        const poolParamsAfter2 = await getterFacet.getPoolParameters(poolId2);
        // Parameters expected to be updated
        expect(await shortTokenInstance2.totalSupply()).to.eq(
          poolParamsBefore2.collateralBalance.sub(positionTokensToRedeem2)
        );
        expect(await longTokenInstance2.totalSupply()).to.eq(
          poolParamsBefore2.collateralBalance.sub(positionTokensToRedeem2)
        );
        expect(poolParamsAfter2.collateralBalance).to.eq(
          poolParamsBefore2.collateralBalance.sub(positionTokensToRedeem2)
        );
        // Parameters expected to remain unchanged
        expect(poolParamsAfter2.referenceAsset).to.eq(
          poolParamsBefore2.referenceAsset
        );
        expect(poolParamsAfter2.expiryTime).to.eq(poolParamsBefore2.expiryTime);
        expect(poolParamsAfter2.floor).to.eq(poolParamsBefore2.floor);
        expect(poolParamsAfter2.inflection).to.eq(poolParamsBefore2.inflection);
        expect(poolParamsAfter2.cap).to.eq(poolParamsBefore2.cap);
        expect(poolParamsAfter2.collateralToken).to.eq(
          poolParamsBefore2.collateralToken
        );
        expect(poolParamsAfter2.gradient).to.eq(poolParamsBefore2.gradient);
        expect(poolParamsAfter2.shortToken).to.eq(poolParamsBefore2.shortToken);
        expect(poolParamsAfter2.longToken).to.eq(poolParamsBefore2.longToken);
        expect(poolParamsAfter2.finalReferenceValue).to.eq(0);
        expect(poolParamsAfter2.statusFinalReferenceValue).to.eq(0);
        expect(poolParamsAfter2.payoutLong).to.eq(0);
        expect(poolParamsAfter2.payoutShort).to.eq(0);
        expect(poolParamsAfter2.statusTimestamp).to.eq(
          poolParamsBefore2.statusTimestamp
        );
        expect(poolParamsAfter2.dataProvider).to.eq(
          poolParamsBefore2.dataProvider
        );
        expect(poolParamsAfter2.capacity).to.eq(poolParamsBefore2.capacity);
      });
    });
  });
});
