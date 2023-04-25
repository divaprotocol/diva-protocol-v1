import { use, expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { solidity } from "ethereum-waffle";
import { parseUnits } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
  EIP712CreateFacet,
  EIP712AddFacet,
  EIP712CancelFacet,
  PoolFacet,
  GetterFacet,
  MockERC20,
  EIP712RemoveFacet,
} from "../typechain-types";
import { LibDIVAStorage } from "../typechain-types/contracts/facets/GetterFacet";

import {
  OfferCreateContingentPool,
  OfferAddLiquidity,
  OfferRemoveLiquidity,
  Signature,
  DivaDomain,
  OfferInfo,
  PoolParams,
  GovParams,
  OfferStatus,
  ADD_LIQUIDITY_TYPE,
  CREATE_POOL_TYPE,
  REMOVE_LIQUIDITY_TYPE,
  ONE_DAY,
} from "../constants";
import { getExpiryTime, getLastTimestamp } from "../utils";
import {
  calcFee,
  calcNewCollateralBalance,
  calcPoolFillAmount,
  calcMakerFillAmount,
  calcFillableRemainingAmount,
  generateSignatureAndTypedMessageHash,
  generateCreateContingentPoolOfferDetails,
  generateRemoveLiquidityOfferDetails,
  generateAddLiquidityOfferDetails,
  mineBlock,
  setNextTimestamp,
} from "../utils";
import { deployMain } from "../scripts/deployMain";

import { erc20DeployFixture, erc20AttachFixture } from "./fixtures";

use(solidity);

const collateralTokenDecimals = 18;

