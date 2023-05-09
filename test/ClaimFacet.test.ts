import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
  ClaimFacet,
  GetterFacet,
  MockERC20,
  PoolFacet,
  SettlementFacet,
} from "../typechain-types";

import { deployMain } from "../scripts/deployMain";
import { getLastTimestamp, setNextTimestamp } from "../utils";

import { erc20DeployFixture } from "./fixtures";

// -------
// Input: Collateral token decimals (>= 6 && <= 18)
// -------
const decimals = 6;

const MAX_UINT = ethers.constants.MaxUint256;

describe("ClaimFacet", async function () {
  let contractOwner: SignerWithAddress,
    treasury: SignerWithAddress,
    oracle: SignerWithAddress,
    user1: SignerWithAddress,
    user2: SignerWithAddress;

  let diamondAddress: string;
  let poolFacet: PoolFacet,
    getterFacet: GetterFacet,
    settlementFacet: SettlementFacet,
    claimFacet: ClaimFacet;

  let collateralTokenInstance: MockERC20;

  before(async function () {
    [contractOwner, treasury, oracle, user1, user2] = await ethers.getSigners(); // keep contractOwner and treasury at first two positions in line with deploy script

    // ---------
    // Setup: Deploy diamond contract (incl. facets) and connect to the diamond contract via facet specific ABI's
    // ---------
    diamondAddress = (await deployMain())[0];
    poolFacet = await ethers.getContractAt("PoolFacet", diamondAddress);
    settlementFacet = await ethers.getContractAt(
      "SettlementFacet",
      diamondAddress
    );
    getterFacet = await ethers.getContractAt("GetterFacet", diamondAddress);
    claimFacet = await ethers.getContractAt("ClaimFacet", diamondAddress);
  });

  describe("Claim", async () => {
    let user1StartCollateralTokenBalance: number;
    let feeClaimTreasury: BigNumber;
    let poolId: string;
    let referenceAsset: string,
      expiryTime,
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
    let nextBlockTimestamp: number;
    let feeClaimDataProvider: BigNumber;
    let feeClaimDataProviderBefore: BigNumber;

    let finalReferenceValue: BigNumber;
    let allowChallenge: boolean;

    beforeEach(async () => {
      // ---------
      // Arrange: Create an expired pool and confirm final reference value so that fees are paid to the DIVA treasury and the data provider
      // ---------
      user1StartCollateralTokenBalance = 100000;

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
        .approve(
          diamondAddress,
          parseUnits(user1StartCollateralTokenBalance.toString(), decimals)
        );

      nextBlockTimestamp = (await getLastTimestamp()) + 1;
      await setNextTimestamp(ethers.provider, nextBlockTimestamp);

      // Create a set of position tokens with a very short time to expiration
      referenceAsset = "BTC/USD";
      expiryTime = nextBlockTimestamp + 1;
      floor = parseUnits("1198.53");
      inflection = parseUnits("1605.33");
      cap = parseUnits("2001.17");
      gradient = parseUnits("0.33", decimals);
      collateralAmount = parseUnits("15001.358", decimals);
      collateralToken = collateralTokenInstance.address;
      dataProvider = oracle.address;
      capacity = MAX_UINT; // Uncapped
      longRecipient = user1.address;
      shortRecipient = user1.address;
      permissionedERC721Token = ethers.constants.AddressZero;

      const tx = await poolFacet.connect(user1).createContingentPool({
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
      const receipt = await tx.wait();
      poolId = receipt.events?.find((x: any) => x.event === "PoolIssued")?.args
        ?.poolId;

      // Confirm final reference value
      finalReferenceValue = parseUnits("1700.89");
      allowChallenge = false;
      await settlementFacet
        .connect(oracle)
        .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge);
    });

    describe("claimFee", async () => {
      // -------------------------------------------
      // Functionality
      // -------------------------------------------

      it("Reduces the claimable amount after fees are claimed by the data provider and DIVA treasury", async () => {
        // ---------
        // Arrange: Confirm that data provider's and treasury's fee claim is positive
        // ---------
        expect(
          await getterFacet.getClaim(collateralToken, oracle.address)
        ).to.be.gt(0);
        expect(
          await getterFacet.getClaim(collateralToken, treasury.address)
        ).to.be.gt(0);

        // ---------
        // Act: Claim fees
        // ---------
        await claimFacet.claimFee(collateralToken, oracle.address);
        await claimFacet.claimFee(collateralToken, treasury.address);

        // ---------
        // Assert: Fee claim goes down to zero
        // ---------
        expect(
          await getterFacet.getClaim(collateralToken, oracle.address)
        ).to.eq(0);
        expect(
          await getterFacet.getClaim(collateralToken, treasury.address)
        ).to.eq(0);
      });

      it("Increases the data provider`s and treasury`s collateral token balance after claiming fees", async () => {
        // ---------
        // Arrange: Confirm that data provider's and treasury's fee claims are positive and collateral token balances are zero
        // ---------
        feeClaimDataProvider = await getterFacet.getClaim(
          collateralToken,
          oracle.address
        );
        feeClaimTreasury = await getterFacet.getClaim(
          collateralToken,
          treasury.address
        );
        expect(feeClaimDataProvider).to.be.gt(0);
        expect(feeClaimTreasury).to.be.gt(0);
        expect(await collateralTokenInstance.balanceOf(oracle.address)).to.eq(
          0
        );
        expect(await collateralTokenInstance.balanceOf(treasury.address)).to.eq(
          0
        );

        // ---------
        // Act: Claim fees
        // ---------
        await claimFacet.claimFee(collateralToken, oracle.address);
        await claimFacet.claimFee(collateralToken, treasury.address);

        // ---------
        // Assert: Check that data provider's and treasury's collateral token balance increased
        // ---------
        expect(await collateralTokenInstance.balanceOf(oracle.address)).to.eq(
          feeClaimDataProvider
        );
        expect(await collateralTokenInstance.balanceOf(treasury.address)).to.eq(
          feeClaimTreasury
        );
      });

      // -------------------------------------------
      // Events
      // -------------------------------------------

      it("Emits a FeeClaimed event", async () => {
        // ---------
        // Arrange: Confirm that data provider's fee claim is positive
        // ---------
        feeClaimDataProvider = await getterFacet.getClaim(
          collateralToken,
          oracle.address
        );
        expect(feeClaimDataProvider).to.be.gt(0);

        // ---------
        // Act: Claim fees
        // ---------
        const tx = await claimFacet.claimFee(collateralToken, oracle.address);
        const receipt = await tx.wait();

        // ---------
        // Assert: Check that it emits a FeeClaimed event
        // ---------
        const feeClaimedEvent = receipt.events?.find(
          (item) => item.event === "FeeClaimed"
        );
        expect(feeClaimedEvent?.args?.recipient).to.eq(oracle.address);
        expect(feeClaimedEvent?.args?.collateralToken).to.eq(collateralToken);
        expect(feeClaimedEvent?.args?.amount).to.eq(feeClaimDataProvider);
      });
    });

    describe("batchClaimFee", async () => {
      // -------------------------------------------
      // Functionality
      // -------------------------------------------

      it("Reduces the claimable amount after fees are claimed by the data provider and DIVA treasury", async () => {
        // ---------
        // Arrange: Confirm that data provider's and treasury's fee claim is positive
        // ---------
        expect(
          await getterFacet.getClaim(collateralToken, oracle.address)
        ).to.be.gt(0);
        expect(
          await getterFacet.getClaim(collateralToken, treasury.address)
        ).to.be.gt(0);

        // ---------
        // Act: Claim fees
        // ---------
        await claimFacet.batchClaimFee([
          {
            collateralToken: collateralToken,
            recipient: oracle.address,
          },
          {
            collateralToken: collateralToken,
            recipient: treasury.address,
          },
        ]);

        // ---------
        // Assert: Fee claim goes down to zero
        // ---------
        expect(
          await getterFacet.getClaim(collateralToken, oracle.address)
        ).to.eq(0);
        expect(
          await getterFacet.getClaim(collateralToken, treasury.address)
        ).to.eq(0);
      });

      it("Increases the data provider`s and treasury`s collateral token balance after claiming fees", async () => {
        // ---------
        // Arrange: Confirm that data provider's and treasury's fee claims are positive and collateral token balances are zero
        // ---------
        feeClaimDataProvider = await getterFacet.getClaim(
          collateralToken,
          oracle.address
        );
        feeClaimTreasury = await getterFacet.getClaim(
          collateralToken,
          treasury.address
        );
        expect(feeClaimDataProvider).to.be.gt(0);
        expect(feeClaimTreasury).to.be.gt(0);
        expect(await collateralTokenInstance.balanceOf(oracle.address)).to.eq(
          0
        );
        expect(await collateralTokenInstance.balanceOf(treasury.address)).to.eq(
          0
        );

        // ---------
        // Act: Claim fees
        // ---------
        await claimFacet.batchClaimFee([
          {
            collateralToken: collateralToken,
            recipient: oracle.address,
          },
          {
            collateralToken: collateralToken,
            recipient: treasury.address,
          },
        ]);

        // ---------
        // Assert: Check that data provider's and treasury's collateral token balance increased
        // ---------
        expect(await collateralTokenInstance.balanceOf(oracle.address)).to.eq(
          feeClaimDataProvider
        );
        expect(await collateralTokenInstance.balanceOf(treasury.address)).to.eq(
          feeClaimTreasury
        );
      });

      // -------------------------------------------
      // Events
      // -------------------------------------------

      it("Emits a FeeClaimed event", async () => {
        // ---------
        // Arrange: Confirm that data provider's and treasury's fee claims are positive
        // ---------
        feeClaimDataProvider = await getterFacet.getClaim(
          collateralToken,
          oracle.address
        );
        expect(feeClaimDataProvider).to.be.gt(0);
        feeClaimTreasury = await getterFacet.getClaim(
          collateralToken,
          treasury.address
        );
        expect(feeClaimTreasury).to.be.gt(0);

        // ---------
        // Act: Claim fees
        // ---------
        const tx = await claimFacet.batchClaimFee([
          {
            collateralToken: collateralToken,
            recipient: oracle.address,
          },
          {
            collateralToken: collateralToken,
            recipient: treasury.address,
          },
        ]);
        const receipt = await tx.wait();

        // ---------
        // Assert: Check that it emits two FeeClaimed events
        // ---------
        const feeClaimedEvents =
          receipt.events?.filter((item) => item.event === "FeeClaimed") || [];

        expect(feeClaimedEvents[0].args?.recipient).to.eq(oracle.address);
        expect(feeClaimedEvents[0].args?.collateralToken).to.eq(
          collateralToken
        );
        expect(feeClaimedEvents[0].args?.amount).to.eq(feeClaimDataProvider);

        expect(feeClaimedEvents[1].args?.recipient).to.eq(treasury.address);
        expect(feeClaimedEvents[1].args?.collateralToken).to.eq(
          collateralToken
        );
        expect(feeClaimedEvents[1].args?.amount).to.eq(feeClaimTreasury);
      });
    });

    describe("transferFeeClaim", async () => {
      // -------------------------------------------
      // Functionality
      // -------------------------------------------
      it("Reduces the sender`s and increases the recipient`s fee claim balance", async () => {
        // ---------
        // Arrange: Check that data provider's fee claim is positive and user2's balance is zero
        // ---------
        feeClaimDataProvider = await getterFacet.getClaim(
          collateralToken,
          oracle.address
        );
        expect(feeClaimDataProvider).to.be.gt(0);
        expect(
          await getterFacet.getClaim(collateralToken, user2.address)
        ).to.eq(0);

        // ---------
        // Act: Transfer fee claim to user2
        // ---------
        await claimFacet
          .connect(oracle)
          .transferFeeClaim(
            user2.address,
            collateralToken,
            feeClaimDataProvider
          );

        // ---------
        // Assert: Check that user2's fee claim balance is positive and data provider's balance is zero
        // ---------
        expect(
          await getterFacet.getClaim(collateralToken, oracle.address)
        ).to.eq(0);
        expect(
          await getterFacet.getClaim(collateralToken, user2.address)
        ).to.eq(feeClaimDataProvider);
      });

      it("Allows the new recipient to claim the fees", async () => {
        // ---------
        // Arrange: Transfer fee claim and confirm that user2's collateral token balance is zero before the claim
        // ---------
        feeClaimDataProvider = await getterFacet.getClaim(
          collateralToken,
          oracle.address
        );
        await claimFacet
          .connect(oracle)
          .transferFeeClaim(
            user2.address,
            collateralToken,
            feeClaimDataProvider
          );
        expect(
          await getterFacet.getClaim(collateralToken, user2.address)
        ).to.eq(feeClaimDataProvider);
        expect(await collateralTokenInstance.balanceOf(user2.address)).to.eq(0);

        // ---------
        // Act: New fee recipient (user2) claims fee
        // ---------
        await claimFacet
          .connect(user2)
          .claimFee(collateralToken, user2.address);

        // ---------
        // Assert: Check that user2's collateral token balance increased and fee claim reduced to zero
        // ---------
        expect(await collateralTokenInstance.balanceOf(user2.address)).to.eq(
          feeClaimDataProvider
        );
        expect(
          await getterFacet.getClaim(collateralToken, user2.address)
        ).to.eq(0);
      });

      it("Does not change the old and new fee recipient`s balance if a zero amount is transferred", async () => {
        // ---------
        // Arrange: Get fee claim amount before the transfer
        // ---------
        feeClaimDataProviderBefore = await getterFacet.getClaim(
          collateralToken,
          oracle.address
        );
        expect(feeClaimDataProviderBefore).to.be.gt(0);
        expect(
          await getterFacet.getClaim(collateralToken, user2.address)
        ).to.eq(0);

        // ---------
        // Act: Transfer zero fee claim amount
        // ---------
        await claimFacet
          .connect(oracle)
          .transferFeeClaim(user2.address, collateralToken, 0);

        // ---------
        // Assert: Check that the data provider's and user2's fee claim remain unchanged
        // ---------
        expect(
          await getterFacet.getClaim(collateralToken, oracle.address)
        ).to.eq(feeClaimDataProviderBefore);
        expect(
          await getterFacet.getClaim(collateralToken, user2.address)
        ).to.eq(0);
      });

      // -------------------------------------------
      // Reverts
      // -------------------------------------------

      it("Reverts if amount exceeds user`s fee claim", async () => {
        // ---------
        // Arrange: Get fee claim amount
        // ---------
        feeClaimDataProvider = await getterFacet.getClaim(
          collateralToken,
          oracle.address
        );

        // ---------
        // Act & Assert: Transfer amount that is larger than the claimable amount and confirm that it reverts
        // ---------
        await expect(
          claimFacet
            .connect(oracle)
            .transferFeeClaim(
              user2.address,
              collateralToken,
              feeClaimDataProvider.add(1)
            )
        ).to.be.revertedWith("AmountExceedsClaimableFee()");
      });

      it("Reverts if recipient is zero address ", async () => {
        // ---------
        // Act & Assert: Confirm that the call reverts if recipient is the zero address
        // ---------
        await expect(
          claimFacet
            .connect(oracle)
            .transferFeeClaim(ethers.constants.AddressZero, collateralToken, 1)
        ).to.be.revertedWith("RecipientIsZeroAddress()");
      });

      // -------------------------------------------
      // Events
      // -------------------------------------------

      it("Emits a FeeClaimTransferred event", async () => {
        // ---------
        // Act: Transfer fee claim
        // ---------
        feeClaimDataProvider = await getterFacet.getClaim(
          collateralToken,
          oracle.address
        );
        const tx = await claimFacet
          .connect(oracle)
          .transferFeeClaim(
            user2.address,
            collateralToken,
            feeClaimDataProvider
          );
        const receipt = await tx.wait();

        // ---------
        // Assert: Check that it emits a FeeClaimTransferred event
        // ---------
        const feeClaimTransferredEvent = receipt.events?.find(
          (item) => item.event === "FeeClaimTransferred"
        );
        expect(feeClaimTransferredEvent?.args?.from).to.eq(oracle.address);
        expect(feeClaimTransferredEvent?.args?.to).to.eq(user2.address);
        expect(feeClaimTransferredEvent?.args?.collateralToken).to.eq(
          collateralToken
        );
        expect(feeClaimTransferredEvent?.args?.amount).to.eq(
          feeClaimDataProvider
        );
      });
    });

    describe("batchTransferFeeClaim", async () => {
      let collateralTokenInstance2: MockERC20;
      let feeClaimDataProvider2: BigNumber;
      let collateralToken2: string;
      let feeClaimDataProviderBefore2: BigNumber;

      beforeEach(async () => {
        // ---------
        // Arrange: Create second expired pool and confirm final reference value so that fees are paid to the DIVA treasury and the data provider
        // ---------

        // Mint second ERC20 collateral token with `decimals` decimals and send it to user 1
        collateralTokenInstance2 = await erc20DeployFixture(
          "DummyCollateralToken2",
          "DCT2",
          parseUnits(user1StartCollateralTokenBalance.toString(), decimals),
          user1.address,
          decimals,
          "0"
        );

        // Set user1 allowances for Diamond contract
        await collateralTokenInstance2
          .connect(user1)
          .approve(
            diamondAddress,
            parseUnits(user1StartCollateralTokenBalance.toString(), decimals)
          );

        nextBlockTimestamp = (await getLastTimestamp()) + 1;
        await setNextTimestamp(ethers.provider, nextBlockTimestamp);

        // Create a set of position tokens with a very short time to expiration
        expiryTime = nextBlockTimestamp + 1;
        collateralToken2 = collateralTokenInstance2.address;

        const tx = await poolFacet.connect(user1).createContingentPool({
          referenceAsset,
          expiryTime, // 15 May 2025
          floor,
          inflection,
          cap,
          gradient,
          collateralAmount,
          collateralToken: collateralToken2, // another collateral token
          dataProvider,
          capacity,
          longRecipient,
          shortRecipient,
          permissionedERC721Token,
        });
        const receipt = await tx.wait();
        poolId = receipt.events?.find((x: any) => x.event === "PoolIssued")
          ?.args?.poolId;

        // Confirm final reference value
        await settlementFacet
          .connect(oracle)
          .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge);
      });

      // -------------------------------------------
      // Functionality
      // -------------------------------------------
      it("Reduces the sender`s and increases the recipient`s fee claim balance", async () => {
        // ---------
        // Arrange: Check that data provider's fee claims are positive and user2's balances are zero
        // ---------
        feeClaimDataProvider = await getterFacet.getClaim(
          collateralToken,
          oracle.address
        );
        expect(feeClaimDataProvider).to.be.gt(0);
        expect(
          await getterFacet.getClaim(collateralToken, user2.address)
        ).to.eq(0);

        feeClaimDataProvider2 = await getterFacet.getClaim(
          collateralToken2,
          oracle.address
        );
        expect(feeClaimDataProvider2).to.be.gt(0);
        expect(
          await getterFacet.getClaim(collateralToken2, user2.address)
        ).to.eq(0);

        // ---------
        // Act: Transfer both fee claims to user2
        // ---------
        await claimFacet.connect(oracle).batchTransferFeeClaim([
          {
            collateralToken: collateralToken,
            recipient: user2.address,
            amount: feeClaimDataProvider,
          },
          {
            collateralToken: collateralToken2,
            recipient: user2.address,
            amount: feeClaimDataProvider2,
          },
        ]);

        // ---------
        // Assert: Check that user2's fee claim balances are positive and data provider's balances are zero
        // ---------
        expect(
          await getterFacet.getClaim(collateralToken, oracle.address)
        ).to.eq(0);
        expect(
          await getterFacet.getClaim(collateralToken, user2.address)
        ).to.eq(feeClaimDataProvider);
        expect(
          await getterFacet.getClaim(collateralToken2, oracle.address)
        ).to.eq(0);
        expect(
          await getterFacet.getClaim(collateralToken2, user2.address)
        ).to.eq(feeClaimDataProvider2);
      });

      it("Allows the new recipient to claim the fees", async () => {
        // ---------
        // Arrange: Transfer fee claim and confirm that user2's collateral token balances are zero before the claim
        // ---------
        feeClaimDataProvider = await getterFacet.getClaim(
          collateralToken,
          oracle.address
        );
        feeClaimDataProvider2 = await getterFacet.getClaim(
          collateralToken2,
          oracle.address
        );
        await claimFacet.connect(oracle).batchTransferFeeClaim([
          {
            recipient: user2.address,
            collateralToken: collateralToken,
            amount: feeClaimDataProvider,
          },
          {
            recipient: user2.address,
            collateralToken: collateralToken2,
            amount: feeClaimDataProvider2,
          },
        ]);
        expect(
          await getterFacet.getClaim(collateralToken, user2.address)
        ).to.eq(feeClaimDataProvider);
        expect(await collateralTokenInstance.balanceOf(user2.address)).to.eq(0);
        expect(
          await getterFacet.getClaim(collateralToken2, user2.address)
        ).to.eq(feeClaimDataProvider2);
        expect(await collateralTokenInstance2.balanceOf(user2.address)).to.eq(
          0
        );

        // ---------
        // Act: New fee recipient (user2) claims fee
        // ---------
        await claimFacet.batchClaimFee([
          {
            collateralToken: collateralToken,
            recipient: user2.address,
          },
          {
            collateralToken: collateralToken2,
            recipient: user2.address,
          },
        ]);

        // ---------
        // Assert: Check that user2's collateral token balances increased and fee claims reduced to zero
        // ---------
        expect(await collateralTokenInstance.balanceOf(user2.address)).to.eq(
          feeClaimDataProvider
        );
        expect(
          await getterFacet.getClaim(collateralToken, user2.address)
        ).to.eq(0);
        expect(await collateralTokenInstance2.balanceOf(user2.address)).to.eq(
          feeClaimDataProvider2
        );
        expect(
          await getterFacet.getClaim(collateralToken2, user2.address)
        ).to.eq(0);
      });

      it("Does not change the old and new fee recipient`s balance if a zero amount is transferred", async () => {
        // ---------
        // Arrange: Get fee claim amounts before the transfer
        // ---------
        feeClaimDataProviderBefore = await getterFacet.getClaim(
          collateralToken,
          oracle.address
        );
        expect(feeClaimDataProviderBefore).to.be.gt(0);
        expect(
          await getterFacet.getClaim(collateralToken, user2.address)
        ).to.eq(0);
        feeClaimDataProviderBefore2 = await getterFacet.getClaim(
          collateralToken2,
          oracle.address
        );
        expect(feeClaimDataProviderBefore2).to.be.gt(0);
        expect(
          await getterFacet.getClaim(collateralToken2, user2.address)
        ).to.eq(0);

        // ---------
        // Act: Transfer zero fee claim amount
        // ---------
        await claimFacet.connect(oracle).batchTransferFeeClaim([
          {
            recipient: user2.address,
            collateralToken: collateralToken,
            amount: 0,
          },
          {
            recipient: user2.address,
            collateralToken: collateralToken2,
            amount: 0,
          },
        ]);

        // ---------
        // Assert: Check that the data provider's and user2's fee claims remain unchanged
        // ---------
        expect(
          await getterFacet.getClaim(collateralToken, oracle.address)
        ).to.eq(feeClaimDataProviderBefore);
        expect(
          await getterFacet.getClaim(collateralToken, user2.address)
        ).to.eq(0);
        expect(
          await getterFacet.getClaim(collateralToken2, oracle.address)
        ).to.eq(feeClaimDataProviderBefore2);
        expect(
          await getterFacet.getClaim(collateralToken2, user2.address)
        ).to.eq(0);
      });

      // -------------------------------------------
      // Reverts
      // -------------------------------------------

      it("Reverts if one of the amounts exceeds user`s fee claim", async () => {
        // ---------
        // Arrange: Get fee claim amount
        // ---------
        feeClaimDataProvider = await getterFacet.getClaim(
          collateralToken,
          oracle.address
        );

        // ---------
        // Act & Assert: Transfer amount that is larger than the claimable amount and confirm that it reverts
        // ---------
        await expect(
          claimFacet.connect(oracle).batchTransferFeeClaim([
            {
              recipient: user2.address,
              collateralToken: collateralToken,
              amount: feeClaimDataProvider.add(1),
            },
            {
              recipient: user2.address,
              collateralToken: collateralToken2,
              amount: 0,
            },
          ])
        ).to.be.revertedWith("AmountExceedsClaimableFee()");
      });

      it("Reverts if one of the recipients is zero address ", async () => {
        // ---------
        // Act & Assert: Confirm that the call reverts if recipient is the zero address
        // ---------
        await expect(
          claimFacet.connect(oracle).batchTransferFeeClaim([
            {
              recipient: user2.address,
              collateralToken: collateralToken,
              amount: 1,
            },
            {
              recipient: ethers.constants.AddressZero,
              collateralToken: collateralToken2,
              amount: 0,
            },
          ])
        ).to.be.revertedWith("RecipientIsZeroAddress()");
      });

      // -------------------------------------------
      // Events
      // -------------------------------------------

      it("Emits a FeeClaimTransferred event", async () => {
        // ---------
        // Act: Transfer fee claims
        // ---------
        feeClaimDataProvider = await getterFacet.getClaim(
          collateralToken,
          oracle.address
        );
        feeClaimDataProvider2 = await getterFacet.getClaim(
          collateralToken2,
          oracle.address
        );
        const tx = await claimFacet.connect(oracle).batchTransferFeeClaim([
          {
            recipient: user2.address,
            collateralToken: collateralToken,
            amount: feeClaimDataProvider,
          },
          {
            recipient: user2.address,
            collateralToken: collateralToken2,
            amount: feeClaimDataProvider2,
          },
        ]);
        const receipt = await tx.wait();

        // ---------
        // Assert: Check that it emits two FeeClaimTransferred events
        // ---------
        const feeClaimTransferredEvents =
          receipt.events?.filter(
            (item) => item.event === "FeeClaimTransferred"
          ) || [];

        expect(feeClaimTransferredEvents[0].args?.from).to.eq(oracle.address);
        expect(feeClaimTransferredEvents[0].args?.to).to.eq(user2.address);
        expect(feeClaimTransferredEvents[0].args?.collateralToken).to.eq(
          collateralToken
        );
        expect(feeClaimTransferredEvents[0].args?.amount).to.eq(
          feeClaimDataProvider
        );

        expect(feeClaimTransferredEvents[1].args?.from).to.eq(oracle.address);
        expect(feeClaimTransferredEvents[1].args?.to).to.eq(user2.address);
        expect(feeClaimTransferredEvents[1].args?.collateralToken).to.eq(
          collateralToken2
        );
        expect(feeClaimTransferredEvents[1].args?.amount).to.eq(
          feeClaimDataProvider2
        );
      });
    });
  });
});
