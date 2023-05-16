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
import { LibDIVAStorage } from "../typechain-types/contracts/facets/GetterFacet";

import { deployMain } from "../scripts/deployMain";
import {
  setNextTimestamp,
  createContingentPool,
  decimals,
  defaultPoolParameters,
  CreateContingentPoolParams
} from "../utils";

import { erc20DeployFixture } from "./fixtures";

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
  
  let poolParams: LibDIVAStorage.PoolStructOutput;
  let poolParams2: LibDIVAStorage.PoolStructOutput;

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
    let poolId2: string;
    let nextBlockTimestamp: number;
    let feeClaimDataProvider: BigNumber;
    let feeClaimDataProviderBefore: BigNumber;

    let finalReferenceValue: BigNumber;
    let allowChallenge: boolean;
    let createContingentPoolParams: CreateContingentPoolParams;

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
      const receipt = await tx.wait();
      poolId = receipt.events?.find((x: any) => x.event === "PoolIssued")?.args
        ?.poolId;

      // Fast forward in time post pool expiration
      poolParams = await getterFacet.getPoolParameters(poolId);
      nextBlockTimestamp = Number(poolParams.expiryTime) + 10
      await setNextTimestamp(ethers.provider, nextBlockTimestamp);

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
          await getterFacet.getClaim(poolParams.collateralToken, oracle.address)
        ).to.be.gt(0);
        expect(
          await getterFacet.getClaim(poolParams.collateralToken, treasury.address)
        ).to.be.gt(0);

        // ---------
        // Act: Claim fees
        // ---------
        await claimFacet.claimFee(poolParams.collateralToken, oracle.address);
        await claimFacet.claimFee(poolParams.collateralToken, treasury.address);

        // ---------
        // Assert: Fee claim goes down to zero
        // ---------
        expect(
          await getterFacet.getClaim(poolParams.collateralToken, oracle.address)
        ).to.eq(0);
        expect(
          await getterFacet.getClaim(poolParams.collateralToken, treasury.address)
        ).to.eq(0);
      });

      it("Increases the data provider`s and treasury`s collateral token balance after claiming fees", async () => {
        // ---------
        // Arrange: Confirm that data provider's and treasury's fee claims are positive and collateral token balances are zero
        // ---------
        feeClaimDataProvider = await getterFacet.getClaim(
          poolParams.collateralToken,
          oracle.address
        );
        feeClaimTreasury = await getterFacet.getClaim(
          poolParams.collateralToken,
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
        await claimFacet.claimFee(poolParams.collateralToken, oracle.address);
        await claimFacet.claimFee(poolParams.collateralToken, treasury.address);

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
          poolParams.collateralToken,
          oracle.address
        );
        expect(feeClaimDataProvider).to.be.gt(0);

        // ---------
        // Act: Claim fees
        // ---------
        const tx = await claimFacet.claimFee(poolParams.collateralToken, oracle.address);
        const receipt = await tx.wait();

        // ---------
        // Assert: Check that it emits a FeeClaimed event
        // ---------
        const feeClaimedEvent = receipt.events?.find(
          (item) => item.event === "FeeClaimed"
        );
        expect(feeClaimedEvent?.args?.recipient).to.eq(oracle.address);
        expect(feeClaimedEvent?.args?.collateralToken).to.eq(poolParams.collateralToken);
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
          await getterFacet.getClaim(poolParams.collateralToken, oracle.address)
        ).to.be.gt(0);
        expect(
          await getterFacet.getClaim(poolParams.collateralToken, treasury.address)
        ).to.be.gt(0);

        // ---------
        // Act: Claim fees
        // ---------
        await claimFacet.batchClaimFee([
          {
            collateralToken: poolParams.collateralToken,
            recipient: oracle.address,
          },
          {
            collateralToken: poolParams.collateralToken,
            recipient: treasury.address,
          },
        ]);

        // ---------
        // Assert: Fee claim goes down to zero
        // ---------
        expect(
          await getterFacet.getClaim(poolParams.collateralToken, oracle.address)
        ).to.eq(0);
        expect(
          await getterFacet.getClaim(poolParams.collateralToken, treasury.address)
        ).to.eq(0);
      });

      it("Increases the data provider`s and treasury`s collateral token balance after claiming fees", async () => {
        // ---------
        // Arrange: Confirm that data provider's and treasury's fee claims are positive and collateral token balances are zero
        // ---------
        feeClaimDataProvider = await getterFacet.getClaim(
          poolParams.collateralToken,
          oracle.address
        );
        feeClaimTreasury = await getterFacet.getClaim(
          poolParams.collateralToken,
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
            collateralToken: poolParams.collateralToken,
            recipient: oracle.address,
          },
          {
            collateralToken: poolParams.collateralToken,
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
          poolParams.collateralToken,
          oracle.address
        );
        expect(feeClaimDataProvider).to.be.gt(0);
        feeClaimTreasury = await getterFacet.getClaim(
          poolParams.collateralToken,
          treasury.address
        );
        expect(feeClaimTreasury).to.be.gt(0);

        // ---------
        // Act: Claim fees
        // ---------
        const tx = await claimFacet.batchClaimFee([
          {
            collateralToken: poolParams.collateralToken,
            recipient: oracle.address,
          },
          {
            collateralToken: poolParams.collateralToken,
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
          poolParams.collateralToken
        );
        expect(feeClaimedEvents[0].args?.amount).to.eq(feeClaimDataProvider);

        expect(feeClaimedEvents[1].args?.recipient).to.eq(treasury.address);
        expect(feeClaimedEvents[1].args?.collateralToken).to.eq(
          poolParams.collateralToken
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
          poolParams.collateralToken,
          oracle.address
        );
        expect(feeClaimDataProvider).to.be.gt(0);
        expect(
          await getterFacet.getClaim(poolParams.collateralToken, user2.address)
        ).to.eq(0);

        // ---------
        // Act: Transfer fee claim to user2
        // ---------
        await claimFacet
          .connect(oracle)
          .transferFeeClaim(
            user2.address,
            poolParams.collateralToken,
            feeClaimDataProvider
          );

        // ---------
        // Assert: Check that user2's fee claim balance is positive and data provider's balance is zero
        // ---------
        expect(
          await getterFacet.getClaim(poolParams.collateralToken, oracle.address)
        ).to.eq(0);
        expect(
          await getterFacet.getClaim(poolParams.collateralToken, user2.address)
        ).to.eq(feeClaimDataProvider);
      });

      it("Allows the new recipient to claim the fees", async () => {
        // ---------
        // Arrange: Transfer fee claim and confirm that user2's collateral token balance is zero before the claim
        // ---------
        feeClaimDataProvider = await getterFacet.getClaim(
          poolParams.collateralToken,
          oracle.address
        );
        await claimFacet
          .connect(oracle)
          .transferFeeClaim(
            user2.address,
            poolParams.collateralToken,
            feeClaimDataProvider
          );
        expect(
          await getterFacet.getClaim(poolParams.collateralToken, user2.address)
        ).to.eq(feeClaimDataProvider);
        expect(await collateralTokenInstance.balanceOf(user2.address)).to.eq(0);

        // ---------
        // Act: New fee recipient (user2) claims fee
        // ---------
        await claimFacet
          .connect(user2)
          .claimFee(poolParams.collateralToken, user2.address);

        // ---------
        // Assert: Check that user2's collateral token balance increased and fee claim reduced to zero
        // ---------
        expect(await collateralTokenInstance.balanceOf(user2.address)).to.eq(
          feeClaimDataProvider
        );
        expect(
          await getterFacet.getClaim(poolParams.collateralToken, user2.address)
        ).to.eq(0);
      });

      it("Does not change the old and new fee recipient`s balance if a zero amount is transferred", async () => {
        // ---------
        // Arrange: Get fee claim amount before the transfer
        // ---------
        feeClaimDataProviderBefore = await getterFacet.getClaim(
          poolParams.collateralToken,
          oracle.address
        );
        expect(feeClaimDataProviderBefore).to.be.gt(0);
        expect(
          await getterFacet.getClaim(poolParams.collateralToken, user2.address)
        ).to.eq(0);

        // ---------
        // Act: Transfer zero fee claim amount
        // ---------
        await claimFacet
          .connect(oracle)
          .transferFeeClaim(user2.address, poolParams.collateralToken, 0);

        // ---------
        // Assert: Check that the data provider's and user2's fee claim remain unchanged
        // ---------
        expect(
          await getterFacet.getClaim(poolParams.collateralToken, oracle.address)
        ).to.eq(feeClaimDataProviderBefore);
        expect(
          await getterFacet.getClaim(poolParams.collateralToken, user2.address)
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
          poolParams.collateralToken,
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
              poolParams.collateralToken,
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
            .transferFeeClaim(ethers.constants.AddressZero, poolParams.collateralToken, 1)
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
          poolParams.collateralToken,
          oracle.address
        );
        const tx = await claimFacet
          .connect(oracle)
          .transferFeeClaim(
            user2.address,
            poolParams.collateralToken,
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
          poolParams.collateralToken
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

        // Get collateralToken2 address
        collateralToken2 = collateralTokenInstance2.address;

        const tx = await createContingentPool({
          ...createContingentPoolParams,
          collateralToken: collateralToken2
        });
        const receipt = await tx.wait();
        poolId2 = receipt.events?.find((x: any) => x.event === "PoolIssued")
          ?.args?.poolId;

        // Fast forward in time post pool expiration
        poolParams2 = await getterFacet.getPoolParameters(poolId2);
        nextBlockTimestamp = Number(poolParams2.expiryTime) + 1
        await setNextTimestamp(ethers.provider, nextBlockTimestamp);

        // Confirm final reference value
        await settlementFacet
          .connect(oracle)
          .setFinalReferenceValue(poolId2, finalReferenceValue, allowChallenge);
      });

      // -------------------------------------------
      // Functionality
      // -------------------------------------------
      it("Reduces the sender`s and increases the recipient`s fee claim balance", async () => {
        // ---------
        // Arrange: Check that data provider's fee claims are positive and user2's balances are zero
        // ---------
        feeClaimDataProvider = await getterFacet.getClaim(
          poolParams.collateralToken,
          oracle.address
        );
        expect(feeClaimDataProvider).to.be.gt(0);
        expect(
          await getterFacet.getClaim(poolParams.collateralToken, user2.address)
        ).to.eq(0);

        feeClaimDataProvider2 = await getterFacet.getClaim(
          poolParams2.collateralToken,
          oracle.address
        );
        expect(feeClaimDataProvider2).to.be.gt(0);
        expect(
          await getterFacet.getClaim(poolParams2.collateralToken, user2.address)
        ).to.eq(0);

        // ---------
        // Act: Transfer both fee claims to user2
        // ---------
        await claimFacet.connect(oracle).batchTransferFeeClaim([
          {
            collateralToken: poolParams.collateralToken,
            recipient: user2.address,
            amount: feeClaimDataProvider,
          },
          {
            collateralToken: poolParams2.collateralToken,
            recipient: user2.address,
            amount: feeClaimDataProvider2,
          },
        ]);

        // ---------
        // Assert: Check that user2's fee claim balances are positive and data provider's balances are zero
        // ---------
        expect(
          await getterFacet.getClaim(poolParams.collateralToken, oracle.address)
        ).to.eq(0);
        expect(
          await getterFacet.getClaim(poolParams.collateralToken, user2.address)
        ).to.eq(feeClaimDataProvider);
        expect(
          await getterFacet.getClaim(poolParams2.collateralToken, oracle.address)
        ).to.eq(0);
        expect(
          await getterFacet.getClaim(poolParams2.collateralToken, user2.address)
        ).to.eq(feeClaimDataProvider2);
      });

      it("Allows the new recipient to claim the fees", async () => {
        // ---------
        // Arrange: Transfer fee claim and confirm that user2's collateral token balances are zero before the claim
        // ---------
        feeClaimDataProvider = await getterFacet.getClaim(
          poolParams.collateralToken,
          oracle.address
        );
        feeClaimDataProvider2 = await getterFacet.getClaim(
          poolParams2.collateralToken,
          oracle.address
        );
        await claimFacet.connect(oracle).batchTransferFeeClaim([
          {
            recipient: user2.address,
            collateralToken: poolParams.collateralToken,
            amount: feeClaimDataProvider,
          },
          {
            recipient: user2.address,
            collateralToken: poolParams2.collateralToken,
            amount: feeClaimDataProvider2,
          },
        ]);
        expect(
          await getterFacet.getClaim(poolParams.collateralToken, user2.address)
        ).to.eq(feeClaimDataProvider);
        expect(await collateralTokenInstance.balanceOf(user2.address)).to.eq(0);
        expect(
          await getterFacet.getClaim(poolParams2.collateralToken, user2.address)
        ).to.eq(feeClaimDataProvider2);
        expect(await collateralTokenInstance2.balanceOf(user2.address)).to.eq(
          0
        );

        // ---------
        // Act: New fee recipient (user2) claims fee
        // ---------
        await claimFacet.batchClaimFee([
          {
            collateralToken: poolParams.collateralToken,
            recipient: user2.address,
          },
          {
            collateralToken: poolParams2.collateralToken,
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
          await getterFacet.getClaim(poolParams.collateralToken, user2.address)
        ).to.eq(0);
        expect(await collateralTokenInstance2.balanceOf(user2.address)).to.eq(
          feeClaimDataProvider2
        );
        expect(
          await getterFacet.getClaim(poolParams2.collateralToken, user2.address)
        ).to.eq(0);
      });

      it("Does not change the old and new fee recipient`s balance if a zero amount is transferred", async () => {
        // ---------
        // Arrange: Get fee claim amounts before the transfer
        // ---------
        feeClaimDataProviderBefore = await getterFacet.getClaim(
          poolParams.collateralToken,
          oracle.address
        );
        expect(feeClaimDataProviderBefore).to.be.gt(0);
        expect(
          await getterFacet.getClaim(poolParams.collateralToken, user2.address)
        ).to.eq(0);
        feeClaimDataProviderBefore2 = await getterFacet.getClaim(
          poolParams2.collateralToken,
          oracle.address
        );
        expect(feeClaimDataProviderBefore2).to.be.gt(0);
        expect(
          await getterFacet.getClaim(poolParams2.collateralToken, user2.address)
        ).to.eq(0);

        // ---------
        // Act: Transfer zero fee claim amount
        // ---------
        await claimFacet.connect(oracle).batchTransferFeeClaim([
          {
            recipient: user2.address,
            collateralToken: poolParams.collateralToken,
            amount: 0,
          },
          {
            recipient: user2.address,
            collateralToken: poolParams2.collateralToken,
            amount: 0,
          },
        ]);

        // ---------
        // Assert: Check that the data provider's and user2's fee claims remain unchanged
        // ---------
        expect(
          await getterFacet.getClaim(poolParams.collateralToken, oracle.address)
        ).to.eq(feeClaimDataProviderBefore);
        expect(
          await getterFacet.getClaim(poolParams.collateralToken, user2.address)
        ).to.eq(0);
        expect(
          await getterFacet.getClaim(poolParams2.collateralToken, oracle.address)
        ).to.eq(feeClaimDataProviderBefore2);
        expect(
          await getterFacet.getClaim(poolParams2.collateralToken, user2.address)
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
          poolParams.collateralToken,
          oracle.address
        );

        // ---------
        // Act & Assert: Transfer amount that is larger than the claimable amount and confirm that it reverts
        // ---------
        await expect(
          claimFacet.connect(oracle).batchTransferFeeClaim([
            {
              recipient: user2.address,
              collateralToken: poolParams.collateralToken,
              amount: feeClaimDataProvider.add(1),
            },
            {
              recipient: user2.address,
              collateralToken: poolParams2.collateralToken,
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
              collateralToken: poolParams.collateralToken,
              amount: 1,
            },
            {
              recipient: ethers.constants.AddressZero,
              collateralToken: poolParams2.collateralToken,
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
          poolParams.collateralToken,
          oracle.address
        );
        feeClaimDataProvider2 = await getterFacet.getClaim(
          poolParams2.collateralToken,
          oracle.address
        );
        const tx = await claimFacet.connect(oracle).batchTransferFeeClaim([
          {
            recipient: user2.address,
            collateralToken: poolParams.collateralToken,
            amount: feeClaimDataProvider,
          },
          {
            recipient: user2.address,
            collateralToken: poolParams2.collateralToken,
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
          poolParams.collateralToken
        );
        expect(feeClaimTransferredEvents[0].args?.amount).to.eq(
          feeClaimDataProvider
        );

        expect(feeClaimTransferredEvents[1].args?.from).to.eq(oracle.address);
        expect(feeClaimTransferredEvents[1].args?.to).to.eq(user2.address);
        expect(feeClaimTransferredEvents[1].args?.collateralToken).to.eq(
          poolParams2.collateralToken
        );
        expect(feeClaimTransferredEvents[1].args?.amount).to.eq(
          feeClaimDataProvider2
        );
      });
    });
  });
});