describe("EIP712", async function () {
  let user1: SignerWithAddress,
    user2: SignerWithAddress,
    user3: SignerWithAddress,
    oracle: SignerWithAddress,
    treasury: SignerWithAddress;

  let diamondAddress: string;
  let eip712CreateFacet: EIP712CreateFacet,
    eip712RemoveFacet: EIP712RemoveFacet,
    eip712AddFacet: EIP712AddFacet,
    eip712CancelFacet: EIP712CancelFacet,
    poolFacet: PoolFacet,
    getterFacet: GetterFacet;

  let collateralToken: MockERC20;

  let chainId: number;
  let divaDomain: DivaDomain;
  let signature: Signature;
  let typedMessageHash: string;

  let takerFillAmount: string;
  let makerFillAmount: string;
  let poolFillAmount: string;
  let expectedCollateralBalance: string;
  let positionTokenFillAmount: string;

  let shortTokenInstance: MockERC20;
  let longTokenInstance: MockERC20;

  let balanceOfCollateralTokenBeforeUser1: BigNumber;
  let balanceOfCollateralTokenBeforeUser2: BigNumber;
  let balanceOfCollateralTokenBeforeDiva: BigNumber;

  let balanceOfLongTokenBeforeUser1: BigNumber;
  let balanceOfShortTokenBeforeUser2: BigNumber;

  let poolId: BigNumber;
  let poolParams: LibDIVAStorage.PoolStructOutput;

  let createPoolParams: PoolParams;
  let offerCreateContingentPool: OfferCreateContingentPool;
  let offerAddLiquidity: OfferAddLiquidity;
  let offerRemoveLiquidity: OfferRemoveLiquidity;

  let govParams: GovParams;
  let poolFees: LibDIVAStorage.FeesStructOutput;
  let poolSettlementPeriods: LibDIVAStorage.SettlementPeriodsStructOutput;

  before(async () => {
    // Get signers
    [, treasury, oracle, user1, user2, user3] = await ethers.getSigners();
    console.log("Address user1: " + user1.address);
    console.log("Address user2: " + user2.address);

    // ---------
    // Setup: Deploy diamond contract (incl. facets) and connect to the diamond contract via facet specific ABI's
    // ---------
    diamondAddress = (await deployMain())[0];
    eip712CreateFacet = await ethers.getContractAt(
      "EIP712CreateFacet",
      diamondAddress
    );
    eip712AddFacet = await ethers.getContractAt(
      "EIP712AddFacet",
      diamondAddress
    );
    eip712RemoveFacet = await ethers.getContractAt(
      "EIP712RemoveFacet",
      diamondAddress
    );
    eip712CancelFacet = await ethers.getContractAt(
      "EIP712CancelFacet",
      diamondAddress
    );
    poolFacet = await ethers.getContractAt("PoolFacet", diamondAddress);
    getterFacet = await ethers.getContractAt("GetterFacet", diamondAddress);

    // Get chainId
    chainId = (await getterFacet.getChainId()).toNumber();

    // Define DIVA Domain struct
    divaDomain = {
      name: "DIVA Protocol",
      version: "1",
      chainId,
      verifyingContract: diamondAddress,
    };
  });

  beforeEach(async () => {
    // Deploy mock collateral token and mint collateral token to user1
    collateralToken = await erc20DeployFixture(
      "Test Token",
      "TTT",
      parseUnits("100000", collateralTokenDecimals),
      user1.address,
      collateralTokenDecimals
    );

    // Transfer collateral token from user1 to user2
    await collateralToken
      .connect(user1)
      .transfer(user2.address, parseUnits("50000", collateralTokenDecimals));

    // Approve collateral token to DIVA contract (Diamond) for user1 and user2
    await collateralToken
      .connect(user1)
      .approve(diamondAddress, parseUnits("50000", collateralTokenDecimals));
    await collateralToken
      .connect(user2)
      .approve(diamondAddress, parseUnits("50000", collateralTokenDecimals));

    // Define parameters for createContingentPool function (used in some of the tests directly)
    createPoolParams = {
      referenceAsset: "BTC/USD",
      expiryTime: await getExpiryTime(7200),
      floor: parseUnits("40000").toString(),
      inflection: parseUnits("60000").toString(),
      cap: parseUnits("80000").toString(),
      gradient: parseUnits("0.7", collateralTokenDecimals).toString(),
      collateralAmount: parseUnits("100", collateralTokenDecimals).toString(),
      collateralToken: collateralToken.address,
      dataProvider: oracle.address,
      capacity: ethers.constants.MaxUint256.toString(),
      longRecipient: user1.address,
      shortRecipient: user2.address,
      permissionedERC721Token: ethers.constants.AddressZero,
    };
  });

  describe("fillOfferCreateContingentPool", async function () {
    describe("fillOfferCreateContingentPool with non-zero taker address and makerIsLong as true", async function () {
      beforeEach(async () => {
        // Generate offerCreateContingentPool with user1 (maker) taking the long side and user2 (taker) the short side
        offerCreateContingentPool =
          await generateCreateContingentPoolOfferDetails({
            maker: user1.address.toString(), // maker
            taker: user2.address.toString(), // taker
            makerIsLong: true, // makerIsLong
            dataProvider: oracle.address,
            collateralToken: collateralToken.address.toString(),
            collateralTokenDecimals,
          });

        // Generate signature and typed message hash
        [signature, typedMessageHash] =
          await generateSignatureAndTypedMessageHash(
            user1,
            divaDomain,
            CREATE_POOL_TYPE,
            offerCreateContingentPool,
            "OfferCreateContingentPool"
          );
      });

      it("Should fully fill a create contingent pool offer and update the relevant parameters", async function () {
        // ---------
        // Arrange: Set takerFillAmount equal to takerCollateralAmount and get balance of collateral token for both users before creating the pool
        // ---------
        govParams = await getterFacet.getGovernanceParameters();

        // Set takerFillAmount = takerCollateralAmount in offer
        takerFillAmount = offerCreateContingentPool.takerCollateralAmount;

        // Calculate makerFillAmount and poolFillAmount
        makerFillAmount = calcMakerFillAmount(
          takerFillAmount,
          offerCreateContingentPool.makerCollateralAmount,
          offerCreateContingentPool.takerCollateralAmount
        );
        poolFillAmount = calcPoolFillAmount(takerFillAmount, makerFillAmount);

        // Get balance of collateral token for both users before fill offer
        balanceOfCollateralTokenBeforeUser1 = await collateralToken.balanceOf(
          user1.address
        );
        balanceOfCollateralTokenBeforeUser2 = await collateralToken.balanceOf(
          user2.address
        );

        // Get balance of collateral token for DIVA Protocol before fill offer
        balanceOfCollateralTokenBeforeDiva = await collateralToken.balanceOf(
          diamondAddress
        );

        // Check relevant eip712 related parameters before the offer is being filled
        const relevantStateParamsBefore =
          await getterFacet.getOfferRelevantStateCreateContingentPool(
            offerCreateContingentPool,
            signature
          );
        const poolIdByHashBefore =
          await getterFacet.getPoolIdByTypedCreateOfferHash(
            relevantStateParamsBefore.offerInfo.typedOfferHash
          );

        expect(relevantStateParamsBefore.offerInfo.typedOfferHash).to.eq(
          typedMessageHash
        );
        expect(relevantStateParamsBefore.offerInfo.status).to.eq(
          OfferStatus.Fillable
        );
        expect(relevantStateParamsBefore.offerInfo.takerFilledAmount).to.eq(0);
        expect(poolIdByHashBefore).to.eq(0);

        // ---------
        // Act: User2 fills create contingent pool offer
        // ---------
        const tx = await eip712CreateFacet
          .connect(user2)
          .fillOfferCreateContingentPool(
            offerCreateContingentPool,
            signature,
            takerFillAmount
          );
        const receipt = await tx.wait();
        console.log("Gas used for fillOfferCreateContingentPool function:");
        console.log(receipt.gasUsed.toString());
        const lastBlockTimestamp = await getLastTimestamp();

        // ---------
        // Assert: Confirm that relevant parameters are updated correctly and the
        // user's and DIVA Protocol's collateral/position token balances are as expected
        // ---------

        // Get poolId of the newly created pool with typedMessageHash value
        poolId = await getterFacet.getPoolIdByTypedCreateOfferHash(
          typedMessageHash
        );

        // Get pool parameters of newly created pool
        poolParams = await getterFacet.getPoolParameters(poolId);

        // Get instances of short and long token
        shortTokenInstance = await erc20AttachFixture(poolParams.shortToken);
        longTokenInstance = await erc20AttachFixture(poolParams.longToken);

        // Confirm pool params are set correctly
        expect(poolParams.referenceAsset).to.eq(
          offerCreateContingentPool.referenceAsset
        );
        expect(poolParams.expiryTime).to.eq(
          offerCreateContingentPool.expiryTime
        );
        expect(poolParams.floor).to.eq(offerCreateContingentPool.floor);
        expect(poolParams.inflection).to.eq(
          offerCreateContingentPool.inflection
        );
        expect(poolParams.cap).to.eq(offerCreateContingentPool.cap);
        expect(poolParams.gradient).to.eq(offerCreateContingentPool.gradient);
        expect(poolParams.collateralToken).to.eq(
          offerCreateContingentPool.collateralToken
        );
        expect(poolParams.dataProvider).to.eq(
          offerCreateContingentPool.dataProvider
        );
        expect(poolParams.capacity).to.eq(offerCreateContingentPool.capacity);

        // Check that the pool has the correct fees set
        poolFees = await getterFacet.getFees(poolParams.indexFees);
        expect(poolFees.protocolFee).to.eq(govParams.currentFees.protocolFee);
        expect(poolFees.settlementFee).to.eq(
          govParams.currentFees.settlementFee
        );

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

        // Confirm that collateralBalance has increased to poolFillAmount
        expect(poolParams.collateralBalance).to.eq(poolFillAmount);

        // Confirm that takerFilledAmount for the corresponding offer has increased
        expect(await getterFacet.getTakerFilledAmount(typedMessageHash)).to.eq(
          takerFillAmount
        );

        // Confirm that total supply of both short and long tokens has increased
        expect(await shortTokenInstance.totalSupply()).to.eq(
          poolParams.collateralBalance
        );
        expect(await longTokenInstance.totalSupply()).to.eq(
          poolParams.collateralBalance
        );

        // Confirm that users received the right amounts of both short and long tokens.
        // If makerIsLong is true, confirm user1 received the right amount of long
        // and user2 the right amount of short position tokens.
        expect(await longTokenInstance.balanceOf(user1.address)).to.eq(
          poolFillAmount
        );
        expect(await shortTokenInstance.balanceOf(user2.address)).to.eq(
          poolFillAmount
        );

        // Confirm that the collateral token balance for both users has reduced
        expect(await collateralToken.balanceOf(user1.address)).to.eq(
          balanceOfCollateralTokenBeforeUser1.sub(makerFillAmount)
        );
        expect(await collateralToken.balanceOf(user2.address)).to.eq(
          balanceOfCollateralTokenBeforeUser2.sub(takerFillAmount)
        );

        // Confirm that DIVA Protocol's collateral token balance has increased
        expect(await collateralToken.balanceOf(diamondAddress)).to.eq(
          balanceOfCollateralTokenBeforeDiva.add(poolFillAmount)
        );

        // Confirm that the relevant eip712 related parameters have been updated
        const relevantStateParamsAfter =
          await getterFacet.getOfferRelevantStateCreateContingentPool(
            offerCreateContingentPool,
            signature
          );
        const poolIdByHashAfter =
          await getterFacet.getPoolIdByTypedCreateOfferHash(
            relevantStateParamsAfter.offerInfo.typedOfferHash
          );

        expect(relevantStateParamsAfter.offerInfo.typedOfferHash).to.eq(
          typedMessageHash
        );
        expect(relevantStateParamsAfter.offerInfo.status).to.eq(
          OfferStatus.Filled
        );
        expect(relevantStateParamsAfter.offerInfo.takerFilledAmount).to.eq(
          takerFillAmount
        );
        expect(poolId).to.eq(poolIdByHashAfter);
      });

      it("Should fill a create contingent pool offer in two steps", async function () {
        // ---------
        // Arrange: Simulate a partial fill of a create contingent pool offer
        // ---------

        // Set takerFillAmountFirstFill < takerCollateralAmount to simulate a partial fill of a create contingent pool offer
        const takerFillAmountFirstFill = parseUnits(
          "60",
          collateralTokenDecimals
        ).toString();
        expect(BigNumber.from(takerFillAmountFirstFill)).to.be.lt(
          BigNumber.from(offerCreateContingentPool.takerCollateralAmount)
        );

        // Fill create contingent pool offer with user2 address (taker in underlying offer)
        await eip712CreateFacet
          .connect(user2)
          .fillOfferCreateContingentPool(
            offerCreateContingentPool,
            signature,
            takerFillAmountFirstFill
          );

        // Get poolId of the newly created pool with typedMessageHash value
        poolId = await getterFacet.getPoolIdByTypedCreateOfferHash(
          typedMessageHash
        );

        // Get pool parameters of newly created pool before adding liquidity via a second fill
        poolParams = await getterFacet.getPoolParameters(poolId);

        // Get instances of short and long token
        shortTokenInstance = await erc20AttachFixture(poolParams.shortToken);
        longTokenInstance = await erc20AttachFixture(poolParams.longToken);

        // Get balance of collateral token for both users before adding liquidity via a second fill
        balanceOfCollateralTokenBeforeUser1 = await collateralToken.balanceOf(
          user1.address
        );
        balanceOfCollateralTokenBeforeUser2 = await collateralToken.balanceOf(
          user2.address
        );

        // Get balance of collateral token for DIVA Protocol before adding liquidity via a second fill
        balanceOfCollateralTokenBeforeDiva = await collateralToken.balanceOf(
          diamondAddress
        );

        // Get balance of short and long position tokens for user1 and user2 adding liquidity via a second fill
        balanceOfShortTokenBeforeUser2 = await shortTokenInstance.balanceOf(
          user2.address
        );
        balanceOfLongTokenBeforeUser1 = await longTokenInstance.balanceOf(
          user1.address
        );

        // Confirm that the relevant eip712 related parameters are as expected after first fill
        const relevantStateParamsAfterFirstFill =
          await getterFacet.getOfferRelevantStateCreateContingentPool(
            offerCreateContingentPool,
            signature
          );
        expect(relevantStateParamsAfterFirstFill.offerInfo.status).to.eq(4); // FILLABLE
        expect(
          relevantStateParamsAfterFirstFill.offerInfo.takerFilledAmount
        ).to.eq(takerFillAmountFirstFill);

        // Set takerFillAmountSecondFill equal to remaining takerFillAmount
        const takerFillAmountSecondFill = calcFillableRemainingAmount(
          offerCreateContingentPool.takerCollateralAmount,
          (await getterFacet.getTakerFilledAmount(typedMessageHash)).toString()
        );

        // Calculate makerFillAmount, poolFillAmount and expected new collateral balance of the pool
        makerFillAmount = calcMakerFillAmount(
          takerFillAmountSecondFill,
          offerCreateContingentPool.makerCollateralAmount,
          offerCreateContingentPool.takerCollateralAmount
        );
        poolFillAmount = calcPoolFillAmount(
          takerFillAmountSecondFill,
          makerFillAmount
        );
        expectedCollateralBalance = calcNewCollateralBalance(
          poolFillAmount,
          poolParams.collateralBalance.toString()
        );

        // ---------
        // Act: User2 calls `fillOfferCreateContingentPool` again with remaining takerCollateralAmount as takerFillAmount
        // ---------
        await eip712CreateFacet
          .connect(user2)
          .fillOfferCreateContingentPool(
            offerCreateContingentPool,
            signature,
            takerFillAmountSecondFill
          );

        // ---------
        // Assert: Confirm that relevant parameters are updated correctly and the
        // user's and DIVA Protocol's collateral/position token balances are as expected
        // ---------

        // Get pool parameters after second fill is executed
        poolParams = await getterFacet.getPoolParameters(poolId);

        // Confirm that collateralBalance has increased to expectedCollateralBalance
        expect(poolParams.collateralBalance).to.eq(expectedCollateralBalance);

        // Confirm that takerFilledAmount has increased
        expect(await getterFacet.getTakerFilledAmount(typedMessageHash)).to.eq(
          offerCreateContingentPool.takerCollateralAmount
        );

        // Confirm that total supply of both short and long tokens has increased
        expect(await shortTokenInstance.totalSupply()).to.eq(
          poolParams.collateralBalance
        );
        expect(await longTokenInstance.totalSupply()).to.eq(
          poolParams.collateralBalance
        );

        // Confirm that users received the right amounts of both short and long tokens.
        // If makerIsLong is true, confirm user1 received the right amounts of long
        // and user2 the right amount of short position tokens.
        expect(await longTokenInstance.balanceOf(user1.address)).to.eq(
          balanceOfLongTokenBeforeUser1.add(poolFillAmount)
        );
        expect(await shortTokenInstance.balanceOf(user2.address)).to.eq(
          balanceOfShortTokenBeforeUser2.add(poolFillAmount)
        );

        // Confirm that the collateral token balance for both users has reduced
        expect(await collateralToken.balanceOf(user1.address)).to.eq(
          balanceOfCollateralTokenBeforeUser1.sub(makerFillAmount)
        );
        expect(await collateralToken.balanceOf(user2.address)).to.eq(
          balanceOfCollateralTokenBeforeUser2.sub(takerFillAmountSecondFill)
        );

        // Confirm that DIVA Protocol's collateral token balance has increased
        expect(await collateralToken.balanceOf(diamondAddress)).to.eq(
          balanceOfCollateralTokenBeforeDiva.add(poolFillAmount)
        );

        // Confirm that the relevant eip712 related parameters are as expected after first fill
        const relevantStateParamsAfterSecondFill =
          await getterFacet.getOfferRelevantStateCreateContingentPool(
            offerCreateContingentPool,
            signature
          );
        expect(relevantStateParamsAfterSecondFill.offerInfo.status).to.eq(
          OfferStatus.Filled
        );
        expect(
          relevantStateParamsAfterSecondFill.offerInfo.takerFilledAmount
        ).to.eq(
          BigNumber.from(takerFillAmountFirstFill).add(
            takerFillAmountSecondFill
          )
        );
      });

      it("Should fill a create contingent pool offer with minimumTakerFillAmount", async () => {
        // ---------
        // Arrange: Set takerFillAmount equal to minimumTakerFillAmount
        // ---------
        takerFillAmount = offerCreateContingentPool.minimumTakerFillAmount;

        // Check relevant eip712 related parameters before the offer is being filled
        const relevantStateParamsBefore =
          await getterFacet.getOfferRelevantStateCreateContingentPool(
            offerCreateContingentPool,
            signature
          );
        expect(relevantStateParamsBefore.offerInfo.status).to.eq(
          OfferStatus.Fillable
        );
        expect(relevantStateParamsBefore.offerInfo.takerFilledAmount).to.eq(0);

        // ---------
        // Act: Fill create contingent pool offer
        // ---------
        await eip712CreateFacet
          .connect(user2)
          .fillOfferCreateContingentPool(
            offerCreateContingentPool,
            signature,
            takerFillAmount
          );

        // ---------
        // Assert: Confirm that the status remains fillable and takerFilledAmount increased
        // ---------

        // Confirm that status and takerFilledAmount are correct
        const relevantStateParamsAfter =
          await getterFacet.getOfferRelevantStateCreateContingentPool(
            offerCreateContingentPool,
            signature
          );
        expect(relevantStateParamsAfter.offerInfo.status).to.eq(
          OfferStatus.Fillable
        );
        expect(relevantStateParamsAfter.offerInfo.takerFilledAmount).to.eq(
          takerFillAmount
        );
      });

      it("Should fill a create contingent pool offer with an amount smaller than minimumTakerFillAmount on second fill", async () => {
        // ---------
        // Arrange: Fill an offer partially with minimum taker amount
        // ---------
        // Set takerFillAmountFirstFill < takerCollateralAmount to simulate a partial fill of a create contingent pool offer
        const takerFillAmountFirstFill = BigNumber.from(
          offerCreateContingentPool.minimumTakerFillAmount
        );
        expect(takerFillAmountFirstFill).to.be.lt(
          BigNumber.from(offerCreateContingentPool.takerCollateralAmount)
        );
        expect(takerFillAmountFirstFill).to.be.gt(0);

        // Fill create contingent pool offer with user2 address (taker in underlying offer)
        await eip712CreateFacet
          .connect(user2)
          .fillOfferCreateContingentPool(
            offerCreateContingentPool,
            signature,
            takerFillAmountFirstFill
          );

        // ---------
        // Act: Fill offer a second time with takerFillAmount smaller than minimum taker amount
        // ---------
        const takerFillAmountSecondFill = BigNumber.from(1);
        await eip712CreateFacet
          .connect(user2)
          .fillOfferCreateContingentPool(
            offerCreateContingentPool,
            signature,
            takerFillAmountSecondFill
          );

        // ---------
        // Assert: Confirm that takerFilledAmount increased
        // ---------
        const relevantStateParams =
          await getterFacet.getOfferRelevantStateCreateContingentPool(
            offerCreateContingentPool,
            signature
          );
        expect(relevantStateParams.offerInfo.takerFilledAmount).to.eq(
          takerFillAmountFirstFill.add(takerFillAmountSecondFill)
        );
      });

      it("Should fill a create contingent pool offer with long referenceAsset", async function () {
        // ---------
        // Arrange: Set takerFillAmount equal to takerCollateralAmount and set referenceAsset as over 32 bytes
        // ---------

        // Set takerFillAmount = takerCollateralAmount in offer
        takerFillAmount = offerCreateContingentPool.takerCollateralAmount;

        // Set referenceAsset
        offerCreateContingentPool.referenceAsset =
          "Test-For-Long-Reference-Asset-Should-Be-Bigger-Than-32-Bytes";
        // Confirm that the length of referenceAsset is larger than 32
        expect(offerCreateContingentPool.referenceAsset.length).to.be.gt(32);

        // Generate new signature with new offerCreateContingentPool
        const [signature] = await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          CREATE_POOL_TYPE,
          offerCreateContingentPool,
          "OfferCreateContingentPool"
        );

        // ---------
        // Act: User2 fills create contingent pool offer
        // ---------
        await eip712CreateFacet
          .connect(user2)
          .fillOfferCreateContingentPool(
            offerCreateContingentPool,
            signature,
            takerFillAmount
          );

        // ---------
        // Assert: Confirm that offer is filled successfully
        // ---------
        const relevantStateParams =
          await getterFacet.getOfferRelevantStateCreateContingentPool(
            offerCreateContingentPool,
            signature
          );
        expect(relevantStateParams.offerInfo.status).to.eq(OfferStatus.Filled);
        expect(relevantStateParams.offerInfo.takerFilledAmount).to.eq(
          takerFillAmount
        );
      });

      // -------------------------------------------
      // Reverts
      // -------------------------------------------

      it("Reverts if takerFillAmount is smaller than minimumTakerFillAmount on first fill", async () => {
        // ---------
        // Arrange: Set takerFillAmount smaller than the minimum taker fill amount
        // ---------
        takerFillAmount = BigNumber.from(
          offerCreateContingentPool.minimumTakerFillAmount
        )
          .sub(1)
          .toString();

        // ---------
        // Act & Assert: Check that `fillOfferCreateContingentPool` fails
        // ---------
        await expect(
          eip712CreateFacet
            .connect(user2)
            .fillOfferCreateContingentPool(
              offerCreateContingentPool,
              signature,
              takerFillAmount
            )
        ).to.be.revertedWith("TakerFillAmountSmallerMinimum()");
      });

      it("Reverts if takerFillAmount exceeds takerCollateralAmount", async () => {
        // ---------
        // Arrange: Set takerFillAmount higher than taker collateral amount
        // ---------
        takerFillAmount = BigNumber.from(
          offerCreateContingentPool.takerCollateralAmount
        )
          .add(1)
          .toString();

        // ---------
        // Act & Assert: Check that `fillOfferCreateContingentPool` fails
        // ---------
        await expect(
          eip712CreateFacet
            .connect(user2)
            .fillOfferCreateContingentPool(
              offerCreateContingentPool,
              signature,
              takerFillAmount
            )
        ).to.be.revertedWith("TakerFillAmountExceedsFillableAmount()");
      });

      it("Reverts if takerFillAmount exceeds remaining fillable taker amount on second fill", async () => {
        // ---------
        // Arrange: Simulate a partial fill and set the next takerFillAmount higher than remaining taker fill amount
        // ---------

        // Set takerFillAmount < takerCollateralAmount to simulate a partial fill of a create contingent pool offer
        takerFillAmount = offerCreateContingentPool.minimumTakerFillAmount;
        expect(BigNumber.from(takerFillAmount)).to.be.lt(
          BigNumber.from(offerCreateContingentPool.takerCollateralAmount)
        );

        // Fill create contingent pool offer with user2 address (taker)
        await eip712CreateFacet
          .connect(user2)
          .fillOfferCreateContingentPool(
            offerCreateContingentPool,
            signature,
            takerFillAmount
          );

        // Set takerFillAmount higher than remaining takerFillAmount before add more liquidity
        const remainingTakerFillAmount = calcFillableRemainingAmount(
          offerCreateContingentPool.takerCollateralAmount,
          (await getterFacet.getTakerFilledAmount(typedMessageHash)).toString()
        );
        takerFillAmount = BigNumber.from(remainingTakerFillAmount)
          .add(1)
          .toString();

        // ---------
        // Act & Assert: Check that `fillOfferCreateContingentPool` fails
        // ---------
        await expect(
          eip712CreateFacet
            .connect(user2)
            .fillOfferCreateContingentPool(
              offerCreateContingentPool,
              signature,
              takerFillAmount
            )
        ).to.be.revertedWith("TakerFillAmountExceedsFillableAmount()");
      });

      it("Reverts if offer taker is not equal to offerTaker from offerCreateContingentPool", async () => {
        // ---------
        // Act & Assert: Check that `fillOfferCreateContingentPool` fails with user3
        // ---------
        await expect(
          eip712CreateFacet
            .connect(user3)
            .fillOfferCreateContingentPool(
              offerCreateContingentPool,
              signature,
              offerCreateContingentPool.takerCollateralAmount
            )
        ).to.be.revertedWith("UnauthorizedTaker()");
      });

      it("Reverts if passed invalid offerCreateContingentPool (different reference asset)", async () => {
        // ---------
        // Arrange: Change the referenceAsset in offerCreateContingentPool which will render the offer to no longer match the signed message
        // ---------

        // Change the referenceAsset in offerCreateContingentPool
        offerCreateContingentPool.referenceAsset = "BUSD";

        // Generate new signature with new offerCreateContingentPool
        const [newSignature] = await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          CREATE_POOL_TYPE,
          offerCreateContingentPool,
          "OfferCreateContingentPool"
        );

        // Compare signatures
        expect(newSignature).to.not.eq(signature);

        // ---------
        // Act & Assert: Check that `fillOfferCreateContingentPool` fails
        // ---------
        await expect(
          eip712CreateFacet
            .connect(user2)
            .fillOfferCreateContingentPool(
              offerCreateContingentPool,
              signature,
              offerCreateContingentPool.takerCollateralAmount
            )
        ).to.be.revertedWith("InvalidSignature()");
      });

      it("Reverts if passed invalid signature (wrong 'v' value)", async () => {
        // ---------
        // Arrange: Set v of signature to non-27
        // ---------
        signature.v = 26;

        // ---------
        // Act & Assert: Check that `fillOfferCreateContingentPool` fails
        // ---------
        await expect(
          eip712CreateFacet
            .connect(user2)
            .fillOfferCreateContingentPool(
              offerCreateContingentPool,
              signature,
              offerCreateContingentPool.takerCollateralAmount
            )
        ).to.be.revertedWith("ECDSA: invalid signature");
      });

      it("Reverts if offerExpiry has passed (offer status = EXPIRED)", async () => {
        // ---------
        // Arrange: Set next block's timestamp after offerExpiry time
        // ---------
        await setNextTimestamp(
          ethers.provider,
          Number(offerCreateContingentPool.offerExpiry) + 1
        );

        // ---------
        // Act & Assert: Check that `fillOfferCreateContingentPool` fails
        // ---------
        await expect(
          eip712CreateFacet
            .connect(user2)
            .fillOfferCreateContingentPool(
              offerCreateContingentPool,
              signature,
              offerCreateContingentPool.takerCollateralAmount
            )
        ).to.be.revertedWith("OfferInvalidCancelledFilledOrExpired()");
      });

      it("Reverts if takerCollateralAmount = 0 (offer status = INVALID)", async () => {
        // ---------
        // Arrange: Set takerCollateralAmount = 0 in offerCreateContingentPool which will render the offer invalid
        // ---------

        // Set takerCollateralAmount = 0 in offerCreateContingentPool
        offerCreateContingentPool.takerCollateralAmount = "0";

        // Generate new signature with new offerCreateContingentPool
        const [signature] = await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          CREATE_POOL_TYPE,
          offerCreateContingentPool,
          "OfferCreateContingentPool"
        );

        // ---------
        // Act & Assert: Check that `fillOfferCreateContingentPool` fails
        // ---------
        await expect(
          eip712CreateFacet
            .connect(user2)
            .fillOfferCreateContingentPool(
              offerCreateContingentPool,
              signature,
              offerCreateContingentPool.takerCollateralAmount
            )
        ).to.be.revertedWith("OfferInvalidCancelledFilledOrExpired()");
      });

      it("Reverts if user tries to fill an already cancelled offer (offer status = CANCELLED)", async () => {
        // ---------
        // Arrange: Cancel create pool offer
        // ---------
        await eip712CancelFacet
          .connect(user1)
          .cancelOfferCreateContingentPool(offerCreateContingentPool);

        // ---------
        // Act & Assert: Check that `fillOfferCreateContingentPool` fails
        // ---------
        await expect(
          eip712CreateFacet
            .connect(user2)
            .fillOfferCreateContingentPool(
              offerCreateContingentPool,
              signature,
              offerCreateContingentPool.takerCollateralAmount
            )
        ).to.be.revertedWith("OfferInvalidCancelledFilledOrExpired()");
      });

      it("Reverts if user tries to fill an already filled offer (offer status = FILLED)", async () => {
        // ---------
        // Arrange: Simulate a full fill and set the next takerFillAmount to 1
        // ---------

        // Set takerFillAmount equal to takerCollateralAmount to simulate a full fill of a create contingent pool offer
        takerFillAmount = offerCreateContingentPool.takerCollateralAmount;

        // Fill create contingent pool offer with user2 address (taker)
        await eip712CreateFacet
          .connect(user2)
          .fillOfferCreateContingentPool(
            offerCreateContingentPool,
            signature,
            takerFillAmount
          );

        // Confirm that the offer is already filled
        const relevantStateParamsAfterFullFill =
          await getterFacet.getOfferRelevantStateCreateContingentPool(
            offerCreateContingentPool,
            signature
          );
        expect(relevantStateParamsAfterFullFill.offerInfo.status).to.eq(
          OfferStatus.Filled
        );

        // Set takerFillAmount to 1
        takerFillAmount = "1";

        // ---------
        // Act & Assert: Check that `fillOfferCreateContingentPool` fails
        // ---------
        await expect(
          eip712CreateFacet
            .connect(user2)
            .fillOfferCreateContingentPool(
              offerCreateContingentPool,
              signature,
              takerFillAmount
            )
        ).to.be.revertedWith("OfferInvalidCancelledFilledOrExpired()");
      });

      // -------------------------------------------
      // Events
      // -------------------------------------------

      it("Should emit an OfferFilled event (fillOfferCreateContingentPool)", async () => {
        // ---------
        // Arrange: Set takerFillAmount
        // ---------
        takerFillAmount = BigNumber.from(
          offerCreateContingentPool.takerCollateralAmount
        ).toString();

        // ---------
        // Act: Fill create contingent pool offer
        // ---------
        const tx = await eip712CreateFacet
          .connect(user2)
          .fillOfferCreateContingentPool(
            offerCreateContingentPool,
            signature,
            takerFillAmount
          );
        const receipt = await tx.wait();

        // ---------
        // Asset: Confirm that the OfferFilled event is emitted with the right parameters
        // ---------
        const offerFilledEvent = receipt.events?.find(
          (item: any) => item.event === "OfferFilled"
        );
        expect(offerFilledEvent?.args?.typedOfferHash).to.eq(typedMessageHash);
        expect(offerFilledEvent?.args?.maker).to.eq(
          offerCreateContingentPool.maker
        );
        expect(offerFilledEvent?.args?.taker).to.eq(
          offerCreateContingentPool.taker
        );
        expect(offerFilledEvent?.args?.takerFilledAmount).to.eq(
          takerFillAmount
        );
      });
    });

    describe("fillOfferCreateContingentPool with non-zero taker address and makerIsLong as false", async function () {
      beforeEach(async () => {
        // Generate offerCreateContingentPool with user1 (maker) taking the short side and user2 (taker) the long side
        offerCreateContingentPool =
          await generateCreateContingentPoolOfferDetails({
            maker: user1.address.toString(), // maker
            taker: user2.address.toString(), // taker
            makerIsLong: false, // makerIsLong
            dataProvider: oracle.address,
            collateralToken: collateralToken.address.toString(),
            collateralTokenDecimals,
          });

        // Generate signature and typed message hash
        [signature, typedMessageHash] =
          await generateSignatureAndTypedMessageHash(
            user1,
            divaDomain,
            CREATE_POOL_TYPE,
            offerCreateContingentPool,
            "OfferCreateContingentPool"
          );
      });

      it("Should fully fill a create contingent pool offer and update the relevant parameters", async function () {
        // ---------
        // Arrange: Set takerFillAmount equal to takerCollateralAmount and get balance of collateral token for both users before creating the pool
        // ---------

        // Set takerFillAmount = takerCollateralAmount in offer
        takerFillAmount = offerCreateContingentPool.takerCollateralAmount;

        // Calculate makerFillAmount and poolFillAmount
        makerFillAmount = calcMakerFillAmount(
          takerFillAmount,
          offerCreateContingentPool.makerCollateralAmount,
          offerCreateContingentPool.takerCollateralAmount
        );
        poolFillAmount = calcPoolFillAmount(takerFillAmount, makerFillAmount);

        // Get balance of collateral token for both users before fill offer
        balanceOfCollateralTokenBeforeUser1 = await collateralToken.balanceOf(
          user1.address
        );
        balanceOfCollateralTokenBeforeUser2 = await collateralToken.balanceOf(
          user2.address
        );

        // Get balance of collateral token for DIVA Protocol before fill offer
        balanceOfCollateralTokenBeforeDiva = await collateralToken.balanceOf(
          diamondAddress
        );

        // ---------
        // Act: User2 fills create contingent pool offer
        // ---------
        await eip712CreateFacet
          .connect(user2)
          .fillOfferCreateContingentPool(
            offerCreateContingentPool,
            signature,
            takerFillAmount
          );

        // ---------
        // Assert: Confirm that relevant parameters are updated correctly and the
        // user's and DIVA Protocol's collateral/position token balances are as expected
        // ---------

        // Get poolId of the newly created pool with typedMessageHash value
        poolId = await getterFacet.getPoolIdByTypedCreateOfferHash(
          typedMessageHash
        );

        // Get pool parameters of newly created pool
        poolParams = await getterFacet.getPoolParameters(poolId);

        // Get instances of short and long token
        shortTokenInstance = await erc20AttachFixture(poolParams.shortToken);
        longTokenInstance = await erc20AttachFixture(poolParams.longToken);

        // Confirm that collateralBalance has increased to poolFillAmount
        expect(poolParams.collateralBalance).to.eq(poolFillAmount);

        // Confirm that takerFilledAmount for the corresponding offer has increased
        expect(await getterFacet.getTakerFilledAmount(typedMessageHash)).to.eq(
          takerFillAmount
        );

        // Confirm that total supply of both short and long tokens has increased
        expect(await shortTokenInstance.totalSupply()).to.eq(
          poolParams.collateralBalance
        );
        expect(await longTokenInstance.totalSupply()).to.eq(
          poolParams.collateralBalance
        );

        // Confirm that users received the right amounts of both short and long tokens.
        // If makerIsLong is false, confirm user1 received the right amounts of short
        // and user2 the right amount of long position tokens.
        expect(await shortTokenInstance.balanceOf(user1.address)).to.eq(
          poolFillAmount
        );
        expect(await longTokenInstance.balanceOf(user2.address)).to.eq(
          poolFillAmount
        );

        // Confirm that the collateral token balance for both users has reduced
        expect(await collateralToken.balanceOf(user1.address)).to.eq(
          balanceOfCollateralTokenBeforeUser1.sub(makerFillAmount)
        );
        expect(await collateralToken.balanceOf(user2.address)).to.eq(
          balanceOfCollateralTokenBeforeUser2.sub(takerFillAmount)
        );

        // Confirm that DIVA Protocol's collateral token balance has increased
        expect(await collateralToken.balanceOf(diamondAddress)).to.eq(
          balanceOfCollateralTokenBeforeDiva.add(poolFillAmount)
        );
      });
    });

    describe("fillOfferCreateContingentPool with zero taker address", async function () {
      beforeEach(async () => {
        // Generate offerCreateContingentPool with zero taker address
        offerCreateContingentPool =
          await generateCreateContingentPoolOfferDetails({
            maker: user1.address.toString(), // maker
            taker: ethers.constants.AddressZero, // taker = zero address
            makerIsLong: true, // makerIsLong
            dataProvider: oracle.address,
            collateralToken: collateralToken.address.toString(),
            collateralTokenDecimals,
          });

        // Generate signature and typed message hash
        [signature, typedMessageHash] =
          await generateSignatureAndTypedMessageHash(
            user1,
            divaDomain,
            CREATE_POOL_TYPE,
            offerCreateContingentPool,
            "OfferCreateContingentPool"
          );
      });

      it("Should be able to fill offer with user2 address", async function () {
        // ---------
        // Arrange: Set takerFillAmount equal to takerCollateralAmount and get balance of collateral token for both users before creating the pool
        // ---------

        // Set takerFillAmount = takerCollateralAmount in offer
        takerFillAmount = offerCreateContingentPool.takerCollateralAmount;

        // Calculate makerFillAmount and poolFillAmount
        makerFillAmount = calcMakerFillAmount(
          takerFillAmount,
          offerCreateContingentPool.makerCollateralAmount,
          offerCreateContingentPool.takerCollateralAmount
        );
        poolFillAmount = calcPoolFillAmount(takerFillAmount, makerFillAmount);

        // Get balance of collateral token for both users before fill offer
        balanceOfCollateralTokenBeforeUser1 = await collateralToken.balanceOf(
          user1.address
        );
        balanceOfCollateralTokenBeforeUser2 = await collateralToken.balanceOf(
          user2.address
        );

        // Get balance of collateral token for DIVA Protocol before fill offer
        balanceOfCollateralTokenBeforeDiva = await collateralToken.balanceOf(
          diamondAddress
        );

        // ---------
        // Act: User2 fills create contingent pool offer
        // ---------
        await eip712CreateFacet
          .connect(user2)
          .fillOfferCreateContingentPool(
            offerCreateContingentPool,
            signature,
            takerFillAmount
          );

        // ---------
        // Assert: Confirm that relevant parameters are updated correctly and the
        // user's and DIVA Protocol's collateral/position token balances are as expected
        // ---------

        // Get poolId of the newly created pool with typedMessageHash value
        poolId = await getterFacet.getPoolIdByTypedCreateOfferHash(
          typedMessageHash
        );

        // Get pool parameters of newly created pool
        poolParams = await getterFacet.getPoolParameters(poolId);

        // Get instances of short and long token
        shortTokenInstance = await erc20AttachFixture(poolParams.shortToken);
        longTokenInstance = await erc20AttachFixture(poolParams.longToken);

        // Confirm that collateralBalance has increased to poolFillAmount
        expect(poolParams.collateralBalance).to.eq(poolFillAmount);

        // Confirm that takerFilledAmount has increased
        expect(await getterFacet.getTakerFilledAmount(typedMessageHash)).to.eq(
          takerFillAmount
        );

        // Confirm that total supply of both short and long tokens has increased
        expect(await shortTokenInstance.totalSupply()).to.eq(
          poolParams.collateralBalance
        );
        expect(await longTokenInstance.totalSupply()).to.eq(
          poolParams.collateralBalance
        );

        // Confirm that users received the right amounts of both short and long tokens.
        // If makerIsLong is true, confirm user1 received the right amount of long
        // and user2 the right amount of short position tokens.
        expect(await longTokenInstance.balanceOf(user1.address)).to.eq(
          poolFillAmount
        );
        expect(await shortTokenInstance.balanceOf(user2.address)).to.eq(
          poolFillAmount
        );

        // Confirm that the collateral token balance for both users has reduced
        expect(await collateralToken.balanceOf(user1.address)).to.eq(
          balanceOfCollateralTokenBeforeUser1.sub(makerFillAmount)
        );
        expect(await collateralToken.balanceOf(user2.address)).to.eq(
          balanceOfCollateralTokenBeforeUser2.sub(takerFillAmount)
        );

        // Confirm that DIVA Protocol's collateral token balance has increased
        expect(await collateralToken.balanceOf(diamondAddress)).to.eq(
          balanceOfCollateralTokenBeforeDiva.add(poolFillAmount)
        );
      });
    });
  });

  describe("batchFillOfferCreateContingentPool", async function () {
    it("Should fully fill two create contingent pool offers and update the relevant parameters", async function () {
      // ---------
      // Arrange: Generate 2 create contingent pool offers, and set takerFillAmount equal to takerCollateralAmount, and get balance of collateral token for both users before creating the pool
      // ---------

      // Generate first create contingent pool offer with user1 (maker) taking the long side and user2 (taker) the short side
      const offerCreateContingentPool1 =
        await generateCreateContingentPoolOfferDetails({
          maker: user1.address.toString(), // maker
          taker: user2.address.toString(), // taker
          makerIsLong: true, // makerIsLong
          dataProvider: oracle.address,
          collateralToken: collateralToken.address.toString(),
          collateralTokenDecimals,
          makerCollateralAmount: parseUnits(
            "20",
            collateralTokenDecimals
          ).toString(),
          takerCollateralAmount: parseUnits(
            "80",
            collateralTokenDecimals
          ).toString(),
        });

      // Generate signature and typed message hash
      const [signature1, typedMessageHash1] =
        await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          CREATE_POOL_TYPE,
          offerCreateContingentPool1,
          "OfferCreateContingentPool"
        );

      // Set takerFillAmount = takerCollateralAmount in offer
      const takerFillAmount1 = offerCreateContingentPool1.takerCollateralAmount;

      // Calculate makerFillAmount and poolFillAmount
      const makerFillAmount1 = calcMakerFillAmount(
        takerFillAmount1,
        offerCreateContingentPool1.makerCollateralAmount,
        offerCreateContingentPool1.takerCollateralAmount
      );
      const poolFillAmount1 = calcPoolFillAmount(
        takerFillAmount1,
        makerFillAmount1
      );

      // Check relevant eip712 related parameters before the offer is being filled
      const relevantStateParamsBefore1 =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool1,
          signature1
        );
      const poolIdByHashBefore1 =
        await getterFacet.getPoolIdByTypedCreateOfferHash(
          relevantStateParamsBefore1.offerInfo.typedOfferHash
        );

      expect(relevantStateParamsBefore1.offerInfo.typedOfferHash).to.eq(
        typedMessageHash1
      );
      expect(relevantStateParamsBefore1.offerInfo.status).to.eq(
        OfferStatus.Fillable
      );
      expect(relevantStateParamsBefore1.offerInfo.takerFilledAmount).to.eq(0);
      expect(poolIdByHashBefore1).to.eq(0);
      // ------------------------------------------------

      // Generate second create contingent pool offer with user1 (maker) taking the long side and user2 (taker) the short side
      const offerCreateContingentPool2 =
        await generateCreateContingentPoolOfferDetails({
          maker: user1.address.toString(), // maker
          taker: user2.address.toString(), // taker
          makerIsLong: true, // makerIsLong
          dataProvider: oracle.address,
          collateralToken: collateralToken.address.toString(),
          collateralTokenDecimals,
          makerCollateralAmount: parseUnits(
            "30",
            collateralTokenDecimals
          ).toString(),
          takerCollateralAmount: parseUnits(
            "70",
            collateralTokenDecimals
          ).toString(),
        });

      // Generate signature and typed message hash
      const [signature2, typedMessageHash2] =
        await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          CREATE_POOL_TYPE,
          offerCreateContingentPool2,
          "OfferCreateContingentPool"
        );

      // Set takerFillAmount = takerCollateralAmount in offer
      const takerFillAmount2 = offerCreateContingentPool2.takerCollateralAmount;

      // Calculate makerFillAmount and poolFillAmount
      const makerFillAmount2 = calcMakerFillAmount(
        takerFillAmount2,
        offerCreateContingentPool2.makerCollateralAmount,
        offerCreateContingentPool2.takerCollateralAmount
      );
      const poolFillAmount2 = calcPoolFillAmount(
        takerFillAmount2,
        makerFillAmount2
      );

      // Check relevant eip712 related parameters before the offer is being filled
      const relevantStateParamsBefore2 =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool2,
          signature2
        );
      const poolIdByHashBefore2 =
        await getterFacet.getPoolIdByTypedCreateOfferHash(
          relevantStateParamsBefore2.offerInfo.typedOfferHash
        );

      expect(relevantStateParamsBefore2.offerInfo.typedOfferHash).to.eq(
        typedMessageHash2
      );
      expect(relevantStateParamsBefore2.offerInfo.status).to.eq(
        OfferStatus.Fillable
      );
      expect(relevantStateParamsBefore2.offerInfo.takerFilledAmount).to.eq(0);
      expect(poolIdByHashBefore2).to.eq(0);
      // ------------------------------------------------

      // Get balance of collateral token for both users before fill offer
      balanceOfCollateralTokenBeforeUser1 = await collateralToken.balanceOf(
        user1.address
      );
      balanceOfCollateralTokenBeforeUser2 = await collateralToken.balanceOf(
        user2.address
      );

      // Get balance of collateral token for DIVA Protocol before fill offer
      balanceOfCollateralTokenBeforeDiva = await collateralToken.balanceOf(
        diamondAddress
      );

      // ---------
      // Act: User2 fills create contingent pool offers
      // ---------
      await eip712CreateFacet
        .connect(user2)
        .batchFillOfferCreateContingentPool([
          {
            offerCreateContingentPool: offerCreateContingentPool1,
            signature: signature1,
            takerFillAmount: takerFillAmount1,
          },
          {
            offerCreateContingentPool: offerCreateContingentPool2,
            signature: signature2,
            takerFillAmount: takerFillAmount2,
          },
        ]);

      // ---------
      // Assert: Confirm that relevant parameters are updated correctly and the
      // user's and DIVA Protocol's collateral/position token balances are as expected
      // ---------

      // Get poolIds of the newly created pools with typedMessageHash values
      const poolId1 = await getterFacet.getPoolIdByTypedCreateOfferHash(
        typedMessageHash1
      );
      const poolId2 = await getterFacet.getPoolIdByTypedCreateOfferHash(
        typedMessageHash2
      );

      // Get first pool parameters of newly created pool
      const poolParams1 = await getterFacet.getPoolParameters(poolId1);

      // Get instances of short and long token
      const shortTokenInstance1 = await erc20AttachFixture(
        poolParams1.shortToken
      );
      const longTokenInstance1 = await erc20AttachFixture(
        poolParams1.longToken
      );

      // Confirm pool params are set correctly
      expect(poolParams1.referenceAsset).to.eq(
        offerCreateContingentPool1.referenceAsset
      );
      expect(poolParams1.expiryTime).to.eq(
        offerCreateContingentPool1.expiryTime
      );
      expect(poolParams1.floor).to.eq(offerCreateContingentPool1.floor);
      expect(poolParams1.inflection).to.eq(
        offerCreateContingentPool1.inflection
      );
      expect(poolParams1.cap).to.eq(offerCreateContingentPool1.cap);
      expect(poolParams1.gradient).to.eq(offerCreateContingentPool1.gradient);
      expect(poolParams1.collateralToken).to.eq(
        offerCreateContingentPool1.collateralToken
      );
      expect(poolParams1.dataProvider).to.eq(
        offerCreateContingentPool1.dataProvider
      );
      expect(poolParams1.capacity).to.eq(offerCreateContingentPool1.capacity);

      // Confirm that collateralBalance has increased to poolFillAmount
      expect(poolParams1.collateralBalance).to.eq(poolFillAmount1);

      // Confirm that takerFilledAmount for the corresponding offer has increased
      expect(await getterFacet.getTakerFilledAmount(typedMessageHash1)).to.eq(
        takerFillAmount1
      );

      // Confirm that total supply of both short and long tokens has increased
      expect(await shortTokenInstance1.totalSupply()).to.eq(
        poolParams1.collateralBalance
      );
      expect(await longTokenInstance1.totalSupply()).to.eq(
        poolParams1.collateralBalance
      );

      // Confirm that users received the right amounts of both short and long tokens.
      // If makerIsLong is true, confirm user1 received the right amount of long
      // and user2 the right amount of short position tokens.
      expect(await longTokenInstance1.balanceOf(user1.address)).to.eq(
        poolFillAmount1
      );
      expect(await shortTokenInstance1.balanceOf(user2.address)).to.eq(
        poolFillAmount1
      );

      // Confirm that the relevant eip712 related parameters have been updated
      const relevantStateParamsAfter1 =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool1,
          signature1
        );
      const poolIdByHashAfter1 =
        await getterFacet.getPoolIdByTypedCreateOfferHash(
          relevantStateParamsAfter1.offerInfo.typedOfferHash
        );

      expect(relevantStateParamsAfter1.offerInfo.typedOfferHash).to.eq(
        typedMessageHash1
      );
      expect(relevantStateParamsAfter1.offerInfo.status).to.eq(
        OfferStatus.Filled
      );
      expect(relevantStateParamsAfter1.offerInfo.takerFilledAmount).to.eq(
        takerFillAmount1
      );
      expect(poolId1).to.eq(poolIdByHashAfter1);
      // ------------------------------------------------

      // Get second pool parameters of newly created pool
      const poolParams2 = await getterFacet.getPoolParameters(poolId2);

      // Get instances of short and long token
      const shortTokenInstance2 = await erc20AttachFixture(
        poolParams2.shortToken
      );
      const longTokenInstance2 = await erc20AttachFixture(
        poolParams2.longToken
      );

      // Confirm pool params are set correctly
      expect(poolParams2.referenceAsset).to.eq(
        offerCreateContingentPool2.referenceAsset
      );
      expect(poolParams2.expiryTime).to.eq(
        offerCreateContingentPool2.expiryTime
      );
      expect(poolParams2.floor).to.eq(offerCreateContingentPool2.floor);
      expect(poolParams2.inflection).to.eq(
        offerCreateContingentPool2.inflection
      );
      expect(poolParams2.cap).to.eq(offerCreateContingentPool2.cap);
      expect(poolParams2.gradient).to.eq(offerCreateContingentPool2.gradient);
      expect(poolParams2.collateralToken).to.eq(
        offerCreateContingentPool2.collateralToken
      );
      expect(poolParams2.dataProvider).to.eq(
        offerCreateContingentPool2.dataProvider
      );
      expect(poolParams2.capacity).to.eq(offerCreateContingentPool2.capacity);

      // Confirm that collateralBalance has increased to poolFillAmount
      expect(poolParams2.collateralBalance).to.eq(poolFillAmount2);

      // Confirm that takerFilledAmount for the corresponding offer has increased
      expect(await getterFacet.getTakerFilledAmount(typedMessageHash2)).to.eq(
        takerFillAmount2
      );

      // Confirm that total supply of both short and long tokens has increased
      expect(await shortTokenInstance2.totalSupply()).to.eq(
        poolParams2.collateralBalance
      );
      expect(await longTokenInstance2.totalSupply()).to.eq(
        poolParams2.collateralBalance
      );

      // Confirm that users received the right amounts of both short and long tokens.
      // If makerIsLong is true, confirm user1 received the right amount of long
      // and user2 the right amount of short position tokens.
      expect(await longTokenInstance2.balanceOf(user1.address)).to.eq(
        poolFillAmount2
      );
      expect(await shortTokenInstance2.balanceOf(user2.address)).to.eq(
        poolFillAmount2
      );

      // Confirm that the relevant eip712 related parameters have been updated
      const relevantStateParamsAfter2 =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool2,
          signature2
        );
      const poolIdByHashAfter2 =
        await getterFacet.getPoolIdByTypedCreateOfferHash(
          relevantStateParamsAfter2.offerInfo.typedOfferHash
        );

      expect(relevantStateParamsAfter2.offerInfo.typedOfferHash).to.eq(
        typedMessageHash2
      );
      expect(relevantStateParamsAfter2.offerInfo.status).to.eq(
        OfferStatus.Filled
      );
      expect(relevantStateParamsAfter2.offerInfo.takerFilledAmount).to.eq(
        takerFillAmount2
      );
      expect(poolId2).to.eq(poolIdByHashAfter2);
      // ------------------------------------------------

      // Confirm that the collateral token balance for both users has reduced
      expect(await collateralToken.balanceOf(user1.address)).to.eq(
        balanceOfCollateralTokenBeforeUser1
          .sub(makerFillAmount1)
          .sub(makerFillAmount2)
      );
      expect(await collateralToken.balanceOf(user2.address)).to.eq(
        balanceOfCollateralTokenBeforeUser2
          .sub(takerFillAmount1)
          .sub(takerFillAmount2)
      );

      // Confirm that DIVA Protocol's collateral token balance has increased
      expect(await collateralToken.balanceOf(diamondAddress)).to.eq(
        balanceOfCollateralTokenBeforeDiva
          .add(poolFillAmount1)
          .add(poolFillAmount2)
      );
    });
  });

  describe("cancelOfferCreateContingentPool", async function () {
    beforeEach(async () => {
      // Generate offerCreateContingentPool
      offerCreateContingentPool =
        await generateCreateContingentPoolOfferDetails({
          maker: user1.address.toString(), // maker
          taker: user2.address.toString(), // taker
          makerIsLong: true, // makerIsLong
          dataProvider: oracle.address,
          collateralToken: collateralToken.address.toString(),
          collateralTokenDecimals,
        });

      // Generate signature and typed message hash
      [signature, typedMessageHash] =
        await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          CREATE_POOL_TYPE,
          offerCreateContingentPool,
          "OfferCreateContingentPool"
        );
    });

    it("Maker should be able to cancel an unfilled create contingent pool offer", async function () {
      // ---------
      // Act: User1 cancels create contingent pool offer
      // ---------
      await eip712CancelFacet
        .connect(user1)
        .cancelOfferCreateContingentPool(offerCreateContingentPool);

      // ---------
      // Assert: Confirm that offer is cancelled successfully
      // ---------
      expect(await getterFacet.getTakerFilledAmount(typedMessageHash)).to.eq(
        ethers.constants.MaxUint256
      );
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool,
          signature
        );
      expect(relevantStateParams.offerInfo.status).to.eq(OfferStatus.Cancelled);
    });

    it("Maker should be able to cancel a fully filled create contingent pool offer", async function () {
      // ---------
      // Arrange: Simulate a full fill
      // ---------

      // Set takerFillAmount equal to takerCollateralAmount to simulate a full fill of a create contingent pool offer
      takerFillAmount = offerCreateContingentPool.takerCollateralAmount;

      // Fill create contingent pool offer with user2 address (taker)
      await eip712CreateFacet
        .connect(user2)
        .fillOfferCreateContingentPool(
          offerCreateContingentPool,
          signature,
          takerFillAmount
        );

      // Confirm that the offer is fully filled
      const relevantStateParamsAfterFullFill =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool,
          signature
        );
      expect(relevantStateParamsAfterFullFill.offerInfo.status).to.eq(
        OfferStatus.Filled
      );

      // ---------
      // Act: User1 (maker) cancels create contingent pool offer
      // ---------
      await eip712CancelFacet
        .connect(user1)
        .cancelOfferCreateContingentPool(offerCreateContingentPool);

      // ---------
      // Assert: Confirm that the offer is cancelled successfully
      // ---------
      const relevantStateParamsAfterCancel =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool,
          signature
        );
      expect(relevantStateParamsAfterCancel.offerInfo.status).to.eq(
        OfferStatus.Cancelled
      );
    });

    it("Maker should be able to cancel a partially filled create contingent pool offer", async function () {
      // ---------
      // Arrange: Simulate a partial fill
      // ---------

      // Set takerFillAmount < takerCollateralAmount to simulate a partial fill of a create contingent pool offer
      takerFillAmount = offerCreateContingentPool.minimumTakerFillAmount;
      expect(takerFillAmount).to.be.lt(
        BigNumber.from(offerCreateContingentPool.takerCollateralAmount)
      );
      expect(takerFillAmount).to.be.gt(BigNumber.from(0));

      // Fill create contingent pool offer with user2 address (taker)
      await eip712CreateFacet
        .connect(user2)
        .fillOfferCreateContingentPool(
          offerCreateContingentPool,
          signature,
          takerFillAmount
        );

      // Confirm that the offer is still fillable
      const relevantStateParamsAfterPartialFill =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool,
          signature
        );
      expect(relevantStateParamsAfterPartialFill.offerInfo.status).to.eq(
        OfferStatus.Fillable
      );

      // ---------
      // Act: User1 (maker) cancels create contingent pool offer
      // ---------
      await eip712CancelFacet
        .connect(user1)
        .cancelOfferCreateContingentPool(offerCreateContingentPool);

      // ---------
      // Assert: Confirm that the offer is cancelled successfully
      // ---------
      const relevantStateParamsAfterCancel =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool,
          signature
        );
      expect(relevantStateParamsAfterCancel.offerInfo.status).to.eq(
        OfferStatus.Cancelled
      );
    });

    it("Maker should be able to cancel an expired create contingent pool offer", async function () {
      // ---------
      // Arrange: Set next block's timestamp after offerExpiry time and mine block to simulate expired offer
      // ---------
      await mineBlock(Number(offerCreateContingentPool.offerExpiry) + 1);

      // Confirm that the offer is expired
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool,
          signature
        );
      expect(relevantStateParams.offerInfo.status).to.eq(OfferStatus.Expired);

      // ---------
      // Act: User1 (maker) cancels create contingent pool offer
      // ---------
      await eip712CancelFacet
        .connect(user1)
        .cancelOfferCreateContingentPool(offerCreateContingentPool);

      // ---------
      // Assert: Confirm that the offer is cancelled successfully
      // ---------
      const relevantStateParamsAfterCancel =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool,
          signature
        );
      expect(relevantStateParamsAfterCancel.offerInfo.status).to.eq(
        OfferStatus.Cancelled
      );
    });

    it("Maker should be able to cancel an already cancelled create contingent pool offer", async function () {
      // ---------
      // Arrange: Simulate a cancelled offer
      // ---------

      // User1 (maker) cancels create contingent pool offer
      await eip712CancelFacet
        .connect(user1)
        .cancelOfferCreateContingentPool(offerCreateContingentPool);

      // Confirm that the offer is cancelled successfully
      const relevantStateParamsAfterFirstCancel =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool,
          signature
        );
      expect(relevantStateParamsAfterFirstCancel.offerInfo.status).to.eq(
        OfferStatus.Cancelled
      );

      // ---------
      // Act: User1 (maker) cancels create contingent pool offer again
      // ---------
      await eip712CancelFacet
        .connect(user1)
        .cancelOfferCreateContingentPool(offerCreateContingentPool);

      // ---------
      // Assert: Confirm that the offer is cancelled successfully
      // ---------
      const relevantStateParamsAfterSecondCancel =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool,
          signature
        );
      expect(relevantStateParamsAfterSecondCancel.offerInfo.status).to.eq(
        OfferStatus.Cancelled
      );
    });

    // -------------------------------------------
    // Reverts
    // -------------------------------------------

    it("Should revert if create contingent pool offer is not cancelled by maker", async function () {
      // ---------
      // Arrange: Confirm that user2 is not the maker of create contingent pool offer
      // ---------
      expect(user2.address).to.not.eq(offerCreateContingentPool.maker);

      // ---------
      // Act & Assert: Check that `cancelOfferCreateContingentPool` fails with user2
      // ---------
      await expect(
        eip712CancelFacet
          .connect(user2)
          .cancelOfferCreateContingentPool(offerCreateContingentPool)
      ).to.be.revertedWith("MsgSenderNotMaker()");
    });

    // -------------------------------------------
    // Events
    // -------------------------------------------

    it("Should emit an OfferCancelled event (fillOfferCreateContingentPool)", async () => {
      // ---------
      // Act: Cancel create contingent pool offer
      // ---------
      const tx = await eip712CancelFacet
        .connect(user1)
        .cancelOfferCreateContingentPool(offerCreateContingentPool);
      const receipt = await tx.wait();

      // ---------
      // Asset: Confirm that the OfferFilled event is emitted with the right parameters
      // ---------
      const offerCancelledEvent = receipt.events?.find(
        (item: any) => item.event === "OfferCancelled"
      );
      expect(offerCancelledEvent?.args?.typedOfferHash).to.eq(typedMessageHash);
      expect(offerCancelledEvent?.args?.maker).to.eq(
        offerCreateContingentPool.maker
      );
    });
  });

  describe("batchCancelOfferCreateContingentPool", async function () {
    it("Maker should be able to cancel batch create contingent pool offers", async function () {
      // ---------
      // Arrange: Create 2 create contingent pool offers
      // ---------
      // Generate first offerCreateContingentPool
      const offerCreateContingentPool1 =
        await generateCreateContingentPoolOfferDetails({
          maker: user1.address.toString(), // maker
          taker: user2.address.toString(), // taker
          makerIsLong: true, // makerIsLong
          dataProvider: oracle.address,
          collateralToken: collateralToken.address.toString(),
          collateralTokenDecimals,
        });
      // Generate signature and typed message hash for first offerCreateContingentPool
      const [signature1, typedMessageHash1] =
        await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          CREATE_POOL_TYPE,
          offerCreateContingentPool1,
          "OfferCreateContingentPool"
        );

      // Generate second offerCreateContingentPool
      const offerCreateContingentPool2 =
        await generateCreateContingentPoolOfferDetails({
          maker: user1.address.toString(), // maker
          taker: user2.address.toString(), // taker
          makerIsLong: true, // makerIsLong
          dataProvider: oracle.address,
          collateralToken: collateralToken.address.toString(),
          collateralTokenDecimals,
        });
      // Generate signature and typed message hash for second offerCreateContingentPool
      const [signature2, typedMessageHash2] =
        await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          CREATE_POOL_TYPE,
          offerCreateContingentPool2,
          "OfferCreateContingentPool"
        );

      // ---------
      // Act: User1 cancels create contingent pool offers
      // ---------
      await eip712CancelFacet
        .connect(user1)
        .batchCancelOfferCreateContingentPool([
          offerCreateContingentPool1,
          offerCreateContingentPool2,
        ]);

      // ---------
      // Assert: Confirm that offers are cancelled successfully
      // ---------
      expect(await getterFacet.getTakerFilledAmount(typedMessageHash1)).to.eq(
        ethers.constants.MaxUint256
      );
      const relevantStateParams1 =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool1,
          signature1
        );
      expect(relevantStateParams1.offerInfo.status).to.eq(
        OfferStatus.Cancelled
      );

      expect(await getterFacet.getTakerFilledAmount(typedMessageHash2)).to.eq(
        ethers.constants.MaxUint256
      );
      const relevantStateParams2 =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool2,
          signature2
        );
      expect(relevantStateParams2.offerInfo.status).to.eq(
        OfferStatus.Cancelled
      );
    });
  });

  describe("getOfferRelevantStateCreateContingentPool", async function () {
    beforeEach(async () => {
      // Generate offerCreateContingentPool
      offerCreateContingentPool =
        await generateCreateContingentPoolOfferDetails({
          maker: user1.address.toString(), // maker
          taker: user2.address.toString(), // taker
          makerIsLong: true, // makerIsLong
          dataProvider: oracle.address,
          collateralToken: collateralToken.address.toString(),
          collateralTokenDecimals,
        });

      // Set pool capacity to max amount to not run into any capacity constraints during the tests
      offerCreateContingentPool.capacity =
        ethers.constants.MaxUint256.toString();

      // Generate signature, typed message hash and typed data
      [signature, typedMessageHash] =
        await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          CREATE_POOL_TYPE,
          offerCreateContingentPool,
          "OfferCreateContingentPool"
        );
    });

    it("Should clamp actualTakerFillableAmount to remaining available maker balance in unfilled create contingent pool offer", async function () {
      // ---------
      // Arrange: Create a contingent pool offer where makerCollateralAmount is larger than the maker's collateral token balance
      // ---------
      const userCollateralTokenBalance = await collateralToken.balanceOf(
        user1.address
      );
      offerCreateContingentPool.makerCollateralAmount =
        userCollateralTokenBalance.mul(2).toString();

      // Generate signature
      [signature] = await generateSignatureAndTypedMessageHash(
        user1,
        divaDomain,
        CREATE_POOL_TYPE,
        offerCreateContingentPool,
        "OfferCreateContingentPool"
      );

      // ---------
      // Assert: Confirm that actualTakerFillableAmount is less than takerCollateralAmount
      // ---------
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool,
          signature
        );
      expect(relevantStateParams.actualTakerFillableAmount).to.eq(
        BigNumber.from(offerCreateContingentPool.takerCollateralAmount).div(2)
      );
    });

    it("Should allow to fill offer with actualTakerFillableAmount on fluctuations in remaining available maker balance", async function () {
      // ---------
      // Arrange1: Create a contingent pool offer where makerCollateralAmount is equal to maker's collateral token balance and
      // takerCollateralAmount is half of it, and simulate a partial fill
      // ---------
      const makerCollateralTokenBalanceBeforeFill =
        await collateralToken.balanceOf(user1.address);

      // Confirm that allowance is greater than or equal to collateral token balance so that allowance is not the limiting factor
      const makerCollateralTokenAllowance = await collateralToken.allowance(
        user1.address,
        diamondAddress
      );
      expect(makerCollateralTokenAllowance).to.be.gte(
        makerCollateralTokenBalanceBeforeFill
      );

      // Set makerCollateralAmount and takerCollateralAmount
      offerCreateContingentPool.makerCollateralAmount =
        makerCollateralTokenBalanceBeforeFill.toString();
      offerCreateContingentPool.takerCollateralAmount =
        makerCollateralTokenBalanceBeforeFill.div(2).toString();

      // Generate signature
      [signature] = await generateSignatureAndTypedMessageHash(
        user1,
        divaDomain,
        CREATE_POOL_TYPE,
        offerCreateContingentPool,
        "OfferCreateContingentPool"
      );

      // Set takerFillAmount < takerCollateralAmount to simulate a partial fill of a create contingent pool offer
      const takerFillAmountFirstFill =
        offerCreateContingentPool.minimumTakerFillAmount;
      expect(takerFillAmountFirstFill).to.be.lt(
        BigNumber.from(offerCreateContingentPool.takerCollateralAmount)
      );
      expect(takerFillAmountFirstFill).to.be.gt(BigNumber.from(0));

      // Fill create contingent pool offer with user2 address (taker)
      await eip712CreateFacet
        .connect(user2)
        .fillOfferCreateContingentPool(
          offerCreateContingentPool,
          signature,
          takerFillAmountFirstFill
        );

      // Confirm that actualTakerFillableAmount equals takerCollateralAmount - takerFillAmountFirstFill
      const relevantStateParamsAfterFill =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool,
          signature
        );
      expect(relevantStateParamsAfterFill.actualTakerFillableAmount).to.eq(
        BigNumber.from(offerCreateContingentPool.takerCollateralAmount).sub(
          takerFillAmountFirstFill
        )
      );

      // Get user1's collateral token balance after fill
      const makerCollateralTokenBalanceAfterFill =
        await collateralToken.balanceOf(user1.address);

      // Transfer out half of user1's collateral token balance so that the offer is no longer fully fillable
      const transferAmount = makerCollateralTokenBalanceAfterFill.div(2);
      await collateralToken
        .connect(user1)
        .transfer(user2.address, transferAmount);

      // Confirm that actualTakerFillableAmount decreased
      const relevantStateParamsAfterTransfer =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool,
          signature
        );
      expect(
        relevantStateParamsAfterTransfer.actualTakerFillableAmount
      ).to.be.lt(relevantStateParamsAfterFill.actualTakerFillableAmount);
      expect(
        relevantStateParamsAfterTransfer.actualTakerFillableAmount
      ).to.be.gt(0);

      // ---------
      // Act1: Execute a second fill using actualTakerFillableAmount as takerFillAmount
      // ---------
      const takerFillAmountSecondFill =
        relevantStateParamsAfterTransfer.actualTakerFillableAmount.toString();
      await eip712CreateFacet
        .connect(user2)
        .fillOfferCreateContingentPool(
          offerCreateContingentPool,
          signature,
          takerFillAmountSecondFill
        );

      // ---------
      // Assert1: Confirm that actualTakerFillableAmount is reduced to zero and status is Fillable under the condition that maker balance increases again
      // ---------
      const relevantStateParamsAfterSecondFill =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool,
          signature
        );
      expect(
        relevantStateParamsAfterSecondFill.actualTakerFillableAmount
      ).to.eq(0);
      expect(relevantStateParamsAfterSecondFill.offerInfo.status).to.eq(
        OfferStatus.Fillable
      );

      // ---------
      // Arrange2: Transfer back collateral token from user2 to user1 to render the original offer fully fillable
      // ---------
      await collateralToken
        .connect(user2)
        .transfer(user1.address, transferAmount);

      // Confirm that actualTakerFillableAmount increased again and equals takerCollateralAmount - takerFillAmountFirstFill - takerFillAmountSecondFill
      const relevantStateParamsBeforeThirdFill =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool,
          signature
        );
      expect(
        relevantStateParamsBeforeThirdFill.actualTakerFillableAmount
      ).to.be.gt(0);
      expect(
        relevantStateParamsBeforeThirdFill.actualTakerFillableAmount
      ).to.eq(
        BigNumber.from(offerCreateContingentPool.takerCollateralAmount)
          .sub(takerFillAmountFirstFill)
          .sub(takerFillAmountSecondFill)
      );

      // ---------
      // Act2: Execute a third fill using actualTakerFillableAmount as takerFillAmount
      // ---------
      const takerFillAmountThirdFill =
        relevantStateParamsBeforeThirdFill.actualTakerFillableAmount.toString();
      await eip712CreateFacet
        .connect(user2)
        .fillOfferCreateContingentPool(
          offerCreateContingentPool,
          signature,
          takerFillAmountThirdFill
        );

      // ---------
      // Assert2: Confirm that the original offer is now fully filled
      // ---------
      const relevantStateParamsAfterThirdFill =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool,
          signature
        );
      expect(relevantStateParamsAfterThirdFill.actualTakerFillableAmount).to.eq(
        0
      );
      expect(relevantStateParamsAfterThirdFill.offerInfo.status).to.eq(
        OfferStatus.Filled
      );
    });

    it("Should set actualTakerFillableAmount = 0 if maker has zero remaining balance", async function () {
      // ---------
      // Arrange: Create a contingent pool offer and reduce the maker's (user1's) collateral token balance to zero
      // ---------
      const userCollateralTokenBalance = await collateralToken.balanceOf(
        user1.address
      );
      expect(userCollateralTokenBalance).to.be.gt(0);

      // Generate signature
      [signature] = await generateSignatureAndTypedMessageHash(
        user1,
        divaDomain,
        CREATE_POOL_TYPE,
        offerCreateContingentPool,
        "OfferCreateContingentPool"
      );

      // User1 transfers out all collateral tokens to user2 after having created the offer
      await collateralToken
        .connect(user1)
        .transfer(user2.address, userCollateralTokenBalance);

      // ---------
      // Assert: Confirm that actualTakerFillableAmount is 0
      // ---------
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool,
          signature
        );
      expect(relevantStateParams.actualTakerFillableAmount).to.eq(0);
    });

    it("Should clamp actualTakerFillableAmount to remaining allowance in unfilled create contingent pool offer", async function () {
      // ---------
      // Arrange: Create a contingent pool offer where makerCollateralAmount is larger than the maker's allowance
      // ---------
      const makerAllowance = await collateralToken.allowance(
        user1.address,
        diamondAddress
      );
      expect(makerAllowance).to.be.gt(0);

      offerCreateContingentPool.makerCollateralAmount = makerAllowance
        .mul(2)
        .toString();

      // Generate signature
      [signature] = await generateSignatureAndTypedMessageHash(
        user1,
        divaDomain,
        CREATE_POOL_TYPE,
        offerCreateContingentPool,
        "OfferCreateContingentPool"
      );

      // ---------
      // Assert: Confirm that actualTakerFillableAmount is less than takerCollateralAmount
      // ---------
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool,
          signature
        );
      expect(relevantStateParams.actualTakerFillableAmount).to.eq(
        BigNumber.from(offerCreateContingentPool.takerCollateralAmount).div(2)
      );
    });

    it("Should allow to fill offer with actualTakerFillableAmount on fluctuations in maker allowance", async function () {
      // ---------
      // Arrange1: Create a contingent pool offer where makerCollateralAmount is equal to maker's collateral token allowance and
      // takerCollateralAmount is half of it, and simulate a partial fill
      // ---------
      const makerCollateralTokenAllowanceBeforeFill =
        await collateralToken.allowance(user1.address, diamondAddress);

      // Confirm that collateral token balance is greater than or equal to allowance so that the balance is not the limiting factor
      const makerCollateralTokenBalance = await collateralToken.balanceOf(
        user1.address
      );
      expect(makerCollateralTokenBalance).to.be.gte(
        makerCollateralTokenAllowanceBeforeFill
      );

      // Set makerCollateralAmount and takerCollateralAmount
      offerCreateContingentPool.makerCollateralAmount =
        makerCollateralTokenAllowanceBeforeFill.toString();
      offerCreateContingentPool.takerCollateralAmount =
        makerCollateralTokenAllowanceBeforeFill.div(2).toString();

      // Generate signature
      [signature] = await generateSignatureAndTypedMessageHash(
        user1,
        divaDomain,
        CREATE_POOL_TYPE,
        offerCreateContingentPool,
        "OfferCreateContingentPool"
      );

      // Set takerFillAmount < takerCollateralAmount to simulate a partial fill of a create contingent pool offer
      const takerFillAmountFirstFill =
        offerCreateContingentPool.minimumTakerFillAmount;
      expect(takerFillAmountFirstFill).to.be.lt(
        BigNumber.from(offerCreateContingentPool.takerCollateralAmount)
      );
      expect(takerFillAmountFirstFill).to.be.gt(BigNumber.from(0));

      // Fill create contingent pool offer with user2 address (taker)
      await eip712CreateFacet
        .connect(user2)
        .fillOfferCreateContingentPool(
          offerCreateContingentPool,
          signature,
          takerFillAmountFirstFill
        );

      // Confirm that actualTakerFillableAmount equals takerCollateralAmount - takerFillAmountFirstFill
      const relevantStateParamsAfterFill =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool,
          signature
        );
      expect(relevantStateParamsAfterFill.actualTakerFillableAmount).to.eq(
        BigNumber.from(offerCreateContingentPool.takerCollateralAmount).sub(
          takerFillAmountFirstFill
        )
      );

      // Reduce maker allowance so that the offer is no longer fully fillable
      const newMakerAllowance = makerCollateralTokenAllowanceBeforeFill.div(2);
      await collateralToken
        .connect(user1)
        .approve(diamondAddress, newMakerAllowance);

      // Confirm that actualTakerFillableAmount decreased
      const relevantStateParamsAfterAllowanceReduction =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool,
          signature
        );
      expect(
        relevantStateParamsAfterAllowanceReduction.actualTakerFillableAmount
      ).to.be.lt(relevantStateParamsAfterFill.actualTakerFillableAmount);
      expect(
        relevantStateParamsAfterAllowanceReduction.actualTakerFillableAmount
      ).to.be.gt(0);

      // ---------
      // Act1: Execute a second fill using actualTakerFillableAmount as takerFillAmount
      // ---------
      const takerFillAmountSecondFill =
        relevantStateParamsAfterAllowanceReduction.actualTakerFillableAmount.toString();
      await eip712CreateFacet
        .connect(user2)
        .fillOfferCreateContingentPool(
          offerCreateContingentPool,
          signature,
          takerFillAmountSecondFill
        );

      // ---------
      // Assert1: Confirm that actualTakerFillableAmount is reduced to zero and status is Fillable under the condition that maker allowance increases again
      // ---------
      const relevantStateParamsAfterSecondFill =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool,
          signature
        );
      expect(
        relevantStateParamsAfterSecondFill.actualTakerFillableAmount
      ).to.eq(0);
      expect(relevantStateParamsAfterSecondFill.offerInfo.status).to.eq(
        OfferStatus.Fillable
      );

      // ---------
      // Arrange2: Increase maker allowance again to render the original offer fully fillable
      // ---------
      await collateralToken
        .connect(user1)
        .approve(diamondAddress, makerCollateralTokenAllowanceBeforeFill);

      // Confirm that actualTakerFillableAmount increased again and equals takerCollateralAmount - takerFillAmountFirstFill - takerFillAmountSecondFill
      const relevantStateParamsBeforeThirdFill =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool,
          signature
        );
      expect(
        relevantStateParamsBeforeThirdFill.actualTakerFillableAmount
      ).to.be.gt(0);
      expect(
        relevantStateParamsBeforeThirdFill.actualTakerFillableAmount
      ).to.eq(
        BigNumber.from(offerCreateContingentPool.takerCollateralAmount)
          .sub(takerFillAmountFirstFill)
          .sub(takerFillAmountSecondFill)
      );

      // ---------
      // Act2: Execute a third fill using actualTakerFillableAmount as takerFillAmount
      // ---------
      const takerFillAmountThirdFill =
        relevantStateParamsBeforeThirdFill.actualTakerFillableAmount.toString();
      await eip712CreateFacet
        .connect(user2)
        .fillOfferCreateContingentPool(
          offerCreateContingentPool,
          signature,
          takerFillAmountThirdFill
        );

      // ---------
      // Assert2: Confirm that the original offer is now fully filled
      // ---------
      const relevantStateParamsAfterThirdFill =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool,
          signature
        );
      expect(relevantStateParamsAfterThirdFill.actualTakerFillableAmount).to.eq(
        0
      );
      expect(relevantStateParamsAfterThirdFill.offerInfo.status).to.eq(
        OfferStatus.Filled
      );
    });

    it("Should return actualTakerFillableAmount = 0 if maker has zero allowance in an unfilled create contingent pool offer", async function () {
      // ---------
      // Arrange: Create a contingent pool offer and reduce the maker's (user1's) collateral token balance to zero
      // ---------
      const makerAllowance = await collateralToken.allowance(
        user1.address,
        diamondAddress
      );
      expect(makerAllowance).to.be.gt(0);

      // Generate signature
      [signature] = await generateSignatureAndTypedMessageHash(
        user1,
        divaDomain,
        CREATE_POOL_TYPE,
        offerCreateContingentPool,
        "OfferCreateContingentPool"
      );

      // User1 transfers out all collateral tokens to user2 after having created the offer
      await collateralToken.connect(user1).approve(diamondAddress, 0);

      // ---------
      // Assert: Confirm that actualTakerFillableAmount is 0
      // ---------
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool,
          signature
        );
      expect(relevantStateParams.actualTakerFillableAmount).to.eq(0);
    });

    it("Should return actualTakerFillableAmount = takerCollateralAmount if makerCollateralAmount = 0 in an unfilled create pool offer", async function () {
      // ---------
      // Arrange: Create a contingent pool offer with makerCollateralAmount = 0
      // ---------
      offerCreateContingentPool.makerCollateralAmount = "0";

      // Generate signature
      [signature] = await generateSignatureAndTypedMessageHash(
        user1,
        divaDomain,
        CREATE_POOL_TYPE,
        offerCreateContingentPool,
        "OfferCreateContingentPool"
      );

      // ---------
      // Assert: Confirm that actualTakerFillableAmount is equal takerCollateralAmount
      // ---------
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool,
          signature
        );
      expect(relevantStateParams.actualTakerFillableAmount).to.eq(
        BigNumber.from(offerCreateContingentPool.takerCollateralAmount)
      );
    });

    it("Should return actualTakerFillableAmount = takerCollateralAmount - takerFilledAmount if makerCollateralAmount = 0 in a partially filled create pool offer", async function () {
      // ---------
      // Arrange: Create a contingent pool offer with makerCollateralAmount = 0
      // ---------
      offerCreateContingentPool.makerCollateralAmount = "0";

      // Generate signature
      [signature] = await generateSignatureAndTypedMessageHash(
        user1,
        divaDomain,
        CREATE_POOL_TYPE,
        offerCreateContingentPool,
        "OfferCreateContingentPool"
      );

      // Set takerFillAmount smaller than takerCollateralAmount to simulate a partial fill
      takerFillAmount = offerCreateContingentPool.minimumTakerFillAmount;
      expect(BigNumber.from(takerFillAmount)).to.be.lt(
        BigNumber.from(offerCreateContingentPool.takerCollateralAmount)
      );

      // ---------
      // Act: Fill offer partially
      // ---------
      await eip712CreateFacet
        .connect(user2)
        .fillOfferCreateContingentPool(
          offerCreateContingentPool,
          signature,
          takerFillAmount
        );

      // ---------
      // Assert: Confirm that actualTakerFillableAmount is equal takerCollateralAmount - takerFilledAmount
      // ---------
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool,
          signature
        );
      expect(relevantStateParams.offerInfo.takerFilledAmount).to.be.gt(0);
      expect(relevantStateParams.actualTakerFillableAmount).to.eq(
        BigNumber.from(offerCreateContingentPool.takerCollateralAmount).sub(
          relevantStateParams.offerInfo.takerFilledAmount
        )
      );
    });

    it("Should return actualTakerFillableAmount = 0 if makerCollateralAmount = 0 in a fully filled create pool offer", async function () {
      // ---------
      // Arrange: Create a contingent pool offer with makerCollateralAmount = 0
      // ---------
      offerCreateContingentPool.makerCollateralAmount = "0";

      // Generate signature
      [signature] = await generateSignatureAndTypedMessageHash(
        user1,
        divaDomain,
        CREATE_POOL_TYPE,
        offerCreateContingentPool,
        "OfferCreateContingentPool"
      );

      // Set takerFillAmount equal to takerCollateralAmount
      takerFillAmount = offerCreateContingentPool.takerCollateralAmount;

      // ---------
      // Act: Fully fill offer
      // ---------
      await eip712CreateFacet
        .connect(user2)
        .fillOfferCreateContingentPool(
          offerCreateContingentPool,
          signature,
          takerFillAmount
        );

      // ---------
      // Assert: Confirm that actualTakerFillableAmount is equal 0
      // ---------
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool,
          signature
        );
      expect(relevantStateParams.offerInfo.takerFilledAmount).to.eq(
        offerCreateContingentPool.takerCollateralAmount
      );
      expect(relevantStateParams.actualTakerFillableAmount).to.eq(
        BigNumber.from(0)
      );
    });

    it("Should return the right parameters for an unfilled create contingent pool offer", async function () {
      // ---------
      // Arrange: Get offer relevant state
      // ---------
      const [
        offerInfo,
        actualTakerFillableAmount,
        isSignatureValid,
        isValidInputParamsCreateContingentPool,
      ]: [OfferInfo, BigNumber, boolean, boolean] =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool,
          signature
        );

      // ---------
      // Assert: Confirm that offer relevant state is correct
      // ---------
      expect(actualTakerFillableAmount).to.eq(
        offerCreateContingentPool.takerCollateralAmount
      );
      expect(isSignatureValid).to.eq(true);
      expect(offerInfo.status).to.eq(OfferStatus.Fillable);
      expect(offerInfo.typedOfferHash).to.eq(typedMessageHash);
      expect(offerInfo.takerFilledAmount).to.eq(0);
      expect(isValidInputParamsCreateContingentPool).to.be.true;
    });

    it("Returns isSignatureValid = false if invalid signature", async () => {
      // ---------
      // Arrange: Manipulate the offer object
      // ---------
      offerCreateContingentPool.maker = ethers.constants.AddressZero;

      // ---------
      // Act & Assert: Confirm that isSignatureValid = false
      // ---------
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool,
          signature
        );
      expect(relevantStateParams.isSignatureValid).to.be.false;
    });

    it("Returns isValidInputParamsCreateContingentPool = false if invalid contingent pool parameters", async () => {
      // ---------
      // Arrange: Set an invalid combination of create contingent pool parameters
      // ---------
      // Set cap below the floor which is an invalid combination
      offerCreateContingentPool.floor = parseUnits("50").toString();
      offerCreateContingentPool.cap = parseUnits("30").toString();

      // ---------
      // Act & Assert: Confirm that `isValidInputParamsCreateContingentPool` = false
      // ---------
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateCreateContingentPool(
          offerCreateContingentPool,
          signature
        );
      expect(relevantStateParams.isValidInputParamsCreateContingentPool).to.be
        .false;
    });
  });

  describe("fillOfferAddLiquidity", async function () {
    describe("fillOfferAddLiquidity with non-zero taker address and makerIsLong as true", async function () {
      beforeEach(async () => {
        // Create a contingent pool on DIVA Protocol
        const tx = await poolFacet
          .connect(user1)
          .createContingentPool(createPoolParams);
        const receipt = await tx.wait();

        // Get poolId of the newly created pool from event
        poolId = receipt.events?.find((x: any) => x.event === "PoolIssued")
          ?.args?.poolId;

        // Get pool parameters of newly created pool
        poolParams = await getterFacet.getPoolParameters(poolId);

        // Get instances of short and long token
        shortTokenInstance = await erc20AttachFixture(poolParams.shortToken);
        longTokenInstance = await erc20AttachFixture(poolParams.longToken);

        // Generate offerAddLiquidity
        offerAddLiquidity = await generateAddLiquidityOfferDetails(
          user1.address.toString(),
          user2.address.toString(),
          true,
          poolId,
          collateralTokenDecimals
        );

        // Generate signature and typed message hash
        [signature, typedMessageHash] =
          await generateSignatureAndTypedMessageHash(
            user1,
            divaDomain,
            ADD_LIQUIDITY_TYPE,
            offerAddLiquidity,
            "OfferAddLiquidity"
          );
      });

      it("Should fully fill an add liquidity offer and update the relevant parameters", async function () {
        // ---------
        // Arrange: Set takerFillAmount equal to takerCollateralAmount, calculate expected collateral balance and token balances for both users before adding liquidity
        // ---------

        // Set takerFillAmount = takerCollateralAmount
        takerFillAmount = offerAddLiquidity.takerCollateralAmount;

        // Calculate makerFillAmount, poolFillAmount and expected new collateral balance of the pool
        makerFillAmount = calcMakerFillAmount(
          takerFillAmount,
          offerAddLiquidity.makerCollateralAmount,
          offerAddLiquidity.takerCollateralAmount
        );
        poolFillAmount = calcPoolFillAmount(takerFillAmount, makerFillAmount);
        expectedCollateralBalance = calcNewCollateralBalance(
          poolFillAmount,
          poolParams.collateralBalance.toString()
        );

        // Get balance of collateral token for both users before add liquidity
        balanceOfCollateralTokenBeforeUser1 = await collateralToken.balanceOf(
          user1.address
        );
        balanceOfCollateralTokenBeforeUser2 = await collateralToken.balanceOf(
          user2.address
        );

        // Get balance of collateral token for DIVA Protocol before add liquidity
        balanceOfCollateralTokenBeforeDiva = await collateralToken.balanceOf(
          diamondAddress
        );

        // Get balance of long token for user1 before add liquidity
        balanceOfLongTokenBeforeUser1 = await longTokenInstance.balanceOf(
          user1.address
        );
        // Get balance of long token for user1 before add liquidity
        balanceOfShortTokenBeforeUser2 = await shortTokenInstance.balanceOf(
          user2.address
        );

        // Check relevant eip712 related parameters before the offer is being filled
        const relevantStateParamsBefore =
          await getterFacet.getOfferRelevantStateAddLiquidity(
            offerAddLiquidity,
            signature
          );

        expect(relevantStateParamsBefore.offerInfo.typedOfferHash).to.eq(
          typedMessageHash
        );
        expect(relevantStateParamsBefore.offerInfo.status).to.eq(
          OfferStatus.Fillable
        );
        expect(relevantStateParamsBefore.offerInfo.takerFilledAmount).to.eq(0);
        expect(relevantStateParamsBefore.poolExists).to.be.true;

        // ---------
        // Act: Fill add liquidity offer
        // ---------
        await eip712AddFacet
          .connect(user2)
          .fillOfferAddLiquidity(offerAddLiquidity, signature, takerFillAmount);

        // ---------
        // Assert: Confirm that relevant parameters are updated correctly and the
        // user and DIVA Protocol collateral/position token balances are as expected
        // ---------

        // Get pool parameters after adding liquidity
        poolParams = await getterFacet.getPoolParameters(poolId);

        // Confirm that collateralBalance has increased to expectedCollateralBalance
        expect(poolParams.collateralBalance).to.eq(expectedCollateralBalance);

        // Confirm that takerFilledAmount for the corresponding offer has increased
        expect(await getterFacet.getTakerFilledAmount(typedMessageHash)).to.eq(
          takerFillAmount
        );

        // Confirm that total supply of both short and long tokens has increased
        expect(await shortTokenInstance.totalSupply()).to.eq(
          poolParams.collateralBalance
        );
        expect(await longTokenInstance.totalSupply()).to.eq(
          poolParams.collateralBalance
        );

        // Confirm that users received the right amounts of both short and long tokens.
        // If makerIsLong is true, confirm user1 received the right amount of long
        // and user2 the right amount of short position tokens.
        expect(await longTokenInstance.balanceOf(user1.address)).to.eq(
          balanceOfLongTokenBeforeUser1.add(poolFillAmount)
        );
        expect(await shortTokenInstance.balanceOf(user2.address)).to.eq(
          balanceOfShortTokenBeforeUser2.add(poolFillAmount)
        );

        // Confirm that the collateral token balance for both users has reduced
        expect(await collateralToken.balanceOf(user1.address)).to.eq(
          balanceOfCollateralTokenBeforeUser1.sub(makerFillAmount)
        );
        expect(await collateralToken.balanceOf(user2.address)).to.eq(
          balanceOfCollateralTokenBeforeUser2.sub(takerFillAmount)
        );

        // Confirm that DIVA Protocol's collateral token balance has increased
        expect(await collateralToken.balanceOf(diamondAddress)).to.eq(
          balanceOfCollateralTokenBeforeDiva.add(poolFillAmount)
        );

        // Confirm that the relevant eip712 related parameters have been updated
        const relevantStateParamsAfter =
          await getterFacet.getOfferRelevantStateAddLiquidity(
            offerAddLiquidity,
            signature
          );
        expect(relevantStateParamsAfter.offerInfo.typedOfferHash).to.eq(
          typedMessageHash
        );
        expect(relevantStateParamsAfter.offerInfo.status).to.eq(
          OfferStatus.Filled
        );
        expect(relevantStateParamsAfter.offerInfo.takerFilledAmount).to.eq(
          takerFillAmount
        );
        expect(relevantStateParamsAfter.poolExists).to.be.true; // should remain unchanged
      });

      it("Should fill an add liquidity offer in two steps", async function () {
        // ---------
        // Arrange: Simulate a partial fill of an add liquidity offer
        // ---------

        // Set takerFillAmountFirstFill < takerCollateralAmount to simulate a partial fill of an add liquidity offer
        const takerFillAmountFirstFill = parseUnits(
          "60",
          collateralTokenDecimals
        ).toString();
        expect(BigNumber.from(takerFillAmountFirstFill)).to.be.lt(
          BigNumber.from(offerAddLiquidity.takerCollateralAmount)
        );

        // Fill add liquidity pool offer with user2 address (taker)
        await eip712AddFacet
          .connect(user2)
          .fillOfferAddLiquidity(
            offerAddLiquidity,
            signature,
            takerFillAmountFirstFill
          );

        // Get balance of collateral token for both users before add liquidity
        balanceOfCollateralTokenBeforeUser1 = await collateralToken.balanceOf(
          user1.address
        );
        balanceOfCollateralTokenBeforeUser2 = await collateralToken.balanceOf(
          user2.address
        );

        // Get balance of collateral token for DIVA protocol before add liquidity
        balanceOfCollateralTokenBeforeDiva = await collateralToken.balanceOf(
          diamondAddress
        );

        // Get balance of short and long tokens for user1 and user2
        balanceOfShortTokenBeforeUser2 = await shortTokenInstance.balanceOf(
          user2.address
        );
        balanceOfLongTokenBeforeUser1 = await longTokenInstance.balanceOf(
          user1.address
        );

        // Confirm that the relevant eip712 related parameters are as expected after first fill
        const relevantStateParamsAfterFirstFill =
          await getterFacet.getOfferRelevantStateAddLiquidity(
            offerAddLiquidity,
            signature
          );
        expect(relevantStateParamsAfterFirstFill.offerInfo.status).to.eq(4); // FILLABLE
        expect(
          relevantStateParamsAfterFirstFill.offerInfo.takerFilledAmount
        ).to.eq(takerFillAmountFirstFill);

        // Get pool parameters before adding liquidity a second time
        poolParams = await getterFacet.getPoolParameters(poolId);

        // Set takerFillAmountSecondFill equal to remaining takerFillAmount before adding more liquidity
        const takerFillAmountSecondFill = calcFillableRemainingAmount(
          offerAddLiquidity.takerCollateralAmount,
          (await getterFacet.getTakerFilledAmount(typedMessageHash)).toString()
        );

        // Calculate makerFillAmount, poolFillAmount and expected new collateral balance of the pool
        makerFillAmount = calcMakerFillAmount(
          takerFillAmountSecondFill,
          offerAddLiquidity.makerCollateralAmount,
          offerAddLiquidity.takerCollateralAmount
        );
        poolFillAmount = calcPoolFillAmount(
          takerFillAmountSecondFill,
          makerFillAmount
        );
        expectedCollateralBalance = calcNewCollateralBalance(
          poolFillAmount,
          poolParams.collateralBalance.toString()
        );

        // ---------
        // Act: User2 calls fillOfferAddLiquidity again with takerFillAmountSecondFill equal to remaining takerCollateralAmount
        // ---------
        await eip712AddFacet
          .connect(user2)
          .fillOfferAddLiquidity(
            offerAddLiquidity,
            signature,
            takerFillAmountSecondFill
          );

        // ---------
        // Assert: Confirm that relevant parameters are updated correctly and the
        // user and DIVA Protocol collateral/position token balances are as expected
        // ---------

        // Get pool parameters after add liquidity has been executed
        poolParams = await getterFacet.getPoolParameters(poolId);

        // Confirm that collateralBalance has increased to expectedCollateralBalance
        expect(poolParams.collateralBalance).to.eq(expectedCollateralBalance);

        // Confirm that taker filled amount has increased
        expect(await getterFacet.getTakerFilledAmount(typedMessageHash)).to.eq(
          offerAddLiquidity.takerCollateralAmount
        );

        // Confirm that total supply of both short and long tokens has increased
        expect(await shortTokenInstance.totalSupply()).to.eq(
          poolParams.collateralBalance
        );
        expect(await longTokenInstance.totalSupply()).to.eq(
          poolParams.collateralBalance
        );

        // Confirm that users received the right amounts of both short and long tokens.
        // If makerIsLong is true, confirm user1 received the right amount of long
        // and user2 the right amount of short position tokens.
        expect(await longTokenInstance.balanceOf(user1.address)).to.eq(
          balanceOfLongTokenBeforeUser1.add(poolFillAmount)
        );
        expect(await shortTokenInstance.balanceOf(user2.address)).to.eq(
          balanceOfShortTokenBeforeUser2.add(poolFillAmount)
        );

        // Confirm that the collateral token balance for both users has reduced
        expect(await collateralToken.balanceOf(user1.address)).to.eq(
          balanceOfCollateralTokenBeforeUser1.sub(makerFillAmount)
        );
        expect(await collateralToken.balanceOf(user2.address)).to.eq(
          balanceOfCollateralTokenBeforeUser2.sub(takerFillAmountSecondFill)
        );

        // Confirm that the collateral token balance for DIVA protocol has increased
        expect(await collateralToken.balanceOf(diamondAddress)).to.eq(
          balanceOfCollateralTokenBeforeDiva.add(poolFillAmount)
        );

        // Confirm that the relevant eip712 related parameters have been updated correctly
        const relevantStateParamsAfterSecondFill =
          await getterFacet.getOfferRelevantStateAddLiquidity(
            offerAddLiquidity,
            signature
          );
        expect(
          relevantStateParamsAfterSecondFill.offerInfo.typedOfferHash
        ).to.eq(relevantStateParamsAfterFirstFill.offerInfo.typedOfferHash); // should remain unchanged
        expect(relevantStateParamsAfterSecondFill.offerInfo.status).to.eq(
          OfferStatus.Filled
        );
        expect(
          relevantStateParamsAfterSecondFill.offerInfo.takerFilledAmount
        ).to.eq(
          BigNumber.from(takerFillAmountFirstFill).add(
            takerFillAmountSecondFill
          )
        );
        expect(relevantStateParamsAfterSecondFill.poolExists).to.eq(
          relevantStateParamsAfterFirstFill.poolExists
        ); // should remain unchanged
      });

      it("Should fill an add liquidity offer with minimumTakerFillAmount", async () => {
        // ---------
        // Arrange: Set takerFillAmount equal to minimumTakerFillAmount
        // ---------
        takerFillAmount = offerAddLiquidity.minimumTakerFillAmount;

        // Check relevant eip712 related parameters before the offer is being filled
        const relevantStateParamsBefore =
          await getterFacet.getOfferRelevantStateAddLiquidity(
            offerAddLiquidity,
            signature
          );
        expect(relevantStateParamsBefore.offerInfo.status).to.eq(
          OfferStatus.Fillable
        );
        expect(relevantStateParamsBefore.offerInfo.takerFilledAmount).to.eq(0);

        // ---------
        // Act: Fill add liquidity offer
        // ---------
        await eip712AddFacet
          .connect(user2)
          .fillOfferAddLiquidity(offerAddLiquidity, signature, takerFillAmount);

        // ---------
        // Assert: Confirm that the status remains fillable and takerFilledAmount increased
        // ---------
        const relevantStateParamsAfter =
          await getterFacet.getOfferRelevantStateAddLiquidity(
            offerAddLiquidity,
            signature
          );
        expect(relevantStateParamsAfter.offerInfo.status).to.eq(
          OfferStatus.Fillable
        );
        expect(relevantStateParamsAfter.offerInfo.takerFilledAmount).to.eq(
          takerFillAmount
        );
      });

      it("Should fill an add liquidity offer with an amount smaller than minimumTakerFillAmount on second fill", async () => {
        // ---------
        // Arrange: Fill an offer partially with minimum taker amount
        // ---------
        // Set takerFillAmountFirstFill < takerCollateralAmount to simulate a partial fill of an add liquidity offer
        const takerFillAmountFirstFill = BigNumber.from(
          offerAddLiquidity.minimumTakerFillAmount
        );
        expect(takerFillAmountFirstFill).to.be.lt(
          BigNumber.from(offerAddLiquidity.takerCollateralAmount)
        );
        expect(takerFillAmountFirstFill).to.be.gt(0);

        // Fill add liquidity offer with user2 address (taker in underlying offer)
        await eip712AddFacet
          .connect(user2)
          .fillOfferAddLiquidity(
            offerAddLiquidity,
            signature,
            takerFillAmountFirstFill
          );

        // ---------
        // Act: Fill offer a second time with takerFillAmount smaller than minimum taker amount
        // ---------
        const takerFillAmountSecondFill = BigNumber.from(1);
        await eip712AddFacet
          .connect(user2)
          .fillOfferAddLiquidity(
            offerAddLiquidity,
            signature,
            takerFillAmountSecondFill
          );

        // ---------
        // Assert: Confirm that takerFilledAmount increased
        // ---------
        const relevantStateParams =
          await getterFacet.getOfferRelevantStateAddLiquidity(
            offerAddLiquidity,
            signature
          );
        expect(relevantStateParams.offerInfo.takerFilledAmount).to.eq(
          takerFillAmountFirstFill.add(takerFillAmountSecondFill)
        );
      });

      // -------------------------------------------
      // Reverts
      // -------------------------------------------

      it("Reverts if takerFillAmount is smaller than minimumTakerFillAmount on first fill", async () => {
        // ---------
        // Arrange: Set takerFillAmount smaller than minimumTakerFillAmount
        // ---------
        takerFillAmount = BigNumber.from(
          offerAddLiquidity.minimumTakerFillAmount
        )
          .sub(1)
          .toString();

        // ---------
        // Act & Assert: Check that `fillOfferAddLiquidity` fails
        // ---------
        await expect(
          eip712AddFacet
            .connect(user2)
            .fillOfferAddLiquidity(
              offerAddLiquidity,
              signature,
              takerFillAmount
            )
        ).to.be.revertedWith("TakerFillAmountSmallerMinimum()");
      });

      it("Reverts if takerFillAmount exceeds takerCollateralAmount", async () => {
        // ---------
        // Arrange: Set takerFillAmount higher than taker collateral amount
        // ---------
        takerFillAmount = BigNumber.from(
          offerAddLiquidity.takerCollateralAmount
        )
          .add(1)
          .toString();

        // ---------
        // Act & Assert: Check that `fillOfferAddLiquidity` fails
        // ---------
        await expect(
          eip712AddFacet
            .connect(user2)
            .fillOfferAddLiquidity(
              offerAddLiquidity,
              signature,
              takerFillAmount
            )
        ).to.be.revertedWith("TakerFillAmountExceedsFillableAmount()");
      });

      it("Reverts if takerFillAmount exceeds remaining fillable taker amount on second fill", async () => {
        // ---------
        // Arrange: Simulate a partial fill and set the next takerFillAmount higher than remaining taker fill amount
        // ---------

        // Set takerFillAmount < takerCollateralAmount to simulate a partial fill of an add liquidity offer
        takerFillAmount = offerAddLiquidity.minimumTakerFillAmount;
        expect(BigNumber.from(takerFillAmount)).to.be.lt(
          BigNumber.from(offerAddLiquidity.takerCollateralAmount)
        );

        // Fill add liquidity offer with user2 address (taker)
        await eip712AddFacet
          .connect(user2)
          .fillOfferAddLiquidity(offerAddLiquidity, signature, takerFillAmount);

        // Set takerFillAmount higher than remaining takerFillAmount before adding more liquidity
        const remainingTakerFillAmount = calcFillableRemainingAmount(
          offerAddLiquidity.takerCollateralAmount,
          (await getterFacet.getTakerFilledAmount(typedMessageHash)).toString()
        );
        takerFillAmount = BigNumber.from(remainingTakerFillAmount)
          .add(1)
          .toString();

        // ---------
        // Act & Assert: Check that `fillOfferAddLiquidity` fails
        // ---------
        await expect(
          eip712AddFacet
            .connect(user2)
            .fillOfferAddLiquidity(
              offerAddLiquidity,
              signature,
              takerFillAmount
            )
        ).to.be.revertedWith("TakerFillAmountExceedsFillableAmount()");
      });

      it("Reverts if offer taker is not equal to offerTaker from offerAddLiquidity", async () => {
        // ---------
        // Act & Assert: Check that `fillOfferAddLiquidity` fails with user3
        // ---------
        await expect(
          eip712AddFacet
            .connect(user3)
            .fillOfferAddLiquidity(
              offerAddLiquidity,
              signature,
              offerAddLiquidity.takerCollateralAmount
            )
        ).to.be.revertedWith("UnauthorizedTaker()");
      });

      it("Reverts if passed invalid offerAddLiquidity (different salt)", async () => {
        // ---------
        // Arrange: Change the salt in offerAddLiquidity which will render the offer to no longer match the signed message
        // ---------

        // Change the salt in offerAddLiquidity
        offerAddLiquidity.salt = Date.now().toString();

        // Generate new signature with new offerAddLiquidity
        const [newSignature] = await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          ADD_LIQUIDITY_TYPE,
          offerAddLiquidity,
          "OfferAddLiquidity"
        );
        // Compare signatures
        expect(newSignature).to.not.eq(signature);

        // ---------
        // Act & Assert: Check that `fillOfferAddLiquidity` fails
        // ---------
        await expect(
          eip712AddFacet
            .connect(user2)
            .fillOfferAddLiquidity(
              offerAddLiquidity,
              signature,
              offerAddLiquidity.takerCollateralAmount
            )
        ).to.be.revertedWith("InvalidSignature()");
      });

      it("Reverts if passed invalid signature (wrong 'v' value)", async () => {
        // ---------
        // Arrange: Set v of signature to non-27
        // ---------
        signature.v = 26;

        // ---------
        // Act & Assert: Check that `fillOfferAddLiquidity` fails
        // ---------
        await expect(
          eip712AddFacet
            .connect(user2)
            .fillOfferAddLiquidity(
              offerAddLiquidity,
              signature,
              offerAddLiquidity.takerCollateralAmount
            )
        ).to.be.revertedWith("ECDSA: invalid signature");
      });

      it("Reverts if offerExpiry has passed (offer status = EXPIRED)", async () => {
        // ---------
        // Arrange: Set next block's timestamp after offerExpiry time
        // ---------
        await setNextTimestamp(
          ethers.provider,
          Number(offerAddLiquidity.offerExpiry) + 1
        );

        // ---------
        // Act & Assert: Check that `fillOfferAddLiquidity` fails
        // ---------
        await expect(
          eip712AddFacet
            .connect(user2)
            .fillOfferAddLiquidity(
              offerAddLiquidity,
              signature,
              offerAddLiquidity.takerCollateralAmount
            )
        ).to.be.revertedWith("OfferInvalidCancelledFilledOrExpired()");
      });

      it("Reverts if takerCollateralAmount = 0 (offer status = INVALID)", async () => {
        // ---------
        // Arrange: Set takerCollateralAmount = 0 in offerAddLiquidity which will render the offer invalid
        // ---------

        // Set takerCollateralAmount = 0 in offerAddLiquidity
        offerAddLiquidity.takerCollateralAmount = "0";

        // Generate new signature with new offerAddLiquidity
        const [signature] = await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          ADD_LIQUIDITY_TYPE,
          offerAddLiquidity,
          "OfferAddLiquidity"
        );

        // ---------
        // Act & Assert: Check that `fillOfferAddLiquidity` fails
        // ---------
        await expect(
          eip712AddFacet
            .connect(user2)
            .fillOfferAddLiquidity(
              offerAddLiquidity,
              signature,
              offerAddLiquidity.takerCollateralAmount
            )
        ).to.be.revertedWith("OfferInvalidCancelledFilledOrExpired()");
      });

      it("Reverts if user tries to fill offer an already cancelled offer (offer status = CANCELLED)", async () => {
        // ---------
        // Arrange: Cancel add liquidity offer
        // ---------
        await eip712CancelFacet
          .connect(user1)
          .cancelOfferAddLiquidity(offerAddLiquidity);

        // ---------
        // Act & Assert: Check that `fillOfferAddLiquidity` fails
        // ---------
        await expect(
          eip712AddFacet
            .connect(user2)
            .fillOfferAddLiquidity(
              offerAddLiquidity,
              signature,
              offerAddLiquidity.takerCollateralAmount
            )
        ).to.be.revertedWith("OfferInvalidCancelledFilledOrExpired()");
      });

      it("Reverts if user tries to fill an already filled offer (offer status = FILLED)", async () => {
        // ---------
        // Arrange: Simulate a full fill and set the next takerFillAmount at 1
        // ---------

        // Set takerFillAmount equal to takerCollateralAmount to simulate a full fill of an add liquidity offer
        takerFillAmount = offerAddLiquidity.takerCollateralAmount;

        // Fill add liquidity offer with user2 address (taker)
        await eip712AddFacet
          .connect(user2)
          .fillOfferAddLiquidity(offerAddLiquidity, signature, takerFillAmount);

        // Confirm that the offer is already filled
        const relevantStateParamsAfterFullFill =
          await getterFacet.getOfferRelevantStateAddLiquidity(
            offerAddLiquidity,
            signature
          );
        expect(relevantStateParamsAfterFullFill.offerInfo.status).to.eq(
          OfferStatus.Filled
        );

        // Set takerFillAmount at 1
        takerFillAmount = "1";

        // ---------
        // Act & Assert: Check that `fillOfferAddLiquidity` fails
        // ---------
        await expect(
          eip712AddFacet
            .connect(user2)
            .fillOfferAddLiquidity(
              offerAddLiquidity,
              signature,
              takerFillAmount
            )
        ).to.be.revertedWith("OfferInvalidCancelledFilledOrExpired()");
      });

      // -------------------------------------------
      // Events
      // -------------------------------------------

      it("Should emit an OfferFilled event (fillOfferAddLiquidity)", async () => {
        // ---------
        // Arrange: Set takerFillAmount
        // ---------
        takerFillAmount = BigNumber.from(
          offerAddLiquidity.takerCollateralAmount
        ).toString();

        // ---------
        // Act: Fill add liquidity offer
        // ---------
        const tx = await eip712AddFacet
          .connect(user2)
          .fillOfferAddLiquidity(offerAddLiquidity, signature, takerFillAmount);
        const receipt = await tx.wait();

        // ---------
        // Asset: Confirm that the OfferFilled event is emitted with the right parameters
        // ---------
        const offerFilledEvent = receipt.events?.find(
          (item: any) => item.event === "OfferFilled"
        );
        expect(offerFilledEvent?.args?.typedOfferHash).to.eq(typedMessageHash);
        expect(offerFilledEvent?.args?.maker).to.eq(offerAddLiquidity.maker);
        expect(offerFilledEvent?.args?.taker).to.eq(offerAddLiquidity.taker);
        expect(offerFilledEvent?.args?.takerFilledAmount).to.eq(
          takerFillAmount
        );
      });
    });

    describe("fillOfferAddLiquidity with non-zero taker address and makerIsLong as false", async function () {
      beforeEach(async () => {
        // Create a contingent pool on DIVA Protocol
        const tx = await poolFacet
          .connect(user1)
          .createContingentPool(createPoolParams);
        const receipt = await tx.wait();

        // Get poolId of the newly created pool from event
        poolId = receipt.events?.find((x: any) => x.event === "PoolIssued")
          ?.args?.poolId;

        // Get pool parameters of newly created pool
        poolParams = await getterFacet.getPoolParameters(poolId);

        // Get instances of short and long token
        shortTokenInstance = await erc20AttachFixture(poolParams.shortToken);
        longTokenInstance = await erc20AttachFixture(poolParams.longToken);

        // Generate offerAddLiquidity
        offerAddLiquidity = await generateAddLiquidityOfferDetails(
          user1.address.toString(), // maker
          user2.address.toString(), // taker
          false, // makerIsLong
          poolId,
          collateralTokenDecimals
        );

        // Generate signature
        [signature] = await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          ADD_LIQUIDITY_TYPE,
          offerAddLiquidity,
          "OfferAddLiquidity"
        );
      });

      it("Should fully fill an add liquidity offer and update the relevant parameters", async function () {
        // ---------
        // Arrange: Set takerFillAmount equal to takerCollateralAmount, calculate expected collateral balance and token balances for both users before adding liquidity
        // ---------

        // Set takerFillAmount = takerCollateralAmount
        takerFillAmount = offerAddLiquidity.takerCollateralAmount;

        // Calculate makerFillAmount, poolFillAmount and expected new collateral balance of the pool
        makerFillAmount = calcMakerFillAmount(
          takerFillAmount,
          offerAddLiquidity.makerCollateralAmount,
          offerAddLiquidity.takerCollateralAmount
        );
        poolFillAmount = calcPoolFillAmount(takerFillAmount, makerFillAmount);

        // Get balance of collateral token for both users before add liquidity
        balanceOfCollateralTokenBeforeUser1 = await collateralToken.balanceOf(
          user1.address
        );
        balanceOfCollateralTokenBeforeUser2 = await collateralToken.balanceOf(
          user2.address
        );

        // Get balance of collateral token for DIVA Protocol before add liquidity
        balanceOfCollateralTokenBeforeDiva = await collateralToken.balanceOf(
          diamondAddress
        );

        // Get balance of short token for user1 before add liquidity
        const balanceOfShortTokenBeforeUser1 =
          await shortTokenInstance.balanceOf(user1.address);
        // Get balance of long token for user2 before add liquidity
        const balanceOfLongTokenBeforeUser2 = await longTokenInstance.balanceOf(
          user2.address
        );

        // ---------
        // Act: User2 fills add liquidity offer
        // ---------
        await eip712AddFacet
          .connect(user2)
          .fillOfferAddLiquidity(offerAddLiquidity, signature, takerFillAmount);

        // ---------
        // Assert: Confirm that relevant parameters are updated correctly and the
        // user and DIVA Protocol collateral/position token balances are as expected
        // ---------

        // Confirm that users received the right amounts of both short and long tokens.
        // If makerIsLong is false, confirm user1 received the right amount of short
        // and user2 the right amount of long position tokens.
        expect(await shortTokenInstance.balanceOf(user1.address)).to.eq(
          balanceOfShortTokenBeforeUser1.add(poolFillAmount)
        );
        expect(await longTokenInstance.balanceOf(user2.address)).to.eq(
          balanceOfLongTokenBeforeUser2.add(poolFillAmount)
        );

        // Confirm that the collateral token balance for both users has reduced
        expect(await collateralToken.balanceOf(user1.address)).to.eq(
          balanceOfCollateralTokenBeforeUser1.sub(makerFillAmount)
        );
        expect(await collateralToken.balanceOf(user2.address)).to.eq(
          balanceOfCollateralTokenBeforeUser2.sub(takerFillAmount)
        );

        // Confirm that DIVA Protocol's collateral token balance has increased
        expect(await collateralToken.balanceOf(diamondAddress)).to.eq(
          balanceOfCollateralTokenBeforeDiva.add(poolFillAmount)
        );
      });
    });

    describe("fillOfferAddLiquidity with zero taker address", async function () {
      beforeEach(async () => {
        // Create a contingent pool on DIVA Protocol
        const tx = await poolFacet
          .connect(user1)
          .createContingentPool(createPoolParams);
        const receipt = await tx.wait();

        // Get poolId of the newly created pool from event
        poolId = receipt.events?.find((x: any) => x.event === "PoolIssued")
          ?.args?.poolId;

        // Get pool parameters of newly created pool
        poolParams = await getterFacet.getPoolParameters(poolId);

        // Get instances of short and long token
        shortTokenInstance = await erc20AttachFixture(poolParams.shortToken);
        longTokenInstance = await erc20AttachFixture(poolParams.longToken);

        // Generate offerAddLiquidity
        offerAddLiquidity = await generateAddLiquidityOfferDetails(
          user1.address.toString(), // maker
          ethers.constants.AddressZero, // taker = zero address
          true, // makerIsLong
          poolId,
          collateralTokenDecimals
        );

        // Generate signature
        [signature] = await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          ADD_LIQUIDITY_TYPE,
          offerAddLiquidity,
          "OfferAddLiquidity"
        );
      });

      it("Should be able to fill offer with user2 address", async function () {
        // ---------
        // Arrange: Set takerFillAmount equal to takerCollateralAmount and get balance of collateral token for both users before adding liquidity
        // ---------

        // Set takerFillAmount = takerCollateralAmount
        takerFillAmount = offerAddLiquidity.takerCollateralAmount;

        // Calculate makerFillAmount, poolFillAmount and expected new collateral balance of the pool
        makerFillAmount = calcMakerFillAmount(
          takerFillAmount,
          offerAddLiquidity.makerCollateralAmount,
          offerAddLiquidity.takerCollateralAmount
        );
        poolFillAmount = calcPoolFillAmount(takerFillAmount, makerFillAmount);

        // Get balance of collateral token for both users before add liquidity
        balanceOfCollateralTokenBeforeUser1 = await collateralToken.balanceOf(
          user1.address
        );
        balanceOfCollateralTokenBeforeUser2 = await collateralToken.balanceOf(
          user2.address
        );

        // Get balance of collateral token for DIVA Protocol before add liquidity
        balanceOfCollateralTokenBeforeDiva = await collateralToken.balanceOf(
          diamondAddress
        );

        // Get balance of long token for user1 before add liquidity
        balanceOfLongTokenBeforeUser1 = await longTokenInstance.balanceOf(
          user1.address
        );
        // Get balance of short token for user2 before add liquidity
        balanceOfShortTokenBeforeUser2 = await shortTokenInstance.balanceOf(
          user2.address
        );

        // ---------
        // Act: User2 fills add liquidity offer
        // ---------
        await eip712AddFacet
          .connect(user2)
          .fillOfferAddLiquidity(offerAddLiquidity, signature, takerFillAmount);

        // ---------
        // Assert: Confirm that relevant parameters are updated correctly and the
        // user and DIVA Protocol collateral/position token balances are as expected
        // ---------

        // Confirm that users received the right amounts of both short and long tokens.
        // If makerIsLong is true, confirm user1 received the right amount of long
        // and user2 the right amount of short position tokens.
        expect(await longTokenInstance.balanceOf(user1.address)).to.eq(
          balanceOfLongTokenBeforeUser1.add(poolFillAmount)
        );
        expect(await shortTokenInstance.balanceOf(user2.address)).to.eq(
          balanceOfShortTokenBeforeUser2.add(poolFillAmount)
        );

        // Confirm that the collateral token balance for both users has reduced
        expect(await collateralToken.balanceOf(user1.address)).to.eq(
          balanceOfCollateralTokenBeforeUser1.sub(makerFillAmount)
        );
        expect(await collateralToken.balanceOf(user2.address)).to.eq(
          balanceOfCollateralTokenBeforeUser2.sub(takerFillAmount)
        );

        // Confirm that DIVA Protocol's collateral token balance has increased
        expect(await collateralToken.balanceOf(diamondAddress)).to.eq(
          balanceOfCollateralTokenBeforeDiva.add(poolFillAmount)
        );
      });
    });
  });

  describe("batchFillOfferAddLiquidity", async function () {
    it("Should fully fill an add liquidity offer and update the relevant parameters", async function () {
      // ---------
      // Arrange: Create 2 contingent pools and set takerFillAmount equal to takerCollateralAmount, calculate expected collateral balances and token balances for both users before adding liquidity
      // ---------

      // Create first contingent pool on DIVA Protocol
      const tx1 = await poolFacet
        .connect(user1)
        .createContingentPool(createPoolParams);
      const receipt1 = await tx1.wait();

      // Get poolId of the newly created pool from event
      const poolId1 = receipt1.events?.find(
        (x: any) => x.event === "PoolIssued"
      )?.args?.poolId;

      // Get pool parameters of newly created pool
      let poolParams1 = await getterFacet.getPoolParameters(poolId1);

      // Get instances of short and long token
      const shortTokenInstance1 = await erc20AttachFixture(
        poolParams1.shortToken
      );
      const longTokenInstance1 = await erc20AttachFixture(
        poolParams1.longToken
      );

      // Generate first offerAddLiquidity
      const offerAddLiquidity1 = await generateAddLiquidityOfferDetails(
        user1.address.toString(),
        user2.address.toString(),
        true,
        poolId1,
        collateralTokenDecimals
      );

      // Generate signature and typed message hash
      const [signature1, typedMessageHash1] =
        await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          ADD_LIQUIDITY_TYPE,
          offerAddLiquidity1,
          "OfferAddLiquidity"
        );

      // Set takerFillAmount = takerCollateralAmount
      const takerFillAmount1 = offerAddLiquidity1.takerCollateralAmount;

      // Calculate makerFillAmount, poolFillAmount and expected new collateral balance of first pool
      const makerFillAmount1 = calcMakerFillAmount(
        takerFillAmount1,
        offerAddLiquidity1.makerCollateralAmount,
        offerAddLiquidity1.takerCollateralAmount
      );
      const poolFillAmount1 = calcPoolFillAmount(
        takerFillAmount1,
        makerFillAmount1
      );
      const expectedCollateralBalance1 = calcNewCollateralBalance(
        poolFillAmount1,
        poolParams1.collateralBalance.toString()
      );

      // Get balance of long token for user1 before add liquidity
      const balanceOfLongToken1BeforeUser1 = await longTokenInstance1.balanceOf(
        user1.address
      );
      // Get balance of long token for user1 before add liquidity
      const balanceOfShortToken1BeforeUser2 =
        await shortTokenInstance1.balanceOf(user2.address);

      // Check relevant eip712 related parameters before the offer is being filled
      const relevantStateParamsBefore1 =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity1,
          signature1
        );

      expect(relevantStateParamsBefore1.offerInfo.typedOfferHash).to.eq(
        typedMessageHash1
      );
      expect(relevantStateParamsBefore1.offerInfo.status).to.eq(
        OfferStatus.Fillable
      );
      expect(relevantStateParamsBefore1.offerInfo.takerFilledAmount).to.eq(0);
      expect(relevantStateParamsBefore1.poolExists).to.be.true;
      // ------------------------------------------------

      // Create second contingent pool on DIVA Protocol
      const tx2 = await poolFacet
        .connect(user1)
        .createContingentPool(createPoolParams);
      const receipt2 = await tx2.wait();

      // Get poolId of the newly created pool from event
      const poolId2 = receipt2.events?.find(
        (x: any) => x.event === "PoolIssued"
      )?.args?.poolId;

      // Get pool parameters of newly created pool
      let poolParams2 = await getterFacet.getPoolParameters(poolId2);

      // Get instances of short and long token
      const shortTokenInstance2 = await erc20AttachFixture(
        poolParams2.shortToken
      );
      const longTokenInstance2 = await erc20AttachFixture(
        poolParams2.longToken
      );

      // Generate second offerAddLiquidity
      const offerAddLiquidity2 = await generateAddLiquidityOfferDetails(
        user1.address.toString(),
        user2.address.toString(),
        true,
        poolId2,
        collateralTokenDecimals
      );

      // Generate signature and typed message hash
      const [signature2, typedMessageHash2] =
        await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          ADD_LIQUIDITY_TYPE,
          offerAddLiquidity2,
          "OfferAddLiquidity"
        );

      // Set takerFillAmount = takerCollateralAmount
      const takerFillAmount2 = offerAddLiquidity2.takerCollateralAmount;

      // Calculate makerFillAmount, poolFillAmount and expected new collateral balance of second pool
      const makerFillAmount2 = calcMakerFillAmount(
        takerFillAmount2,
        offerAddLiquidity2.makerCollateralAmount,
        offerAddLiquidity2.takerCollateralAmount
      );
      const poolFillAmount2 = calcPoolFillAmount(
        takerFillAmount2,
        makerFillAmount2
      );
      const expectedCollateralBalance2 = calcNewCollateralBalance(
        poolFillAmount2,
        poolParams2.collateralBalance.toString()
      );

      // Get balance of long token for user1 before add liquidity
      const balanceOfLongToken2BeforeUser1 = await longTokenInstance2.balanceOf(
        user1.address
      );
      // Get balance of long token for user1 before add liquidity
      const balanceOfShortToken2BeforeUser2 =
        await shortTokenInstance2.balanceOf(user2.address);

      // Check relevant eip712 related parameters before the offer is being filled
      const relevantStateParamsBefore2 =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity2,
          signature2
        );

      expect(relevantStateParamsBefore2.offerInfo.typedOfferHash).to.eq(
        typedMessageHash2
      );
      expect(relevantStateParamsBefore2.offerInfo.status).to.eq(
        OfferStatus.Fillable
      );
      expect(relevantStateParamsBefore2.offerInfo.takerFilledAmount).to.eq(0);
      expect(relevantStateParamsBefore2.poolExists).to.be.true;
      // ------------------------------------------------

      // Get balance of collateral token for both users before add liquidity
      const balanceOfCollateralTokenBeforeUser1 =
        await collateralToken.balanceOf(user1.address);
      const balanceOfCollateralTokenBeforeUser2 =
        await collateralToken.balanceOf(user2.address);

      // Get balance of collateral token for DIVA Protocol before add liquidity
      const balanceOfCollateralTokenBeforeDiva =
        await collateralToken.balanceOf(diamondAddress);

      // ---------
      // Act: Batch fill add liquidity offer
      // ---------
      await eip712AddFacet.connect(user2).batchFillOfferAddLiquidity([
        {
          offerAddLiquidity: offerAddLiquidity1,
          signature: signature1,
          takerFillAmount: takerFillAmount1,
        },
        {
          offerAddLiquidity: offerAddLiquidity2,
          signature: signature2,
          takerFillAmount: takerFillAmount2,
        },
      ]);

      // ---------
      // Assert: Confirm that relevant parameters are updated correctly and the
      // user and DIVA Protocol collateral/position token balances are as expected
      // ---------

      // Get first pool parameters after adding liquidity
      poolParams1 = await getterFacet.getPoolParameters(poolId1);

      // Confirm that collateralBalance has increased to expectedCollateralBalance
      expect(poolParams1.collateralBalance).to.eq(expectedCollateralBalance1);

      // Confirm that takerFilledAmount for the corresponding offer has increased
      expect(await getterFacet.getTakerFilledAmount(typedMessageHash1)).to.eq(
        takerFillAmount1
      );

      // Confirm that total supply of both short and long tokens has increased
      expect(await shortTokenInstance1.totalSupply()).to.eq(
        poolParams1.collateralBalance
      );
      expect(await longTokenInstance1.totalSupply()).to.eq(
        poolParams1.collateralBalance
      );

      // Confirm that users received the right amounts of both short and long tokens.
      // If makerIsLong is true, confirm user1 received the right amount of long
      // and user2 the right amount of short position tokens.
      expect(await longTokenInstance1.balanceOf(user1.address)).to.eq(
        balanceOfLongToken1BeforeUser1.add(poolFillAmount1)
      );
      expect(await shortTokenInstance1.balanceOf(user2.address)).to.eq(
        balanceOfShortToken1BeforeUser2.add(poolFillAmount1)
      );

      // Confirm that the relevant eip712 related parameters have been updated
      const relevantStateParamsAfter1 =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity1,
          signature1
        );
      expect(relevantStateParamsAfter1.offerInfo.typedOfferHash).to.eq(
        typedMessageHash1
      );
      expect(relevantStateParamsAfter1.offerInfo.status).to.eq(
        OfferStatus.Filled
      );
      expect(relevantStateParamsAfter1.offerInfo.takerFilledAmount).to.eq(
        takerFillAmount1
      );
      expect(relevantStateParamsAfter1.poolExists).to.be.true; // should remain unchanged
      // ------------------------------------------------

      // Get second pool parameters after adding liquidity
      poolParams2 = await getterFacet.getPoolParameters(poolId2);

      // Confirm that collateralBalance has increased to expectedCollateralBalance
      expect(poolParams2.collateralBalance).to.eq(expectedCollateralBalance2);

      // Confirm that takerFilledAmount for the corresponding offer has increased
      expect(await getterFacet.getTakerFilledAmount(typedMessageHash2)).to.eq(
        takerFillAmount2
      );

      // Confirm that total supply of both short and long tokens has increased
      expect(await shortTokenInstance2.totalSupply()).to.eq(
        poolParams2.collateralBalance
      );
      expect(await longTokenInstance2.totalSupply()).to.eq(
        poolParams2.collateralBalance
      );

      // Confirm that users received the right amounts of both short and long tokens.
      // If makerIsLong is true, confirm user1 received the right amount of long
      // and user2 the right amount of short position tokens.
      expect(await longTokenInstance2.balanceOf(user1.address)).to.eq(
        balanceOfLongToken2BeforeUser1.add(poolFillAmount2)
      );
      expect(await shortTokenInstance2.balanceOf(user2.address)).to.eq(
        balanceOfShortToken2BeforeUser2.add(poolFillAmount2)
      );

      // Confirm that the relevant eip712 related parameters have been updated
      const relevantStateParamsAfter2 =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity2,
          signature2
        );
      expect(relevantStateParamsAfter2.offerInfo.typedOfferHash).to.eq(
        typedMessageHash2
      );
      expect(relevantStateParamsAfter2.offerInfo.status).to.eq(
        OfferStatus.Filled
      );
      expect(relevantStateParamsAfter2.offerInfo.takerFilledAmount).to.eq(
        takerFillAmount2
      );
      expect(relevantStateParamsAfter2.poolExists).to.be.true; // should remain unchanged
      // ------------------------------------------------

      // Confirm that the collateral token balance for both users has reduced
      expect(await collateralToken.balanceOf(user1.address)).to.eq(
        balanceOfCollateralTokenBeforeUser1
          .sub(makerFillAmount1)
          .sub(makerFillAmount2)
      );
      expect(await collateralToken.balanceOf(user2.address)).to.eq(
        balanceOfCollateralTokenBeforeUser2
          .sub(takerFillAmount1)
          .sub(takerFillAmount2)
      );

      // Confirm that DIVA Protocol's collateral token balance has increased
      expect(await collateralToken.balanceOf(diamondAddress)).to.eq(
        balanceOfCollateralTokenBeforeDiva
          .add(poolFillAmount1)
          .add(poolFillAmount2)
      );
    });
  });

  describe("cancelOfferAddLiquidity", async function () {
    beforeEach(async () => {
      // Create a contingent pool on DIVA protocol
      const tx = await poolFacet
        .connect(user1)
        .createContingentPool(createPoolParams);
      const receipt = await tx.wait();

      // Get poolId of the newly created pool from event
      poolId = receipt.events?.find((x: any) => x.event === "PoolIssued")?.args
        ?.poolId;

      // Generate offerAddLiquidity
      offerAddLiquidity = await generateAddLiquidityOfferDetails(
        user1.address.toString(), // maker
        user2.address.toString(), // taker
        true, // makerIsLong
        poolId,
        collateralTokenDecimals
      );

      // Generate signature and typed message hash
      [signature, typedMessageHash] =
        await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          ADD_LIQUIDITY_TYPE,
          offerAddLiquidity,
          "OfferAddLiquidity"
        );
    });

    it("Maker should be able to cancel an unfilled add liquidity offer", async function () {
      // ---------
      // Act: User1 cancel add liquidity offer
      // ---------
      await eip712CancelFacet
        .connect(user1)
        .cancelOfferAddLiquidity(offerAddLiquidity);

      // ---------
      // Assert: Confirm that offer is cancelled successfully
      // ---------
      expect(await getterFacet.getTakerFilledAmount(typedMessageHash)).to.eq(
        ethers.constants.MaxUint256
      );
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity,
          signature
        );
      expect(relevantStateParams.offerInfo.status).to.eq(OfferStatus.Cancelled);
    });

    it("Maker should be able to cancel a fully filled add liquidity offer", async function () {
      // ---------
      // Arrange: Simulate a full fill
      // ---------

      // Set takerFillAmount equal to takerCollateralAmount to simulate a full fill of an add liquidity offer
      takerFillAmount = offerAddLiquidity.takerCollateralAmount;

      // Fill add liquidity offer with user2 address (taker)
      await eip712AddFacet
        .connect(user2)
        .fillOfferAddLiquidity(offerAddLiquidity, signature, takerFillAmount);

      // Confirm that the offer is fully filled
      const relevantStateParamsAfterFullFill =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity,
          signature
        );
      expect(relevantStateParamsAfterFullFill.offerInfo.status).to.eq(
        OfferStatus.Filled
      );

      // ---------
      // Act: User1 (maker) cancels add liquidity offer
      // ---------
      await eip712CancelFacet
        .connect(user1)
        .cancelOfferAddLiquidity(offerAddLiquidity);

      // ---------
      // Assert: Confirm that the offer is cancelled successfully
      // ---------
      const relevantStateParamsAfterCancel =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity,
          signature
        );
      expect(relevantStateParamsAfterCancel.offerInfo.status).to.eq(
        OfferStatus.Cancelled
      );
    });

    it("Maker should be able to cancel a partially filled add liquidity offer", async function () {
      // ---------
      // Arrange: Simulate a partial fill
      // ---------

      // Set takerFillAmount < takerCollateralAmount to simulate a partial fill of an add liquidity offer
      takerFillAmount = offerAddLiquidity.minimumTakerFillAmount;
      expect(takerFillAmount).to.be.lt(
        BigNumber.from(offerAddLiquidity.takerCollateralAmount)
      );
      expect(takerFillAmount).to.be.gt(BigNumber.from(0));

      // Fill add liquidity offer with user2 address (taker)
      await eip712AddFacet
        .connect(user2)
        .fillOfferAddLiquidity(offerAddLiquidity, signature, takerFillAmount);

      // Confirm that the offer is still fillable
      const relevantStateParamsAfterPartialFill =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity,
          signature
        );
      expect(relevantStateParamsAfterPartialFill.offerInfo.status).to.eq(
        OfferStatus.Fillable
      );

      // ---------
      // Act: User1 (maker) cancels add liquidity offer
      // ---------
      await eip712CancelFacet
        .connect(user1)
        .cancelOfferAddLiquidity(offerAddLiquidity);

      // ---------
      // Assert: Confirm that the offer is cancelled successfully
      // ---------
      const relevantStateParamsAfterCancel =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity,
          signature
        );
      expect(relevantStateParamsAfterCancel.offerInfo.status).to.eq(
        OfferStatus.Cancelled
      );
    });

    it("Maker should be able to cancel an expired add liquidity offer", async function () {
      // ---------
      // Arrange: Set next block's timestamp after offerExpiry time and mine block to simulate expired offer
      // ---------
      await mineBlock(Number(offerAddLiquidity.offerExpiry) + 1);

      // Confirm that the offer is expired
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity,
          signature
        );
      expect(relevantStateParams.offerInfo.status).to.eq(OfferStatus.Expired);

      // ---------
      // Act: User1 (maker) cancels add liquidity offer
      // ---------
      await eip712CancelFacet
        .connect(user1)
        .cancelOfferAddLiquidity(offerAddLiquidity);

      // ---------
      // Assert: Confirm that the offer is cancelled successfully
      // ---------
      const relevantStateParamsAfterCancel =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity,
          signature
        );
      expect(relevantStateParamsAfterCancel.offerInfo.status).to.eq(
        OfferStatus.Cancelled
      );
    });

    it("Maker should be able to cancel an already cancelled add liquidity offer", async function () {
      // ---------
      // Arrange: Simulate a cancelled offer
      // ---------

      // User1 (maker) cancels add liquidity offer
      await eip712CancelFacet
        .connect(user1)
        .cancelOfferAddLiquidity(offerAddLiquidity);

      // Confirm that the offer is cancelled successfully
      const relevantStateParamsAfterFirstCancel =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity,
          signature
        );
      expect(relevantStateParamsAfterFirstCancel.offerInfo.status).to.eq(
        OfferStatus.Cancelled
      );

      // ---------
      // Act: User1 (maker) cancels add liquidity offer again
      // ---------
      await eip712CancelFacet
        .connect(user1)
        .cancelOfferAddLiquidity(offerAddLiquidity);

      // ---------
      // Assert: Confirm that the offer is still cancelled
      // ---------
      const relevantStateParamsAfterSecondCancel =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity,
          signature
        );
      expect(relevantStateParamsAfterSecondCancel.offerInfo.status).to.eq(
        OfferStatus.Cancelled
      );
    });

    // -------------------------------------------
    // Reverts
    // -------------------------------------------

    it("Should revert if add liquidity offer is not cancelled by maker", async function () {
      // ---------
      // Arrange: Confirm that user2 is not the maker of add liquidity offer
      // ---------
      expect(user2.address).to.not.eq(offerAddLiquidity.maker);

      // ---------
      // Act & Assert: Check that `cancelOfferAddLiquidity` fails with user2
      // ---------
      await expect(
        eip712CancelFacet
          .connect(user2)
          .cancelOfferAddLiquidity(offerAddLiquidity)
      ).to.be.revertedWith("MsgSenderNotMaker()");
    });

    // -------------------------------------------
    // Events
    // -------------------------------------------

    it("Should emit an OfferCancelled event (fillOfferAddLiquidity)", async () => {
      // ---------
      // Act: Cancel add liquidity offer
      // ---------
      const tx = await eip712CancelFacet
        .connect(user1)
        .cancelOfferAddLiquidity(offerAddLiquidity);
      const receipt = await tx.wait();

      // ---------
      // Asset: Confirm that the OfferFilled event is emitted with the right parameters
      // ---------
      const offerCancelledEvent = receipt.events?.find(
        (item: any) => item.event === "OfferCancelled"
      );
      expect(offerCancelledEvent?.args?.typedOfferHash).to.eq(typedMessageHash);
      expect(offerCancelledEvent?.args?.maker).to.eq(offerAddLiquidity.maker);
    });
  });

  describe("batchCancelOfferAddLiquidity", async function () {
    it("Maker should be able to cancel batch add liquidity offers", async function () {
      // ---------
      // Arrange: Create 2 add liquidity offers
      // ---------

      // Create first contingent pool on DIVA protocol
      const tx1 = await poolFacet
        .connect(user1)
        .createContingentPool(createPoolParams);
      const receipt1 = await tx1.wait();

      // Get poolId of the newly created pool from event
      const poolId1 = receipt1.events?.find(
        (x: any) => x.event === "PoolIssued"
      )?.args?.poolId;

      // Generate offerAddLiquidity
      const offerAddLiquidity1 = await generateAddLiquidityOfferDetails(
        user1.address.toString(), // maker
        user2.address.toString(), // taker
        true, // makerIsLong
        poolId1,
        collateralTokenDecimals
      );

      // Generate signature and typed message hash
      const [signature1, typedMessageHash1] =
        await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          ADD_LIQUIDITY_TYPE,
          offerAddLiquidity1,
          "OfferAddLiquidity"
        );
      // --------------------------------------------------

      // Create second contingent pool on DIVA protocol
      const tx2 = await poolFacet
        .connect(user1)
        .createContingentPool(createPoolParams);
      const receipt2 = await tx2.wait();

      // Get poolId of the newly created pool from event
      const poolId2 = receipt2.events?.find(
        (x: any) => x.event === "PoolIssued"
      )?.args?.poolId;

      // Generate offerAddLiquidity
      const offerAddLiquidity2 = await generateAddLiquidityOfferDetails(
        user1.address.toString(), // maker
        user2.address.toString(), // taker
        true, // makerIsLong
        poolId2,
        collateralTokenDecimals
      );

      // Generate signature and typed message hash
      const [signature2, typedMessageHash2] =
        await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          ADD_LIQUIDITY_TYPE,
          offerAddLiquidity2,
          "OfferAddLiquidity"
        );
      // --------------------------------------------------

      // ---------
      // Act: User1 cancel add liquidity offers
      // ---------
      await eip712CancelFacet
        .connect(user1)
        .batchCancelOfferAddLiquidity([offerAddLiquidity1, offerAddLiquidity2]);

      // ---------
      // Assert: Confirm that offers are cancelled successfully
      // ---------
      expect(await getterFacet.getTakerFilledAmount(typedMessageHash1)).to.eq(
        ethers.constants.MaxUint256
      );
      const relevantStateParams1 =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity1,
          signature1
        );
      expect(relevantStateParams1.offerInfo.status).to.eq(
        OfferStatus.Cancelled
      );

      expect(await getterFacet.getTakerFilledAmount(typedMessageHash2)).to.eq(
        ethers.constants.MaxUint256
      );
      const relevantStateParams2 =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity2,
          signature2
        );
      expect(relevantStateParams2.offerInfo.status).to.eq(
        OfferStatus.Cancelled
      );
    });
  });

  describe("getOfferRelevantStateAddLiquidity", async function () {
    beforeEach(async () => {
      // Set pool capacity to max amount to not run into any capacity constraints during the tests

      // Create a contingent pool on DIVA protocol
      const tx = await poolFacet
        .connect(user1)
        .createContingentPool(createPoolParams);
      const receipt = await tx.wait();

      // Get poolId of the newly created pool from event
      poolId = receipt.events?.find((x: any) => x.event === "PoolIssued")?.args
        ?.poolId;

      // Generate offerAddLiquidity
      offerAddLiquidity = await generateAddLiquidityOfferDetails(
        user1.address.toString(),
        user2.address.toString(),
        true,
        poolId,
        collateralTokenDecimals
      );

      // Generate signature and typed message hash
      [signature, typedMessageHash] =
        await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          ADD_LIQUIDITY_TYPE,
          offerAddLiquidity,
          "OfferAddLiquidity"
        );
    });

    it("Should clamp actualTakerFillableAmount to remaining available maker balance in unfilled add liquidity offer", async function () {
      // ---------
      // Arrange: Create an add liquidity offer where makerCollateralAmount is larger than the maker's collateral token balance
      // ---------
      const userCollateralTokenBalance = await collateralToken.balanceOf(
        user1.address
      );
      offerAddLiquidity.makerCollateralAmount = userCollateralTokenBalance
        .mul(2)
        .toString();

      // Generate signature
      [signature] = await generateSignatureAndTypedMessageHash(
        user1,
        divaDomain,
        ADD_LIQUIDITY_TYPE,
        offerAddLiquidity,
        "OfferAddLiquidity"
      );

      // ---------
      // Assert: Confirm that actualTakerFillableAmount is less than takerCollateralAmount
      // ---------
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity,
          signature
        );
      expect(relevantStateParams.actualTakerFillableAmount).to.eq(
        BigNumber.from(offerAddLiquidity.takerCollateralAmount).div(2)
      );
    });

    it("Should allow to fill offer with actualTakerFillableAmount on fluctuations in remaining available maker balance", async function () {
      // ---------
      // Arrange1: Create an add liquidity offer where makerCollateralAmount is equal to maker's collateral token balance and
      // takerCollateralAmount is half of it, and simulate a partial fill
      // ---------
      const makerCollateralTokenBalanceBeforeFill =
        await collateralToken.balanceOf(user1.address);

      // Confirm that allowance is greater than or equal to collateral token balance so that allowance is not the limiting factor
      const makerCollateralTokenAllowance = await collateralToken.allowance(
        user1.address,
        diamondAddress
      );
      expect(makerCollateralTokenAllowance).to.be.gte(
        makerCollateralTokenBalanceBeforeFill
      );

      // Set makerCollateralAmount and takerCollateralAmount
      offerAddLiquidity.makerCollateralAmount =
        makerCollateralTokenBalanceBeforeFill.toString();
      offerAddLiquidity.takerCollateralAmount =
        makerCollateralTokenBalanceBeforeFill.div(2).toString();

      // Generate signature
      [signature] = await generateSignatureAndTypedMessageHash(
        user1,
        divaDomain,
        ADD_LIQUIDITY_TYPE,
        offerAddLiquidity,
        "OfferAddLiquidity"
      );

      // Set takerFillAmount < takerCollateralAmount to simulate a partial fill of an add liquidity offer
      const takerFillAmountFirstFill = offerAddLiquidity.minimumTakerFillAmount;
      expect(takerFillAmountFirstFill).to.be.lt(
        BigNumber.from(offerAddLiquidity.takerCollateralAmount)
      );
      expect(takerFillAmountFirstFill).to.be.gt(BigNumber.from(0));

      // Fill add liquidity offer with user2 address (taker)
      await eip712AddFacet
        .connect(user2)
        .fillOfferAddLiquidity(
          offerAddLiquidity,
          signature,
          takerFillAmountFirstFill
        );

      // Confirm that actualTakerFillableAmount equals takerCollateralAmount - takerFillAmountFirstFill
      const relevantStateParamsAfterFill =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity,
          signature
        );
      expect(relevantStateParamsAfterFill.actualTakerFillableAmount).to.eq(
        BigNumber.from(offerAddLiquidity.takerCollateralAmount).sub(
          takerFillAmountFirstFill
        )
      );

      // Get user1's collateral token balance after fill
      const makerCollateralTokenBalanceAfterFill =
        await collateralToken.balanceOf(user1.address);

      // Transfer out half of user1's collateral token balance so that the offer is no longer fully fillable
      const transferAmount = makerCollateralTokenBalanceAfterFill.div(2);
      await collateralToken
        .connect(user1)
        .transfer(user2.address, transferAmount);

      // Confirm that actualTakerFillableAmount decreased
      const relevantStateParamsAfterTransfer =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity,
          signature
        );
      expect(
        relevantStateParamsAfterTransfer.actualTakerFillableAmount
      ).to.be.lt(relevantStateParamsAfterFill.actualTakerFillableAmount);
      expect(
        relevantStateParamsAfterTransfer.actualTakerFillableAmount
      ).to.be.gt(0);

      // ---------
      // Act1: Execute a second fill using actualTakerFillableAmount as takerFillAmount
      // ---------
      const takerFillAmountSecondFill =
        relevantStateParamsAfterTransfer.actualTakerFillableAmount.toString();
      await eip712AddFacet
        .connect(user2)
        .fillOfferAddLiquidity(
          offerAddLiquidity,
          signature,
          takerFillAmountSecondFill
        );

      // ---------
      // Assert1: Confirm that actualTakerFillableAmount is reduced to zero and status is Fillable under the condition that maker balance increases again
      // ---------
      const relevantStateParamsAfterSecondFill =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity,
          signature
        );
      expect(
        relevantStateParamsAfterSecondFill.actualTakerFillableAmount
      ).to.eq(0);
      expect(relevantStateParamsAfterSecondFill.offerInfo.status).to.eq(
        OfferStatus.Fillable
      );

      // ---------
      // Arrange2: Transfer back collateral token from user2 to user1 to render the original offer fully fillable
      // ---------
      await collateralToken
        .connect(user2)
        .transfer(user1.address, transferAmount);

      // Confirm that actualTakerFillableAmount increased again and equals takerCollateralAmount - takerFillAmountFirstFill - takerFillAmountSecondFill
      const relevantStateParamsBeforeThirdFill =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity,
          signature
        );
      expect(
        relevantStateParamsBeforeThirdFill.actualTakerFillableAmount
      ).to.be.gt(0);
      expect(
        relevantStateParamsBeforeThirdFill.actualTakerFillableAmount
      ).to.eq(
        BigNumber.from(offerAddLiquidity.takerCollateralAmount)
          .sub(takerFillAmountFirstFill)
          .sub(takerFillAmountSecondFill)
      );

      // ---------
      // Act2: Execute a third fill using actualTakerFillableAmount as takerFillAmount
      // ---------
      const takerFillAmountThirdFill =
        relevantStateParamsBeforeThirdFill.actualTakerFillableAmount.toString();
      await eip712AddFacet
        .connect(user2)
        .fillOfferAddLiquidity(
          offerAddLiquidity,
          signature,
          takerFillAmountThirdFill
        );

      // ---------
      // Assert2: Confirm that the original offer is now fully filled
      // ---------
      const relevantStateParamsAfterThirdFill =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity,
          signature
        );
      expect(relevantStateParamsAfterThirdFill.actualTakerFillableAmount).to.eq(
        0
      );
      expect(relevantStateParamsAfterThirdFill.offerInfo.status).to.eq(
        OfferStatus.Filled
      );
    });

    it("Should set actualTakerFillableAmount = 0 if maker has zero remaining balance", async function () {
      // ---------
      // Arrange: Create an add liquidity offer and reduce the maker's (user1's) collateral token balance to zero
      // ---------
      const userCollateralTokenBalance = await collateralToken.balanceOf(
        user1.address
      );
      expect(userCollateralTokenBalance).to.be.gt(0);

      // Generate signature
      [signature] = await generateSignatureAndTypedMessageHash(
        user1,
        divaDomain,
        ADD_LIQUIDITY_TYPE,
        offerAddLiquidity,
        "OfferAddLiquidity"
      );

      // User1 transfers out all collateral tokens to user2 after having created the offer
      await collateralToken
        .connect(user1)
        .transfer(user2.address, userCollateralTokenBalance);

      // ---------
      // Assert: Confirm that actualTakerFillableAmount is 0
      // ---------
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity,
          signature
        );
      expect(relevantStateParams.actualTakerFillableAmount).to.eq(0);
    });

    it("Should clamp actualTakerFillableAmount to remaining allowance in unfilled add liquidity offer", async function () {
      // ---------
      // Arrange: Create an add liquidity offer where makerCollateralAmount is larger than the maker's allowance
      // ---------
      const makerAllowance = await collateralToken.allowance(
        user1.address,
        diamondAddress
      );
      expect(makerAllowance).to.be.gt(0);

      offerAddLiquidity.makerCollateralAmount = makerAllowance
        .mul(2)
        .toString();

      // Generate signature
      [signature] = await generateSignatureAndTypedMessageHash(
        user1,
        divaDomain,
        ADD_LIQUIDITY_TYPE,
        offerAddLiquidity,
        "OfferAddLiquidity"
      );

      // ---------
      // Assert: Confirm that actualTakerFillableAmount is less than takerCollateralAmount
      // ---------
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity,
          signature
        );
      expect(relevantStateParams.actualTakerFillableAmount).to.eq(
        BigNumber.from(offerAddLiquidity.takerCollateralAmount).div(2)
      );
    });

    it("Should allow to fill offer with actualTakerFillableAmount on fluctuations in maker allowance", async function () {
      // ---------
      // Arrange1: Create an add liquidity offer where makerCollateralAmount is equal to maker's collateral token allowance and
      // takerCollateralAmount is half of it, and simulate a partial fill
      // ---------
      const makerCollateralTokenAllowanceBeforeFill =
        await collateralToken.allowance(user1.address, diamondAddress);

      // Confirm that collateral token balance is greater than or equal to allowance so that the balance is not the limiting factor
      const makerCollateralTokenBalance = await collateralToken.balanceOf(
        user1.address
      );
      expect(makerCollateralTokenBalance).to.be.gte(
        makerCollateralTokenAllowanceBeforeFill
      );

      // Set makerCollateralAmount and takerCollateralAmount
      offerAddLiquidity.makerCollateralAmount =
        makerCollateralTokenAllowanceBeforeFill.toString();
      offerAddLiquidity.takerCollateralAmount =
        makerCollateralTokenAllowanceBeforeFill.div(2).toString();

      // Generate signature
      [signature] = await generateSignatureAndTypedMessageHash(
        user1,
        divaDomain,
        ADD_LIQUIDITY_TYPE,
        offerAddLiquidity,
        "OfferAddLiquidity"
      );

      // Set takerFillAmount < takerCollateralAmount to simulate a partial fill of an add liquidity offer
      const takerFillAmountFirstFill = offerAddLiquidity.minimumTakerFillAmount;
      expect(takerFillAmountFirstFill).to.be.lt(
        BigNumber.from(offerAddLiquidity.takerCollateralAmount)
      );
      expect(takerFillAmountFirstFill).to.be.gt(BigNumber.from(0));

      // Fill add liquidity offer with user2 address (taker)
      await eip712AddFacet
        .connect(user2)
        .fillOfferAddLiquidity(
          offerAddLiquidity,
          signature,
          takerFillAmountFirstFill
        );

      // Confirm that actualTakerFillableAmount equals takerCollateralAmount - takerFillAmountFirstFill
      const relevantStateParamsAfterFill =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity,
          signature
        );
      expect(relevantStateParamsAfterFill.actualTakerFillableAmount).to.eq(
        BigNumber.from(offerAddLiquidity.takerCollateralAmount).sub(
          takerFillAmountFirstFill
        )
      );

      // Reduce maker allowance so that the offer is no longer fully fillable
      const newMakerAllowance = makerCollateralTokenAllowanceBeforeFill.div(2);
      await collateralToken
        .connect(user1)
        .approve(diamondAddress, newMakerAllowance);

      // Confirm that actualTakerFillableAmount decreased
      const relevantStateParamsAfterAllowanceReduction =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity,
          signature
        );
      expect(
        relevantStateParamsAfterAllowanceReduction.actualTakerFillableAmount
      ).to.be.lt(relevantStateParamsAfterFill.actualTakerFillableAmount);
      expect(
        relevantStateParamsAfterAllowanceReduction.actualTakerFillableAmount
      ).to.be.gt(0);

      // ---------
      // Act1: Execute a second fill using actualTakerFillableAmount as takerFillAmount
      // ---------
      const takerFillAmountSecondFill =
        relevantStateParamsAfterAllowanceReduction.actualTakerFillableAmount.toString();
      await eip712AddFacet
        .connect(user2)
        .fillOfferAddLiquidity(
          offerAddLiquidity,
          signature,
          takerFillAmountSecondFill
        );

      // ---------
      // Assert1: Confirm that actualTakerFillableAmount is reduced to zero and status is Fillable under the condition that maker allowance increases again
      // ---------
      const relevantStateParamsAfterSecondFill =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity,
          signature
        );
      expect(
        relevantStateParamsAfterSecondFill.actualTakerFillableAmount
      ).to.eq(0);
      expect(relevantStateParamsAfterSecondFill.offerInfo.status).to.eq(
        OfferStatus.Fillable
      );

      // ---------
      // Arrange2: Increase maker allowance again to render the original offer fully fillable
      // ---------
      await collateralToken
        .connect(user1)
        .approve(diamondAddress, makerCollateralTokenAllowanceBeforeFill);

      // Confirm that actualTakerFillableAmount increased again and equals takerCollateralAmount - takerFillAmountFirstFill - takerFillAmountSecondFill
      const relevantStateParamsBeforeThirdFill =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity,
          signature
        );
      expect(
        relevantStateParamsBeforeThirdFill.actualTakerFillableAmount
      ).to.be.gt(0);
      expect(
        relevantStateParamsBeforeThirdFill.actualTakerFillableAmount
      ).to.eq(
        BigNumber.from(offerAddLiquidity.takerCollateralAmount)
          .sub(takerFillAmountFirstFill)
          .sub(takerFillAmountSecondFill)
      );

      // ---------
      // Act2: Execute a third fill using actualTakerFillableAmount as takerFillAmount
      // ---------
      const takerFillAmountThirdFill =
        relevantStateParamsBeforeThirdFill.actualTakerFillableAmount.toString();
      await eip712AddFacet
        .connect(user2)
        .fillOfferAddLiquidity(
          offerAddLiquidity,
          signature,
          takerFillAmountThirdFill
        );

      // ---------
      // Assert2: Confirm that the original offer is now fully filled
      // ---------
      const relevantStateParamsAfterThirdFill =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity,
          signature
        );
      expect(relevantStateParamsAfterThirdFill.actualTakerFillableAmount).to.eq(
        0
      );
      expect(relevantStateParamsAfterThirdFill.offerInfo.status).to.eq(
        OfferStatus.Filled
      );
    });

    it("Should return actualTakerFillableAmount = 0 if maker has zero allowance in an unfilled add liquidity offer", async function () {
      // ---------
      // Arrange: Create an add liquidity offer and reduce the maker's (user1's) collateral token balance to zero
      // ---------
      const makerAllowance = await collateralToken.allowance(
        user1.address,
        diamondAddress
      );
      expect(makerAllowance).to.be.gt(0);

      // Generate signature
      [signature] = await generateSignatureAndTypedMessageHash(
        user1,
        divaDomain,
        ADD_LIQUIDITY_TYPE,
        offerAddLiquidity,
        "OfferAddLiquidity"
      );

      // User1 transfers out all collateral tokens to user2 after having created the offer
      await collateralToken.connect(user1).approve(diamondAddress, 0);

      // ---------
      // Assert: Confirm that actualTakerFillableAmount is 0
      // ---------
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity,
          signature
        );
      expect(relevantStateParams.actualTakerFillableAmount).to.eq(0);
    });

    it("Should return poolExists = false if poolId does not exist", async function () {
      // ---------
      // Arrange: Create an offer with a poolId that does not yet exist
      // ---------
      // Confirm that a poolId already exists (repeating from beforeEach block for test readability)
      poolId = await getterFacet.getLatestPoolId();
      expect(poolId).to.be.gt(0);

      // Increase poolId
      const nonExistentPoolId = poolId.add(1);
      const nonExistentPoolParams = await getterFacet.getPoolParameters(
        nonExistentPoolId
      );
      expect(nonExistentPoolParams.collateralToken).to.eq(
        ethers.constants.AddressZero
      ); // That's the existence check inside the smart contract

      offerAddLiquidity.poolId = nonExistentPoolId;

      // Generate signature
      [signature] = await generateSignatureAndTypedMessageHash(
        user1,
        divaDomain,
        ADD_LIQUIDITY_TYPE,
        offerAddLiquidity,
        "OfferAddLiquidity"
      );

      // ---------
      // Assert: Confirm that actualTakerFillableAmount is 0 and poolExists = false
      // ---------
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity,
          signature
        );
      expect(relevantStateParams.actualTakerFillableAmount).to.eq(0);
      expect(relevantStateParams.poolExists).to.be.false;
    });

    it("Should return actualTakerFillableAmount = takerCollateralAmount if makerCollateralAmount = 0 in an unfilled add liquidity offer", async function () {
      // ---------
      // Arrange: Create an add liquidity offer with makerCollateralAmount = 0
      // ---------
      offerAddLiquidity.makerCollateralAmount = "0";

      // Generate signature
      [signature] = await generateSignatureAndTypedMessageHash(
        user1,
        divaDomain,
        ADD_LIQUIDITY_TYPE,
        offerAddLiquidity,
        "OfferAddLiquidity"
      );

      // ---------
      // Assert: Confirm that actualTakerFillableAmount is equal takerCollateralAmount
      // ---------
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity,
          signature
        );
      expect(relevantStateParams.actualTakerFillableAmount).to.eq(
        BigNumber.from(offerAddLiquidity.takerCollateralAmount)
      );
    });

    it("Should return actualTakerFillableAmount = takerCollateralAmount - takerFilledAmount if makerCollateralAmount = 0 in a partially filled add liquidity offer", async function () {
      // ---------
      // Arrange: Create an add liquidity offer with makerCollateralAmount = 0
      // ---------
      offerAddLiquidity.makerCollateralAmount = "0";

      // Generate signature
      [signature] = await generateSignatureAndTypedMessageHash(
        user1,
        divaDomain,
        ADD_LIQUIDITY_TYPE,
        offerAddLiquidity,
        "OfferAddLiquidity"
      );

      // Set takerFillAmount smaller than takerCollateralAmount to simulate a partial fill
      takerFillAmount = parseUnits("60", collateralTokenDecimals).toString();
      expect(BigNumber.from(takerFillAmount)).to.be.lt(
        BigNumber.from(offerAddLiquidity.takerCollateralAmount)
      );

      // ---------
      // Act: Fill offer partially
      // ---------
      await eip712AddFacet
        .connect(user2)
        .fillOfferAddLiquidity(offerAddLiquidity, signature, takerFillAmount);

      // ---------
      // Assert: Confirm that actualTakerFillableAmount is equal takerCollateralAmount - takerFilledAmount
      // ---------
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity,
          signature
        );
      expect(relevantStateParams.offerInfo.takerFilledAmount).to.be.gt(0);
      expect(relevantStateParams.actualTakerFillableAmount).to.eq(
        BigNumber.from(offerAddLiquidity.takerCollateralAmount).sub(
          relevantStateParams.offerInfo.takerFilledAmount
        )
      );
    });

    it("Should return actualTakerFillableAmount = 0 if makerCollateralAmount = 0 in a fully filled add liquidity offer", async function () {
      // ---------
      // Arrange: Create an add liquidity offer with makerCollateralAmount = 0
      // ---------
      offerAddLiquidity.makerCollateralAmount = "0";

      // Generate signature
      [signature] = await generateSignatureAndTypedMessageHash(
        user1,
        divaDomain,
        ADD_LIQUIDITY_TYPE,
        offerAddLiquidity,
        "OfferAddLiquidity"
      );

      // Set takerFillAmount equal to takerCollateralAmount
      takerFillAmount = offerAddLiquidity.takerCollateralAmount;

      // ---------
      // Act: Fully fill offer
      // ---------
      await eip712AddFacet
        .connect(user2)
        .fillOfferAddLiquidity(offerAddLiquidity, signature, takerFillAmount);

      // ---------
      // Assert: Confirm that actualTakerFillableAmount is equal 0
      // ---------
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity,
          signature
        );
      expect(relevantStateParams.offerInfo.takerFilledAmount).to.eq(
        offerAddLiquidity.takerCollateralAmount
      );
      expect(relevantStateParams.actualTakerFillableAmount).to.eq(
        BigNumber.from(0)
      );
    });

    it("Should return the right parameters for an unfilled add liquidity offer", async function () {
      // ---------
      // Arrange: Get offer relevant state
      // ---------
      const [
        offerInfo,
        actualTakerFillableAmount,
        isSignatureValid,
        poolExists,
      ]: [OfferInfo, BigNumber, boolean, boolean] =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity,
          signature
        );

      // ---------
      // Assert: Confirm that offer relevant state is correct
      // ---------
      expect(actualTakerFillableAmount).to.eq(
        offerAddLiquidity.takerCollateralAmount
      );
      expect(isSignatureValid).to.eq(true);
      expect(offerInfo.status).to.eq(OfferStatus.Fillable);
      expect(offerInfo.typedOfferHash).to.eq(typedMessageHash);
      expect(offerInfo.takerFilledAmount).to.eq(0);
      expect(poolExists).to.be.true;
    });

    it("Returns isSignatureValid = false if invalid signature", async () => {
      // ---------
      // Arrange: Manipulate the offer object
      // ---------
      offerAddLiquidity.maker = ethers.constants.AddressZero;

      // ---------
      // Act & Assert: Confirm that isSignatureValid = false
      // ---------
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateAddLiquidity(
          offerAddLiquidity,
          signature
        );
      expect(relevantStateParams.isSignatureValid).to.be.false;
    });
  });

  describe("fillOfferRemoveLiquidity", async function () {
    let supplyShortBefore: BigNumber;
    let supplyLongBefore: BigNumber;

    let feesParams: LibDIVAStorage.FeesStructOutput;
    let protocolFee: BigNumber;
    let settlementFee: BigNumber;

    let collateralToReturnNet: BigNumber;
    let collateralAmountRemovedNetMaker: BigNumber;
    let collateralAmountRemovedNetTaker: BigNumber;

    let poolParamsBefore: LibDIVAStorage.PoolStructOutput;
    let poolParamsAfter: LibDIVAStorage.PoolStructOutput;

    describe("fillOfferRemoveLiquidity with non-zero taker address and makerIsLong as true", async function () {
      beforeEach(async () => {
        // Create a contingent pool on DIVA Protocol
        const tx = await poolFacet
          .connect(user1)
          .createContingentPool(createPoolParams);
        const receipt = await tx.wait();

        // Get poolId of the newly created pool from event
        poolId = receipt.events?.find((x: any) => x.event === "PoolIssued")
          ?.args?.poolId;

        // Get pool parameters of newly created pool
        poolParamsBefore = await getterFacet.getPoolParameters(poolId);

        // Get instances of short and long token
        shortTokenInstance = await erc20AttachFixture(
          poolParamsBefore.shortToken
        );
        longTokenInstance = await erc20AttachFixture(
          poolParamsBefore.longToken
        );

        // Generate offerRemoveLiquidity
        offerRemoveLiquidity = await generateRemoveLiquidityOfferDetails(
          user1.address.toString(), // maker
          user2.address.toString(), // taker
          true, // maker is long
          poolId,
          collateralTokenDecimals
        );

        // Generate signature and typed message hash
        [signature, typedMessageHash] =
          await generateSignatureAndTypedMessageHash(
            user1,
            divaDomain,
            REMOVE_LIQUIDITY_TYPE,
            offerRemoveLiquidity,
            "OfferRemoveLiquidity"
          );

        feesParams = await getterFacet.getFees(poolParamsBefore.indexFees);
      });

      it("Should fully fill a remove liquidity offer and update the relevant parameters", async function () {
        // ---------
        // Arrange: Set positionTokenFillAmount equal to positionTokenAmount, calculate collateral net of fees and token balances for both users before removing liquidity
        // ---------

        // Set positionTokenFillAmount = positionTokenAmount in offer
        positionTokenFillAmount = offerRemoveLiquidity.positionTokenAmount;

        // Calculate fees
        protocolFee = calcFee(
          feesParams.protocolFee,
          BigNumber.from(positionTokenFillAmount),
          collateralTokenDecimals
        );
        expect(protocolFee).to.not.eq(0);
        settlementFee = calcFee(
          feesParams.settlementFee,
          BigNumber.from(positionTokenFillAmount),
          collateralTokenDecimals
        );
        expect(settlementFee).to.not.eq(0);

        // Collateral net of fees
        collateralToReturnNet = BigNumber.from(positionTokenFillAmount)
          .sub(protocolFee)
          .sub(settlementFee);

        // Collateral net of fees for maker and taker
        collateralAmountRemovedNetMaker = collateralToReturnNet
          .mul(BigNumber.from(offerRemoveLiquidity.makerCollateralAmount))
          .div(BigNumber.from(offerRemoveLiquidity.positionTokenAmount));
        collateralAmountRemovedNetTaker = collateralToReturnNet.sub(
          collateralAmountRemovedNetMaker
        );

        // Get balance of long token for user1 before fill offer
        balanceOfLongTokenBeforeUser1 = await longTokenInstance.balanceOf(
          user1.address
        );
        // Get balance of short token for user2 before fill offer
        balanceOfShortTokenBeforeUser2 = await shortTokenInstance.balanceOf(
          user2.address
        );

        // Get balance of collateral token for both users before fill offer
        balanceOfCollateralTokenBeforeUser1 = await collateralToken.balanceOf(
          user1.address
        );
        balanceOfCollateralTokenBeforeUser2 = await collateralToken.balanceOf(
          user2.address
        );

        // Get balance of collateral token for DIVA Protocol before fill offer
        balanceOfCollateralTokenBeforeDiva = await collateralToken.balanceOf(
          diamondAddress
        );

        // Get short and long token supply before fill offer
        supplyShortBefore = await shortTokenInstance.totalSupply();
        supplyLongBefore = await longTokenInstance.totalSupply();

        // Check relevant eip712 related parameters before the offer is being filled
        const relevantStateParamsBefore =
          await getterFacet.getOfferRelevantStateRemoveLiquidity(
            offerRemoveLiquidity,
            signature
          );
        expect(relevantStateParamsBefore.offerInfo.typedOfferHash).to.eq(
          typedMessageHash
        );
        expect(relevantStateParamsBefore.offerInfo.status).to.eq(
          OfferStatus.Fillable
        );
        expect(relevantStateParamsBefore.offerInfo.takerFilledAmount).to.eq(0);
        expect(relevantStateParamsBefore.poolExists).to.be.true;

        // ---------
        // Act: User2 fills remove liquidity offer
        // ---------
        const tx = await eip712RemoveFacet
          .connect(user2)
          .fillOfferRemoveLiquidity(
            offerRemoveLiquidity,
            signature,
            positionTokenFillAmount
          );
        await tx.wait();

        // ---------
        // Assert: Confirm that relevant parameters are updated correctly and the
        // user's and DIVA Protocol's collateral/position token balances are as expected
        // ---------

        // Get pool parameters after adding liquidity
        poolParamsAfter = await getterFacet.getPoolParameters(poolId);

        // Confirm that pool collateralBalance has reduced
        expect(poolParamsAfter.collateralBalance).to.eq(
          poolParamsBefore.collateralBalance.sub(positionTokenFillAmount)
        );

        // Confirm that total supply of position tokens has reduced
        expect(await shortTokenInstance.totalSupply()).to.eq(
          supplyShortBefore.sub(positionTokenFillAmount)
        );
        expect(await longTokenInstance.totalSupply()).to.eq(
          supplyLongBefore.sub(positionTokenFillAmount)
        );

        // Confirm that fees are allocated correctly to treasury and oracle address
        expect(
          await getterFacet.getClaim(collateralToken.address, treasury.address)
        ).to.eq(protocolFee);
        expect(
          await getterFacet.getClaim(collateralToken.address, oracle.address)
        ).to.eq(settlementFee);

        // Confirm that the collateral token balance for both users has increased
        expect(await collateralToken.balanceOf(user1.address)).to.eq(
          balanceOfCollateralTokenBeforeUser1.add(
            collateralAmountRemovedNetMaker
          )
        );
        expect(await collateralToken.balanceOf(user2.address)).to.eq(
          balanceOfCollateralTokenBeforeUser2.add(
            collateralAmountRemovedNetTaker
          )
        );

        // Confirm that takerFilledAmount for the corresponding offer has increased
        expect(await getterFacet.getTakerFilledAmount(typedMessageHash)).to.eq(
          positionTokenFillAmount
        );

        // Confirm that users' short and long token balances have reduced
        expect(await longTokenInstance.balanceOf(user1.address)).to.eq(
          balanceOfLongTokenBeforeUser1.sub(positionTokenFillAmount)
        );
        expect(await shortTokenInstance.balanceOf(user2.address)).to.eq(
          balanceOfShortTokenBeforeUser2.sub(positionTokenFillAmount)
        );

        // Confirm that DIVA Protocol's collateral token balance has reduced.
        // Note that the fees are still within DIVA Protocol until they are claimed.
        // Hence, the balance should reduce by collateralToReturnNet in the absence of a fee claim.
        expect(await collateralToken.balanceOf(diamondAddress)).to.eq(
          balanceOfCollateralTokenBeforeDiva.sub(collateralToReturnNet)
        );

        // Confirm that the relevant eip712 related parameters have been updated
        const relevantStateParamsAfter =
          await getterFacet.getOfferRelevantStateRemoveLiquidity(
            offerRemoveLiquidity,
            signature
          );
        expect(relevantStateParamsAfter.offerInfo.typedOfferHash).to.eq(
          typedMessageHash
        );
        expect(relevantStateParamsAfter.offerInfo.status).to.eq(
          OfferStatus.Filled
        );
        expect(relevantStateParamsAfter.offerInfo.takerFilledAmount).to.eq(
          positionTokenFillAmount
        );
        expect(relevantStateParamsAfter.poolExists).to.be.true; // should remain unchanged
      });

      it("Should fill a remove liquidity offer in two steps", async function () {
        // ---------
        // Arrange: Simulate a partial fill of a remove liquidity offer
        // ---------

        // Set positionTokenAmountFirstFill < positionTokenAmount to simulate a partial fill of a remove liquidity offer
        const positionTokenAmountFirstFill = parseUnits(
          "15",
          collateralTokenDecimals
        ).toString();
        expect(BigNumber.from(positionTokenAmountFirstFill)).to.be.lt(
          BigNumber.from(offerRemoveLiquidity.positionTokenAmount)
        );

        // Fill remove liquidity offer with user2 address (taker)
        await eip712RemoveFacet
          .connect(user2)
          .fillOfferRemoveLiquidity(
            offerRemoveLiquidity,
            signature,
            positionTokenAmountFirstFill
          );

        // Get balance of collateral token for both users before remove liquidity
        balanceOfCollateralTokenBeforeUser1 = await collateralToken.balanceOf(
          user1.address
        );
        balanceOfCollateralTokenBeforeUser2 = await collateralToken.balanceOf(
          user2.address
        );

        // Get balance of collateral token for DIVA protocol before remove liquidity
        balanceOfCollateralTokenBeforeDiva = await collateralToken.balanceOf(
          diamondAddress
        );

        // Get balance of short and long tokens for user1 and user2
        balanceOfShortTokenBeforeUser2 = await shortTokenInstance.balanceOf(
          user2.address
        );
        balanceOfLongTokenBeforeUser1 = await longTokenInstance.balanceOf(
          user1.address
        );

        // Confirm that the relevant eip712 related parameters are as expected after first fill
        const relevantStateParamsAfterFirstFill =
          await getterFacet.getOfferRelevantStateRemoveLiquidity(
            offerRemoveLiquidity,
            signature
          );
        expect(relevantStateParamsAfterFirstFill.offerInfo.status).to.eq(
          OfferStatus.Fillable
        );
        expect(
          relevantStateParamsAfterFirstFill.offerInfo.takerFilledAmount
        ).to.eq(positionTokenAmountFirstFill);

        // Get pool parameters before removing liquidity a second time
        poolParamsBefore = await getterFacet.getPoolParameters(poolId);

        // Set positionTokenAmountSecondFill equal to remaining positionTokenAmount before removing more liquidity
        const positionTokenAmountSecondFill = calcFillableRemainingAmount(
          offerRemoveLiquidity.positionTokenAmount,
          (await getterFacet.getTakerFilledAmount(typedMessageHash)).toString()
        );

        // Calculate fees
        protocolFee = calcFee(
          feesParams.protocolFee,
          BigNumber.from(positionTokenAmountSecondFill),
          collateralTokenDecimals
        );
        expect(protocolFee).to.not.eq(0);
        settlementFee = calcFee(
          feesParams.settlementFee,
          BigNumber.from(positionTokenAmountSecondFill),
          collateralTokenDecimals
        );
        expect(settlementFee).to.not.eq(0);

        // Collateral net of fees
        collateralToReturnNet = BigNumber.from(positionTokenAmountSecondFill)
          .sub(protocolFee)
          .sub(settlementFee);

        // Collateral net of fees for maker and taker
        collateralAmountRemovedNetMaker = collateralToReturnNet
          .mul(BigNumber.from(offerRemoveLiquidity.makerCollateralAmount))
          .div(BigNumber.from(offerRemoveLiquidity.positionTokenAmount));
        collateralAmountRemovedNetTaker = collateralToReturnNet.sub(
          collateralAmountRemovedNetMaker
        );

        // Get short and long token supply before fill offer
        supplyShortBefore = await shortTokenInstance.totalSupply();
        supplyLongBefore = await longTokenInstance.totalSupply();

        // ---------
        // Act: User2 calls fillOfferRemoveLiquidity again with positionTokenAmountSecondFill equal to remaining positionTokenAmount
        // ---------
        await eip712RemoveFacet
          .connect(user2)
          .fillOfferRemoveLiquidity(
            offerRemoveLiquidity,
            signature,
            positionTokenAmountSecondFill
          );

        // ---------
        // Assert: Confirm that relevant parameters are updated correctly and the
        // user and DIVA Protocol collateral/position token balances are as expected
        // ---------

        // Get pool parameters after remove liquidity has been executed
        poolParamsAfter = await getterFacet.getPoolParameters(poolId);

        // Confirm that pool collateralBalance has reduced
        expect(poolParamsAfter.collateralBalance).to.eq(
          poolParamsBefore.collateralBalance.sub(positionTokenAmountSecondFill)
        );

        // Confirm that taker filled amount has increased
        expect(await getterFacet.getTakerFilledAmount(typedMessageHash)).to.eq(
          offerRemoveLiquidity.positionTokenAmount
        );

        // Confirm that total supply of both short and long tokens has reduced
        expect(await shortTokenInstance.totalSupply()).to.eq(
          supplyShortBefore.sub(positionTokenAmountSecondFill)
        );
        expect(await longTokenInstance.totalSupply()).to.eq(
          supplyLongBefore.sub(positionTokenAmountSecondFill)
        );

        // Confirm that users' short and long token balances have reduced
        expect(await longTokenInstance.balanceOf(user1.address)).to.eq(
          balanceOfLongTokenBeforeUser1.sub(positionTokenAmountSecondFill)
        );
        expect(await shortTokenInstance.balanceOf(user2.address)).to.eq(
          balanceOfShortTokenBeforeUser2.sub(positionTokenAmountSecondFill)
        );

        // Confirm that the collateral token balance for both users has increased
        expect(await collateralToken.balanceOf(user1.address)).to.eq(
          balanceOfCollateralTokenBeforeUser1.add(
            collateralAmountRemovedNetMaker
          )
        );
        expect(await collateralToken.balanceOf(user2.address)).to.eq(
          balanceOfCollateralTokenBeforeUser2.add(
            collateralAmountRemovedNetTaker
          )
        );

        // Confirm that DIVA Protocol's collateral token balance has reduced.
        // Note that the fees are still within DIVA Protocol until they are claimed.
        // Hence, the balance should reduce by collateralToReturnNet in the absence of a fee claim.
        expect(await collateralToken.balanceOf(diamondAddress)).to.eq(
          balanceOfCollateralTokenBeforeDiva.sub(collateralToReturnNet)
        );

        // Confirm that the relevant eip712 related parameters have been updated correctly
        const relevantStateParamsAfterSecondFill =
          await getterFacet.getOfferRelevantStateRemoveLiquidity(
            offerRemoveLiquidity,
            signature
          );
        expect(
          relevantStateParamsAfterSecondFill.offerInfo.typedOfferHash
        ).to.eq(relevantStateParamsAfterFirstFill.offerInfo.typedOfferHash); // should remain unchanged
        expect(relevantStateParamsAfterSecondFill.offerInfo.status).to.eq(
          OfferStatus.Filled
        );
        expect(
          relevantStateParamsAfterSecondFill.offerInfo.takerFilledAmount
        ).to.eq(
          BigNumber.from(positionTokenAmountFirstFill).add(
            positionTokenAmountSecondFill
          )
        );
        expect(relevantStateParamsAfterSecondFill.poolExists).to.eq(
          relevantStateParamsAfterFirstFill.poolExists
        ); // should remain unchanged
      });

      it("Should fill a remove liquidity offer with minimumTakerFillAmount", async () => {
        // ---------
        // Arrange: Set positionTokenAmountSecondFill equal to minimumTakerFillAmount
        // ---------
        positionTokenFillAmount = offerRemoveLiquidity.minimumTakerFillAmount;

        // Check relevant eip712 related parameters before the offer is being filled
        const relevantStateParamsBefore =
          await getterFacet.getOfferRelevantStateRemoveLiquidity(
            offerRemoveLiquidity,
            signature
          );
        expect(relevantStateParamsBefore.offerInfo.status).to.eq(
          OfferStatus.Fillable
        );
        expect(relevantStateParamsBefore.offerInfo.takerFilledAmount).to.eq(0);

        // ---------
        // Act: Fill remove liquidity offer
        // ---------
        await eip712RemoveFacet
          .connect(user2)
          .fillOfferRemoveLiquidity(
            offerRemoveLiquidity,
            signature,
            positionTokenFillAmount
          );

        // ---------
        // Assert: Confirm that the status remains fillable and takerFilledAmount increased
        // ---------
        const relevantStateParamsAfter =
          await getterFacet.getOfferRelevantStateRemoveLiquidity(
            offerRemoveLiquidity,
            signature
          );
        expect(relevantStateParamsAfter.offerInfo.status).to.eq(
          OfferStatus.Fillable
        );
        expect(relevantStateParamsAfter.offerInfo.takerFilledAmount).to.eq(
          positionTokenFillAmount
        );
      });

      it("Should fill a remove liquidity offer with an amount smaller than minimumTakerFillAmount on second fill", async () => {
        // ---------
        // Arrange: Fill an offer partially with minimum taker amount
        // ---------
        // Set positionTokenAmountFirstFill < positionTokenAmount to simulate a partial fill of a remove liquidity offer
        const positionTokenAmountFirstFill = BigNumber.from(
          offerRemoveLiquidity.minimumTakerFillAmount
        );
        expect(positionTokenAmountFirstFill).to.be.lt(
          BigNumber.from(offerRemoveLiquidity.positionTokenAmount)
        );
        expect(positionTokenAmountFirstFill).to.be.gt(0);

        // Fill remove liquidity offer with user2 address (taker in underlying offer)
        await eip712RemoveFacet
          .connect(user2)
          .fillOfferRemoveLiquidity(
            offerRemoveLiquidity,
            signature,
            positionTokenAmountFirstFill
          );

        // Set positionTokenAmountSecondFill < minimumTakerFillAmount
        // IMPORTANT: if positionTokenAmountSecondFill is too small, the resulting protocol fee
        // would be zero in which case the protocol will revert. That's why using
        // `positionTokenAmountSecondFill = BigNumber.from(1)` will not work here (as opposed to
        // equivalent `fillOfferAddLiquidity` test)
        const positionTokenAmountSecondFill = BigNumber.from(
          offerRemoveLiquidity.minimumTakerFillAmount
        ).sub(1);
        expect(positionTokenAmountSecondFill).to.be.lt(
          BigNumber.from(offerRemoveLiquidity.positionTokenAmount).sub(
            BigNumber.from(offerRemoveLiquidity.minimumTakerFillAmount)
          )
        );
        expect(positionTokenAmountSecondFill).to.be.gt(0);

        // ---------
        // Act: Fill offer a second time with positionTokenAmount smaller than minimum taker amount
        // ---------
        await eip712RemoveFacet
          .connect(user2)
          .fillOfferRemoveLiquidity(
            offerRemoveLiquidity,
            signature,
            positionTokenAmountSecondFill
          );

        // ---------
        // Assert: Confirm that takerFilledAmount increased
        // ---------
        const relevantStateParams =
          await getterFacet.getOfferRelevantStateRemoveLiquidity(
            offerRemoveLiquidity,
            signature
          );
        expect(relevantStateParams.offerInfo.takerFilledAmount).to.eq(
          positionTokenAmountFirstFill.add(positionTokenAmountSecondFill)
        );
      });

      // -------------------------------------------
      // Reverts
      // -------------------------------------------
      it("Reverts if positionTokenFillAmount is smaller than minimumTakerFillAmount on first fill", async () => {
        // ---------
        // Arrange: Set positionTokenFillAmount smaller than minimumTakerFillAmount
        // ---------
        positionTokenFillAmount = BigNumber.from(
          offerRemoveLiquidity.minimumTakerFillAmount
        )
          .sub(1)
          .toString();

        // ---------
        // Act & Assert: Check that `fillOfferRemoveLiquidity` fails
        // ---------
        await expect(
          eip712RemoveFacet
            .connect(user2)
            .fillOfferRemoveLiquidity(
              offerRemoveLiquidity,
              signature,
              positionTokenFillAmount
            )
        ).to.be.revertedWith("TakerFillAmountSmallerMinimum()");
      });

      it("Reverts if positionTokenFillAmount exceeds positionTokenAmount", async () => {
        // ---------
        // Arrange: Set positionTokenFillAmount higher than position token amount
        // ---------
        positionTokenFillAmount = BigNumber.from(
          offerRemoveLiquidity.positionTokenAmount
        )
          .add(1)
          .toString();

        // ---------
        // Act & Assert: Check that `fillOfferRemoveLiquidity` fails
        // ---------
        await expect(
          eip712RemoveFacet
            .connect(user2)
            .fillOfferRemoveLiquidity(
              offerRemoveLiquidity,
              signature,
              positionTokenFillAmount
            )
        ).to.be.revertedWith("TakerFillAmountExceedsFillableAmount()");
      });

      it("Reverts if positionTokenFillAmount exceeds remaining fillable taker amount on second fill", async () => {
        // ---------
        // Arrange: Simulate a partial fill and set the next positionTokenFillAmount higher than remaining taker fill amount
        // ---------

        // Set positionTokenFillAmount < positionTokenAmount to simulate a partial fill of a remove liquidity offer
        positionTokenFillAmount = offerRemoveLiquidity.minimumTakerFillAmount;
        expect(BigNumber.from(positionTokenFillAmount)).to.be.lt(
          BigNumber.from(offerRemoveLiquidity.positionTokenAmount)
        );

        // Fill remove liquidity offer with user2 address (taker)
        await eip712RemoveFacet
          .connect(user2)
          .fillOfferRemoveLiquidity(
            offerRemoveLiquidity,
            signature,
            positionTokenFillAmount
          );

        // Set positionTokenFillAmount higher than remaining takerFillAmount before removing more liquidity
        const remainingTakerFillAmount = calcFillableRemainingAmount(
          offerRemoveLiquidity.positionTokenAmount,
          (await getterFacet.getTakerFilledAmount(typedMessageHash)).toString()
        );
        positionTokenFillAmount = BigNumber.from(remainingTakerFillAmount)
          .add(1)
          .toString();

        // ---------
        // Act & Assert: Check that `fillOfferRemoveLiquidity` fails
        // ---------
        await expect(
          eip712RemoveFacet
            .connect(user2)
            .fillOfferRemoveLiquidity(
              offerRemoveLiquidity,
              signature,
              positionTokenFillAmount
            )
        ).to.be.revertedWith("TakerFillAmountExceedsFillableAmount()");
      });

      it("Reverts if offer taker is not equal to offerTaker from offerRemoveLiquidity", async () => {
        // ---------
        // Act & Assert: Check that `fillOfferRemoveLiquidity` fails with user3
        // ---------
        await expect(
          eip712RemoveFacet
            .connect(user3)
            .fillOfferRemoveLiquidity(
              offerRemoveLiquidity,
              signature,
              offerRemoveLiquidity.positionTokenAmount
            )
        ).to.be.revertedWith("UnauthorizedTaker()");
      });

      it("Reverts if passed invalid offerRemoveLiquidity (different salt)", async () => {
        // ---------
        // Arrange: Change the salt in offerRemoveLiquidity which will render the offer to no longer match the signed message
        // ---------

        // Change the salt in offerRemoveLiquidity
        offerRemoveLiquidity.salt = Date.now().toString();

        // Generate new signature with new offerRemoveLiquidity
        const [newSignature] = await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          REMOVE_LIQUIDITY_TYPE,
          offerRemoveLiquidity,
          "OfferRemoveLiquidity"
        );
        // Compare signatures
        expect(newSignature).to.not.eq(signature);

        // ---------
        // Act & Assert: Check that `fillOfferRemoveLiquidity` fails
        // ---------
        await expect(
          eip712RemoveFacet
            .connect(user2)
            .fillOfferRemoveLiquidity(
              offerRemoveLiquidity,
              signature,
              offerRemoveLiquidity.positionTokenAmount
            )
        ).to.be.revertedWith("InvalidSignature()");
      });

      it("Reverts if passed invalid signature (wrong 'v' value)", async () => {
        // ---------
        // Arrange: Set v of signature to non-27
        // ---------
        signature.v = 26;

        // ---------
        // Act & Assert: Check that `fillOfferRemoveLiquidity` fails
        // ---------
        await expect(
          eip712RemoveFacet
            .connect(user2)
            .fillOfferRemoveLiquidity(
              offerRemoveLiquidity,
              signature,
              offerRemoveLiquidity.positionTokenAmount
            )
        ).to.be.revertedWith("ECDSA: invalid signature");
      });

      it("Reverts if offerExpiry has passed (offer status = EXPIRED)", async () => {
        // ---------
        // Arrange: Set next block's timestamp after offerExpiry time
        // ---------
        await setNextTimestamp(
          ethers.provider,
          Number(offerRemoveLiquidity.offerExpiry) + 1
        );

        // ---------
        // Act & Assert: Check that `fillOfferRemoveLiquidity` fails
        // ---------
        await expect(
          eip712RemoveFacet
            .connect(user2)
            .fillOfferRemoveLiquidity(
              offerRemoveLiquidity,
              signature,
              offerRemoveLiquidity.positionTokenAmount
            )
        ).to.be.revertedWith("OfferInvalidCancelledFilledOrExpired()");
      });

      it("Reverts if positionTokenAmount = 0 (offer status = INVALID)", async () => {
        // ---------
        // Arrange: Set positionTokenAmount = 0 in offerRemoveLiquidity which will render the offer invalid
        // ---------

        // Set positionTokenAmount = 0 in offerRemoveLiquidity
        offerRemoveLiquidity.positionTokenAmount = "0";

        // Generate new signature with new offerRemoveLiquidity
        const [signature] = await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          REMOVE_LIQUIDITY_TYPE,
          offerRemoveLiquidity,
          "OfferRemoveLiquidity"
        );

        // ---------
        // Act & Assert: Check that `fillOfferRemoveLiquidity` fails
        // ---------
        await expect(
          eip712RemoveFacet
            .connect(user2)
            .fillOfferRemoveLiquidity(
              offerRemoveLiquidity,
              signature,
              offerRemoveLiquidity.positionTokenAmount
            )
        ).to.be.revertedWith("OfferInvalidCancelledFilledOrExpired()");
      });

      // Note that this test is specific to fillOfferRemoveLiquidity and does not exist for fillOfferAddLiquidity (which is used for reference)
      it("Reverts if makerCollateralAmount exceeds positionTokenAmount (offer status = INVALID)", async function () {
        // ---------
        // Arrange: Set makerCollateralAmount > positionTokenAmount in offerRemoveLiquidity which will render the offer invalid
        // ---------

        // Set makerCollateralAmount > positionTokenAmount in offerRemoveLiquidity
        offerRemoveLiquidity.makerCollateralAmount = BigNumber.from(
          offerRemoveLiquidity.positionTokenAmount
        )
          .add(1)
          .toString();

        // Generate new signature with new offerRemoveLiquidity
        const [signature] = await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          REMOVE_LIQUIDITY_TYPE,
          offerRemoveLiquidity,
          "OfferRemoveLiquidity"
        );

        // ---------
        // Act & Assert: Check that `fillOfferRemoveLiquidity` fails
        // ---------
        await expect(
          eip712RemoveFacet
            .connect(user2)
            .fillOfferRemoveLiquidity(
              offerRemoveLiquidity,
              signature,
              offerRemoveLiquidity.positionTokenAmount
            )
        ).to.be.revertedWith("OfferInvalidCancelledFilledOrExpired()");
      });

      it("Reverts if user tries to fill offer an already cancelled offer (offer status = CANCELLED)", async () => {
        // ---------
        // Arrange: Cancel remove liquidity offer
        // ---------
        await eip712CancelFacet
          .connect(user1)
          .cancelOfferRemoveLiquidity(offerRemoveLiquidity);

        // ---------
        // Act & Assert: Check that `fillOfferRemoveLiquidity` fails
        // ---------
        await expect(
          eip712RemoveFacet
            .connect(user2)
            .fillOfferRemoveLiquidity(
              offerRemoveLiquidity,
              signature,
              offerRemoveLiquidity.positionTokenAmount
            )
        ).to.be.revertedWith("OfferInvalidCancelledFilledOrExpired()");
      });

      it("Reverts if user tries to fill an already filled offer (offer status = FILLED)", async () => {
        // ---------
        // Arrange: Simulate a full fill and set the next positionTokenFillAmount at 1
        // ---------

        // Set positionTokenFillAmount equal to positionTokenAmount to simulate a full fill of a remove liquidity offer
        positionTokenFillAmount = offerRemoveLiquidity.positionTokenAmount;

        // Fill remove liquidity offer with user2 address (taker)
        await eip712RemoveFacet
          .connect(user2)
          .fillOfferRemoveLiquidity(
            offerRemoveLiquidity,
            signature,
            positionTokenFillAmount
          );

        // Confirm that the offer is already filled
        const relevantStateParamsAfterFullFill =
          await getterFacet.getOfferRelevantStateRemoveLiquidity(
            offerRemoveLiquidity,
            signature
          );
        expect(relevantStateParamsAfterFullFill.offerInfo.status).to.eq(
          OfferStatus.Filled
        );

        // Set positionTokenFillAmount at 1
        positionTokenFillAmount = "1";

        // ---------
        // Act & Assert: Check that `fillOfferRemoveLiquidity` fails
        // ---------
        await expect(
          eip712RemoveFacet
            .connect(user2)
            .fillOfferRemoveLiquidity(
              offerRemoveLiquidity,
              signature,
              positionTokenFillAmount
            )
        ).to.be.revertedWith("OfferInvalidCancelledFilledOrExpired()");
      });

      // -------------------------------------------
      // Events
      // -------------------------------------------

      it("Should emit an OfferFilled event (fillOfferRemoveLiquidity)", async () => {
        // ---------
        // Arrange: Set positionTokenFillAmount
        // ---------
        positionTokenFillAmount = BigNumber.from(
          offerRemoveLiquidity.positionTokenAmount
        ).toString();

        // ---------
        // Act: Fill remove liquidity offer
        // ---------
        const tx = await eip712RemoveFacet
          .connect(user2)
          .fillOfferRemoveLiquidity(
            offerRemoveLiquidity,
            signature,
            positionTokenFillAmount
          );
        const receipt = await tx.wait();

        // ---------
        // Asset: Confirm that the OfferFilled event is emitted with the right parameters
        // ---------
        const offerFilledEvent = receipt.events?.find(
          (item: any) => item.event === "OfferFilled"
        );
        expect(offerFilledEvent?.args?.typedOfferHash).to.eq(typedMessageHash);
        expect(offerFilledEvent?.args?.maker).to.eq(offerRemoveLiquidity.maker);
        expect(offerFilledEvent?.args?.taker).to.eq(offerRemoveLiquidity.taker);
        expect(offerFilledEvent?.args?.takerFilledAmount).to.eq(
          positionTokenFillAmount
        );
      });
    });

    describe("fillOfferRemoveLiquidity with non-zero taker address and makerIsLong as false", async function () {
      beforeEach(async () => {
        // Reset long, short token recipient in createPoolParams
        createPoolParams.longRecipient = user2.address;
        createPoolParams.shortRecipient = user1.address;

        // Create a contingent pool on DIVA Protocol
        const tx = await poolFacet
          .connect(user1)
          .createContingentPool(createPoolParams);
        const receipt = await tx.wait();

        // Get poolId of the newly created pool from event
        poolId = receipt.events?.find((x: any) => x.event === "PoolIssued")
          ?.args?.poolId;

        // Get pool parameters of newly created pool
        poolParams = await getterFacet.getPoolParameters(poolId);

        // Get instances of short and long token
        shortTokenInstance = await erc20AttachFixture(poolParams.shortToken);
        longTokenInstance = await erc20AttachFixture(poolParams.longToken);

        // Generate offerRemoveLiquidity
        offerRemoveLiquidity = await generateRemoveLiquidityOfferDetails(
          user1.address.toString(), // maker
          user2.address.toString(), // taker
          false, // makerIsLong
          poolId,
          collateralTokenDecimals
        );

        // Generate signature
        [signature] = await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          REMOVE_LIQUIDITY_TYPE,
          offerRemoveLiquidity,
          "OfferRemoveLiquidity"
        );

        feesParams = await getterFacet.getFees(poolParams.indexFees);
      });

      it("Should fully fill a remove liquidity offer and update the relevant parameters", async function () {
        // ---------
        // Arrange: Set positionTokenFillAmount equal to positionTokenAmount, calculate collateral net of fees and token balances for both users before removing liquidity
        // ---------

        // Set positionTokenFillAmount = positionTokenAmount
        positionTokenFillAmount = offerRemoveLiquidity.positionTokenAmount;

        // Calculate fees
        protocolFee = calcFee(
          feesParams.protocolFee,
          BigNumber.from(positionTokenFillAmount),
          collateralTokenDecimals
        );
        expect(protocolFee).to.not.eq(0);
        settlementFee = calcFee(
          feesParams.settlementFee,
          BigNumber.from(positionTokenFillAmount),
          collateralTokenDecimals
        );
        expect(settlementFee).to.not.eq(0);

        // Collateral net of fees
        collateralToReturnNet = BigNumber.from(positionTokenFillAmount)
          .sub(protocolFee)
          .sub(settlementFee);

        // Collateral net of fees for maker and taker
        collateralAmountRemovedNetMaker = collateralToReturnNet
          .mul(BigNumber.from(offerRemoveLiquidity.makerCollateralAmount))
          .div(BigNumber.from(offerRemoveLiquidity.positionTokenAmount));
        collateralAmountRemovedNetTaker = collateralToReturnNet.sub(
          collateralAmountRemovedNetMaker
        );

        // Get balance of collateral token for both users before remove liquidity
        balanceOfCollateralTokenBeforeUser1 = await collateralToken.balanceOf(
          user1.address
        );
        balanceOfCollateralTokenBeforeUser2 = await collateralToken.balanceOf(
          user2.address
        );

        // Get balance of collateral token for DIVA Protocol before remove liquidity
        balanceOfCollateralTokenBeforeDiva = await collateralToken.balanceOf(
          diamondAddress
        );

        // Get balance of short token for user1 before remove liquidity
        const balanceOfShortTokenBeforeUser1 =
          await shortTokenInstance.balanceOf(user1.address);
        // Get balance of long token for user2 before remove liquidity
        const balanceOfLongTokenBeforeUser2 = await longTokenInstance.balanceOf(
          user2.address
        );

        // ---------
        // Act: User2 fills remove liquidity offer
        // ---------
        await eip712RemoveFacet
          .connect(user2)
          .fillOfferRemoveLiquidity(
            offerRemoveLiquidity,
            signature,
            positionTokenFillAmount
          );

        // ---------
        // Assert: Confirm that relevant parameters are updated correctly and the
        // user and DIVA Protocol collateral/position token balances are as expected
        // ---------

        // Confirm that users' short and long token balances have reduced
        // If makerIsLong is false, confirm that user1's short token balance
        // and user2's long token balance have reduced.
        expect(await shortTokenInstance.balanceOf(user1.address)).to.eq(
          balanceOfShortTokenBeforeUser1.sub(positionTokenFillAmount)
        );
        expect(await longTokenInstance.balanceOf(user2.address)).to.eq(
          balanceOfLongTokenBeforeUser2.sub(positionTokenFillAmount)
        );

        // Confirm that the collateral token balance for both users has increased
        expect(await collateralToken.balanceOf(user1.address)).to.eq(
          balanceOfCollateralTokenBeforeUser1.add(
            collateralAmountRemovedNetMaker
          )
        );
        expect(await collateralToken.balanceOf(user2.address)).to.eq(
          balanceOfCollateralTokenBeforeUser2.add(
            collateralAmountRemovedNetTaker
          )
        );

        // Confirm that DIVA Protocol's collateral token balance has reduced.
        // Note that the fees are still within DIVA Protocol until they are claimed.
        // Hence, the balance should reduce by collateralToReturnNet in the absence of a fee claim.
        expect(await collateralToken.balanceOf(diamondAddress)).to.eq(
          balanceOfCollateralTokenBeforeDiva.sub(collateralToReturnNet)
        );
      });
    });

    describe("fillOfferRemoveLiquidity with zero taker address", async function () {
      beforeEach(async () => {
        // Create a contingent pool on DIVA Protocol
        const tx = await poolFacet
          .connect(user1)
          .createContingentPool(createPoolParams);
        const receipt = await tx.wait();

        // Get poolId of the newly created pool from event
        poolId = receipt.events?.find((x: any) => x.event === "PoolIssued")
          ?.args?.poolId;

        // Get pool parameters of newly created pool
        poolParams = await getterFacet.getPoolParameters(poolId);

        // Get instances of short and long token
        shortTokenInstance = await erc20AttachFixture(poolParams.shortToken);
        longTokenInstance = await erc20AttachFixture(poolParams.longToken);

        // Generate offerRemoveLiquidity
        offerRemoveLiquidity = await generateRemoveLiquidityOfferDetails(
          user1.address.toString(), // maker
          ethers.constants.AddressZero, // taker = zero address
          true, // makerIsLong
          poolId,
          collateralTokenDecimals
        );

        // Generate signature
        [signature] = await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          REMOVE_LIQUIDITY_TYPE,
          offerRemoveLiquidity,
          "OfferRemoveLiquidity"
        );

        feesParams = await getterFacet.getFees(poolParams.indexFees);
      });

      it("Should be able to fill offer with any address (user2 for example) when taker is zero address", async function () {
        // ---------
        // Arrange: Set positionTokenFillAmount equal to positionTokenAmount, calculate collateral net of fees and token balances for both users before removing liquidity
        // ---------

        // Set positionTokenFillAmount = positionTokenAmount
        positionTokenFillAmount = offerRemoveLiquidity.positionTokenAmount;

        // Calculate fees
        protocolFee = calcFee(
          feesParams.protocolFee,
          BigNumber.from(positionTokenFillAmount),
          collateralTokenDecimals
        );
        expect(protocolFee).to.not.eq(0);
        settlementFee = calcFee(
          feesParams.settlementFee,
          BigNumber.from(positionTokenFillAmount),
          collateralTokenDecimals
        );
        expect(settlementFee).to.not.eq(0);

        // Collateral net of fees
        collateralToReturnNet = BigNumber.from(positionTokenFillAmount)
          .sub(protocolFee)
          .sub(settlementFee);

        // Collateral net of fees for maker and taker
        collateralAmountRemovedNetMaker = collateralToReturnNet
          .mul(BigNumber.from(offerRemoveLiquidity.makerCollateralAmount))
          .div(BigNumber.from(offerRemoveLiquidity.positionTokenAmount));
        collateralAmountRemovedNetTaker = collateralToReturnNet.sub(
          collateralAmountRemovedNetMaker
        );

        // Get balance of collateral token for both users before remove liquidity
        balanceOfCollateralTokenBeforeUser1 = await collateralToken.balanceOf(
          user1.address
        );
        balanceOfCollateralTokenBeforeUser2 = await collateralToken.balanceOf(
          user2.address
        );

        // Get balance of collateral token for DIVA Protocol before remove liquidity
        balanceOfCollateralTokenBeforeDiva = await collateralToken.balanceOf(
          diamondAddress
        );

        // Get balance of long token for user1 before remove liquidity
        balanceOfLongTokenBeforeUser1 = await longTokenInstance.balanceOf(
          user1.address
        );
        // Get balance of short token for user2 before remove liquidity
        balanceOfShortTokenBeforeUser2 = await shortTokenInstance.balanceOf(
          user2.address
        );

        // ---------
        // Act: User2 (any address) fills remove liquidity offer
        // ---------
        await eip712RemoveFacet
          .connect(user2)
          .fillOfferRemoveLiquidity(
            offerRemoveLiquidity,
            signature,
            positionTokenFillAmount
          );

        // ---------
        // Assert: Confirm that relevant parameters are updated correctly and the
        // user and DIVA Protocol collateral/position token balances are as expected
        // ---------

        // Confirm that users' short and long token balances have reduced
        expect(await longTokenInstance.balanceOf(user1.address)).to.eq(
          balanceOfLongTokenBeforeUser1.sub(positionTokenFillAmount)
        );
        expect(await shortTokenInstance.balanceOf(user2.address)).to.eq(
          balanceOfShortTokenBeforeUser2.sub(positionTokenFillAmount)
        );

        // Confirm that the collateral token balance for both users has increased
        expect(await collateralToken.balanceOf(user1.address)).to.eq(
          balanceOfCollateralTokenBeforeUser1.add(
            collateralAmountRemovedNetMaker
          )
        );
        expect(await collateralToken.balanceOf(user2.address)).to.eq(
          balanceOfCollateralTokenBeforeUser2.add(
            collateralAmountRemovedNetTaker
          )
        );

        // Confirm that DIVA Protocol's collateral token balance has reduced.
        // Note that the fees are still within DIVA Protocol until they are claimed.
        // Hence, the balance should reduce by collateralToReturnNet in the absence of a fee claim.
        expect(await collateralToken.balanceOf(diamondAddress)).to.eq(
          balanceOfCollateralTokenBeforeDiva.sub(collateralToReturnNet)
        );
      });
    });
  });

  describe("batchFillOfferRemoveLiquidity", async function () {
    it("Should fully fill a remove liquidity offer and update the relevant parameters", async function () {
      // ---------
      // Arrange: Create 2 contingent pools and set positionTokenFillAmount equal to positionTokenAmount, calculate collateral net of fees and token balances for both users before removing liquidity
      // ---------

      // Create first contingent pool on DIVA Protocol
      const tx1 = await poolFacet
        .connect(user1)
        .createContingentPool(createPoolParams);
      const receipt1 = await tx1.wait();

      // Get poolId of the newly created pool from event
      const poolId1 = receipt1.events?.find(
        (x: any) => x.event === "PoolIssued"
      )?.args?.poolId;

      // Get pool parameters and fee params of newly created pool
      const poolParams1Before = await getterFacet.getPoolParameters(poolId1);
      const feesParams1 = await getterFacet.getFees(
        poolParams1Before.indexFees
      );

      // Get instances of short and long token
      const shortTokenInstance1 = await erc20AttachFixture(
        poolParams1Before.shortToken
      );
      const longTokenInstance1 = await erc20AttachFixture(
        poolParams1Before.longToken
      );

      const supplyShort1Before = await shortTokenInstance1.totalSupply();
      const supplyLong1Before = await longTokenInstance1.totalSupply();

      // Generate first offerRemoveLiquidity
      const offerRemoveLiquidity1 = await generateRemoveLiquidityOfferDetails(
        user1.address.toString(),
        user2.address.toString(),
        true,
        poolId1,
        collateralTokenDecimals
      );

      // Generate signature and typed message hash
      const [signature1, typedMessageHash1] =
        await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          REMOVE_LIQUIDITY_TYPE,
          offerRemoveLiquidity1,
          "OfferRemoveLiquidity"
        );

      // Set positionTokenFillAmount = positionTokenAmount
      const positionTokenFillAmount1 =
        offerRemoveLiquidity1.positionTokenAmount;

      // Calculate fees
      const protocolFee1 = calcFee(
        feesParams1.protocolFee,
        BigNumber.from(positionTokenFillAmount1),
        collateralTokenDecimals
      );
      expect(protocolFee1).to.not.eq(0);
      const settlementFee1 = calcFee(
        feesParams1.settlementFee,
        BigNumber.from(positionTokenFillAmount1),
        collateralTokenDecimals
      );
      expect(settlementFee1).to.not.eq(0);

      // Collateral net of fees
      const collateralToReturnNet1 = BigNumber.from(positionTokenFillAmount1)
        .sub(protocolFee1)
        .sub(settlementFee1);

      // Collateral net of fees for maker and taker
      const collateralAmountRemovedNetMaker1 = collateralToReturnNet1
        .mul(BigNumber.from(offerRemoveLiquidity1.makerCollateralAmount))
        .div(BigNumber.from(offerRemoveLiquidity1.positionTokenAmount));
      const collateralAmountRemovedNetTaker1 = collateralToReturnNet1.sub(
        collateralAmountRemovedNetMaker1
      );

      // Get balance of long token for user1 before remove liquidity
      const balanceOfLongToken1BeforeUser1 = await longTokenInstance1.balanceOf(
        user1.address
      );
      // Get balance of long token for user1 before remove liquidity
      const balanceOfShortToken1BeforeUser2 =
        await shortTokenInstance1.balanceOf(user2.address);

      // Check relevant eip712 related parameters before the offer is being filled
      const relevantStateParamsBefore1 =
        await getterFacet.getOfferRelevantStateRemoveLiquidity(
          offerRemoveLiquidity1,
          signature1
        );

      expect(relevantStateParamsBefore1.offerInfo.typedOfferHash).to.eq(
        typedMessageHash1
      );
      expect(relevantStateParamsBefore1.offerInfo.status).to.eq(
        OfferStatus.Fillable
      );
      expect(relevantStateParamsBefore1.offerInfo.takerFilledAmount).to.eq(0);
      expect(relevantStateParamsBefore1.poolExists).to.be.true;
      // ------------------------------------------------

      // Create second contingent pool on DIVA Protocol
      const tx2 = await poolFacet
        .connect(user1)
        .createContingentPool(createPoolParams);
      const receipt2 = await tx2.wait();

      // Get poolId of the newly created pool from event
      const poolId2 = receipt2.events?.find(
        (x: any) => x.event === "PoolIssued"
      )?.args?.poolId;

      // Get pool parameters and fee params of newly created pool
      const poolParams2Before = await getterFacet.getPoolParameters(poolId2);
      const feesParams2 = await getterFacet.getFees(
        poolParams2Before.indexFees
      );

      // Get instances of short and long token
      const shortTokenInstance2 = await erc20AttachFixture(
        poolParams2Before.shortToken
      );
      const longTokenInstance2 = await erc20AttachFixture(
        poolParams2Before.longToken
      );

      const supplyShort2Before = await shortTokenInstance2.totalSupply();
      const supplyLong2Before = await longTokenInstance2.totalSupply();

      // Generate second offerRemoveLiquidity
      const offerRemoveLiquidity2 = await generateRemoveLiquidityOfferDetails(
        user1.address.toString(),
        user2.address.toString(),
        true,
        poolId2,
        collateralTokenDecimals
      );

      // Generate signature and typed message hash
      const [signature2, typedMessageHash2] =
        await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          REMOVE_LIQUIDITY_TYPE,
          offerRemoveLiquidity2,
          "OfferRemoveLiquidity"
        );

      // Set positionTokenFillAmount = positionTokenAmount
      const positionTokenFillAmount2 =
        offerRemoveLiquidity2.positionTokenAmount;

      // Calculate fees
      const protocolFee2 = calcFee(
        feesParams2.protocolFee,
        BigNumber.from(positionTokenFillAmount2),
        collateralTokenDecimals
      );
      expect(protocolFee2).to.not.eq(0);
      const settlementFee2 = calcFee(
        feesParams2.settlementFee,
        BigNumber.from(positionTokenFillAmount2),
        collateralTokenDecimals
      );
      expect(settlementFee2).to.not.eq(0);

      // Collateral net of fees
      const collateralToReturnNet2 = BigNumber.from(positionTokenFillAmount2)
        .sub(protocolFee2)
        .sub(settlementFee2);

      // Collateral net of fees for maker and taker
      const collateralAmountRemovedNetMaker2 = collateralToReturnNet2
        .mul(BigNumber.from(offerRemoveLiquidity2.makerCollateralAmount))
        .div(BigNumber.from(offerRemoveLiquidity2.positionTokenAmount));
      const collateralAmountRemovedNetTaker2 = collateralToReturnNet2.sub(
        collateralAmountRemovedNetMaker2
      );

      // Get balance of long token for user1 before remove liquidity
      const balanceOfLongToken2BeforeUser1 = await longTokenInstance2.balanceOf(
        user1.address
      );
      // Get balance of long token for user1 before remove liquidity
      const balanceOfShortToken2BeforeUser2 =
        await shortTokenInstance2.balanceOf(user2.address);

      // Check relevant eip712 related parameters before the offer is being filled
      const relevantStateParamsBefore2 =
        await getterFacet.getOfferRelevantStateRemoveLiquidity(
          offerRemoveLiquidity2,
          signature2
        );

      expect(relevantStateParamsBefore2.offerInfo.typedOfferHash).to.eq(
        typedMessageHash2
      );
      expect(relevantStateParamsBefore2.offerInfo.status).to.eq(
        OfferStatus.Fillable
      );
      expect(relevantStateParamsBefore2.offerInfo.takerFilledAmount).to.eq(0);
      expect(relevantStateParamsBefore2.poolExists).to.be.true;
      // ------------------------------------------------

      // Get balance of collateral token for both users before remove liquidity
      const balanceOfCollateralTokenBeforeUser1 =
        await collateralToken.balanceOf(user1.address);
      const balanceOfCollateralTokenBeforeUser2 =
        await collateralToken.balanceOf(user2.address);

      // Get balance of collateral token for DIVA Protocol before remove liquidity
      const balanceOfCollateralTokenBeforeDiva =
        await collateralToken.balanceOf(diamondAddress);

      // ---------
      // Act: Batch fill remove liquidity offer
      // ---------
      await eip712RemoveFacet.connect(user2).batchFillOfferRemoveLiquidity([
        {
          offerRemoveLiquidity: offerRemoveLiquidity1,
          signature: signature1,
          positionTokenFillAmount: positionTokenFillAmount1,
        },
        {
          offerRemoveLiquidity: offerRemoveLiquidity2,
          signature: signature2,
          positionTokenFillAmount: positionTokenFillAmount2,
        },
      ]);

      // ---------
      // Assert: Confirm that relevant parameters are updated correctly and the
      // user and DIVA Protocol collateral/position token balances are as expected
      // ---------

      // Get first pool parameters after removing liquidity
      const poolParams1After = await getterFacet.getPoolParameters(poolId1);

      // Confirm that pool collateralBalance has reduced
      expect(poolParams1After.collateralBalance).to.eq(
        poolParams1Before.collateralBalance.sub(positionTokenFillAmount1)
      );

      // Confirm that takerFilledAmount for the corresponding offer has increased
      expect(await getterFacet.getTakerFilledAmount(typedMessageHash1)).to.eq(
        positionTokenFillAmount1
      );

      // Confirm that total supply of both short and long tokens has reduced
      expect(await shortTokenInstance1.totalSupply()).to.eq(
        supplyShort1Before.sub(positionTokenFillAmount1)
      );
      expect(await longTokenInstance1.totalSupply()).to.eq(
        supplyLong1Before.sub(positionTokenFillAmount1)
      );

      // Confirm that users' short and long token balances have reduced
      expect(await longTokenInstance1.balanceOf(user1.address)).to.eq(
        balanceOfLongToken1BeforeUser1.sub(positionTokenFillAmount1)
      );
      expect(await shortTokenInstance1.balanceOf(user2.address)).to.eq(
        balanceOfShortToken1BeforeUser2.sub(positionTokenFillAmount1)
      );

      // Confirm that the relevant eip712 related parameters have been updated
      const relevantStateParamsAfter1 =
        await getterFacet.getOfferRelevantStateRemoveLiquidity(
          offerRemoveLiquidity1,
          signature1
        );
      expect(relevantStateParamsAfter1.offerInfo.typedOfferHash).to.eq(
        typedMessageHash1
      );
      expect(relevantStateParamsAfter1.offerInfo.status).to.eq(
        OfferStatus.Filled
      );
      expect(relevantStateParamsAfter1.offerInfo.takerFilledAmount).to.eq(
        positionTokenFillAmount1
      );
      expect(relevantStateParamsAfter1.poolExists).to.be.true; // should remain unchanged
      // ------------------------------------------------

      // Get second pool parameters after adding liquidity
      const poolParams2After = await getterFacet.getPoolParameters(poolId2);

      // Confirm that pool collateralBalance has reduced
      expect(poolParams2After.collateralBalance).to.eq(
        poolParams2Before.collateralBalance.sub(positionTokenFillAmount2)
      );

      // Confirm that takerFilledAmount for the corresponding offer has increased
      expect(await getterFacet.getTakerFilledAmount(typedMessageHash2)).to.eq(
        positionTokenFillAmount2
      );

      // Confirm that total supply of both short and long tokens has reduced
      expect(await shortTokenInstance2.totalSupply()).to.eq(
        supplyShort2Before.sub(positionTokenFillAmount2)
      );
      expect(await longTokenInstance2.totalSupply()).to.eq(
        supplyLong2Before.sub(positionTokenFillAmount2)
      );

      // Confirm that users' short and long token balances have reduced
      expect(await longTokenInstance2.balanceOf(user1.address)).to.eq(
        balanceOfLongToken2BeforeUser1.sub(positionTokenFillAmount2)
      );
      expect(await shortTokenInstance2.balanceOf(user2.address)).to.eq(
        balanceOfShortToken2BeforeUser2.sub(positionTokenFillAmount2)
      );

      // Confirm that the relevant eip712 related parameters have been updated
      const relevantStateParamsAfter2 =
        await getterFacet.getOfferRelevantStateRemoveLiquidity(
          offerRemoveLiquidity2,
          signature2
        );
      expect(relevantStateParamsAfter2.offerInfo.typedOfferHash).to.eq(
        typedMessageHash2
      );
      expect(relevantStateParamsAfter2.offerInfo.status).to.eq(
        OfferStatus.Filled
      );
      expect(relevantStateParamsAfter2.offerInfo.takerFilledAmount).to.eq(
        positionTokenFillAmount2
      );
      expect(relevantStateParamsAfter2.poolExists).to.be.true; // should remain unchanged
      // ------------------------------------------------

      // Confirm that the collateral token balance for both users has increased
      expect(await collateralToken.balanceOf(user1.address)).to.eq(
        balanceOfCollateralTokenBeforeUser1
          .add(collateralAmountRemovedNetMaker1)
          .add(collateralAmountRemovedNetMaker2)
      );
      expect(await collateralToken.balanceOf(user2.address)).to.eq(
        balanceOfCollateralTokenBeforeUser2
          .add(collateralAmountRemovedNetTaker1)
          .add(collateralAmountRemovedNetTaker2)
      );

      // Confirm that DIVA Protocol's collateral token balance has reduced.
      // Note that the fees are still within DIVA Protocol until they are claimed.
      // Hence, the balance should reduce by collateralToReturnNet in the absence of a fee claim.
      expect(await collateralToken.balanceOf(diamondAddress)).to.eq(
        balanceOfCollateralTokenBeforeDiva
          .sub(collateralToReturnNet1)
          .sub(collateralToReturnNet2)
      );
    });
  });

  describe("cancelOfferRemoveLiquidity", async function () {
    beforeEach(async () => {
      // Create a contingent pool on DIVA protocol
      const tx = await poolFacet
        .connect(user1)
        .createContingentPool(createPoolParams);
      const receipt = await tx.wait();

      // Get poolId of the newly created pool from event
      poolId = receipt.events?.find((x: any) => x.event === "PoolIssued")?.args
        ?.poolId;

      // Generate offerRemoveLiquidity
      offerRemoveLiquidity = await generateRemoveLiquidityOfferDetails(
        user1.address.toString(), // maker
        user2.address.toString(), // taker
        true, // makerIsLong
        poolId,
        collateralTokenDecimals
      );

      // Generate signature and typed message hash
      [signature, typedMessageHash] =
        await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          REMOVE_LIQUIDITY_TYPE,
          offerRemoveLiquidity,
          "OfferRemoveLiquidity"
        );
    });

    it("Maker should be able to cancel an unfilled remove liquidity offer", async function () {
      // ---------
      // Act: User1 cancel remove liquidity offer
      // ---------
      await eip712CancelFacet
        .connect(user1)
        .cancelOfferRemoveLiquidity(offerRemoveLiquidity);

      // ---------
      // Assert: Confirm that offer is cancelled successfully
      // ---------
      expect(await getterFacet.getTakerFilledAmount(typedMessageHash)).to.eq(
        ethers.constants.MaxUint256
      );
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateRemoveLiquidity(
          offerRemoveLiquidity,
          signature
        );
      expect(relevantStateParams.offerInfo.status).to.eq(OfferStatus.Cancelled);
    });

    it("Maker should be able to cancel a fully filled remove liquidity offer", async function () {
      // ---------
      // Arrange: Simulate a full fill
      // ---------

      // Set positionTokenFillAmount equal to positionTokenAmount to simulate a full fill of a remove liquidity offer
      positionTokenFillAmount = offerRemoveLiquidity.positionTokenAmount;

      // Fill remove liquidity offer with user2 address (taker)
      await eip712RemoveFacet
        .connect(user2)
        .fillOfferRemoveLiquidity(
          offerRemoveLiquidity,
          signature,
          positionTokenFillAmount
        );

      // Confirm that the offer is fully filled
      const relevantStateParamsAfterFullFill =
        await getterFacet.getOfferRelevantStateRemoveLiquidity(
          offerRemoveLiquidity,
          signature
        );
      expect(relevantStateParamsAfterFullFill.offerInfo.status).to.eq(
        OfferStatus.Filled
      );

      // ---------
      // Act: User1 (maker) cancels remove liquidity offer
      // ---------
      await eip712CancelFacet
        .connect(user1)
        .cancelOfferRemoveLiquidity(offerRemoveLiquidity);

      // ---------
      // Assert: Confirm that the offer is cancelled successfully
      // ---------
      const relevantStateParamsAfterCancel =
        await getterFacet.getOfferRelevantStateRemoveLiquidity(
          offerRemoveLiquidity,
          signature
        );
      expect(relevantStateParamsAfterCancel.offerInfo.status).to.eq(
        OfferStatus.Cancelled
      );
    });

    it("Maker should be able to cancel a partially filled remove liquidity offer", async function () {
      // ---------
      // Arrange: Simulate a partial fill
      // ---------

      // Set positionTokenFillAmount < positionTokenAmount to simulate a partial fill of a remove liquidity offer
      positionTokenFillAmount = offerRemoveLiquidity.minimumTakerFillAmount;
      expect(positionTokenFillAmount).to.be.lt(
        BigNumber.from(offerRemoveLiquidity.positionTokenAmount)
      );
      expect(positionTokenFillAmount).to.be.gt(BigNumber.from(0));

      // Fill remove liquidity offer with user2 address (taker)
      await eip712RemoveFacet
        .connect(user2)
        .fillOfferRemoveLiquidity(
          offerRemoveLiquidity,
          signature,
          positionTokenFillAmount
        );

      // Confirm that the offer is still fillable
      const relevantStateParamsAfterPartialFill =
        await getterFacet.getOfferRelevantStateRemoveLiquidity(
          offerRemoveLiquidity,
          signature
        );
      expect(relevantStateParamsAfterPartialFill.offerInfo.status).to.eq(
        OfferStatus.Fillable
      );

      // ---------
      // Act: User1 (maker) cancels remove liquidity offer
      // ---------
      await eip712CancelFacet
        .connect(user1)
        .cancelOfferRemoveLiquidity(offerRemoveLiquidity);

      // ---------
      // Assert: Confirm that the offer is cancelled successfully
      // ---------
      const relevantStateParamsAfterCancel =
        await getterFacet.getOfferRelevantStateRemoveLiquidity(
          offerRemoveLiquidity,
          signature
        );
      expect(relevantStateParamsAfterCancel.offerInfo.status).to.eq(
        OfferStatus.Cancelled
      );
    });

    it("Maker should be able to cancel an expired remove liquidity offer", async function () {
      // ---------
      // Arrange: Set next block's timestamp after offerExpiry time and mine block to simulate expired offer
      // ---------
      await mineBlock(Number(offerRemoveLiquidity.offerExpiry) + 1);

      // Confirm that the offer is expired
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateRemoveLiquidity(
          offerRemoveLiquidity,
          signature
        );
      expect(relevantStateParams.offerInfo.status).to.eq(OfferStatus.Expired);

      // ---------
      // Act: User1 (maker) cancels remove liquidity offer
      // ---------
      await eip712CancelFacet
        .connect(user1)
        .cancelOfferRemoveLiquidity(offerRemoveLiquidity);

      // ---------
      // Assert: Confirm that the offer is cancelled successfully
      // ---------
      const relevantStateParamsAfterCancel =
        await getterFacet.getOfferRelevantStateRemoveLiquidity(
          offerRemoveLiquidity,
          signature
        );
      expect(relevantStateParamsAfterCancel.offerInfo.status).to.eq(
        OfferStatus.Cancelled
      );
    });

    it("Maker should be able to cancel an already cancelled remove liquidity offer", async function () {
      // ---------
      // Arrange: Simulate a cancelled offer
      // ---------

      // User1 (maker) cancels remove liquidity offer
      await eip712CancelFacet
        .connect(user1)
        .cancelOfferRemoveLiquidity(offerRemoveLiquidity);

      // Confirm that the offer is cancelled successfully
      const relevantStateParamsAfterFirstCancel =
        await getterFacet.getOfferRelevantStateRemoveLiquidity(
          offerRemoveLiquidity,
          signature
        );
      expect(relevantStateParamsAfterFirstCancel.offerInfo.status).to.eq(
        OfferStatus.Cancelled
      );

      // ---------
      // Act: User1 (maker) cancels remove liquidity offer again
      // ---------
      await eip712CancelFacet
        .connect(user1)
        .cancelOfferRemoveLiquidity(offerRemoveLiquidity);

      // ---------
      // Assert: Confirm that the offer is still cancelled
      // ---------
      const relevantStateParamsAfterSecondCancel =
        await getterFacet.getOfferRelevantStateRemoveLiquidity(
          offerRemoveLiquidity,
          signature
        );
      expect(relevantStateParamsAfterSecondCancel.offerInfo.status).to.eq(
        OfferStatus.Cancelled
      );
    });

    // -------------------------------------------
    // Reverts
    // -------------------------------------------

    it("Should revert if remove liquidity offer is not cancelled by maker", async function () {
      // ---------
      // Arrange: Confirm that user2 is not the maker of remove liquidity offer
      // ---------
      expect(user2.address).to.not.eq(offerRemoveLiquidity.maker);

      // ---------
      // Act & Assert: Check that `cancelOfferRemoveLiquidity` fails with user2
      // ---------
      await expect(
        eip712CancelFacet
          .connect(user2)
          .cancelOfferRemoveLiquidity(offerRemoveLiquidity)
      ).to.be.revertedWith("MsgSenderNotMaker()");
    });

    // -------------------------------------------
    // Events
    // -------------------------------------------

    it("Should emit an OfferCancelled event (fillOfferRemoveLiquidity)", async () => {
      // ---------
      // Act: Cancel remove liquidity offer
      // ---------
      const tx = await eip712CancelFacet
        .connect(user1)
        .cancelOfferRemoveLiquidity(offerRemoveLiquidity);
      const receipt = await tx.wait();

      // ---------
      // Asset: Confirm that the OfferFilled event is emitted with the right parameters
      // ---------
      const offerCancelledEvent = receipt.events?.find(
        (item: any) => item.event === "OfferCancelled"
      );
      expect(offerCancelledEvent?.args?.typedOfferHash).to.eq(typedMessageHash);
      expect(offerCancelledEvent?.args?.maker).to.eq(
        offerRemoveLiquidity.maker
      );
    });
  });

  describe("batchCancelOfferRemoveLiquidity", async function () {
    it("Maker should be able to cancel batch remove liquidity offers", async function () {
      // ---------
      // Arrange: Create 2 remove liquidity offers
      // ---------

      // Create first contingent pool on DIVA protocol
      const tx1 = await poolFacet
        .connect(user1)
        .createContingentPool(createPoolParams);
      const receipt1 = await tx1.wait();

      // Get poolId of the newly created pool from event
      const poolId1 = receipt1.events?.find(
        (x: any) => x.event === "PoolIssued"
      )?.args?.poolId;

      // Generate offerRemoveLiquidity
      const offerRemoveLiquidity1 = await generateRemoveLiquidityOfferDetails(
        user1.address.toString(), // maker
        user2.address.toString(), // taker
        true, // makerIsLong
        poolId1,
        collateralTokenDecimals
      );

      // Generate signature and typed message hash
      const [signature1, typedMessageHash1] =
        await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          REMOVE_LIQUIDITY_TYPE,
          offerRemoveLiquidity1,
          "OfferRemoveLiquidity"
        );
      // --------------------------------------------------

      // Create second contingent pool on DIVA protocol
      const tx2 = await poolFacet
        .connect(user1)
        .createContingentPool(createPoolParams);
      const receipt2 = await tx2.wait();

      // Get poolId of the newly created pool from event
      const poolId2 = receipt2.events?.find(
        (x: any) => x.event === "PoolIssued"
      )?.args?.poolId;

      // Generate offerRemoveLiquidity
      const offerRemoveLiquidity2 = await generateRemoveLiquidityOfferDetails(
        user1.address.toString(), // maker
        user2.address.toString(), // taker
        true, // makerIsLong
        poolId2,
        collateralTokenDecimals
      );

      // Generate signature and typed message hash
      const [signature2, typedMessageHash2] =
        await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          REMOVE_LIQUIDITY_TYPE,
          offerRemoveLiquidity2,
          "OfferRemoveLiquidity"
        );
      // --------------------------------------------------

      // ---------
      // Act: User1 cancel remove liquidity offers
      // ---------
      await eip712CancelFacet
        .connect(user1)
        .batchCancelOfferRemoveLiquidity([
          offerRemoveLiquidity1,
          offerRemoveLiquidity2,
        ]);

      // ---------
      // Assert: Confirm that offers are cancelled successfully
      // ---------
      expect(await getterFacet.getTakerFilledAmount(typedMessageHash1)).to.eq(
        ethers.constants.MaxUint256
      );
      const relevantStateParams1 =
        await getterFacet.getOfferRelevantStateRemoveLiquidity(
          offerRemoveLiquidity1,
          signature1
        );
      expect(relevantStateParams1.offerInfo.status).to.eq(
        OfferStatus.Cancelled
      );

      expect(await getterFacet.getTakerFilledAmount(typedMessageHash2)).to.eq(
        ethers.constants.MaxUint256
      );
      const relevantStateParams2 =
        await getterFacet.getOfferRelevantStateRemoveLiquidity(
          offerRemoveLiquidity2,
          signature2
        );
      expect(relevantStateParams2.offerInfo.status).to.eq(
        OfferStatus.Cancelled
      );
    });
  });

  describe("getOfferRelevantStateRemoveLiquidity", async function () {
    beforeEach(async () => {
      // Set pool capacity to max amount to not run into any capacity constraints during the tests

      // Create a contingent pool on DIVA protocol
      const tx = await poolFacet
        .connect(user1)
        .createContingentPool(createPoolParams);
      const receipt = await tx.wait();

      // Get poolId of the newly created pool from event
      poolId = receipt.events?.find((x: any) => x.event === "PoolIssued")?.args
        ?.poolId;

      // Get pool parameters of newly created pool
      poolParams = await getterFacet.getPoolParameters(poolId);

      // Get instances of short and long token
      shortTokenInstance = await erc20AttachFixture(poolParams.shortToken);
      longTokenInstance = await erc20AttachFixture(poolParams.longToken);

      // Generate offerRemoveLiquidity
      offerRemoveLiquidity = await generateRemoveLiquidityOfferDetails(
        user1.address.toString(), // maker
        user2.address.toString(), // taker
        true, // makerIsLong
        poolId,
        collateralTokenDecimals
      );

      // Generate signature and typed message hash
      [signature, typedMessageHash] =
        await generateSignatureAndTypedMessageHash(
          user1,
          divaDomain,
          REMOVE_LIQUIDITY_TYPE,
          offerRemoveLiquidity,
          "OfferRemoveLiquidity"
        );
    });

    it("Should clamp actualTakerFillableAmount to remaining available maker position token balance in unfilled remove liquidity offer", async function () {
      // ---------
      // Arrange: Create a remove liquidity offer where positionTokenAmount is larger than the maker's position token balance
      // ---------
      const makerPositionTokenBalance = await longTokenInstance.balanceOf(
        user1.address
      );

      offerRemoveLiquidity.positionTokenAmount = makerPositionTokenBalance
        .mul(2)
        .toString();

      // Generate signature
      [signature] = await generateSignatureAndTypedMessageHash(
        user1,
        divaDomain,
        REMOVE_LIQUIDITY_TYPE,
        offerRemoveLiquidity,
        "OfferRemoveLiquidity"
      );

      // ---------
      // Assert: Confirm that actualTakerFillableAmount is less than positionTokenAmount
      // ---------
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateRemoveLiquidity(
          offerRemoveLiquidity,
          signature
        );
      expect(relevantStateParams.actualTakerFillableAmount).to.eq(
        makerPositionTokenBalance
      );
    });

    it("Should allow to fill offer with actualTakerFillableAmount on fluctuations in remaining available maker position token balance", async function () {
      // ---------
      // Arrange1: Create a remove liquidity offer where makerCollateralAmount and positionTokenAmount are equal to maker's position token balance, and simulate a partial fill
      // ---------
      const makerPositionTokenBalanceBeforeFill =
        await longTokenInstance.balanceOf(user1.address);

      // Set makerCollateralAmount and positionTokenAmount
      offerRemoveLiquidity.makerCollateralAmount =
        makerPositionTokenBalanceBeforeFill.toString();
      offerRemoveLiquidity.positionTokenAmount =
        makerPositionTokenBalanceBeforeFill.toString();

      // Generate signature
      [signature] = await generateSignatureAndTypedMessageHash(
        user1,
        divaDomain,
        REMOVE_LIQUIDITY_TYPE,
        offerRemoveLiquidity,
        "OfferRemoveLiquidity"
      );

      // Set positionTokenFillAmount < positionTokenAmount to simulate a partial fill of a remove liquidity offer
      const positionTokenAmountFirstFill =
        offerRemoveLiquidity.minimumTakerFillAmount;
      expect(positionTokenAmountFirstFill).to.be.lt(
        BigNumber.from(offerRemoveLiquidity.positionTokenAmount)
      );
      expect(positionTokenAmountFirstFill).to.be.gt(BigNumber.from(0));

      // Fill remove liquidity offer with user2 address (taker)
      await eip712RemoveFacet
        .connect(user2)
        .fillOfferRemoveLiquidity(
          offerRemoveLiquidity,
          signature,
          positionTokenAmountFirstFill
        );

      // Confirm that actualTakerFillableAmount equals positionTokenAmount - positionTokenAmountFirstFill
      const relevantStateParamsAfterFill =
        await getterFacet.getOfferRelevantStateRemoveLiquidity(
          offerRemoveLiquidity,
          signature
        );
      expect(relevantStateParamsAfterFill.actualTakerFillableAmount).to.eq(
        BigNumber.from(offerRemoveLiquidity.positionTokenAmount).sub(
          positionTokenAmountFirstFill
        )
      );

      // Get user1's position token balance after fill
      const makerPositionTokenBalanceAfterFill =
        await longTokenInstance.balanceOf(user1.address);

      // Transfer out half of user1's position token balance so that the offer is no longer fully fillable
      const transferAmount = makerPositionTokenBalanceAfterFill.div(2);
      await longTokenInstance
        .connect(user1)
        .transfer(user2.address, transferAmount);

      // Confirm that actualTakerFillableAmount decreased
      const relevantStateParamsAfterTransfer =
        await getterFacet.getOfferRelevantStateRemoveLiquidity(
          offerRemoveLiquidity,
          signature
        );
      expect(
        relevantStateParamsAfterTransfer.actualTakerFillableAmount
      ).to.be.lt(relevantStateParamsAfterFill.actualTakerFillableAmount);
      expect(
        relevantStateParamsAfterTransfer.actualTakerFillableAmount
      ).to.be.gt(0);

      // ---------
      // Act1: Execute a second fill using actualTakerFillableAmount as takerFillAmount
      // ---------
      const positionTokenAmountSecondFill =
        relevantStateParamsAfterTransfer.actualTakerFillableAmount.toString();
      await eip712RemoveFacet
        .connect(user2)
        .fillOfferRemoveLiquidity(
          offerRemoveLiquidity,
          signature,
          positionTokenAmountSecondFill
        );

      // ---------
      // Assert1: Confirm that actualTakerFillableAmount is reduced to zero and status is Fillable under the condition that maker balance increases again
      // ---------
      const relevantStateParamsAfterSecondFill =
        await getterFacet.getOfferRelevantStateRemoveLiquidity(
          offerRemoveLiquidity,
          signature
        );
      expect(
        relevantStateParamsAfterSecondFill.actualTakerFillableAmount
      ).to.eq(0);
      expect(relevantStateParamsAfterSecondFill.offerInfo.status).to.eq(
        OfferStatus.Fillable
      );

      // ---------
      // Arrange2: Transfer back position token from user2 to user1 to render the original offer fully fillable
      // ---------
      await longTokenInstance
        .connect(user2)
        .transfer(user1.address, transferAmount);

      // Confirm that actualTakerFillableAmount increased again and equals positionTokenAmount - positionTokenAmountFirstFill - positionTokenAmountSecondFill
      const relevantStateParamsBeforeThirdFill =
        await getterFacet.getOfferRelevantStateRemoveLiquidity(
          offerRemoveLiquidity,
          signature
        );
      expect(
        relevantStateParamsBeforeThirdFill.actualTakerFillableAmount
      ).to.be.gt(0);
      expect(
        relevantStateParamsBeforeThirdFill.actualTakerFillableAmount
      ).to.eq(
        BigNumber.from(offerRemoveLiquidity.positionTokenAmount)
          .sub(positionTokenAmountFirstFill)
          .sub(positionTokenAmountSecondFill)
      );

      // ---------
      // Act2: Execute a third fill using actualTakerFillableAmount as positionTokenFillAmount
      // ---------
      const positionTokenAmountThirdFill =
        relevantStateParamsBeforeThirdFill.actualTakerFillableAmount.toString();
      await eip712RemoveFacet
        .connect(user2)
        .fillOfferRemoveLiquidity(
          offerRemoveLiquidity,
          signature,
          positionTokenAmountThirdFill
        );

      // ---------
      // Assert2: Confirm that the original offer is now fully filled
      // ---------
      const relevantStateParamsAfterThirdFill =
        await getterFacet.getOfferRelevantStateRemoveLiquidity(
          offerRemoveLiquidity,
          signature
        );
      expect(relevantStateParamsAfterThirdFill.actualTakerFillableAmount).to.eq(
        0
      );
      expect(relevantStateParamsAfterThirdFill.offerInfo.status).to.eq(
        OfferStatus.Filled
      );
    });

    it("Should set actualTakerFillableAmount = 0 if maker has zero remaining position token balance", async function () {
      // ---------
      // Arrange: Create a remove liquidity offer and reduce the maker's (user1's) position token balance to zero
      // ---------
      const makerPositionTokenBalance = await longTokenInstance.balanceOf(
        user1.address
      );
      expect(makerPositionTokenBalance).to.be.gt(0);

      // User1 transfers out all position tokens to user2 after having created the offer
      await longTokenInstance
        .connect(user1)
        .transfer(user2.address, makerPositionTokenBalance);

      // ---------
      // Assert: Confirm that actualTakerFillableAmount is 0
      // ---------
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateRemoveLiquidity(
          offerRemoveLiquidity,
          signature
        );
      expect(relevantStateParams.actualTakerFillableAmount).to.eq(0);
    });

    // Note that allowance part is not relevant for the remove liquidity offer as opposed to add liquidity offer

    it("Should return poolExists = false if poolId does not exist", async function () {
      // ---------
      // Arrange: Create an offer with a poolId that does not yet exist
      // ---------
      // Confirm that a poolId already exists (repeating from beforeEach block for test readability)
      poolId = await getterFacet.getLatestPoolId();
      expect(poolId).to.be.gt(0);

      // Increase poolId
      const nonExistentPoolId = poolId.add(1);
      const nonExistentPoolParams = await getterFacet.getPoolParameters(
        nonExistentPoolId
      );
      expect(nonExistentPoolParams.collateralToken).to.eq(
        ethers.constants.AddressZero
      ); // That's the existence check inside the smart contract

      offerRemoveLiquidity.poolId = nonExistentPoolId;

      // Generate signature
      [signature] = await generateSignatureAndTypedMessageHash(
        user1,
        divaDomain,
        REMOVE_LIQUIDITY_TYPE,
        offerRemoveLiquidity,
        "OfferRemoveLiquidity"
      );

      // ---------
      // Assert: Confirm that actualTakerFillableAmount is 0 and poolExists = false
      // ---------
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateRemoveLiquidity(
          offerRemoveLiquidity,
          signature
        );
      expect(relevantStateParams.actualTakerFillableAmount).to.eq(0);
      expect(relevantStateParams.poolExists).to.be.false;
    });

    it("Should return actualTakerFillableAmount = positionTokenAmount if makerCollateralAmount = 0 in an unfilled remove liquidity offer", async function () {
      // ---------
      // Arrange: Create a remove liquidity offer with makerCollateralAmount = 0
      // ---------
      offerRemoveLiquidity.makerCollateralAmount = "0";

      // Generate signature
      [signature] = await generateSignatureAndTypedMessageHash(
        user1,
        divaDomain,
        REMOVE_LIQUIDITY_TYPE,
        offerRemoveLiquidity,
        "OfferRemoveLiquidity"
      );

      // ---------
      // Assert: Confirm that actualTakerFillableAmount is equal positionTokenAmount
      // ---------
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateRemoveLiquidity(
          offerRemoveLiquidity,
          signature
        );
      expect(relevantStateParams.actualTakerFillableAmount).to.eq(
        BigNumber.from(offerRemoveLiquidity.positionTokenAmount)
      );
    });

    it("Should return actualTakerFillableAmount = positionTokenAmount - takerFilledAmount if makerCollateralAmount = 0 in a partially filled remove liquidity offer", async function () {
      // ---------
      // Arrange: Create a remove liquidity offer with makerCollateralAmount = 0
      // ---------
      offerRemoveLiquidity.makerCollateralAmount = "0";

      // Generate signature
      [signature] = await generateSignatureAndTypedMessageHash(
        user1,
        divaDomain,
        REMOVE_LIQUIDITY_TYPE,
        offerRemoveLiquidity,
        "OfferRemoveLiquidity"
      );

      // Set positionTokenFillAmount smaller than positionTokenAmount to simulate a partial fill
      positionTokenFillAmount = offerRemoveLiquidity.minimumTakerFillAmount;
      expect(BigNumber.from(positionTokenFillAmount)).to.be.lt(
        BigNumber.from(offerRemoveLiquidity.positionTokenAmount)
      );

      // ---------
      // Act: Fill offer partially
      // ---------
      await eip712RemoveFacet
        .connect(user2)
        .fillOfferRemoveLiquidity(
          offerRemoveLiquidity,
          signature,
          positionTokenFillAmount
        );

      // ---------
      // Assert: Confirm that actualTakerFillableAmount is equal positionTokenAmount - takerFilledAmount
      // ---------
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateRemoveLiquidity(
          offerRemoveLiquidity,
          signature
        );
      expect(relevantStateParams.offerInfo.takerFilledAmount).to.be.gt(0);
      expect(relevantStateParams.actualTakerFillableAmount).to.eq(
        BigNumber.from(offerRemoveLiquidity.positionTokenAmount).sub(
          relevantStateParams.offerInfo.takerFilledAmount
        )
      );
    });

    // Omitted a test here compared to add liquidity offer ("Should return actualTakerFillableAmount = 0 if makerCollateralAmount = 0 in a fully filled add liquidity offer")

    it("Should return the right parameters for an unfilled remove liquidity offer", async function () {
      // ---------
      // Arrange: Get offer relevant state
      // ---------
      const [
        offerInfo,
        actualTakerFillableAmount,
        isSignatureValid,
        poolExists,
      ]: [OfferInfo, BigNumber, boolean, boolean] =
        await getterFacet.getOfferRelevantStateRemoveLiquidity(
          offerRemoveLiquidity,
          signature
        );

      // ---------
      // Assert: Confirm that offer relevant state is correct
      // ---------
      expect(actualTakerFillableAmount).to.eq(
        offerRemoveLiquidity.positionTokenAmount
      );
      expect(isSignatureValid).to.eq(true);
      expect(offerInfo.status).to.eq(OfferStatus.Fillable);
      expect(offerInfo.typedOfferHash).to.eq(typedMessageHash);
      expect(offerInfo.takerFilledAmount).to.eq(0);
      expect(poolExists).to.be.true;
    });

    it("Returns isSignatureValid = false if invalid signature", async () => {
      // ---------
      // Arrange: Manipulate the offer object
      // ---------
      offerRemoveLiquidity.maker = ethers.constants.AddressZero;

      // ---------
      // Act & Assert: Confirm that isSignatureValid = false
      // ---------
      const relevantStateParams =
        await getterFacet.getOfferRelevantStateRemoveLiquidity(
          offerRemoveLiquidity,
          signature
        );
      expect(relevantStateParams.isSignatureValid).to.be.false;
    });
  });
});
