import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, BigNumberish, ContractReceipt, ContractTransaction } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
  GetterFacet,
  MockERC20,
  MockERC721,
  PermissionedPositionToken,
  PoolFacet,
  PositionToken,
} from "../typechain-types";
import { LibDIVAStorage } from "../typechain-types/contracts/facets/GetterFacet";
import { LibDIVA } from "../typechain-types/contracts/facets/PoolFacet";

import {
  getExpiryTime,
  getLastTimestamp,
  getPoolIdFromTx,
  getPoolId,
  extractNumberFromString,
  createContingentPool,
  decimals,
  defaultPoolParameters,
  CreateContingentPoolParams,
} from "../utils";
import { ONE_DAY, GovParams } from "../constants";
import { deployMain } from "../scripts/deployMain";

import {
  erc20DeployFixture,
  erc721DeployFixture,
  positionTokenAttachFixture,
  permissionedPositionTokenAttachFixture,
  fakePositionTokenDeployFixture,
} from "./fixtures";

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

  let protocolFee = "2500000000000000"; // initial protocol value
  let settlementFee = "500000000000000"; // initial protocol value
  let userStartCollateralTokenBalance: BigNumber;
  let collateralTokenInstance: MockERC20;
  let collateralTokenWithFeesInstance: MockERC20;

  let currentNonce: string;
  let expectedPoolId: string;

  let poolId: string;
  let poolParams: LibDIVAStorage.PoolStructOutput;
  let govParams: GovParams,
    poolFees: LibDIVAStorage.FeesStructOutput,
    poolSettlementPeriods: LibDIVAStorage.SettlementPeriodsStructOutput;

  let currentBlockTimestamp: number;

  let tx: ContractTransaction;
  let receipt: ContractReceipt;

  let createContingentPoolParams: CreateContingentPoolParams;
  let createContingentPoolParams2: CreateContingentPoolParams;

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
        decimals,
        "0"
      );
      collateralTokenWithFeesInstance = await erc20DeployFixture(
        "DummyCollateralTokenWithFees",
        "DCTWF",
        userStartCollateralTokenBalance,
        user1.address,
        decimals,
        "100", // 1% = 100, 0.1% = 1000
      );
      await collateralTokenInstance
        .connect(user1)
        .approve(diamondAddress, userStartCollateralTokenBalance);
      await collateralTokenWithFeesInstance
        .connect(user1)
        .approve(diamondAddress, userStartCollateralTokenBalance);

      // Specify the create contingent pool parameters. Refer to `utils/libDiva.ts` for default values.
      // `expiryTime` was set manually so that we can use it for comparison later.
      createContingentPoolParams = {
        ...defaultPoolParameters,
        collateralToken: collateralTokenInstance.address,
        dataProvider: oracle.address,
        poolCreater: user1,
        poolFacet: poolFacet,
        longRecipient: user1.address,
        shortRecipient: user2.address,
        expiryTime: await getExpiryTime(7200)
      }

      if (
        this.currentTest?.title !==
        "Creates a contingent pool and stores the pool parameters"
      ) {
        // ---------
        // Act: Create a contingent pool with default parameters
        // ---------
        tx = await createContingentPool(createContingentPoolParams);

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
      const poolCountBefore = await getterFacet.getPoolCount();
      govParams = await getterFacet.getGovernanceParameters();
      tx = await createContingentPool(createContingentPoolParams);

      // ---------
      // Assert: Check that pool parameters are correctly set
      // ---------
      currentBlockTimestamp = await getLastTimestamp();
      poolId = await getPoolIdFromTx(tx);
      poolParams = await getterFacet.getPoolParameters(poolId);
      const poolCountAfter = await getterFacet.getPoolCount();
      shortTokenInstance = await positionTokenAttachFixture(poolParams.shortToken);
      longTokenInstance = await positionTokenAttachFixture(poolParams.longToken);
      currentNonce = await extractNumberFromString(await shortTokenInstance.name());

      // Manually calculate the expected poolId
      expectedPoolId = getPoolId(
        createContingentPoolParams.referenceAsset,
        createContingentPoolParams.expiryTime as BigNumberish,
        createContingentPoolParams.floor,
        createContingentPoolParams.inflection,
        createContingentPoolParams.cap,
        createContingentPoolParams.gradient,
        createContingentPoolParams.collateralAmount,
        createContingentPoolParams.collateralToken,
        createContingentPoolParams.dataProvider,
        createContingentPoolParams.capacity,
        createContingentPoolParams.longRecipient,
        createContingentPoolParams.shortRecipient,
        createContingentPoolParams.permissionedERC721Token,
        createContingentPoolParams.collateralAmount, // collateralAmountMsgSender
        "0", // collateralAmountMaker
        ethers.constants.AddressZero, // maker,
        user1.address, // msgSender
        currentNonce // nonce
      )
      
      expect(poolId).to.eq(expectedPoolId);
      expect(poolCountAfter).to.eq(poolCountBefore.add(1));
      expect(poolParams.referenceAsset).to.eq(createContingentPoolParams.referenceAsset);
      expect(poolParams.expiryTime).to.eq(createContingentPoolParams.expiryTime);
      expect(poolParams.floor).to.eq(createContingentPoolParams.floor);
      expect(poolParams.inflection).to.eq(createContingentPoolParams.inflection);
      expect(poolParams.cap).to.eq(createContingentPoolParams.cap);
      expect(poolParams.collateralToken).to.eq(createContingentPoolParams.collateralToken);
      expect(poolParams.gradient).to.eq(createContingentPoolParams.gradient);
      expect(poolParams.collateralBalance).to.eq(createContingentPoolParams.collateralAmount);
      expect(poolParams.shortToken).is.properAddress;
      expect(poolParams.longToken).is.properAddress;
      expect(poolParams.finalReferenceValue).to.eq(0);
      expect(poolParams.statusFinalReferenceValue).to.eq(0);
      expect(poolParams.payoutLong).to.eq(0);
      expect(poolParams.payoutShort).to.eq(0);
      expect(poolParams.statusTimestamp).to.eq(currentBlockTimestamp);
      expect(poolParams.dataProvider).to.eq(createContingentPoolParams.dataProvider);
      expect(poolParams.capacity).to.eq(createContingentPoolParams.capacity);

      // Confirm that the position tokens store the correct poolId
      expect(await shortTokenInstance.poolId()).to.eq(expectedPoolId);
      expect(await longTokenInstance.poolId()).to.eq(expectedPoolId);

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

    it("Returns the same pool parameters when retrieved via `getPoolParametersByAddress`", async () => {
      // ---------
      // Act: Create a contingent pool with default parameters
      // ---------
      tx = await createContingentPool(createContingentPoolParams);

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
      expect(await shortTokenInstance.totalSupply()).to.eq(createContingentPoolParams.collateralAmount);
      expect(await longTokenInstance.totalSupply()).to.eq(createContingentPoolParams.collateralAmount);
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
      const poolCount = await getterFacet.getPoolCount();
      expect(await shortTokenInstance.name()).to.eq("S" + poolCount);
      expect(await longTokenInstance.name()).to.eq("L" + poolCount);
    });

    it("Sends position tokens to user1 (pool creator) and user2", async () => {
      expect(await shortTokenInstance.balanceOf(user2.address)).to.eq(
        createContingentPoolParams.collateralAmount
      );
      expect(await longTokenInstance.balanceOf(user1.address)).to.eq(
        createContingentPoolParams.collateralAmount
      );
    });

    it("Reduces the user1`s (msg.sender) collateral token balance", async () => {
      expect(await collateralTokenInstance.balanceOf(user1.address)).to.eq(
        userStartCollateralTokenBalance.sub(createContingentPoolParams.collateralAmount)
      );
    });

    it("Increases the diamond`s collateral token balance", async () => {
      expect(await collateralTokenInstance.balanceOf(diamondAddress)).to.eq(
        createContingentPoolParams.collateralAmount
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

    it("Increments the poolCount", async () => {
      // ---------
      // Arrange: Get current pool count
      // ---------
      const poolCountBefore = await getterFacet.getPoolCount();

      // ---------
      // Act: Mint a second pair of position tokens
      // ---------
      await createContingentPool(createContingentPoolParams);

      // ---------
      // Assert: Check that the pool count increased
      // ---------
      const poolCountAfter = await getterFacet.getPoolCount();
      expect(poolCountAfter).to.eq(poolCountBefore.add(1));
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
      
    it("Deducts a fee on transfer for the Mock ERC20 token with fees", async () => {
      // This test is to ensure that the fee logic in the Mock ERC20 functions correctly

      // ---------
      // Arrange: Get the token balances before transfer and prepare parameters for transfer call
      // ---------
      const collateralTokenWithFeesUser1Before = await collateralTokenWithFeesInstance.balanceOf(user1.address);
      const collateralTokenWithFeesUser2Before = await collateralTokenWithFeesInstance.balanceOf(user2.address);

      const amountToTransfer = BigNumber.from("10000");
      const feePct = await collateralTokenWithFeesInstance.getFee();
      expect(feePct).to.be.gt(0)
      const feeAmount = amountToTransfer.div(feePct);
      
      // ---------
      // Act: Transfer tokens
      // ---------
      await collateralTokenWithFeesInstance
        .connect(user1)
        .transfer(user2.address, amountToTransfer);

      // ---------
      // Assert: Confirm that the new balances are as expected
      // ---------
      const collateralTokenWithFeesUser1After = await collateralTokenWithFeesInstance.balanceOf(user1.address);
      const collateralTokenWithFeesUser2After = await collateralTokenWithFeesInstance.balanceOf(user2.address);
      expect(collateralTokenWithFeesUser1After).to.eq(collateralTokenWithFeesUser1Before.sub(amountToTransfer));
      expect(collateralTokenWithFeesUser2After).to.eq(collateralTokenWithFeesUser2Before.add(amountToTransfer).sub(feeAmount));
    })

    it("Shouldn't change anything if collateralAmount = 0", async () => {
      // ---------
      // Arrange: Set collateral amount to zero and retrieve DIVA contract's collateral token balance
      // ---------
      const zeroCollateralAmount = BigNumber.from(0);
      const diamondCollateralTokenBalanceBefore = await collateralTokenInstance.balanceOf(diamondAddress);
      const createContingentPoolParamsAdj: CreateContingentPoolParams = {
        ...createContingentPoolParams,
        collateralAmount: zeroCollateralAmount
      }

      // ---------
      // Act: Create a contingent pool
      // ---------
      tx = await createContingentPool(createContingentPoolParamsAdj);

      // ---------
      // Assert: Check that relevant pool parameters are correctly set
      // ---------
      currentBlockTimestamp = await getLastTimestamp();
      poolId = await getPoolIdFromTx(tx);
      poolParams = await getterFacet.getPoolParameters(poolId);
      shortTokenInstance = await positionTokenAttachFixture(poolParams.shortToken);
      longTokenInstance = await positionTokenAttachFixture(poolParams.longToken);

      // Confirm that the collateral amount is zero
      expect(poolParams.collateralBalance).to.eq(zeroCollateralAmount);

      // Confirm that the total short and long token supply is zero
      expect(await shortTokenInstance.totalSupply()).to.eq(zeroCollateralAmount);
      expect(await longTokenInstance.totalSupply()).to.eq(zeroCollateralAmount);

      // Confirm that the user's long and short token supply are zero
      expect(await shortTokenInstance.balanceOf(user2.address)).to.eq(
        zeroCollateralAmount
      );
      expect(await longTokenInstance.balanceOf(user1.address)).to.eq(
        zeroCollateralAmount
      );

      // Confirm that DIVA contract's collateral token balance remained unchanged
      expect(await collateralTokenInstance.balanceOf(diamondAddress)).to.eq(
        diamondCollateralTokenBalanceBefore
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
      expect(poolIssuedEvent?.args?.longRecipient).to.eq(createContingentPoolParams.longRecipient);
      expect(poolIssuedEvent?.args?.shortRecipient).to.eq(createContingentPoolParams.shortRecipient);
      expect(poolIssuedEvent?.args?.collateralAmount).to.eq(createContingentPoolParams.collateralAmount);
      expect(poolIssuedEvent?.args?.permissionedERC721Token).to.eq(
        createContingentPoolParams.permissionedERC721Token
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
        createContingentPool({
          ...createContingentPoolParams,
          expiryTime: invalidExpiryTime // invalid as in the past (equal to getLastTimestamp())
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
        createContingentPool({
          ...createContingentPoolParams,
          referenceAsset: invalidReferenceAsset
        })
      ).to.be.revertedWith("InvalidInputParamsCreateContingentPool()");
    });

    it("Reverts if floor is greater than inflection", async () => {
      // ---------
      // Arrange: Set invalid floor
      // ---------
      const invalidFloor = createContingentPoolParams.inflection.add(1);

      // ---------
      // Act & Assert: Check that contingent pool creation fails
      // ---------
      await expect(
        createContingentPool({
          ...createContingentPoolParams,
          floor: invalidFloor
        })
      ).to.be.revertedWith("InvalidInputParamsCreateContingentPool()");
    });

    it("Reverts if cap is smaller than inflection", async () => {
      // ---------
      // Arrange: Set invalid floor
      // ---------
      const invalidCap = createContingentPoolParams.inflection.sub(1);

      // ---------
      // Act & Assert: Check that contingent pool creation fails
      // ---------
      await expect(
        createContingentPool({
          ...createContingentPoolParams,
          cap: invalidCap
        })
      ).to.be.revertedWith("InvalidInputParamsCreateContingentPool()");
    });

    it("Reverts if cap exceeds 1e59", async () => {
      // ---------
      // Arrange: Set invalid cap
      // ---------
      const invalidCap = parseUnits("1", 59).add(1);

      // ---------
      // Act & Assert: Check that contingent pool creation fails
      // ---------
      await expect(
        createContingentPool({
          ...createContingentPoolParams,
          cap: invalidCap
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
        createContingentPool({
          ...createContingentPoolParams,
          dataProvider: invalidDataProvider
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
        createContingentPool({
          ...createContingentPoolParams,
          gradient: invalidGradient
        })
      ).to.be.revertedWith("InvalidInputParamsCreateContingentPool()");
    });

    it("Reverts if total collateral exceeds pool capacity", async () => {
      // ---------
      // Arrange: Set invalid capacity
      // ---------
      const invalidCapacity = createContingentPoolParams.collateralAmount.sub(1);

      // ---------
      // Act & Assert: Check that contingent pool creation fails
      // ---------
      await expect(
        createContingentPool({
          ...createContingentPoolParams,
          capacity: invalidCapacity
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
        _decimals,
        "0"
      );

      // ---------
      // Act & Assert: Check that contingent pool creation fails
      // ---------
      await expect(
        createContingentPool({
          ...createContingentPoolParams,
          collateralAmount: parseUnits("200", _decimals),
          collateralToken: collateralTokenInstance.address,
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
        _decimals,
        "0"
      );

      // ---------
      // Act & Assert: Check that contingent pool creation fails
      // ---------
      await expect(
        createContingentPool({
          ...createContingentPoolParams,
          collateralAmount: parseUnits("200", _decimals),
          collateralToken: collateralTokenInstance.address,
        })
      ).to.be.revertedWith("InvalidInputParamsCreateContingentPool()");
    });

    it("Reverts if longRecipient is the zero address", async () => {
      // ---------
      // Arrange: Set longRecipient to zero address
      // ---------
      const zeroXLongRecipient = ethers.constants.AddressZero;
      expect(createContingentPoolParams.shortRecipient).to.not.eq(ethers.constants.AddressZero);

      // ---------
      // Act & Assert: Check that contingent pool creation fails
      // ---------
      await expect(
        createContingentPool({
          ...createContingentPoolParams,
          longRecipient: zeroXLongRecipient
        })
      ).to.be.revertedWith("ERC20: mint to the zero address");
    });

    it("Reverts if shortRecipient is the zero address", async () => {
      // ---------
      // Arrange: Set shortRecipient to zero address
      // ---------
      const zeroXShortRecipient = ethers.constants.AddressZero;
      expect(createContingentPoolParams.longRecipient).to.not.eq(ethers.constants.AddressZero);

      // ---------
      // Act & Assert: Check that contingent pool creation fails
      // ---------
      await expect(
        createContingentPool({
          ...createContingentPoolParams,
          shortRecipient: zeroXShortRecipient
        })
      ).to.be.revertedWith("ERC20: mint to the zero address");
    });

    it("Reverts if collateral token implements a fee", async () => {
      // ---------
      // Act & Assert: Check that contingent pool creation fails
      // ---------
      await expect(
        createContingentPool({
          ...createContingentPoolParams,
          collateralToken: collateralTokenWithFeesInstance.address
        })
      ).to.be.revertedWith("FeeTokensNotSupported()");
    });

    it("`getPoolParametersByAddress` reverts default struct if an invalid position token address is provided", async () => {

      tx = await createContingentPool(createContingentPoolParams);

      poolId = await getPoolIdFromTx(tx);
      expect(poolId).to.not.eq(ethers.constants.HashZero);
      
      // Create a fake position token with an existing poolId
      const fakePositionTokenInstance = await fakePositionTokenDeployFixture(
        "L1",
        "L1",
        poolId,
        user1.address
      );

      // ---------
      // Act & Assert: Check that `getPoolParametersByAddress` returns the default struct
      // (checking that `collateralToken` address and `expiryTime` are equal to their default values)
      // ---------
      poolParams = await getterFacet.getPoolParametersByAddress(fakePositionTokenInstance.address);
      expect(poolParams.collateralToken).to.eq(ethers.constants.AddressZero);
      expect(poolParams.dataProvider).to.eq(ethers.constants.AddressZero);
      expect(poolParams.expiryTime).to.eq(0)
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
        decimals,
        "0"
      );
      await collateralTokenInstance
        .connect(user1)
        .approve(diamondAddress, userStartCollateralTokenBalance);

      permissionedERC721TokenInstance = await erc721DeployFixture(
        "PermissionedERC721Token",
        "PNFT"
      );
      await permissionedERC721TokenInstance.connect(user1).mint();
      await permissionedERC721TokenInstance.connect(user2).mint();

      // Specify the create contingent pool parameters. Refer to `utils/libDiva.ts` for default values.
      createContingentPoolParams = {
        ...defaultPoolParameters,
        collateralToken: collateralTokenInstance.address,
        dataProvider: oracle.address,
        poolCreater: user1,
        poolFacet: poolFacet,
        longRecipient: user1.address,
        shortRecipient: user2.address,
        expiryTime: await getExpiryTime(7200), // setting it manually here so that I can compare it later
        permissionedERC721Token: permissionedERC721TokenInstance.address
      }

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
        tx = await createContingentPool(createContingentPoolParams);

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
        await permissionedERC721TokenInstance.balanceOf(createContingentPoolParams.longRecipient)
      ).to.gt(0);
      expect(
        await permissionedERC721TokenInstance.balanceOf(createContingentPoolParams.shortRecipient)
      ).to.gt(0);
      govParams = await getterFacet.getGovernanceParameters();

      // ---------
      // Act: Should able to create contingent pool
      // ---------
      tx = await createContingentPool(createContingentPoolParams);

      // ---------
      // Assert: Check that pool parameters are correctly set
      // ---------
      currentBlockTimestamp = await getLastTimestamp();
      poolId = await getPoolIdFromTx(tx);
      poolParams = await getterFacet.getPoolParameters(poolId);
      shortTokenInstance = await permissionedPositionTokenAttachFixture(poolParams.shortToken);
      longTokenInstance = await permissionedPositionTokenAttachFixture(poolParams.longToken);
      currentNonce = await extractNumberFromString(await shortTokenInstance.name());

      // Manually calculate the expected poolId
      expectedPoolId = getPoolId(
        createContingentPoolParams.referenceAsset,
        createContingentPoolParams.expiryTime as BigNumberish,
        createContingentPoolParams.floor,
        createContingentPoolParams.inflection,
        createContingentPoolParams.cap,
        createContingentPoolParams.gradient,
        createContingentPoolParams.collateralAmount,
        createContingentPoolParams.collateralToken,
        createContingentPoolParams.dataProvider,
        createContingentPoolParams.capacity,
        createContingentPoolParams.longRecipient,
        createContingentPoolParams.shortRecipient,
        createContingentPoolParams.permissionedERC721Token,
        createContingentPoolParams.collateralAmount, // collateralAmountMsgSender
        "0", // collateralAmountMaker
        ethers.constants.AddressZero, // maker,
        user1.address, // msgSender
        currentNonce // nonce
      )

      expect(poolId).to.eq(expectedPoolId);
      expect(poolParams.referenceAsset).to.eq(createContingentPoolParams.referenceAsset);
      expect(poolParams.expiryTime).to.eq(createContingentPoolParams.expiryTime);
      expect(poolParams.floor).to.eq(createContingentPoolParams.floor);
      expect(poolParams.inflection).to.eq(createContingentPoolParams.inflection);
      expect(poolParams.cap).to.eq(createContingentPoolParams.cap);
      expect(poolParams.collateralToken).to.eq(createContingentPoolParams.collateralToken);
      expect(poolParams.gradient).to.eq(createContingentPoolParams.gradient);
      expect(poolParams.collateralBalance).to.eq(createContingentPoolParams.collateralAmount);
      expect(poolParams.shortToken).is.properAddress;
      expect(poolParams.longToken).is.properAddress;
      expect(poolParams.finalReferenceValue).to.eq(0);
      expect(poolParams.statusFinalReferenceValue).to.eq(0);
      expect(poolParams.payoutLong).to.eq(0);
      expect(poolParams.payoutShort).to.eq(0);
      expect(poolParams.statusTimestamp).to.eq(currentBlockTimestamp);
      expect(poolParams.dataProvider).to.eq(createContingentPoolParams.dataProvider);
      expect(poolParams.capacity).to.eq(createContingentPoolParams.capacity);

      // Confirm that the position tokens store the correct poolId
      expect(await shortTokenInstance.poolId()).to.eq(expectedPoolId);
      expect(await longTokenInstance.poolId()).to.eq(expectedPoolId);

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
        createContingentPoolParams.permissionedERC721Token
      );
      expect(await longTokenInstance.permissionedERC721Token()).to.eq(
        createContingentPoolParams.permissionedERC721Token
      );
    });

    it("Permissioned position token holder can transfer their position token to permissioned user", async () => {
      // ---------
      // Arrange: Check that user1 and user2 are permissioned user and get user balances of short and long tokens
      // ---------
      expect(
        await permissionedERC721TokenInstance.balanceOf(createContingentPoolParams.longRecipient)
      ).to.gt(0);
      expect(
        await permissionedERC721TokenInstance.balanceOf(createContingentPoolParams.shortRecipient)
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
      expect(poolIssuedEvent?.args?.longRecipient).to.eq(createContingentPoolParams.longRecipient);
      expect(poolIssuedEvent?.args?.shortRecipient).to.eq(createContingentPoolParams.shortRecipient);
      expect(poolIssuedEvent?.args?.collateralAmount).to.eq(createContingentPoolParams.collateralAmount);
      expect(poolIssuedEvent?.args?.permissionedERC721Token).to.eq(
        createContingentPoolParams.permissionedERC721Token
      );
    });

    // -------------------------------------------
    // Reverts
    // -------------------------------------------

    it("Reverts if pool is created with non-permissioned short recipient", async () => {
      // ---------
      // Arrange: Set invalid short recipient (accounts[0] who doesn't hold any permissioned ERC721 tokens)
      // ---------
      const nonEligibleShortRecipient = accounts[0].address;
      expect(
        await permissionedERC721TokenInstance.balanceOf(nonEligibleShortRecipient)
      ).to.eq(0);

      // ---------
      // Act & Assert: Check that contingent pool creation fails
      // ---------
      await expect(
        createContingentPool({
          ...createContingentPoolParams,
          shortRecipient: nonEligibleShortRecipient
        })
      ).to.be.revertedWith("PositionToken: invalid recipient");
    });

    it("Reverts if pool is created with non-permissioned long recipient", async () => {
      // ---------
      // Arrange: Set non-eligible long recipient (accounts[0] who doesn't hold any permissioned ERC721 tokens)
      // ---------
      const nonEligibleLongRecipient = accounts[0].address;
      expect(
        await permissionedERC721TokenInstance.balanceOf(nonEligibleLongRecipient)
      ).to.eq(0);

      // ---------
      // Act & Assert: Check that contingent pool creation fails
      // ---------
      await expect(
        createContingentPool({
          ...createContingentPoolParams,
          longRecipient: nonEligibleLongRecipient
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
        decimals,
        "0"
      );
      await collateralTokenInstance
        .connect(user1)
        .approve(diamondAddress, userStartCollateralTokenBalance);

      // Specify the create contingent pool parameters for pool 1
      createContingentPoolParams = {
        ...defaultPoolParameters,
        expiryTime: await getExpiryTime(7200), // setting it manually here so that I can compare it later
        collateralToken: collateralTokenInstance.address,
        dataProvider: oracle.address,
        poolCreater: user1,
        poolFacet: poolFacet,
        longRecipient: user1.address,
        shortRecipient: user2.address,
      }

      // Specify the create contingent pool parameters for pool 2
      createContingentPoolParams2 = {
        ...defaultPoolParameters,
        referenceAsset: "ETH/USD",
        expiryTime: await getExpiryTime(7300),
        floor: parseUnits("1298.53"),
        inflection: parseUnits("1705.33"),
        cap: parseUnits("2101.17"),
        gradient: parseUnits("0.43", decimals),
        collateralAmount: parseUnits("16001.358", decimals),
        permissionedERC721Token: ethers.constants.AddressZero,
        collateralToken: collateralTokenInstance.address,
        dataProvider: oracle.address,
        poolCreater: user1,
        poolFacet: poolFacet,
        longRecipient: user1.address,
        shortRecipient: user2.address        
      }

      // ---------
      // Act: Create contingent pools with parameters
      // ---------
      tx = await poolFacet.connect(user1).batchCreateContingentPool([
        createContingentPoolParams as LibDIVA.PoolParamsStruct,
        createContingentPoolParams2 as LibDIVA.PoolParamsStruct,
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
      expect(poolParams1.referenceAsset).to.eq(createContingentPoolParams.referenceAsset);
      expect(poolParams1.expiryTime).to.eq(createContingentPoolParams.expiryTime);
      expect(poolParams1.floor).to.eq(createContingentPoolParams.floor);
      expect(poolParams1.inflection).to.eq(createContingentPoolParams.inflection);
      expect(poolParams1.cap).to.eq(createContingentPoolParams.cap);
      expect(poolParams1.collateralToken).to.eq(createContingentPoolParams.collateralToken);
      expect(poolParams1.gradient).to.eq(createContingentPoolParams.gradient);
      expect(poolParams1.collateralBalance).to.eq(createContingentPoolParams.collateralAmount);
      expect(poolParams1.shortToken).is.properAddress;
      expect(poolParams1.longToken).is.properAddress;
      expect(poolParams1.finalReferenceValue).to.eq(0);
      expect(poolParams1.statusFinalReferenceValue).to.eq(0);
      expect(poolParams1.payoutLong).to.eq(0);
      expect(poolParams1.payoutShort).to.eq(0);
      expect(poolParams1.statusTimestamp).to.eq(currentBlockTimestamp);
      expect(poolParams1.dataProvider).to.eq(createContingentPoolParams.dataProvider);
      expect(poolParams1.capacity).to.eq(createContingentPoolParams.capacity);

      const poolParams2 = await getterFacet.getPoolParameters(poolId2);
      expect(poolParams2.referenceAsset).to.eq(createContingentPoolParams2.referenceAsset);
      expect(poolParams2.expiryTime).to.eq(createContingentPoolParams2.expiryTime);
      expect(poolParams2.floor).to.eq(createContingentPoolParams2.floor);
      expect(poolParams2.inflection).to.eq(createContingentPoolParams2.inflection);
      expect(poolParams2.cap).to.eq(createContingentPoolParams2.cap);
      expect(poolParams2.collateralToken).to.eq(createContingentPoolParams2.collateralToken);
      expect(poolParams2.gradient).to.eq(createContingentPoolParams2.gradient);
      expect(poolParams2.collateralBalance).to.eq(createContingentPoolParams2.collateralAmount);
      expect(poolParams2.shortToken).is.properAddress;
      expect(poolParams2.longToken).is.properAddress;
      expect(poolParams2.finalReferenceValue).to.eq(0);
      expect(poolParams2.statusFinalReferenceValue).to.eq(0);
      expect(poolParams2.payoutLong).to.eq(0);
      expect(poolParams2.payoutShort).to.eq(0);
      expect(poolParams2.statusTimestamp).to.eq(currentBlockTimestamp);
      expect(poolParams2.dataProvider).to.eq(createContingentPoolParams2.dataProvider);
      expect(poolParams2.capacity).to.eq(createContingentPoolParams2.capacity);
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
