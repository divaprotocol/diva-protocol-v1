import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, ContractReceipt, ContractTransaction } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
  GetterFacet,
  LibDiamond,
  MockERC20,
  MockERC721,
  PermissionedPositionToken,
  PoolFacet,
  PositionToken,
} from "../typechain-types";
import { LibDIVAStorage } from "../typechain-types/contracts/facets/GetterFacet";

import { getExpiryTime, getLastTimestamp, getPoolIdFromTx } from "../utils";
import { ONE_DAY, GovParams } from "../constants";
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

describe("PoolFacet", async function () {
  let contractOwner: SignerWithAddress,
    treasury: SignerWithAddress,
    oracle: SignerWithAddress,
    user1: SignerWithAddress,
    user2: SignerWithAddress,
    accounts: SignerWithAddress[];

  let diamondAddress: string;
  let poolFacet: PoolFacet, getterFacet: GetterFacet;

  let diamondDeployment: [string, number];
  let blockTimestampDiamondDeployment: number;

  let referenceAsset: string,
    expiryTime: string,
    floor: BigNumber,
    inflection: BigNumber,
    cap: BigNumber,
    gradient: BigNumber,
    collateralAmount: BigNumber,
    collateralToken: string,
    dataProvider: string,
    capacity: BigNumber,
    longRecipient: string,
    shortRecipient: string,
    permissionedERC721Token: string;

  let protocolFee = "2500000000000000"; // initial protocol value
  let settlementFee = "500000000000000"; // initial protocol value
  let userStartCollateralTokenBalance: BigNumber;
  let collateralTokenInstance: MockERC20;

  let poolId: BigNumber;
  let poolParams: LibDIVAStorage.PoolStructOutput;
  let govParams: GovParams,
    poolFees: LibDIVAStorage.FeesStructOutput,
    poolSettlementPeriods: LibDIVAStorage.SettlementPeriodsStructOutput;

  let currentBlockTimestamp: number;

  let tx: ContractTransaction;
  let receipt: ContractReceipt;

  const MAX_UINT = ethers.constants.MaxUint256;

  before(async function () {
    [contractOwner, treasury, oracle, user1, user2, ...accounts] =
      await ethers.getSigners(); // keep contractOwner and treasury at first two positions in line with deploy script

    // ---------
    // Setup: Deploy diamond contract (incl. facets) and connect to the diamond contract via facet specific ABI's
    // ---------
    diamondDeployment = await deployMain();
    diamondAddress = diamondDeployment[0];
    blockTimestampDiamondDeployment = diamondDeployment[1]
    poolFacet = await ethers.getContractAt("PoolFacet", diamondAddress);
    getterFacet = await ethers.getContractAt("GetterFacet", diamondAddress);
  });

  describe("Initialization", async () => {
    it("Should initialize parameters at contract deployment", async () => {
      const governanceParameters = await getterFacet.getGovernanceParameters();
      const treasuryInfo = await getterFacet.getTreasuryInfo();
      const fallbackDataProviderInfo = await getterFacet.getFallbackDataProviderInfo();
      const feesInfo = await getterFacet.getFees(0);
      const settlementPeriodsInfo = await getterFacet.getSettlementPeriods(0);

      expect(feesInfo.startTime).to.eq(blockTimestampDiamondDeployment);
      expect(governanceParameters.currentFees.protocolFee).to.eq(protocolFee);
      expect(governanceParameters.currentFees.settlementFee).to.eq(
        settlementFee
      );
      expect(settlementPeriodsInfo.startTime).to.eq(blockTimestampDiamondDeployment);
      expect(
        governanceParameters.currentSettlementPeriods.submissionPeriod
      ).to.eq(7 * ONE_DAY);
      expect(
        governanceParameters.currentSettlementPeriods.challengePeriod
      ).to.eq(3 * ONE_DAY);
      expect(governanceParameters.currentSettlementPeriods.reviewPeriod).to.eq(
        5 * ONE_DAY
      );
      expect(
        governanceParameters.currentSettlementPeriods.fallbackSubmissionPeriod
      ).to.eq(10 * ONE_DAY);
      expect(treasuryInfo.startTimeTreasury).to.eq(blockTimestampDiamondDeployment);
      expect(governanceParameters.treasury).to.eq(treasury.address);
      expect(fallbackDataProviderInfo.startTimeFallbackDataProvider).to.eq(blockTimestampDiamondDeployment);
      expect(governanceParameters.fallbackDataProvider).to.eq(
        contractOwner.address
      );
      expect(await getterFacet.getOwner()).to.eq(contractOwner.address);
    });
  });

  describe("createContingentPool with zero permissionedERC721Token", async () => {
    let shortTokenInstance: PositionToken;
    let longTokenInstance: PositionToken;
    let _decimals: number;

    beforeEach(async function () {
      // ---------
      // Arrange: Equip user1 with collateral token, approve collateral token for diamond contract, and specify default pool parameters
      // ---------
      userStartCollateralTokenBalance = parseUnits("1000000");
      collateralTokenInstance = await erc20DeployFixture(
        "DummyCollateralToken",
        "DCT",
        userStartCollateralTokenBalance,
        user1.address,
        decimals
      );
      await collateralTokenInstance
        .connect(user1)
        .approve(diamondAddress, userStartCollateralTokenBalance);
      // Specify default pool parameters
      referenceAsset = "BTC/USD";
      expiryTime = await getExpiryTime(7200); // Expiry in 2h
      floor = parseUnits("1198.53");
      inflection = parseUnits("1605.33");
      cap = parseUnits("2001.17");
      gradient = parseUnits("0.33", decimals);
      collateralAmount = parseUnits("15001.358", decimals);
      collateralToken = collateralTokenInstance.address;
      dataProvider = oracle.address;
      capacity = MAX_UINT; // Uncapped
      longRecipient = user1.address;
      shortRecipient = user2.address;
      permissionedERC721Token = ethers.constants.AddressZero;

      if (
        this.currentTest?.title !==
        "Creates a contingent pool and stores the pool parameters"
      ) {
        // ---------
        // Act: Create a contingent pool with default parameters
        // ---------
        tx = await poolFacet.connect(user1).createContingentPool({
          referenceAsset,
          expiryTime,
          floor,
          inflection,
          cap,
          gradient,
          collateralAmount,
          collateralToken,
          dataProvider,
          capacity,
          longRecipient,
          shortRecipient,
          permissionedERC721Token,
        });

        poolId = await getPoolIdFromTx(tx);
        poolParams = await getterFacet.getPoolParameters(poolId);
        shortTokenInstance = await positionTokenAttachFixture(
          poolParams.shortToken
        );
        longTokenInstance = await positionTokenAttachFixture(
          poolParams.longToken
        );
      }
    });

    // -------------------------------------------
    // Functionality
    // -------------------------------------------

    it("Creates a contingent pool and stores the pool parameters", async () => {
      // ---------
      // Act: Create a contingent pool with default parameters
      // ---------
      govParams = await getterFacet.getGovernanceParameters();
      tx = await poolFacet.connect(user1).createContingentPool({
        referenceAsset,
        expiryTime,
        floor,
        inflection,
        cap,
        gradient,
        collateralAmount,
        collateralToken,
        dataProvider,
        capacity,
        longRecipient,
        shortRecipient,
        permissionedERC721Token,
      });

      // ---------
      // Assert: Check that pool parameters are correctly set
      // ---------
      currentBlockTimestamp = await getLastTimestamp();

      poolId = await getPoolIdFromTx(tx);
      poolParams = await getterFacet.getPoolParameters(poolId);
      expect(poolId).to.eq(1);
      expect(poolParams.referenceAsset).to.eq(referenceAsset);
      expect(poolParams.expiryTime).to.eq(expiryTime);
      expect(poolParams.floor).to.eq(floor);
      expect(poolParams.inflection).to.eq(inflection);
      expect(poolParams.cap).to.eq(cap);
      expect(poolParams.collateralToken).to.eq(collateralToken);
      expect(poolParams.gradient).to.eq(gradient);
      expect(poolParams.collateralBalance).to.eq(collateralAmount);
      expect(poolParams.shortToken).is.properAddress;
      expect(poolParams.longToken).is.properAddress;
      expect(poolParams.finalReferenceValue).to.eq(0);
      expect(poolParams.statusFinalReferenceValue).to.eq(0);
      expect(poolParams.payoutLong).to.eq(0);
      expect(poolParams.payoutShort).to.eq(0);
      expect(poolParams.statusTimestamp).to.eq(currentBlockTimestamp);
      expect(poolParams.dataProvider).to.eq(oracle.address);
      expect(poolParams.capacity).to.eq(capacity);

      // Check that the pool has the correct fees set
      poolFees = await getterFacet.getFees(poolParams.indexFees);
      expect(poolFees.protocolFee).to.eq(govParams.currentFees.protocolFee);
      expect(poolFees.settlementFee).to.eq(govParams.currentFees.settlementFee);

      // Check that the pool has the correct settlement periods set
      poolSettlementPeriods = await getterFacet.getSettlementPeriods(
        poolParams.indexSettlementPeriods
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
    });

    it("Creates a contingent pool and returns the poolId", async () => {
      // ---------
      // Arrange: Get the latest pool Id
      // ---------
      poolId = await getPoolIdFromTx(tx);

      // ---------
      // Act: Create a contingent pool with default parameters
      // ---------
      const res = await poolFacet
        .connect(user1)
        .callStatic.createContingentPool({
          referenceAsset,
          expiryTime,
          floor,
          inflection,
          cap,
          gradient,
          collateralAmount,
          collateralToken,
          dataProvider,
          capacity,
          longRecipient,
          shortRecipient,
          permissionedERC721Token,
        });

      // ---------
      // Assert: Check that the poolId returned is equal to the previously latest poolId + 1
      // ---------
      expect(res).to.eq(poolId.add(1));
    });

    it("Returns the same pool parameters when retrieved via `getPoolParametersByAddress`", async () => {
      // ---------
      // Act: Create a contingent pool with default parameters
      // ---------
      tx = await poolFacet.connect(user1).createContingentPool({
        referenceAsset,
        expiryTime,
        floor,
        inflection,
        cap,
        gradient,
        collateralAmount,
        collateralToken,
        dataProvider,
        capacity,
        longRecipient,
        shortRecipient,
        permissionedERC721Token,
      });

      // ---------
      // Assert: Check that it returns the same pool parameters when called via `getPoolParametersByAddress`
      // ---------
      currentBlockTimestamp = await getLastTimestamp();
      poolId = await getPoolIdFromTx(tx);
      poolParams = await getterFacet.getPoolParameters(poolId);
      const poolParamsByAddress = await getterFacet.getPoolParametersByAddress(
        poolParams.shortToken
      );
      expect(poolParamsByAddress.referenceAsset).to.eq(
        poolParams.referenceAsset
      );
      expect(poolParamsByAddress.expiryTime).to.eq(poolParams.expiryTime);
      expect(poolParamsByAddress.floor).to.eq(poolParams.floor);
      expect(poolParamsByAddress.inflection).to.eq(poolParams.inflection);
      expect(poolParamsByAddress.cap).to.eq(poolParams.cap);
      expect(poolParamsByAddress.collateralToken).to.eq(
        poolParams.collateralToken
      );
      expect(poolParamsByAddress.gradient).to.eq(poolParams.gradient);
      expect(poolParamsByAddress.collateralBalance).to.eq(
        poolParams.collateralBalance
      );
      expect(poolParamsByAddress.shortToken).to.eq(poolParams.shortToken);
      expect(poolParamsByAddress.longToken).to.eq(poolParams.longToken);
      expect(poolParamsByAddress.finalReferenceValue).to.eq(
        poolParams.finalReferenceValue
      );
      expect(poolParamsByAddress.statusFinalReferenceValue).to.eq(
        poolParams.statusFinalReferenceValue
      );
      expect(poolParamsByAddress.payoutLong).to.eq(poolParams.payoutLong);
      expect(poolParamsByAddress.payoutShort).to.eq(poolParams.payoutShort);
      expect(poolParamsByAddress.statusTimestamp).to.eq(
        poolParams.statusTimestamp
      );
      expect(poolParamsByAddress.dataProvider).to.eq(poolParams.dataProvider);
      expect(poolParamsByAddress.capacity).to.eq(poolParams.capacity);
    });

    it("Increases the short and long token supply", async () => {
      // ---------
      // Assert
      // ---------
      expect(await shortTokenInstance.totalSupply()).to.eq(collateralAmount);
      expect(await longTokenInstance.totalSupply()).to.eq(collateralAmount);
    });

    it("Assigns the diamond contract as the owner of the position tokens", async () => {
      expect(await shortTokenInstance.owner()).is.eq(diamondAddress);
      expect(await longTokenInstance.owner()).is.eq(diamondAddress);
    });

    it("Assigns the right poolId for each position token", async () => {
      expect(await shortTokenInstance.poolId()).is.eq(poolId);
      expect(await longTokenInstance.poolId()).is.eq(poolId);
    });

    it("Sets the position token names to L1 and S1", async () => {
      expect(await shortTokenInstance.name()).to.eq("S" + poolId);
      expect(await longTokenInstance.name()).to.eq("L" + poolId);
    });

    it("Sends position tokens to user1 (pool creator) and user2", async () => {
      expect(await shortTokenInstance.balanceOf(user2.address)).to.eq(
        collateralAmount
      );
      expect(await longTokenInstance.balanceOf(user1.address)).to.eq(
        collateralAmount
      );
    });

    it("Reduces the user1`s (msg.sender) collateral token balance", async () => {
      expect(await collateralTokenInstance.balanceOf(user1.address)).to.eq(
        userStartCollateralTokenBalance.sub(collateralAmount)
      );
    });

    it("Increases the diamond`s collateral token balance", async () => {
      expect(await collateralTokenInstance.balanceOf(diamondAddress)).to.eq(
        collateralAmount
      );
    });

    it("Sets the position token decimals equal to that of the collateral tokens", async () => {
      expect(await collateralTokenInstance.decimals()).to.eq(
        await shortTokenInstance.decimals()
      );
      expect(await collateralTokenInstance.decimals()).to.eq(
        await longTokenInstance.decimals()
      );
    });

    it("Increments the poolId", async () => {
      // ---------
      // Act: Mint a second pair of position tokens
      // ---------
      tx = await poolFacet.connect(user1).createContingentPool({
        referenceAsset,
        expiryTime,
        floor,
        inflection,
        cap,
        gradient,
        collateralAmount,
        collateralToken,
        dataProvider,
        capacity,
        longRecipient,
        shortRecipient,
        permissionedERC721Token,
      });

      // ---------
      // Assert: Check that the `poolId` increased
      // ---------
      const secondPoolId = await getPoolIdFromTx(tx);
      expect(secondPoolId).to.eq(poolId.add(1));
    });

    it("Position token holders can transfer their position tokens to any users", async () => {
      // ---------
      // Arrange: Check user balances of short and long token
      // ---------
      const shortTokenBalanceUser1 = await shortTokenInstance.balanceOf(
        user1.address
      );
      const longTokenBalanceUser1 = await longTokenInstance.balanceOf(
        user1.address
      );
      expect(shortTokenBalanceUser1).to.eq(0);
      expect(longTokenBalanceUser1).to.gt(0);

      const shortTokenBalanceUser2 = await shortTokenInstance.balanceOf(
        user2.address
      );
      const longTokenBalanceUser2 = await longTokenInstance.balanceOf(
        user2.address
      );
      expect(shortTokenBalanceUser2).to.gt(0);
      expect(longTokenBalanceUser2).to.eq(0);

      // ---------
      // Act: Transfer position tokens
      // ---------
      await shortTokenInstance
        .connect(user2)
        .transfer(user1.address, shortTokenBalanceUser2);
      await longTokenInstance
        .connect(user1)
        .transfer(user2.address, longTokenBalanceUser1);

      // ---------
      // Assert: Check that position tokens are transferred correctly
      // ---------
      expect(await shortTokenInstance.balanceOf(user1.address)).to.eq(
        shortTokenBalanceUser2
      );
      expect(await longTokenInstance.balanceOf(user1.address)).to.eq(0);

      expect(await shortTokenInstance.balanceOf(user2.address)).to.eq(0);
      expect(await longTokenInstance.balanceOf(user2.address)).to.eq(
        longTokenBalanceUser1
      );
    });

    // -------------------------------------------
    // Events
    // -------------------------------------------

    it("Emits a PoolIssued event", async () => {
      receipt = await tx.wait();
      const poolIssuedEvent = receipt.events?.find(
        (item: any) => item.event === "PoolIssued"
      );
      expect(poolIssuedEvent?.args?.poolId).to.eq(poolId);
      expect(poolIssuedEvent?.args?.longRecipient).to.eq(user1.address);
      expect(poolIssuedEvent?.args?.shortRecipient).to.eq(user2.address);
      expect(poolIssuedEvent?.args?.collateralAmount).to.eq(collateralAmount);
      expect(poolIssuedEvent?.args?.permissionedERC721Token).to.eq(
        permissionedERC721Token
      );
    });

    // -------------------------------------------
    // Reverts
    // -------------------------------------------

    it("Reverts if expiry time is less than block.timestamp", async () => {
      // ---------
      // Arrange: Set invalid expiryTime (equal to previous block's timestamp)
      // ---------
      const invalidExpiryTime = await getLastTimestamp();

      // ---------
      // Act & Assert: Check that contingent pool creation fails
      // ---------
      await expect(
        poolFacet.connect(user1).createContingentPool({
          referenceAsset,
          expiryTime: invalidExpiryTime,
          floor,
          inflection,
          cap,
          gradient,
          collateralAmount,
          collateralToken,
          dataProvider,
          capacity,
          longRecipient,
          shortRecipient,
          permissionedERC721Token,
        })
      ).to.be.revertedWith("InvalidInputParamsCreateContingentPool()");
    });

    it("Reverts if an empty reference asset string is provided", async () => {
      // ---------
      // Arrange: Set invalid name for reference asset
      // ---------
      const invalidReferenceAsset = "";

      // ---------
      // Act & Assert: Check that contingent pool creation fails
      // ---------
      await expect(
        poolFacet.connect(user1).createContingentPool({
          referenceAsset: invalidReferenceAsset,
          expiryTime,
          floor,
          inflection,
          cap,
          gradient,
          collateralAmount,
          collateralToken,
          dataProvider,
          capacity,
          longRecipient,
          shortRecipient,
          permissionedERC721Token,
        })
      ).to.be.revertedWith("InvalidInputParamsCreateContingentPool()");
    });

    it("Reverts if floor is greater than inflection", async () => {
      // ---------
      // Arrange: Set invalid floor
      // ---------
      const invalidFloor = inflection.add(1);

      // ---------
      // Act & Assert: Check that contingent pool creation fails
      // ---------
      await expect(
        poolFacet.connect(user1).createContingentPool({
          referenceAsset,
          expiryTime,
          floor: invalidFloor,
          inflection,
          cap,
          gradient,
          collateralAmount,
          collateralToken,
          dataProvider,
          capacity,
          longRecipient,
          shortRecipient,
          permissionedERC721Token,
        })
      ).to.be.revertedWith("InvalidInputParamsCreateContingentPool()");
    });

    it("Reverts if cap is smaller than inflection", async () => {
      // ---------
      // Arrange: Set invalid floor
      // ---------
      const invalidCap = inflection.sub(1);

      // ---------
      // Act & Assert: Check that contingent pool creation fails
      // ---------
      await expect(
        poolFacet.connect(user1).createContingentPool({
          referenceAsset,
          expiryTime,
          floor,
          inflection,
          cap: invalidCap,
          gradient,
          collateralAmount,
          collateralToken,
          dataProvider,
          capacity,
          longRecipient,
          shortRecipient,
          permissionedERC721Token,
        })
      ).to.be.revertedWith("InvalidInputParamsCreateContingentPool()");
    });

    it("Reverts if total collateral amount is less than 10**6", async () => {
      // ---------
      // Arrange: Set collateralAmount < 10**6
      // ---------
      const invalidCollateralAmount = parseUnits("1", 6).sub(1);

      // ---------
      // Act & Assert: Check that contingent pool creation fails
      // ---------
      await expect(
        poolFacet.connect(user1).createContingentPool({
          referenceAsset,
          expiryTime,
          floor,
          inflection,
          cap,
          gradient,
          collateralAmount: invalidCollateralAmount,
          collateralToken,
          dataProvider,
          capacity,
          longRecipient,
          shortRecipient,
          permissionedERC721Token,
        })
      ).to.be.revertedWith("InvalidInputParamsCreateContingentPool()");
    });

    it("Reverts if data provider is zero address", async () => {
      // ---------
      // Arrange: Set invalid data provider
      // ---------
      const invalidDataProvider = ethers.constants.AddressZero;

      // ---------
      // Act & Assert: Check that contingent pool creation fails
      // ---------
      await expect(
        poolFacet.connect(user1).createContingentPool({
          referenceAsset,
          expiryTime,
          floor,
          inflection,
          cap,
          gradient,
          collateralAmount,
          collateralToken,
          dataProvider: invalidDataProvider,
          capacity,
          longRecipient,
          shortRecipient,
          permissionedERC721Token,
        })
      ).to.be.revertedWith("InvalidInputParamsCreateContingentPool()");
    });

    it("Reverts if gradient is greater than 1 (1e18)", async () => {
      // ---------
      // Arrange: Set invalid gradient parameter
      // ---------
      const invalidGradient = parseUnits("1").add(1);

      // ---------
      // Act & Assert: Check that contingent pool creation fails
      // ---------
      await expect(
        poolFacet.connect(user1).createContingentPool({
          referenceAsset,
          expiryTime,
          floor,
          inflection,
          cap,
          gradient: invalidGradient,
          collateralAmount,
          collateralToken,
          dataProvider,
          capacity,
          longRecipient,
          shortRecipient,
          permissionedERC721Token,
        })
      ).to.be.revertedWith("InvalidInputParamsCreateContingentPool()");
    });

    it("Reverts if total collateral exceeds pool capacity", async () => {
      // ---------
      // Arrange: Set invalid capacity
      // ---------
      const invalidCapacity = collateralAmount.sub(1);

      // ---------
      // Act & Assert: Check that contingent pool creation fails
      // ---------
      await expect(
        poolFacet.connect(user1).createContingentPool({
          referenceAsset,
          expiryTime,
          floor,
          inflection,
          cap,
          gradient,
          collateralAmount,
          collateralToken,
          dataProvider,
          capacity: invalidCapacity,
          longRecipient,
          shortRecipient,
          permissionedERC721Token,
        })
      ).to.be.revertedWith("InvalidInputParamsCreateContingentPool()");
    });

    it("Reverts if collateral token has more than 18 decimals", async () => {
      // ---------
      // Arrange: Create an ERC20 token with 20 decimal places which should not be accepted
      // ---------
      _decimals = 20;
      collateralTokenInstance = await erc20DeployFixture(
        "DummyCollateralToken",
        "DCT",
        userStartCollateralTokenBalance,
        user1.address,
        _decimals
      );

      // ---------
      // Act & Assert: Check that contingent pool creation fails
      // ---------
      await expect(
        poolFacet.connect(user1).createContingentPool({
          referenceAsset,
          expiryTime,
          floor,
          inflection,
          cap,
          gradient,
          collateralAmount: parseUnits("200", _decimals),
          collateralToken: collateralTokenInstance.address,
          dataProvider,
          capacity,
          longRecipient,
          shortRecipient,
          permissionedERC721Token,
        })
      ).to.be.revertedWith("InvalidInputParamsCreateContingentPool()");
    });

    it("Reverts if collateral token has less than 3 decimals", async () => {
      // ---------
      // Arrange: Create an ERC20 token with 3 decimal places which should not be accepted
      // ---------
      _decimals = 5;
      collateralTokenInstance = await erc20DeployFixture(
        "DummyCollateralToken",
        "DCT",
        userStartCollateralTokenBalance,
        user1.address,
        _decimals
      );

      // ---------
      // Act & Assert: Check that contingent pool creation fails
      // ---------
      await expect(
        poolFacet.connect(user1).createContingentPool({
          referenceAsset,
          expiryTime,
          floor,
          inflection,
          cap,
          gradient,
          collateralAmount: parseUnits("200", _decimals),
          collateralToken: collateralTokenInstance.address,
          dataProvider,
          capacity,
          longRecipient,
          shortRecipient,
          permissionedERC721Token,
        })
      ).to.be.revertedWith("InvalidInputParamsCreateContingentPool()");
    });

    it("Reverts if both longRecipient and shortRecipient are zero address", async () => {
      // ---------
      // Arrange: Set longRecipient and shortRecipient to zero address
      // ---------
      const zeroXLongRecipient = ethers.constants.AddressZero;
      const zeroXShortRecipient = ethers.constants.AddressZero;

      // ---------
      // Act & Assert: Check that contingent pool creation fails
      // ---------
      await expect(
        poolFacet.connect(user1).createContingentPool({
          referenceAsset,
          expiryTime,
          floor,
          inflection,
          cap,
          gradient,
          collateralAmount,
          collateralToken,
          dataProvider,
          capacity,
          longRecipient: zeroXLongRecipient,
          shortRecipient: zeroXShortRecipient,
          permissionedERC721Token,
        })
      ).to.be.revertedWith("InvalidInputParamsCreateContingentPool()");
    });
  });

  describe("createContingentPool with non-zero permissionedERC721Token", async () => {
    let shortTokenInstance: PermissionedPositionToken;
    let longTokenInstance: PermissionedPositionToken;
    let userStartCollateralTokenBalance: BigNumber;
    let permissionedERC721TokenInstance: MockERC721;

    beforeEach(async function () {
      // ---------
      // Arrange: Equip user1 with collateral token, approve collateral token for diamond contract, and specify default pool parameters,  and Equip user1 and user2 with permissioned ERC721 token
      // ---------
      userStartCollateralTokenBalance = parseUnits("1000000");
      collateralTokenInstance = await erc20DeployFixture(
        "DummyCollateralToken",
        "DCT",
        userStartCollateralTokenBalance,
        user1.address,
        decimals
      );
      await collateralTokenInstance
        .connect(user1)
        .approve(diamondAddress, userStartCollateralTokenBalance);

      // Specify default pool parameters
      referenceAsset = "BTC/USD";
      expiryTime = await getExpiryTime(7200); // Expiry in 2h
      floor = parseUnits("1198.53");
      inflection = parseUnits("1605.33");
      cap = parseUnits("2001.17");
      gradient = parseUnits("0.33", decimals);
      collateralAmount = parseUnits("15001.358", decimals);
      collateralToken = collateralTokenInstance.address;
      dataProvider = oracle.address;
      capacity = MAX_UINT; // Uncapped
      longRecipient = user1.address; // Set long token recipient to user1
      shortRecipient = user2.address; // Set short token recipient to user1

      permissionedERC721TokenInstance = await erc721DeployFixture(
        "PermissionedERC721Token",
        "PNFT"
      );
      await permissionedERC721TokenInstance.connect(user1).mint();
      await permissionedERC721TokenInstance.connect(user2).mint();
      permissionedERC721Token = permissionedERC721TokenInstance.address;

      if (
        this.currentTest?.title !==
          "Should allow to create a contingent pool with permissioned recipients" &&
        this.currentTest?.title !==
          "Reverts if pool is created with non-permissioned short recipient" &&
        this.currentTest?.title !==
          "Reverts if pool is created with non-permissioned long recipient"
      ) {
        // ---------
        // Act: Create a contingent pool with default parameters
        // ---------
        tx = await poolFacet.connect(user1).createContingentPool({
          referenceAsset,
          expiryTime,
          floor,
          inflection,
          cap,
          gradient,
          collateralAmount,
          collateralToken,
          dataProvider,
          capacity,
          longRecipient,
          shortRecipient,
          permissionedERC721Token,
        });

        poolId = await getPoolIdFromTx(tx);
        poolParams = await getterFacet.getPoolParameters(poolId);
        shortTokenInstance = await permissionedPositionTokenAttachFixture(
          poolParams.shortToken
        );
        longTokenInstance = await permissionedPositionTokenAttachFixture(
          poolParams.longToken
        );
      }
    });

    // -------------------------------------------
    // Functionality
    // -------------------------------------------

    it("Should allow to create a contingent pool with permissioned recipients", async () => {
      // ---------
      // Arrange: Check that long recipient and short recipient own the permissioned ERC721 token
      // ---------
      expect(
        await permissionedERC721TokenInstance.balanceOf(longRecipient)
      ).to.gt(0);
      expect(
        await permissionedERC721TokenInstance.balanceOf(shortRecipient)
      ).to.gt(0);
      govParams = await getterFacet.getGovernanceParameters();

      // ---------
      // Act: Should able to create contingent pool
      // ---------
      tx = await poolFacet.connect(user1).createContingentPool({
        referenceAsset,
        expiryTime,
        floor,
        inflection,
        cap,
        gradient,
        collateralAmount,
        collateralToken,
        dataProvider,
        capacity,
        longRecipient,
        shortRecipient,
        permissionedERC721Token,
      });

      // ---------
      // Assert: Check that pool parameters are correctly set
      // ---------
      currentBlockTimestamp = await getLastTimestamp();
      poolId = await getPoolIdFromTx(tx);
      poolParams = await getterFacet.getPoolParameters(poolId);
      expect(poolParams.referenceAsset).to.eq(referenceAsset);
      expect(poolParams.expiryTime).to.eq(expiryTime);
      expect(poolParams.floor).to.eq(floor);
      expect(poolParams.inflection).to.eq(inflection);
      expect(poolParams.cap).to.eq(cap);
      expect(poolParams.collateralToken).to.eq(collateralToken);
      expect(poolParams.gradient).to.eq(gradient);
      expect(poolParams.collateralBalance).to.eq(collateralAmount);
      expect(poolParams.shortToken).is.properAddress;
      expect(poolParams.longToken).is.properAddress;
      expect(poolParams.finalReferenceValue).to.eq(0);
      expect(poolParams.statusFinalReferenceValue).to.eq(0);
      expect(poolParams.payoutLong).to.eq(0);
      expect(poolParams.payoutShort).to.eq(0);
      expect(poolParams.statusTimestamp).to.eq(currentBlockTimestamp);
      expect(poolParams.dataProvider).to.eq(oracle.address);
      expect(poolParams.capacity).to.eq(capacity);

      // Check that the pool has the correct fees set
      poolFees = await getterFacet.getFees(poolParams.indexFees);
      expect(poolFees.protocolFee).to.eq(govParams.currentFees.protocolFee);
      expect(poolFees.settlementFee).to.eq(govParams.currentFees.settlementFee);

      // Check that the pool has the correct settlement periods set
      poolSettlementPeriods = await getterFacet.getSettlementPeriods(
        poolParams.indexSettlementPeriods
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

      // Check that position tokens return the permissionedERC721Token address
      shortTokenInstance = await permissionedPositionTokenAttachFixture(
        poolParams.shortToken
      );
      longTokenInstance = await permissionedPositionTokenAttachFixture(
        poolParams.longToken
      );
      expect(await shortTokenInstance.permissionedERC721Token()).to.eq(
        permissionedERC721Token
      );
      expect(await longTokenInstance.permissionedERC721Token()).to.eq(
        permissionedERC721Token
      );
    });

    it("Permissioned position token holder can transfer their position token to permissioned user", async () => {
      // ---------
      // Arrange: Check that user1 and user2 are permissioned user and get user balances of short and long tokens
      // ---------
      expect(
        await permissionedERC721TokenInstance.balanceOf(longRecipient)
      ).to.gt(0);
      expect(
        await permissionedERC721TokenInstance.balanceOf(shortRecipient)
      ).to.gt(0);

      const shortTokenBalanceUser1 = await shortTokenInstance.balanceOf(
        user1.address
      );
      const longTokenBalanceUser1 = await longTokenInstance.balanceOf(
        user1.address
      );
      expect(shortTokenBalanceUser1).to.eq(0);
      expect(longTokenBalanceUser1).to.gt(0);

      const shortTokenBalanceUser2 = await shortTokenInstance.balanceOf(
        user2.address
      );
      const longTokenBalanceUser2 = await longTokenInstance.balanceOf(
        user2.address
      );
      expect(shortTokenBalanceUser2).to.gt(0);
      expect(longTokenBalanceUser2).to.eq(0);

      // ---------
      // Act: Transfer position tokens
      // ---------
      await shortTokenInstance
        .connect(user2)
        .transfer(user1.address, shortTokenBalanceUser2);
      await longTokenInstance
        .connect(user1)
        .transfer(user2.address, longTokenBalanceUser1);

      // ---------
      // Assert: Check that position tokens are transferred correctly
      // ---------
      expect(await shortTokenInstance.balanceOf(user1.address)).to.eq(
        shortTokenBalanceUser2
      );
      expect(await longTokenInstance.balanceOf(user1.address)).to.eq(0);

      expect(await shortTokenInstance.balanceOf(user2.address)).to.eq(0);
      expect(await longTokenInstance.balanceOf(user2.address)).to.eq(
        longTokenBalanceUser1
      );
    });

    // -------------------------------------------
    // Events
    // -------------------------------------------

    it("Emits a PoolIssued event", async () => {
      receipt = await tx.wait();
      const poolIssuedEvent = receipt.events?.find(
        (item: any) => item.event === "PoolIssued"
      );
      expect(poolIssuedEvent?.args?.poolId).to.eq(poolId);
      expect(poolIssuedEvent?.args?.longRecipient).to.eq(user1.address);
      expect(poolIssuedEvent?.args?.shortRecipient).to.eq(user2.address);
      expect(poolIssuedEvent?.args?.collateralAmount).to.eq(collateralAmount);
      expect(poolIssuedEvent?.args?.permissionedERC721Token).to.eq(
        permissionedERC721Token
      );
    });

    // -------------------------------------------
    // Reverts
    // -------------------------------------------

    it("Reverts if pool is created with non-permissioned short recipient", async () => {
      // ---------
      // Arrange: Set invalid short recipient (accounts[0] who doesn't hold any permissioned ERC721 tokens)
      // ---------
      shortRecipient = accounts[0].address;
      expect(
        await permissionedERC721TokenInstance.balanceOf(shortRecipient)
      ).to.eq(0);

      // ---------
      // Act & Assert: Check that contingent pool creation fails
      // ---------
      await expect(
        poolFacet.connect(user1).createContingentPool({
          referenceAsset,
          expiryTime,
          floor,
          inflection,
          cap,
          gradient,
          collateralAmount,
          collateralToken,
          dataProvider,
          capacity,
          longRecipient,
          shortRecipient,
          permissionedERC721Token,
        })
      ).to.be.revertedWith("PositionToken: invalid recipient");
    });

    it("Reverts if pool is created with non-permissioned long recipient", async () => {
      // ---------
      // Arrange: Set invalid long recipient (accounts[0] who doesn't hold any permissioned ERC721 tokens)
      // ---------
      longRecipient = accounts[0].address;
      expect(
        await permissionedERC721TokenInstance.balanceOf(longRecipient)
      ).to.eq(0);

      // ---------
      // Act & Assert: Check that contingent pool creation fails
      // ---------
      await expect(
        poolFacet.connect(user1).createContingentPool({
          referenceAsset,
          expiryTime,
          floor,
          inflection,
          cap,
          gradient,
          collateralAmount,
          collateralToken,
          dataProvider,
          capacity,
          longRecipient,
          shortRecipient,
          permissionedERC721Token,
        })
      ).to.be.revertedWith("PositionToken: invalid recipient");
    });

    it("Reverts if position tokens are transferred to a non-permissioned address", async () => {
      // ---------
      // Arrange: Set invalid recipient (accounts[0] who doesn't hold any permissioned ERC721 tokens) and confirm that user1 and user2 are holding position tokens
      // ---------
      const recipient = accounts[0].address;
      expect(await permissionedERC721TokenInstance.balanceOf(recipient)).to.eq(
        0
      );

      const shortTokenBalanceUser2 = await shortTokenInstance.balanceOf(
        user2.address
      );
      expect(shortTokenBalanceUser2).to.gt(0);

      const longTokenBalanceUser1 = await longTokenInstance.balanceOf(
        user1.address
      );
      expect(longTokenBalanceUser1).to.gt(0);

      // ---------
      // Act & Assert: Check that transfer position token fails
      // ---------
      await expect(
        shortTokenInstance
          .connect(user2.address)
          .transfer(recipient, shortTokenBalanceUser2)
      ).to.be.revertedWith("PositionToken: invalid recipient");
      await expect(
        longTokenInstance
          .connect(user1.address)
          .transfer(recipient, longTokenBalanceUser1)
      ).to.be.revertedWith("PositionToken: invalid recipient");
    });

    it("Reverts if position tokens are transferred from a non-permissioned address", async () => {
      // ---------
      // Arrange: Transfer permissioned ERC721 token from user1 and user2 to other account (account[0]) and confirm that user1 and user2 are holding position tokens
      // ---------
      const recipient = accounts[0].address;
      await permissionedERC721TokenInstance
        .connect(user1)
        .transferFrom(user1.address, recipient, 1);
      await permissionedERC721TokenInstance
        .connect(user2)
        .transferFrom(user2.address, recipient, 2);
      expect(
        await permissionedERC721TokenInstance.balanceOf(user1.address)
      ).to.eq(0);
      expect(
        await permissionedERC721TokenInstance.balanceOf(user2.address)
      ).to.eq(0);

      const shortTokenBalanceUser2 = await shortTokenInstance.balanceOf(
        user2.address
      );
      expect(shortTokenBalanceUser2).to.gt(0);

      const longTokenBalanceUser1 = await longTokenInstance.balanceOf(
        user1.address
      );
      expect(longTokenBalanceUser1).to.gt(0);

      // ---------
      // Act & Assert: Check that the transfer of position tokens fails
      // ---------
      await expect(
        shortTokenInstance
          .connect(user2.address)
          .transfer(recipient, shortTokenBalanceUser2)
      ).to.be.revertedWith("PositionToken: invalid sender");
      await expect(
        longTokenInstance
          .connect(user1.address)
          .transfer(recipient, longTokenBalanceUser1)
      ).to.be.revertedWith("PositionToken: invalid sender");
    });
  });

  describe("batchCreateContingentPool", async () => {
    // -------------------------------------------
    // Functionality
    // -------------------------------------------

    it("Creates contingent pools and stores the pools parameters", async () => {
      // ---------
      // Arrange: Equip user1 with collateral token, approve collateral token for diamond contract, and specify default pools parameters
      // ---------
      userStartCollateralTokenBalance = parseUnits("1000000");
      collateralTokenInstance = await erc20DeployFixture(
        "DummyCollateralToken",
        "DCT",
        userStartCollateralTokenBalance,
        user1.address,
        decimals
      );
      await collateralTokenInstance
        .connect(user1)
        .approve(diamondAddress, userStartCollateralTokenBalance);

      // Specify default pools parameters
      const referenceAsset1 = "BTC/USD";
      const expiryTime1 = await getExpiryTime(7200);
      const floor1 = parseUnits("1198.53");
      const inflection1 = parseUnits("1605.33");
      const cap1 = parseUnits("2001.17");
      const gradient1 = parseUnits("0.33", decimals);
      const collateralAmount1 = parseUnits("15001.358", decimals);

      const referenceAsset2 = "ETH/USD";
      const expiryTime2 = await getExpiryTime(7300);
      const floor2 = parseUnits("1298.53");
      const inflection2 = parseUnits("1705.33");
      const cap2 = parseUnits("2101.17");
      const gradient2 = parseUnits("0.43", decimals);
      const collateralAmount2 = parseUnits("16001.358", decimals);

      collateralToken = collateralTokenInstance.address;
      dataProvider = oracle.address;
      capacity = MAX_UINT; // Uncapped
      longRecipient = user1.address;
      shortRecipient = user2.address;

      // ---------
      // Act: Create  contingent pools with parameters
      // ---------
      tx = await poolFacet.connect(user1).batchCreateContingentPool([
        {
          referenceAsset: referenceAsset1,
          expiryTime: expiryTime1,
          floor: floor1,
          inflection: inflection1,
          cap: cap1,
          gradient: gradient1,
          collateralAmount: collateralAmount1,
          collateralToken,
          dataProvider,
          capacity,
          longRecipient,
          shortRecipient,
          permissionedERC721Token: ethers.constants.AddressZero,
        },
        {
          referenceAsset: referenceAsset2,
          expiryTime: expiryTime2,
          floor: floor2,
          inflection: inflection2,
          cap: cap2,
          gradient: gradient2,
          collateralAmount: collateralAmount2,
          collateralToken,
          dataProvider,
          capacity,
          longRecipient,
          shortRecipient,
          permissionedERC721Token: ethers.constants.AddressZero,
        },
      ]);
      receipt = await tx.wait();

      // ---------
      // Assert: Check that pools parameters are correctly set
      // ---------
      const poolIssuedEvents =
        receipt.events?.filter((x: any) => x.event === "PoolIssued") || [];
      const poolId1 = poolIssuedEvents[0].args?.poolId;
      const poolId2 = poolIssuedEvents[1].args?.poolId;

      currentBlockTimestamp = await getLastTimestamp();

      const poolParams1 = await getterFacet.getPoolParameters(poolId1);
      expect(poolParams1.referenceAsset).to.eq(referenceAsset1);
      expect(poolParams1.expiryTime).to.eq(expiryTime1);
      expect(poolParams1.floor).to.eq(floor1);
      expect(poolParams1.inflection).to.eq(inflection1);
      expect(poolParams1.cap).to.eq(cap1);
      expect(poolParams1.collateralToken).to.eq(collateralToken);
      expect(poolParams1.gradient).to.eq(gradient1);
      expect(poolParams1.collateralBalance).to.eq(collateralAmount1);
      expect(poolParams1.shortToken).is.properAddress;
      expect(poolParams1.longToken).is.properAddress;
      expect(poolParams1.finalReferenceValue).to.eq(0);
      expect(poolParams1.statusFinalReferenceValue).to.eq(0);
      expect(poolParams1.payoutLong).to.eq(0);
      expect(poolParams1.payoutShort).to.eq(0);
      expect(poolParams1.statusTimestamp).to.eq(currentBlockTimestamp);
      expect(poolParams1.dataProvider).to.eq(oracle.address);
      expect(poolParams1.capacity).to.eq(capacity);

      const poolParams2 = await getterFacet.getPoolParameters(poolId2);
      expect(poolParams2.referenceAsset).to.eq(referenceAsset2);
      expect(poolParams2.expiryTime).to.eq(expiryTime2);
      expect(poolParams2.floor).to.eq(floor2);
      expect(poolParams2.inflection).to.eq(inflection2);
      expect(poolParams2.cap).to.eq(cap2);
      expect(poolParams2.collateralToken).to.eq(collateralToken);
      expect(poolParams2.gradient).to.eq(gradient2);
      expect(poolParams2.collateralBalance).to.eq(collateralAmount2);
      expect(poolParams2.shortToken).is.properAddress;
      expect(poolParams2.longToken).is.properAddress;
      expect(poolParams2.finalReferenceValue).to.eq(0);
      expect(poolParams2.statusFinalReferenceValue).to.eq(0);
      expect(poolParams2.payoutLong).to.eq(0);
      expect(poolParams2.payoutShort).to.eq(0);
      expect(poolParams2.statusTimestamp).to.eq(currentBlockTimestamp);
      expect(poolParams2.dataProvider).to.eq(oracle.address);
      expect(poolParams2.capacity).to.eq(capacity);
    });
  });

  describe("Storage slots distance", function () {
    // Source: https://discord.com/channels/730508054143172710/730508054877175911/1074220753278472232
    it("are sufficiently far", async function () {
      let positions = [
        ethers.BigNumber.from(0),
        ethers.BigNumber.from(ethers.utils.id("diamond.standard.diamond.storage")),
        ethers.BigNumber.from(ethers.utils.id("diamond.standard.pool.storage")),
        ethers.BigNumber.from(ethers.utils.id("diamond.standard.governance.storage")),
        ethers.BigNumber.from(ethers.utils.id("diamond.standard.fee.claim.storage")),
        ethers.BigNumber.from(ethers.utils.id("diamond.standard.eip712.storage")),
      ];
      for(let i = 0; i < positions.length; i++) {
        console.log(positions[i].toHexString());
      }
      positions = positions.sort(sortBNs);
      let minDistance = 25600;
      for(let i = 0; i < positions.length-1; i++) {
        let distance = positions[i+1].sub(positions[i]);
        expect(distance).gte(minDistance);
      }
    });
  });
  
  // sorts BigNumbers ascending
  function sortBNs(a: BigNumber, b: BigNumber) {
    if(a.lt(b)) return -1;
    if(a.gt(b)) return 1;
    return 0;
  }
  
});
