import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, ContractReceipt, ContractTransaction } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
  DIVADevelopmentFund,
  GetterFacet,
  DIVAToken,
  MockERC20,
} from "../typechain-types";

import { getLastTimestamp, setNextTimestamp } from "../utils";

import { divaTokenDeployFixture, erc20DeployFixture } from "./fixtures";
import { deployMain } from "../scripts/deployMain";
import { Deposit, ONE_HOUR } from "../constants";

describe("DIVADevelopmentFund", async function () {
  let contractOwner: SignerWithAddress, user1: SignerWithAddress;

  let diamondAddress: string;
  let getterFacet: GetterFacet;

  let ownershipContractAddress: string;
  let divaDevelopmentFund: DIVADevelopmentFund;
  let depositTokenInstance: DIVAToken;
  let depositTokenWithFeesInstance: MockERC20;

  let user1EthBalance: BigNumber;
  let user1DepositTokenBalance: BigNumber;
  let divaDevelopmentFundEthBalanceBefore: BigNumber;
  let divaDevelopmentFundDepositTokenBalanceBefore: BigNumber;
  let unclaimedDepositAmountBefore: BigNumber;

  let depositAmount: BigNumber;
  let lastBlockTimestamp: number;

  before(async function () {
    // Get signers
    [contractOwner, user1] = await ethers.getSigners();

    // ---------
    // Setup: Deploy diamond contract (incl. facets) and connect to the diamond contract via facet specific ABI's
    // ---------
    diamondAddress = (await deployMain())[0];
    getterFacet = await ethers.getContractAt("GetterFacet", diamondAddress);

    // Get the ownership contract address that DIVA is connected to
    ownershipContractAddress = await getterFacet.getOwnershipContract();

    const divaDevelopmentFundFactory = await ethers.getContractFactory(
      "DIVADevelopmentFund"
    );
    divaDevelopmentFund = await divaDevelopmentFundFactory.deploy(
      ownershipContractAddress
    );

    // Deploy DIVA Token for deposit
    depositTokenInstance = await divaTokenDeployFixture(
      "DummyDepositToken",
      "DDT",
      parseUnits("10000", 18),
      user1.address
    );

    // Deploy deposit token that implements fees on transfers
    depositTokenWithFeesInstance = await erc20DeployFixture(
      "DummyDepositTokenWithFees",
      "DDTWF",
      parseUnits("10000", 18),
      user1.address,
      18, // decimals
      "100", // 1% = 100, 0.1% = 1000
    );
  });

  describe("Initialization", async () => {
    it("Should initialize parameters at contract deployment", async () => {
      // -------------------------------------------
      // Act: Deploy DIVADevelopmentFund contract
      // -------------------------------------------
      const divaDevelopmentFundFactory = await ethers.getContractFactory(
        "DIVADevelopmentFund"
      );
      divaDevelopmentFund = await divaDevelopmentFundFactory.deploy(
        ownershipContractAddress
      );

      // -------------------------------------------
      // Assert: Confirm that initial values are as expected
      // -------------------------------------------
      expect(await divaDevelopmentFund.getDivaOwnership()).to.eq(
        ownershipContractAddress
      );
      expect(await divaDevelopmentFund.getDepositsLength()).to.eq(0);
    });
  });

  describe("deposit", async () => {
    let depositsLengthBefore: BigNumber;
    let user1DepositTokenBalanceBefore: BigNumber;
    let expectedDepositIndex: BigNumber;
    let releasePeriodInSeconds: number;

    before(async function () {
      // Set release period
      releasePeriodInSeconds = ONE_HOUR; // 1 hour
    });

    // -------------------------------------------
    // Functionality
    // -------------------------------------------

    it("Should allow to deposit the native asset (ETH) to DIVADevelopmentFund contract via the `deposit` function", async function () {
      // ---------
      // Arrange: Prepare and get relevant values before deposit
      // ---------
      // Get ETH balance for user and DIVADevelopmentFund contract before deposit
      divaDevelopmentFundEthBalanceBefore = await ethers.provider.getBalance(
        divaDevelopmentFund.address
      );
      const user1EthBalanceBefore = await user1.getBalance();
      expect(user1EthBalanceBefore).to.gt(0);

      // Set ETH amount to deposit
      depositAmount = user1EthBalanceBefore.div(10);

      // Get unclaimedDepositAmount before deposit
      unclaimedDepositAmountBefore =
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          ethers.constants.AddressZero
        );

      // Calc expected deposit index (length of deposits before deposit)
      expectedDepositIndex = await divaDevelopmentFund.getDepositsLength();

      // Get indices length for native asset before deposit
      const indicesLengthBefore =
        await divaDevelopmentFund.getDepositIndicesLengthForToken(
          ethers.constants.AddressZero
        );

      // ---------
      // Act: User1 deposits ETH to DIVADevelopmentFund contract via the `deposit` function
      // ---------
      const tx = await divaDevelopmentFund
        .connect(user1)
        ["deposit(uint256)"](releasePeriodInSeconds, {
          value: depositAmount,
        });
      const receipt = await tx.wait();

      // ---------
      // Assert: Confirm that the native asset is deposited successfully
      // ---------
      // Calc gas price used during deposit
      const gasPriceUsed = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      // Confirm that ETH balance of user1 has been reduced
      expect(await user1.getBalance()).to.eq(
        user1EthBalanceBefore.sub(depositAmount).sub(gasPriceUsed)
      );

      // Confirm that ETH balance of DIVADevelopmentFund contract has been increased
      expect(
        await ethers.provider.getBalance(divaDevelopmentFund.address)
      ).to.eq(divaDevelopmentFundEthBalanceBefore.add(depositAmount));

      // Get last block timestamp and deposit index
      lastBlockTimestamp = await getLastTimestamp();
      const depositIndex = receipt.events?.find(
        (x: any) => x.event === "Deposited"
      )?.args?.depositIndex;
      expect(depositIndex).to.eq(expectedDepositIndex);

      // Confirm that indices for native asset are updated correctly
      const indicesLengthAfter =
        await divaDevelopmentFund.getDepositIndicesLengthForToken(
          ethers.constants.AddressZero
        );
      expect(indicesLengthBefore).to.eq(indicesLengthAfter.sub(1));
      const indices = await divaDevelopmentFund.getDepositIndices(
        ethers.constants.AddressZero,
        indicesLengthBefore,
        indicesLengthAfter
      );
      expect(indices[0]).to.eq(depositIndex);

      // Get deposit info from DIVADevelopmentFund contract
      const deposit = await divaDevelopmentFund.getDepositInfo(depositIndex);

      // Confirm that deposit info has been added correctly
      expect(deposit.token).to.eq(ethers.constants.AddressZero);
      expect(deposit.amount).to.eq(depositAmount);
      expect(deposit.startTime).to.eq(lastBlockTimestamp);
      expect(deposit.endTime).to.eq(
        lastBlockTimestamp + releasePeriodInSeconds
      );
      expect(deposit.lastClaimedAt).to.eq(lastBlockTimestamp);

      // Confirm that unclaimedDepositAmount has been increased
      expect(
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          ethers.constants.AddressZero
        )
      ).to.eq(unclaimedDepositAmountBefore.add(depositAmount));
    });

    it("Should allow to deposit the native asset (ETH) to DIVADevelopmentFund contract via direct send", async function () {
      // ---------
      // Arrange: Prepare and get relevant values before deposit
      // ---------
      // Get ETH balance for user and DIVADevelopmentFund contract before deposit
      divaDevelopmentFundEthBalanceBefore = await ethers.provider.getBalance(
        divaDevelopmentFund.address
      );
      const user1EthBalanceBefore = await user1.getBalance();
      expect(user1EthBalanceBefore).to.gt(0);

      // Set ETH amount to deposit
      depositAmount = user1EthBalanceBefore.div(10);

      // Get unclaimedDepositAmount before deposit
      unclaimedDepositAmountBefore =
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          ethers.constants.AddressZero
        );

      // Get depositsLength before deposit
      depositsLengthBefore = await divaDevelopmentFund.getDepositsLength();

      // ---------
      // Act: User1 deposits ETH to DIVADevelopmentFund contract directly
      // ---------
      const tx = await user1.sendTransaction({
        value: depositAmount,
        to: divaDevelopmentFund.address,
      });
      const receipt = await tx.wait();

      // ---------
      // Assert: Confirm that the native asset is deposited successfully
      // ---------
      // Calc gas price used during deposit
      const gasPriceUsed = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      // Confirm that ETH balance of user1 has been reduced
      expect(await user1.getBalance()).to.eq(
        user1EthBalanceBefore.sub(depositAmount).sub(gasPriceUsed)
      );

      // Confirm that ETH balance of DIVADevelopmentFund contract has been increased
      expect(
        await ethers.provider.getBalance(divaDevelopmentFund.address)
      ).to.eq(divaDevelopmentFundEthBalanceBefore.add(depositAmount));

      // Confirm that length of deposits hasn't been changed
      expect(await divaDevelopmentFund.getDepositsLength()).to.eq(
        depositsLengthBefore
      );

      // Confirm that unclaimedDepositAmount hasn't been changed
      expect(
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          ethers.constants.AddressZero
        )
      ).to.eq(unclaimedDepositAmountBefore);
    });

    it("Should allow anyone to deposit an ERC20 token to DIVADevelopmentFund contract via the `deposit` function", async function () {
      // ---------
      // Arrange: Prepare and get relevant values before deposit
      // ---------
      // Get deposit token balance for user and DIVADevelopmentFund before deposit
      divaDevelopmentFundDepositTokenBalanceBefore =
        await depositTokenInstance.balanceOf(divaDevelopmentFund.address);
      user1DepositTokenBalanceBefore = await depositTokenInstance.balanceOf(
        user1.address
      );
      expect(user1DepositTokenBalanceBefore).to.gt(0);

      // Set token amount to deposit
      depositAmount = user1DepositTokenBalanceBefore.div(10);

      // Approve deposit token to DIVADevelopmentFund contract for user1
      await depositTokenInstance
        .connect(user1)
        .approve(divaDevelopmentFund.address, depositAmount);

      // Get unclaimedDepositAmount before deposit
      unclaimedDepositAmountBefore =
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          depositTokenInstance.address
        );

      // ---------
      // Act: User1 deposit token to DIVADevelopmentFund contract
      // ---------
      const tx = await divaDevelopmentFund
        .connect(user1)
        ["deposit(address,uint256,uint256)"](
          depositTokenInstance.address,
          depositAmount,
          releasePeriodInSeconds
        );
      const receipt = await tx.wait();

      // ---------
      // Assert: Confirm that token is deposited successfully
      // ---------
      // Confirm that deposit token balance of user1 has been reduced
      expect(await depositTokenInstance.balanceOf(user1.address)).to.eq(
        user1DepositTokenBalanceBefore.sub(depositAmount)
      );

      // Confirm that deposit token balance of DIVADevelopmentFund contract has been increased
      expect(
        await depositTokenInstance.balanceOf(divaDevelopmentFund.address)
      ).to.eq(divaDevelopmentFundDepositTokenBalanceBefore.add(depositAmount));

      // Get last block timestamp and deposit index
      lastBlockTimestamp = await getLastTimestamp();
      const depositIndex = receipt.events?.find(
        (x: any) => x.event === "Deposited"
      )?.args?.depositIndex;

      // Get deposit info from DIVADevelopmentFund contract
      const deposit = await divaDevelopmentFund.getDepositInfo(depositIndex);

      // Confirm that deposit info has been added correctly
      expect(deposit.token).to.eq(depositTokenInstance.address);
      expect(deposit.amount).to.eq(depositAmount);
      expect(deposit.startTime).to.eq(lastBlockTimestamp);
      expect(deposit.endTime).to.eq(
        lastBlockTimestamp + releasePeriodInSeconds
      );
      expect(deposit.lastClaimedAt).to.eq(lastBlockTimestamp);

      // Confirm that unclaimedDepositAmount has been increased
      expect(
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          depositTokenInstance.address
        )
      ).to.eq(unclaimedDepositAmountBefore.add(depositAmount));
    });

    it("Should allow anyone to deposit an ERC20 token to DIVADevelopmentFund contract via direct send", async function () {
      // ---------
      // Arrange: Prepare and get relevant values before deposit
      // ---------
      // Get deposit token balance for user and DIVADevelopmentFund before deposit
      divaDevelopmentFundDepositTokenBalanceBefore =
        await depositTokenInstance.balanceOf(divaDevelopmentFund.address);
      user1DepositTokenBalanceBefore = await depositTokenInstance.balanceOf(
        user1.address
      );
      expect(user1DepositTokenBalanceBefore).to.gt(0);

      // Set token amount to deposit
      depositAmount = user1DepositTokenBalanceBefore.div(10);

      // Get unclaimedDepositAmount before deposit
      unclaimedDepositAmountBefore =
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          depositTokenInstance.address
        );

      // Get depositsLength before deposit
      depositsLengthBefore = await divaDevelopmentFund.getDepositsLength();

      // ---------
      // Act: User1 deposits ERC20 token to DIVADevelopmentFund contract
      // ---------
      await depositTokenInstance
        .connect(user1)
        .transfer(divaDevelopmentFund.address, depositAmount);

      // ---------
      // Assert: Confirm that the token is deposited successfully
      // ---------
      // Confirm that deposit token balance of user1 has been reduced
      expect(await depositTokenInstance.balanceOf(user1.address)).to.eq(
        user1DepositTokenBalanceBefore.sub(depositAmount)
      );

      // Confirm that deposit token balance of DIVADevelopmentFund contract has been increased
      expect(
        await depositTokenInstance.balanceOf(divaDevelopmentFund.address)
      ).to.eq(divaDevelopmentFundDepositTokenBalanceBefore.add(depositAmount));

      // Confirm that length of deposits hasn't been changed
      expect(await divaDevelopmentFund.getDepositsLength()).to.eq(
        depositsLengthBefore
      );

      // Confirm that unclaimedDepositAmount hasn't been changed
      expect(
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          depositTokenInstance.address
        )
      ).to.eq(unclaimedDepositAmountBefore);
    });

    // -------------------------------------------
    // Events
    // -------------------------------------------

    it("Emits a `Deposited` event when a user deposits the native asset (ETH) via the `deposit` function", async () => {
      // ---------
      // Arrange: Set ETH amount to deposit and calc expected deposit index
      // ---------
      // Set ETH amount to deposit
      user1EthBalance = await user1.getBalance();
      expect(user1EthBalance).to.gt(0);
      depositAmount = user1EthBalance.div(10);

      // Calc expected deposit index (length of deposits before deposit)
      expectedDepositIndex = await divaDevelopmentFund.getDepositsLength();

      // ---------
      // Act: User1 deposits the native asset (ETH) to DIVADevelopmentFund contract
      // ---------
      const tx = await divaDevelopmentFund
        .connect(user1)
        ["deposit(uint256)"](releasePeriodInSeconds, {
          value: depositAmount,
        });
      const receipt = await tx.wait();

      // ---------
      // Assert: Check that it emits a `Deposited` event
      // ---------
      const depositedEvent = receipt.events?.find(
        (x: any) => x.event === "Deposited"
      );
      expect(depositedEvent?.args?.sender).to.eq(user1.address);
      expect(depositedEvent?.args?.depositIndex).to.eq(expectedDepositIndex);
    });

    it("Emits a `Deposited` event when a user deposits ERC20 token via the `deposit` function", async () => {
      // ---------
      // Arrange: Set token amount to deposit and calc expected deposit index
      // ---------
      // Set token amount to deposit
      user1DepositTokenBalance = await depositTokenInstance.balanceOf(
        user1.address
      );
      expect(user1DepositTokenBalance).to.gt(0);
      depositAmount = user1DepositTokenBalance.div(10);

      // Approve deposit token to DIVADevelopmentFund contract for user1
      await depositTokenInstance
        .connect(user1)
        .approve(divaDevelopmentFund.address, depositAmount);

      // Calc expected deposit index (length of deposits before deposit)
      expectedDepositIndex = await divaDevelopmentFund.getDepositsLength();

      // ---------
      // Act: User1 deposits an ERC20 token to DIVADevelopmentFund contract
      // ---------
      const tx = await divaDevelopmentFund
        .connect(user1)
        ["deposit(address,uint256,uint256)"](
          depositTokenInstance.address,
          depositAmount,
          releasePeriodInSeconds
        );
      const receipt = await tx.wait();

      // ---------
      // Assert: Check that it emits a `Deposited` event
      // ---------
      const depositedEvent = receipt.events?.find(
        (x: any) => x.event === "Deposited"
      );
      expect(depositedEvent?.args?.sender).to.eq(user1.address);
      expect(depositedEvent?.args?.depositIndex).to.eq(expectedDepositIndex);
    });

    // -------------------------------------------
    // Reverts
    // -------------------------------------------

    it("Reverts with `InvalidReleasePeriod()` if `_releasePeriodInSeconds = 0` in native asset deposits", async () => {
      // ---------
      // Arrange: Set invalid `_releasePeriodInSeconds`
      // ---------
      const releasePeriodInSecondsTest = 0;

      // Set `depositAmount`
      depositAmount = user1DepositTokenBalance.div(10);

      // ---------
      // Act & Assert: Check that the deposit operation fails
      // ---------
      await expect(divaDevelopmentFund
        .connect(user1)
        ["deposit(uint256)"](releasePeriodInSecondsTest, {
          value: depositAmount,
        })).to.be.revertedWith("InvalidReleasePeriod()");
    });

    it("Reverts with `InvalidReleasePeriod()` if `_releasePeriodInSeconds > 30*365 days` in native asset deposits", async () => {
      // ---------
      // Arrange: Set invalid `_releasePeriodInSeconds`
      // ---------
      const releasePeriodInSecondsTest = 30*365*86400 + 1; // 30 years + 1 second

      // Set `depositAmount`
      depositAmount = user1DepositTokenBalance.div(10);

      // ---------
      // Act & Assert: Check that the deposit operation fails
      // ---------
      await expect(divaDevelopmentFund
        .connect(user1)
        ["deposit(uint256)"](releasePeriodInSecondsTest, {
          value: depositAmount,
        })).to.be.revertedWith("InvalidReleasePeriod()");
    });

    it("Reverts with `InvalidReleasePeriod()` if `_releasePeriodInSeconds = 0` in ERC20 token deposits", async () => {
      // ---------
      // Arrange: Set invalid `_releasePeriodInSeconds`
      // ---------
      const releasePeriodInSecondsTest = 0;

      // Set `depositAmount`
      depositAmount = user1DepositTokenBalance.div(10);

      // ---------
      // Act & Assert: Check that the deposit operation fails
      // ---------
      await expect(divaDevelopmentFund
        .connect(user1)
        ["deposit(address,uint256,uint256)"](
          depositTokenInstance.address,
          depositAmount,
          releasePeriodInSecondsTest
        )).to.be.revertedWith("InvalidReleasePeriod()");
    });

    it("Reverts with `InvalidReleasePeriod()` if `_releasePeriodInSeconds > 30*365 days` in ERC20 token deposits", async () => {
      // ---------
      // Arrange: Set invalid `_releasePeriodInSeconds`
      // ---------
      const releasePeriodInSecondsTest = 30*365*86400 + 1; // 30 years + 1 second

      // Set `depositAmount`
      depositAmount = user1DepositTokenBalance.div(10);

      // ---------
      // Act & Assert: Check that the deposit operation fails
      // ---------
      await expect(divaDevelopmentFund
        .connect(user1)
        ["deposit(address,uint256,uint256)"](
          depositTokenInstance.address,
          depositAmount,
          releasePeriodInSecondsTest
        )).to.be.revertedWith("InvalidReleasePeriod()");
    });

    it("Reverts with `FeeTokensNotSupported()` if the deposit token implements a fee on transfers", async () => {
      // ---------
      // Arrange: Set `depositAmount` and allowance
      // ---------
      // Set `depositAmount`
      const user1DepositTokenWithFeesBalance = await depositTokenWithFeesInstance.balanceOf(
        user1.address
      );
      expect(user1DepositTokenWithFeesBalance).to.be.gt(0);
      depositAmount = user1DepositTokenWithFeesBalance.div(10);
      expect(depositAmount).to.be.gt(0);

      // Set allowance
      await depositTokenWithFeesInstance
        .connect(user1)
        .approve(divaDevelopmentFund.address, depositAmount);

      // ---------
      // Act & Assert: Check that the deposit operation fails
      // ---------
      await expect(divaDevelopmentFund
        .connect(user1)
        ["deposit(address,uint256,uint256)"](
          depositTokenWithFeesInstance.address,
          depositAmount,
          "100" // release period in seconds
        )).to.be.revertedWith("FeeTokensNotSupported()");      
    });
  });

  describe("withdraw", async () => {
    let ethDepositIndex1: BigNumber,
      ethDepositIndex2: BigNumber,
      erc20DepositIndex1: BigNumber,
      erc20DepositIndex2: BigNumber;
    let nextBlockTimestamp: number;
    let deposit1InfoBefore: Deposit,
      deposit2InfoBefore: Deposit,
      deposit1InfoAfter: Deposit,
      deposit2InfoAfter: Deposit;

    let expectedWithdrawnAmount1: BigNumber,
      expectedWithdrawnAmount2: BigNumber,
      expectedWithdrawnAmount: BigNumber;

    let contractOwnerEthBalanceBefore: BigNumber,
      contractOwnerDepositTokenBalanceBefore: BigNumber;

    let releasePeriodInSeconds1: number, releasePeriodInSeconds2: number;

    before(async function () {
      // Set release period
      releasePeriodInSeconds1 = 2 * ONE_HOUR;
      releasePeriodInSeconds2 = 3 * ONE_HOUR;
    });

    beforeEach(async function () {
      let tx: ContractTransaction;
      let receipt: ContractReceipt;
      if (
        this.currentTest?.title ===
          "Owner can partially withdraw ETH from DIVADevelopmentFund contract - for deposits via `deposit` function" ||
        this.currentTest?.title ===
          "Owner can fully withdraw ETH from DIVADevelopmentFund contract after pass end time of deposit - for deposits via `deposit` function" ||
        this.currentTest?.title ===
          "Owner can claim the remaining amount after end time if they have claimed deposited ETH partially during the release period - for deposits via `deposit` function" ||
        this.currentTest?.title ===
          "Owner can fully withdraw ETH from DIVADevelopmentFund contract only once after pass end time of deposit - for deposits via `deposit` function"
      ) {
        // ---------
        // Setup: Simulate two ETH deposits via `deposit` function
        // ---------

        // Get ETH balance for user1
        user1EthBalance = await user1.getBalance();
        expect(user1EthBalance).to.gt(0);

        // Set ETH amount to deposit
        depositAmount = user1EthBalance.div(10);

        // User1 deposit ETH to DIVADevelopmentFund contract (first)
        tx = await divaDevelopmentFund
          .connect(user1)
          ["deposit(uint256)"](releasePeriodInSeconds1, {
            value: depositAmount,
          });
        receipt = await tx.wait();
        ethDepositIndex1 = receipt.events?.find(
          (x: any) => x.event === "Deposited"
        )?.args?.depositIndex;

        // User1 deposit ETH to DIVADevelopmentFund contract (second)
        tx = await divaDevelopmentFund
          .connect(user1)
          ["deposit(uint256)"](releasePeriodInSeconds2, {
            value: depositAmount,
          });
        receipt = await tx.wait();
        ethDepositIndex2 = receipt.events?.find(
          (x: any) => x.event === "Deposited"
        )?.args?.depositIndex;
      } else if (
        this.currentTest?.title ===
          "Owner can partially withdraw ERC20 token from DIVADevelopmentFund contract - for deposits via `deposit` function" ||
        this.currentTest?.title ===
          "Owner can fully withdraw ERC20 token from DIVADevelopmentFund contract after pass end time of deposit - for deposits via `deposit` function" ||
        this.currentTest?.title ===
          "Owner can claim the remaining amount after end time if they have claimed deposited ERC20 token partially during the release period - for deposits via `deposit` function"
      ) {
        // ---------
        // Setup: Simulate two ERC20 token deposits
        // ---------

        // Get deposit token balance for user
        user1DepositTokenBalance = await depositTokenInstance.balanceOf(
          user1.address
        );
        // Set token amount to deposit
        depositAmount = user1DepositTokenBalance.div(10);

        // Approve deposit token to DIVADevelopmentFund contract for user1
        await depositTokenInstance
          .connect(user1)
          .approve(divaDevelopmentFund.address, depositAmount.mul(2));

        // User1 deposit ETH to DIVADevelopmentFund contract
        tx = await divaDevelopmentFund
          .connect(user1)
          ["deposit(address,uint256,uint256)"](
            depositTokenInstance.address,
            depositAmount,
            releasePeriodInSeconds1
          );
        receipt = await tx.wait();
        erc20DepositIndex1 = receipt.events?.find(
          (x: any) => x.event === "Deposited"
        )?.args?.depositIndex;

        // User1 deposit ETH to DIVADevelopmentFund contract
        tx = await divaDevelopmentFund
          .connect(user1)
          ["deposit(address,uint256,uint256)"](
            depositTokenInstance.address,
            depositAmount,
            releasePeriodInSeconds2
          );
        receipt = await tx.wait();
        erc20DepositIndex2 = receipt.events?.find(
          (x: any) => x.event === "Deposited"
        )?.args?.depositIndex;
      } else if (
        this.currentTest?.title ===
        "Owner can withdraw ETH from DIVADevelopmentFund contract - for direct deposit"
      ) {
        // ---------
        // Setup: Simulate direct ETH deposit
        // ---------

        // Get ETH balance for user1
        user1EthBalance = await user1.getBalance();
        expect(user1EthBalance).to.gt(0);

        // Set ETH amount to deposit
        depositAmount = user1EthBalance.div(10);

        // Direct ETH deposit
        await user1.sendTransaction({
          value: depositAmount,
          to: divaDevelopmentFund.address,
        });
      } else if (
        this.currentTest?.title ===
        "Owner can withdraw ERC20 token from DIVADevelopmentFund contract - for direct deposit"
      ) {
        // ---------
        // Setup: Simulate direct ERC20 token deposit
        // ---------

        // Get deposit token balance for user
        user1DepositTokenBalance = await depositTokenInstance.balanceOf(
          user1.address
        );
        // Set token amount to deposit
        depositAmount = user1DepositTokenBalance.div(10);

        // Direct ERC20 token deposit
        await depositTokenInstance
          .connect(user1)
          .transfer(divaDevelopmentFund.address, depositAmount);
      }

      // Get last block timestamp
      lastBlockTimestamp = await getLastTimestamp();
    });

    // -------------------------------------------
    // Functionality and events
    // -------------------------------------------

    it("Owner can partially withdraw ETH from DIVADevelopmentFund contract - for deposits via `deposit` function", async function () {
      // ---------
      // Arrange: Get balances and calc expected withdrawn amount
      // ---------
      // Set next block timestamp to one hour from now
      nextBlockTimestamp = lastBlockTimestamp + ONE_HOUR;
      await setNextTimestamp(ethers.provider, nextBlockTimestamp);

      // Get deposit infos before withdraw
      deposit1InfoBefore = await divaDevelopmentFund.getDepositInfo(
        ethDepositIndex1
      );
      deposit2InfoBefore = await divaDevelopmentFund.getDepositInfo(
        ethDepositIndex2
      );

      expectedWithdrawnAmount1 = deposit1InfoBefore.amount
        .mul(
          BigNumber.from(nextBlockTimestamp).sub(
            deposit1InfoBefore.lastClaimedAt
          )
        )
        .div(deposit1InfoBefore.endTime.sub(deposit1InfoBefore.startTime));
      expectedWithdrawnAmount2 = deposit2InfoBefore.amount
        .mul(
          BigNumber.from(nextBlockTimestamp).sub(
            deposit2InfoBefore.lastClaimedAt
          )
        )
        .div(deposit2InfoBefore.endTime.sub(deposit2InfoBefore.startTime));

      // Get ETH balance for contractOwner and DIVADevelopmentFund contract before deposit
      divaDevelopmentFundEthBalanceBefore = await ethers.provider.getBalance(
        divaDevelopmentFund.address
      );
      contractOwnerEthBalanceBefore = await contractOwner.getBalance();

      // Get unclaimedDepositAmount before deposit
      unclaimedDepositAmountBefore =
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          ethers.constants.AddressZero
        );

      // ---------
      // Act: Owner of DIVA protocol withdraw ETH from DIVADevelopmentFund contract
      // ---------
      const tx = await divaDevelopmentFund
        .connect(contractOwner)
        .withdraw(ethers.constants.AddressZero, [
          ethDepositIndex1,
          ethDepositIndex2,
        ]);
      const receipt = await tx.wait();

      // ---------
      // Assert: Confirm that ETH is withdrawn successfully and new balances are as expected
      // ---------
      // Confirm that it emits a `Withdrawn` event during withdraw
      const withdrawnEvent = receipt.events?.find(
        (x: any) => x.event === "Withdrawn"
      );
      expect(withdrawnEvent?.args?.withdrawnBy).to.eq(contractOwner.address);
      expect(withdrawnEvent?.args?.token).to.eq(ethers.constants.AddressZero);
      const withdrawnAmount = withdrawnEvent?.args?.amount;
      expect(withdrawnAmount).to.eq(
        expectedWithdrawnAmount1.add(expectedWithdrawnAmount2)
      );

      // Calc gas price used during deposit
      const gasPriceUsed = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      // Confirm that ETH balance of contract owner has been increased
      expect(await contractOwner.getBalance()).to.eq(
        contractOwnerEthBalanceBefore.add(withdrawnAmount).sub(gasPriceUsed)
      );

      // Confirm that ETH balance of DIVADevelopmentFund contract has been reduced
      expect(
        await ethers.provider.getBalance(divaDevelopmentFund.address)
      ).to.eq(divaDevelopmentFundEthBalanceBefore.sub(withdrawnAmount));

      // Get deposit infos after withdraw
      deposit1InfoAfter = await divaDevelopmentFund.getDepositInfo(
        ethDepositIndex1
      );
      deposit2InfoAfter = await divaDevelopmentFund.getDepositInfo(
        ethDepositIndex2
      );

      // Confirm that deposit info has been updated correctly
      expect(deposit1InfoAfter.lastClaimedAt).to.eq(nextBlockTimestamp);
      expect(deposit2InfoAfter.lastClaimedAt).to.eq(nextBlockTimestamp);

      // Confirm that unclaimedDepositAmount has been reduced
      expect(
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          ethers.constants.AddressZero
        )
      ).to.eq(unclaimedDepositAmountBefore.sub(withdrawnAmount));
    });

    it("Owner can withdraw ETH from DIVADevelopmentFund contract - for direct deposit", async function () {
      // ---------
      // Arrange: Get balances and calc expected withdrawn amount
      // ---------
      // Get ETH balance for contractOwner and DIVADevelopmentFund contract before deposit
      divaDevelopmentFundEthBalanceBefore = await ethers.provider.getBalance(
        divaDevelopmentFund.address
      );
      contractOwnerEthBalanceBefore = await contractOwner.getBalance();

      // Get unclaimedDepositAmount before deposit
      unclaimedDepositAmountBefore =
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          ethers.constants.AddressZero
        );

      // Calculate expected amount that will be withdrawn
      expectedWithdrawnAmount = divaDevelopmentFundEthBalanceBefore.sub(
        unclaimedDepositAmountBefore
      );

      // Confirm that direct deposited ETH exists
      expect(expectedWithdrawnAmount).to.be.gt(0);

      // ---------
      // Act: Owner of DIVA protocol withdraws ETH from DIVADevelopmentFund contract
      // ---------
      const tx = await divaDevelopmentFund
        .connect(contractOwner)
        .withdrawDirectDeposit(ethers.constants.AddressZero);
      const receipt = await tx.wait();

      // ---------
      // Assert: Confirm that ETH is withdrawn successfully
      // ---------
      // Confirm that it emits a `Withdrawn` event during withdraw
      const withdrawnEvent = receipt.events?.find(
        (x: any) => x.event === "Withdrawn"
      );
      expect(withdrawnEvent?.args?.withdrawnBy).to.eq(contractOwner.address);
      expect(withdrawnEvent?.args?.token).to.eq(ethers.constants.AddressZero);
      const withdrawnAmount = withdrawnEvent?.args?.amount;
      expect(withdrawnAmount).to.eq(expectedWithdrawnAmount);

      // Calc gas price used during deposit
      const gasPriceUsed = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      // Confirm that ETH balance of contract owner has been increased
      expect(await contractOwner.getBalance()).to.eq(
        contractOwnerEthBalanceBefore.add(withdrawnAmount).sub(gasPriceUsed)
      );

      // Confirm that ETH balance of DIVADevelopmentFund contract has been reduced
      expect(
        await ethers.provider.getBalance(divaDevelopmentFund.address)
      ).to.eq(divaDevelopmentFundEthBalanceBefore.sub(withdrawnAmount));

      // Confirm that unclaimedDepositAmount hasn't been changed
      expect(
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          ethers.constants.AddressZero
        )
      ).to.eq(unclaimedDepositAmountBefore);
    });

    it("Owner can partially withdraw ERC20 token from DIVADevelopmentFund contract - for deposits via `deposit` function", async function () {
      // ---------
      // Arrange: Get balances and calc expected withdrawn amount
      // ---------
      // Set next block timestamp to one hour from now
      nextBlockTimestamp = lastBlockTimestamp + ONE_HOUR;
      await setNextTimestamp(ethers.provider, nextBlockTimestamp);

      // Get deposit token balance for contractOwner and DIVADevelopmentFund before deposit
      contractOwnerDepositTokenBalanceBefore =
        await depositTokenInstance.balanceOf(contractOwner.address);
      divaDevelopmentFundDepositTokenBalanceBefore =
        await depositTokenInstance.balanceOf(divaDevelopmentFund.address);

      // Get unclaimedDepositAmount before deposit
      unclaimedDepositAmountBefore =
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          depositTokenInstance.address
        );

      // Get deposit infos before withdraw
      deposit1InfoBefore = await divaDevelopmentFund.getDepositInfo(
        erc20DepositIndex1
      );
      deposit2InfoBefore = await divaDevelopmentFund.getDepositInfo(
        erc20DepositIndex2
      );

      expectedWithdrawnAmount1 = deposit1InfoBefore.amount
        .mul(
          BigNumber.from(nextBlockTimestamp).sub(
            deposit1InfoBefore.lastClaimedAt
          )
        )
        .div(deposit1InfoBefore.endTime.sub(deposit1InfoBefore.startTime));
      expectedWithdrawnAmount2 = deposit2InfoBefore.amount
        .mul(
          BigNumber.from(nextBlockTimestamp).sub(
            deposit2InfoBefore.lastClaimedAt
          )
        )
        .div(deposit2InfoBefore.endTime.sub(deposit2InfoBefore.startTime));

      // ---------
      // Act: Owner of DIVA protocol withdraws ERC20 token from DIVADevelopmentFund contract
      // ---------
      const tx = await divaDevelopmentFund
        .connect(contractOwner)
        .withdraw(depositTokenInstance.address, [
          erc20DepositIndex1,
          erc20DepositIndex2,
        ]);
      const receipt = await tx.wait();

      // ---------
      // Assert: Confirm that ERC20 token is withdrawn successfully
      // ---------
      // Confirm that it emits a `Withdrawn` event during withdraw
      const withdrawnEvent = receipt.events?.find(
        (x: any) => x.event === "Withdrawn"
      );
      expect(withdrawnEvent?.args?.withdrawnBy).to.eq(contractOwner.address);
      expect(withdrawnEvent?.args?.token).to.eq(depositTokenInstance.address);
      const withdrawnAmount = withdrawnEvent?.args?.amount;
      expect(withdrawnAmount).to.eq(
        expectedWithdrawnAmount1.add(expectedWithdrawnAmount2)
      );

      // Confirm that ERC20 token balance of contract owner has been increased
      expect(await depositTokenInstance.balanceOf(contractOwner.address)).to.eq(
        contractOwnerDepositTokenBalanceBefore.add(withdrawnAmount)
      );

      // Confirm that ERC20 token balance of DIVADevelopmentFund contract has been reduced
      expect(
        await depositTokenInstance.balanceOf(divaDevelopmentFund.address)
      ).to.eq(
        divaDevelopmentFundDepositTokenBalanceBefore.sub(withdrawnAmount)
      );

      // Get deposit infos after withdraw
      deposit1InfoAfter = await divaDevelopmentFund.getDepositInfo(
        erc20DepositIndex1
      );
      deposit2InfoAfter = await divaDevelopmentFund.getDepositInfo(
        erc20DepositIndex2
      );

      // Confirm that deposit info has been updated correctly
      expect(deposit1InfoAfter.lastClaimedAt).to.eq(nextBlockTimestamp);
      expect(deposit2InfoAfter.lastClaimedAt).to.eq(nextBlockTimestamp);

      // Confirm that unclaimedDepositAmount has been reduced
      expect(
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          depositTokenInstance.address
        )
      ).to.eq(unclaimedDepositAmountBefore.sub(withdrawnAmount));
    });

    it("Owner can withdraw ERC20 token from DIVADevelopmentFund contract - for direct deposit", async function () {
      // ---------
      // Arrange: Get balances and calc expected withdrawn amount
      // ---------
      // Get deposit token balance for contractOwner and DIVADevelopmentFund before deposit
      contractOwnerDepositTokenBalanceBefore =
        await depositTokenInstance.balanceOf(contractOwner.address);
      divaDevelopmentFundDepositTokenBalanceBefore =
        await depositTokenInstance.balanceOf(divaDevelopmentFund.address);

      // Get unclaimedDepositAmount before deposit
      unclaimedDepositAmountBefore =
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          depositTokenInstance.address
        );

      expectedWithdrawnAmount =
        divaDevelopmentFundDepositTokenBalanceBefore.sub(
          unclaimedDepositAmountBefore
        );

      // Confirm that direct deposited ERC20 token exists
      expect(expectedWithdrawnAmount).to.be.gt(0);

      // ---------
      // Act: Owner of DIVA protocol withdraws ERC20 token from DIVADevelopmentFund contract
      // ---------
      const tx = await divaDevelopmentFund
        .connect(contractOwner)
        .withdrawDirectDeposit(depositTokenInstance.address);
      const receipt = await tx.wait();

      // ---------
      // Assert: Confirm that ERC20 token is withdrawn successfully
      // ---------
      // Confirm that it emits a `Withdrawn` event during withdraw
      const withdrawnEvent = receipt.events?.find(
        (x: any) => x.event === "Withdrawn"
      );
      expect(withdrawnEvent?.args?.withdrawnBy).to.eq(contractOwner.address);
      expect(withdrawnEvent?.args?.token).to.eq(depositTokenInstance.address);
      const withdrawnAmount = withdrawnEvent?.args?.amount;
      expect(withdrawnAmount).to.eq(expectedWithdrawnAmount);

      // Confirm that ERC20 token balance of contract owner has been increased
      expect(await depositTokenInstance.balanceOf(contractOwner.address)).to.eq(
        contractOwnerDepositTokenBalanceBefore.add(withdrawnAmount)
      );

      // Confirm that ERC20 token balance of DIVADevelopmentFund contract has been reduced
      expect(
        await depositTokenInstance.balanceOf(divaDevelopmentFund.address)
      ).to.eq(
        divaDevelopmentFundDepositTokenBalanceBefore.sub(withdrawnAmount)
      );

      // Confirm that unclaimedDepositAmount hasn't been changed
      expect(
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          depositTokenInstance.address
        )
      ).to.eq(unclaimedDepositAmountBefore);
    });

    it("Owner can fully withdraw ETH from DIVADevelopmentFund contract after pass end time of deposit - for deposits via `deposit` function", async function () {
      // ---------
      // Arrange: Get balances and calc expected withdrawn amount
      // ---------
      // Get deposit infos before withdraw
      deposit1InfoBefore = await divaDevelopmentFund.getDepositInfo(
        ethDepositIndex1
      );
      deposit2InfoBefore = await divaDevelopmentFund.getDepositInfo(
        ethDepositIndex2
      );

      // Get expected withdraw amount
      expectedWithdrawnAmount = deposit1InfoBefore.amount.add(
        deposit2InfoBefore.amount
      );

      // Get ETH balance for contractOwner and DIVADevelopmentFund contract before deposit
      divaDevelopmentFundEthBalanceBefore = await ethers.provider.getBalance(
        divaDevelopmentFund.address
      );
      contractOwnerEthBalanceBefore = await contractOwner.getBalance();

      // Get unclaimedDepositAmount before deposit
      unclaimedDepositAmountBefore =
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          ethers.constants.AddressZero
        );

      // Set next block timestamp to after the end of release period for both deposits
      nextBlockTimestamp =
        lastBlockTimestamp +
        Math.max(releasePeriodInSeconds1, releasePeriodInSeconds2) +
        1;
      expect(nextBlockTimestamp).to.be.gt(deposit1InfoBefore.endTime);
      expect(nextBlockTimestamp).to.be.gt(deposit2InfoBefore.endTime);
      await setNextTimestamp(ethers.provider, nextBlockTimestamp);

      // ---------
      // Act: Owner of DIVA protocol withdraws ETH from DIVADevelopmentFund contract
      // ---------
      const tx = await divaDevelopmentFund
        .connect(contractOwner)
        .withdraw(ethers.constants.AddressZero, [
          ethDepositIndex1,
          ethDepositIndex2,
        ]);
      const receipt = await tx.wait();

      // ---------
      // Assert: Confirm that ETH is withdrawn successfully
      // ---------
      // Confirm that it emits a Withdrawn event during withdraw
      const withdrawnEvent = receipt.events?.find(
        (x: any) => x.event === "Withdrawn"
      );
      expect(withdrawnEvent?.args?.withdrawnBy).to.eq(contractOwner.address);
      expect(withdrawnEvent?.args?.token).to.eq(ethers.constants.AddressZero);
      const withdrawnAmount = withdrawnEvent?.args?.amount;
      expect(withdrawnAmount).to.eq(expectedWithdrawnAmount);

      // Calc gas price used during deposit
      const gasPriceUsed = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      // Confirm that ETH balance of contract owner has been increased
      expect(await contractOwner.getBalance()).to.eq(
        contractOwnerEthBalanceBefore.add(withdrawnAmount).sub(gasPriceUsed)
      );

      // Confirm that ETH balance of DIVADevelopmentFund contract has been reduced
      expect(
        await ethers.provider.getBalance(divaDevelopmentFund.address)
      ).to.eq(divaDevelopmentFundEthBalanceBefore.sub(withdrawnAmount));

      // Get deposit infos after withdraw
      deposit1InfoAfter = await divaDevelopmentFund.getDepositInfo(
        ethDepositIndex1
      );
      deposit2InfoAfter = await divaDevelopmentFund.getDepositInfo(
        ethDepositIndex2
      );

      // Confirm that deposit info has been updated correctly
      expect(deposit1InfoAfter.lastClaimedAt).to.eq(nextBlockTimestamp);
      expect(deposit2InfoAfter.lastClaimedAt).to.eq(nextBlockTimestamp);

      // Confirm that unclaimedDepositAmount has been reduced
      expect(
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          ethers.constants.AddressZero
        )
      ).to.eq(unclaimedDepositAmountBefore.sub(withdrawnAmount));
    });

    it("Owner can fully withdraw ERC20 token from DIVADevelopmentFund contract after pass end time of deposit - for deposits via `deposit` function", async function () {
      // ---------
      // Arrange: Get balances and calc expected withdrawn amount
      // ---------
      // Get deposit token balance for contractOwner and DIVADevelopmentFund before deposit
      contractOwnerDepositTokenBalanceBefore =
        await depositTokenInstance.balanceOf(contractOwner.address);
      divaDevelopmentFundDepositTokenBalanceBefore =
        await depositTokenInstance.balanceOf(divaDevelopmentFund.address);

      // Get unclaimedDepositAmount before deposit
      unclaimedDepositAmountBefore =
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          depositTokenInstance.address
        );

      // Get deposit infos before withdraw
      deposit1InfoBefore = await divaDevelopmentFund.getDepositInfo(
        erc20DepositIndex1
      );
      deposit2InfoBefore = await divaDevelopmentFund.getDepositInfo(
        erc20DepositIndex2
      );

      // Calculate expected withdraw amount
      expectedWithdrawnAmount = deposit1InfoBefore.amount.add(
        deposit2InfoBefore.amount
      );

      // Set next block timestamp to after the end of release period for both deposits
      nextBlockTimestamp =
        lastBlockTimestamp +
        Math.max(releasePeriodInSeconds1, releasePeriodInSeconds2) +
        1;
      expect(nextBlockTimestamp).to.be.gt(deposit1InfoBefore.endTime);
      expect(nextBlockTimestamp).to.be.gt(deposit2InfoBefore.endTime);
      await setNextTimestamp(ethers.provider, nextBlockTimestamp);

      // ---------
      // Act: Owner of DIVA protocol withdraws ERC20 token from DIVADevelopmentFund contract
      // ---------
      const tx = await divaDevelopmentFund
        .connect(contractOwner)
        .withdraw(depositTokenInstance.address, [
          erc20DepositIndex1,
          erc20DepositIndex2,
        ]);
      const receipt = await tx.wait();

      // ---------
      // Assert: Confirm that ERC20 token is withdrawn successfully
      // ---------
      // Confirm that it emits a Withdrawn event during withdraw
      const withdrawnEvent = receipt.events?.find(
        (x: any) => x.event === "Withdrawn"
      );
      expect(withdrawnEvent?.args?.withdrawnBy).to.eq(contractOwner.address);
      expect(withdrawnEvent?.args?.token).to.eq(depositTokenInstance.address);
      const withdrawnAmount = withdrawnEvent?.args?.amount;
      expect(withdrawnAmount).to.eq(expectedWithdrawnAmount);

      // Confirm that ERC20 token balance of contract owner has been increased
      expect(await depositTokenInstance.balanceOf(contractOwner.address)).to.eq(
        contractOwnerDepositTokenBalanceBefore.add(withdrawnAmount)
      );

      // Confirm that ERC20 token balance of DIVADevelopmentFund contract has been reduced
      expect(
        await depositTokenInstance.balanceOf(divaDevelopmentFund.address)
      ).to.eq(
        divaDevelopmentFundDepositTokenBalanceBefore.sub(withdrawnAmount)
      );

      // Get deposit infos after withdraw
      deposit1InfoAfter = await divaDevelopmentFund.getDepositInfo(
        erc20DepositIndex1
      );
      deposit2InfoAfter = await divaDevelopmentFund.getDepositInfo(
        erc20DepositIndex2
      );
      // Confirm that deposit info has been updated correctly
      expect(deposit1InfoAfter.lastClaimedAt).to.eq(nextBlockTimestamp);
      expect(deposit2InfoAfter.lastClaimedAt).to.eq(nextBlockTimestamp);

      // Confirm that unclaimedDepositAmount has been reduced
      expect(
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          depositTokenInstance.address
        )
      ).to.eq(unclaimedDepositAmountBefore.sub(withdrawnAmount));
    });

    it("Owner can fully withdraw ETH from DIVADevelopmentFund contract only once after pass end time of deposit - for deposits via `deposit` function", async function () {
      // ---------
      // Arrange: Get balances and calc expected withdrawn amount before 1st withdraw
      // ---------
      // Get deposit infos before withdraw
      deposit1InfoBefore = await divaDevelopmentFund.getDepositInfo(
        ethDepositIndex1
      );
      deposit2InfoBefore = await divaDevelopmentFund.getDepositInfo(
        ethDepositIndex2
      );

      // Get expected withdraw amount
      expectedWithdrawnAmount = deposit1InfoBefore.amount.add(
        deposit2InfoBefore.amount
      );

      // Get ETH balance for contractOwner and DIVADevelopmentFund contract before deposit
      divaDevelopmentFundEthBalanceBefore = await ethers.provider.getBalance(
        divaDevelopmentFund.address
      );
      contractOwnerEthBalanceBefore = await contractOwner.getBalance();

      // Get unclaimedDepositAmount before deposit
      unclaimedDepositAmountBefore =
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          ethers.constants.AddressZero
        );

      // Set next block timestamp to after the end of release period for both deposits
      nextBlockTimestamp =
        lastBlockTimestamp +
        Math.max(releasePeriodInSeconds1, releasePeriodInSeconds2) +
        1;
      expect(nextBlockTimestamp).to.be.gt(deposit1InfoBefore.endTime);
      expect(nextBlockTimestamp).to.be.gt(deposit2InfoBefore.endTime);
      await setNextTimestamp(ethers.provider, nextBlockTimestamp);

      // ---------
      // Act: Owner of DIVA protocol withdraws ETH from DIVADevelopmentFund contract - 1st withdraw
      // ---------
      const tx1 = await divaDevelopmentFund
        .connect(contractOwner)
        .withdraw(ethers.constants.AddressZero, [
          ethDepositIndex1,
          ethDepositIndex2,
        ]);
      const receipt1 = await tx1.wait();

      // ---------
      // Assert: Confirm that ETH is withdrawn successfully - after 1st withdraw
      // ---------
      // Confirm that it emits a Withdrawn event during withdraw
      const withdrawnEvent1 = receipt1.events?.find(
        (x: any) => x.event === "Withdrawn"
      );
      expect(withdrawnEvent1?.args?.withdrawnBy).to.eq(contractOwner.address);
      expect(withdrawnEvent1?.args?.token).to.eq(ethers.constants.AddressZero);
      const withdrawnAmount1 = withdrawnEvent1?.args?.amount;
      expect(withdrawnAmount1).to.eq(expectedWithdrawnAmount);

      // Calc gas price used during deposit
      const gasPriceUsed1 = receipt1.gasUsed.mul(receipt1.effectiveGasPrice);

      // Confirm that ETH balance of contract owner has been increased
      expect(await contractOwner.getBalance()).to.eq(
        contractOwnerEthBalanceBefore.add(withdrawnAmount1).sub(gasPriceUsed1)
      );

      // Confirm that ETH balance of DIVADevelopmentFund contract has been reduced
      expect(
        await ethers.provider.getBalance(divaDevelopmentFund.address)
      ).to.eq(divaDevelopmentFundEthBalanceBefore.sub(withdrawnAmount1));

      // Get deposit infos after withdraw
      deposit1InfoAfter = await divaDevelopmentFund.getDepositInfo(
        ethDepositIndex1
      );
      deposit2InfoAfter = await divaDevelopmentFund.getDepositInfo(
        ethDepositIndex2
      );

      // Confirm that deposit info has been updated correctly
      expect(deposit1InfoAfter.lastClaimedAt).to.eq(nextBlockTimestamp);
      expect(deposit2InfoAfter.lastClaimedAt).to.eq(nextBlockTimestamp);

      // Confirm that unclaimedDepositAmount has been reduced
      expect(
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          ethers.constants.AddressZero
        )
      ).to.eq(unclaimedDepositAmountBefore.sub(withdrawnAmount1));

      // ---------
      // Arrange: Get balances before 2nd withdraw
      // ---------
      // Get ETH balance for contractOwner and DIVADevelopmentFund contract before deposit
      divaDevelopmentFundEthBalanceBefore = await ethers.provider.getBalance(
        divaDevelopmentFund.address
      );
      contractOwnerEthBalanceBefore = await contractOwner.getBalance();

      // Get unclaimedDepositAmount before deposit
      unclaimedDepositAmountBefore =
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          ethers.constants.AddressZero
        );

      // ---------
      // Act: Owner of DIVA protocol withdraws ETH from DIVADevelopmentFund contract - 2nd withdraw
      // ---------
      const tx2 = await divaDevelopmentFund
        .connect(contractOwner)
        .withdraw(ethers.constants.AddressZero, [
          ethDepositIndex1,
          ethDepositIndex2,
        ]);
      const receipt2 = await tx2.wait();

      // ---------
      // Assert: Confirm that ETH balance is not changed - after 2nd withdraw
      // ---------
      // Confirm that it emits a Withdrawn event during withdraw
      const withdrawnEvent2 = receipt2.events?.find(
        (x: any) => x.event === "Withdrawn"
      );
      expect(withdrawnEvent2?.args?.withdrawnBy).to.eq(contractOwner.address);
      expect(withdrawnEvent2?.args?.token).to.eq(ethers.constants.AddressZero);
      const withdrawnAmount2 = withdrawnEvent2?.args?.amount;
      expect(withdrawnAmount2).to.eq(0);

      // Calc gas price used during deposit
      const gasPriceUsed2 = receipt2.gasUsed.mul(receipt2.effectiveGasPrice);

      // Confirm that ETH balance of contract owner has been reduced with amount of gas price used
      expect(await contractOwner.getBalance()).to.eq(
        contractOwnerEthBalanceBefore.sub(gasPriceUsed2)
      );

      // Confirm that ETH balance of DIVADevelopmentFund contract hasn't been changed
      expect(
        await ethers.provider.getBalance(divaDevelopmentFund.address)
      ).to.eq(divaDevelopmentFundEthBalanceBefore);

      // Confirm that unclaimedDepositAmount hasn't been changed
      expect(
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          ethers.constants.AddressZero
        )
      ).to.eq(unclaimedDepositAmountBefore);
    });

    it("Owner can claim the remaining amount after end time if they have claimed deposited ETH partially during the release period - for deposits via `deposit` function", async function () {
      // ---------
      // Arrange: Simulate partial withdraw, get balances and calc expected withdrawn amount
      // ---------
      // Get deposit infos before withdraw
      deposit1InfoBefore = await divaDevelopmentFund.getDepositInfo(
        ethDepositIndex1
      );
      deposit2InfoBefore = await divaDevelopmentFund.getDepositInfo(
        ethDepositIndex2
      );

      // Set next block timestamp to one hour from now
      nextBlockTimestamp = lastBlockTimestamp + ONE_HOUR;
      expect(nextBlockTimestamp).to.be.lt(deposit1InfoBefore.endTime);
      expect(nextBlockTimestamp).to.be.lt(deposit2InfoBefore.endTime);
      await setNextTimestamp(ethers.provider, nextBlockTimestamp);

      // Owner of DIVA protocol partially withdraw ETH from DIVADevelopmentFund contract
      const tx1 = await divaDevelopmentFund
        .connect(contractOwner)
        .withdraw(ethers.constants.AddressZero, [
          ethDepositIndex1,
          ethDepositIndex2,
        ]);
      const receipt1 = await tx1.wait();

      // Get withdrawn amount
      const withdrawnAmount1 = receipt1.events?.find(
        (x: any) => x.event === "Withdrawn"
      )?.args?.amount;

      // Get expected withdraw amount
      expectedWithdrawnAmount = deposit1InfoBefore.amount
        .add(deposit2InfoBefore.amount)
        .sub(withdrawnAmount1);
      expect(expectedWithdrawnAmount).to.be.gt(0);

      // Set next block timestamp to after the end of release period for both deposits
      nextBlockTimestamp =
        lastBlockTimestamp +
        Math.max(releasePeriodInSeconds1, releasePeriodInSeconds2) +
        1;
      expect(nextBlockTimestamp).to.be.gt(deposit1InfoBefore.endTime);
      expect(nextBlockTimestamp).to.be.gt(deposit2InfoBefore.endTime);
      await setNextTimestamp(ethers.provider, nextBlockTimestamp);

      // Get ETH balance for contractOwner and DIVADevelopmentFund contract before deposit
      divaDevelopmentFundEthBalanceBefore = await ethers.provider.getBalance(
        divaDevelopmentFund.address
      );
      contractOwnerEthBalanceBefore = await contractOwner.getBalance();

      // Get unclaimedDepositAmount before deposit
      unclaimedDepositAmountBefore =
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          ethers.constants.AddressZero
        );

      // ---------
      // Act: Owner of DIVA protocol withdraws ETH from DIVADevelopmentFund contract
      // ---------
      const tx2 = await divaDevelopmentFund
        .connect(contractOwner)
        .withdraw(ethers.constants.AddressZero, [
          ethDepositIndex1,
          ethDepositIndex2,
        ]);
      const receipt2 = await tx2.wait();

      // ---------
      // Assert: Confirm that ETH is withdrawn successfully
      // ---------
      // Confirm that it emits a Withdrawn event during withdraw
      const withdrawnEvent = receipt2.events?.find(
        (x: any) => x.event === "Withdrawn"
      );
      expect(withdrawnEvent?.args?.withdrawnBy).to.eq(contractOwner.address);
      expect(withdrawnEvent?.args?.token).to.eq(ethers.constants.AddressZero);
      const withdrawnAmount2 = withdrawnEvent?.args?.amount;
      expect(withdrawnAmount2).to.eq(expectedWithdrawnAmount);

      // Calc gas price used during deposit
      const gasPriceUsed = receipt2.gasUsed.mul(receipt2.effectiveGasPrice);

      // Confirm that ETH balance of contract owner has been increased
      expect(await contractOwner.getBalance()).to.eq(
        contractOwnerEthBalanceBefore.add(withdrawnAmount2).sub(gasPriceUsed)
      );

      // Confirm that ETH balance of DIVADevelopmentFund contract has been reduced
      expect(
        await ethers.provider.getBalance(divaDevelopmentFund.address)
      ).to.eq(divaDevelopmentFundEthBalanceBefore.sub(withdrawnAmount2));

      // Get deposit infos after withdraw
      deposit1InfoAfter = await divaDevelopmentFund.getDepositInfo(
        ethDepositIndex1
      );
      deposit2InfoAfter = await divaDevelopmentFund.getDepositInfo(
        ethDepositIndex2
      );

      // Confirm that deposit info has been updated correctly
      expect(deposit1InfoAfter.lastClaimedAt).to.eq(nextBlockTimestamp);
      expect(deposit2InfoAfter.lastClaimedAt).to.eq(nextBlockTimestamp);

      // Confirm that unclaimedDepositAmount has been reduced
      expect(
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          ethers.constants.AddressZero
        )
      ).to.eq(unclaimedDepositAmountBefore.sub(withdrawnAmount2));
    });

    it("Owner can claim the remaining amount after end time if they have claimed deposited ERC20 token partially during the release period - for deposits via `deposit` function", async function () {
      // ---------
      // Arrange: Simulate partial withdraw, get balances and calc expected withdrawn amount
      // ---------
      // Get deposit infos before withdraw
      deposit1InfoBefore = await divaDevelopmentFund.getDepositInfo(
        erc20DepositIndex1
      );
      deposit2InfoBefore = await divaDevelopmentFund.getDepositInfo(
        erc20DepositIndex2
      );

      // Set next block timestamp to one hour from now
      nextBlockTimestamp = lastBlockTimestamp + ONE_HOUR;
      expect(nextBlockTimestamp).to.be.lt(deposit1InfoBefore.endTime);
      expect(nextBlockTimestamp).to.be.lt(deposit2InfoBefore.endTime);
      await setNextTimestamp(ethers.provider, nextBlockTimestamp);

      // Owner of DIVA protocol partially withdraw ETH from DIVADevelopmentFund contract
      const tx1 = await divaDevelopmentFund
        .connect(contractOwner)
        .withdraw(depositTokenInstance.address, [
          erc20DepositIndex1,
          erc20DepositIndex2,
        ]);
      const receipt1 = await tx1.wait();

      // Get withdrawn amount
      const withdrawnAmount1 = receipt1.events?.find(
        (x: any) => x.event === "Withdrawn"
      )?.args?.amount;

      // Get expected withdraw amount
      expectedWithdrawnAmount = deposit1InfoBefore.amount
        .add(deposit2InfoBefore.amount)
        .sub(withdrawnAmount1);
      expect(expectedWithdrawnAmount).to.be.gt(0);

      // Set next block timestamp to after the end of release period for both deposits
      nextBlockTimestamp =
        lastBlockTimestamp +
        Math.max(releasePeriodInSeconds1, releasePeriodInSeconds2) +
        1;
      expect(nextBlockTimestamp).to.be.gt(deposit1InfoBefore.endTime);
      expect(nextBlockTimestamp).to.be.gt(deposit2InfoBefore.endTime);
      await setNextTimestamp(ethers.provider, nextBlockTimestamp);

      // Get deposit token balance for contractOwner and DIVADevelopmentFund before deposit
      contractOwnerDepositTokenBalanceBefore =
        await depositTokenInstance.balanceOf(contractOwner.address);
      divaDevelopmentFundDepositTokenBalanceBefore =
        await depositTokenInstance.balanceOf(divaDevelopmentFund.address);

      // Get unclaimedDepositAmount before deposit
      unclaimedDepositAmountBefore =
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          depositTokenInstance.address
        );

      // ---------
      // Act: Owner of DIVA protocol withdraws ERC20 token from DIVADevelopmentFund contract
      // ---------
      const tx2 = await divaDevelopmentFund
        .connect(contractOwner)
        .withdraw(depositTokenInstance.address, [
          erc20DepositIndex1,
          erc20DepositIndex2,
        ]);
      const receipt2 = await tx2.wait();

      // ---------
      // Assert: Confirm that ERC20 token is withdrawn successfully
      // ---------
      // Confirm that it emits a Withdrawn event during withdraw
      const withdrawnEvent = receipt2.events?.find(
        (x: any) => x.event === "Withdrawn"
      );
      expect(withdrawnEvent?.args?.withdrawnBy).to.eq(contractOwner.address);
      expect(withdrawnEvent?.args?.token).to.eq(depositTokenInstance.address);
      const withdrawnAmount2 = withdrawnEvent?.args?.amount;
      expect(withdrawnAmount2).to.eq(expectedWithdrawnAmount);

      // Confirm that ERC20 token balance of contract owner has been increased
      expect(await depositTokenInstance.balanceOf(contractOwner.address)).to.eq(
        contractOwnerDepositTokenBalanceBefore.add(withdrawnAmount2)
      );

      // Confirm that ERC20 token balance of DIVADevelopmentFund contract has been reduced
      expect(
        await depositTokenInstance.balanceOf(divaDevelopmentFund.address)
      ).to.eq(
        divaDevelopmentFundDepositTokenBalanceBefore.sub(withdrawnAmount2)
      );

      // Get deposit infos after withdraw
      deposit1InfoAfter = await divaDevelopmentFund.getDepositInfo(
        erc20DepositIndex1
      );
      deposit2InfoAfter = await divaDevelopmentFund.getDepositInfo(
        erc20DepositIndex2
      );
      // Confirm that deposit info has been updated correctly
      expect(deposit1InfoAfter.lastClaimedAt).to.eq(nextBlockTimestamp);
      expect(deposit2InfoAfter.lastClaimedAt).to.eq(nextBlockTimestamp);

      // Confirm that unclaimedDepositAmount has been reduced
      expect(
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          depositTokenInstance.address
        )
      ).to.eq(unclaimedDepositAmountBefore.sub(withdrawnAmount2));
    });

    it("Should not change anything if owner calls the `withdraw` function with an empty indices array (ETH scenario)", async function () {
      // ---------
      // Arrange: Get balances and calc expected withdrawn amount
      // ---------
      // Get ETH balance for contractOwner and DIVADevelopmentFund contract before deposit
      divaDevelopmentFundEthBalanceBefore = await ethers.provider.getBalance(
        divaDevelopmentFund.address
      );
      contractOwnerEthBalanceBefore = await contractOwner.getBalance();

      // Get unclaimedDepositAmount before deposit
      unclaimedDepositAmountBefore =
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          ethers.constants.AddressZero
        );

      // ---------
      // Act: Owner of DIVA protocol withdraws ETH from DIVADevelopmentFund contract with an empty indices array
      // ---------
      const tx = await divaDevelopmentFund
        .connect(contractOwner)
        .withdraw(ethers.constants.AddressZero, []);
      const receipt = await tx.wait();

      // ---------
      // Assert: Confirm that balances and relevant storage variables remain unchanged
      // ---------
      // Confirm that it emits a Withdrawn event during withdraw with zero withdrawn amount
      const withdrawnEvent = receipt.events?.find(
        (x: any) => x.event === "Withdrawn"
      );
      expect(withdrawnEvent?.args?.withdrawnBy).to.eq(contractOwner.address);
      expect(withdrawnEvent?.args?.token).to.eq(ethers.constants.AddressZero);
      expect(withdrawnEvent?.args?.amount).to.eq(0);

      // Calc gas price used during deposit
      const gasPriceUsed = receipt.gasUsed.mul(receipt.effectiveGasPrice);

      // Confirm that ETH balance of contract owner has reduced only due to gas fees (`gasPriceUsed`)
      expect(await contractOwner.getBalance()).to.eq(
        contractOwnerEthBalanceBefore.sub(gasPriceUsed)
      );

      // Confirm that ETH balance of DIVADevelopmentFund contract hasn't been changed
      expect(
        await ethers.provider.getBalance(divaDevelopmentFund.address)
      ).to.eq(divaDevelopmentFundEthBalanceBefore);

      // Confirm that unclaimedDepositAmount hasn't been changed
      expect(
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          ethers.constants.AddressZero
        )
      ).to.eq(unclaimedDepositAmountBefore);
    });

    it("Should not change anything if owner calls the `withdraw` function with an empty indices array (ERC20 token scenario)", async function () {
      // ---------
      // Arrange: Get balances
      // ---------
      // Get deposit token balance for contractOwner and DIVADevelopmentFund before deposit
      contractOwnerDepositTokenBalanceBefore =
        await depositTokenInstance.balanceOf(contractOwner.address);
      divaDevelopmentFundDepositTokenBalanceBefore =
        await depositTokenInstance.balanceOf(divaDevelopmentFund.address);

      // Get unclaimedDepositAmount before deposit
      unclaimedDepositAmountBefore =
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          depositTokenInstance.address
        );

      // ---------
      // Act: Owner of DIVA protocol withdraws ERC20 token from DIVADevelopmentFund contract with an empty indices array
      // ---------
      const tx = await divaDevelopmentFund
        .connect(contractOwner)
        .withdraw(depositTokenInstance.address, []);
      const receipt = await tx.wait();

      // ---------
      // Assert: Confirm that balances and relevant storage variables remain unchanged
      // ---------
      // Confirm that it emits a Withdrawn event during withdraw with zero withdrawn amount
      const withdrawnEvent = receipt.events?.find(
        (x: any) => x.event === "Withdrawn"
      );
      expect(withdrawnEvent?.args?.withdrawnBy).to.eq(contractOwner.address);
      expect(withdrawnEvent?.args?.token).to.eq(depositTokenInstance.address);
      expect(withdrawnEvent?.args?.amount).to.eq(0);

      // Confirm that ERC20 token balance of contract owner hasn't been changed
      expect(await depositTokenInstance.balanceOf(contractOwner.address)).to.eq(
        contractOwnerDepositTokenBalanceBefore
      );

      // Confirm that ERC20 token balance of DIVADevelopmentFund contract hasn't been changed
      expect(
        await depositTokenInstance.balanceOf(divaDevelopmentFund.address)
      ).to.eq(divaDevelopmentFundDepositTokenBalanceBefore);

      // Confirm that unclaimedDepositAmount hasn't been changed
      expect(
        await divaDevelopmentFund.getUnclaimedDepositAmount(
          depositTokenInstance.address
        )
      ).to.eq(unclaimedDepositAmountBefore);
    });

    // -------------------------------------------
    // Reverts
    // -------------------------------------------

    it("Reverts if not owner is trying to withdraw - for deposits via `deposit` function", async () => {
      // ---------
      // Act & Assert: Check that withdraw fails
      // ---------
      ethDepositIndex1 = BigNumber.from(0);
      ethDepositIndex2 = BigNumber.from(0);
      await expect(
        divaDevelopmentFund
          .connect(user1)
          .withdraw(ethers.constants.AddressZero, [
            ethDepositIndex1,
            ethDepositIndex2,
          ])
      ).to.be.revertedWith(
        `NotDIVAOwner("${user1.address}", "${contractOwner.address}")`
      );
    });

    it("Reverts if not owner is trying to withdraw - for direct deposit", async () => {
      // ---------
      // Act & Assert: Check that withdraw fails
      // ---------
      await expect(
        divaDevelopmentFund
          .connect(user1)
          .withdrawDirectDeposit(depositTokenInstance.address)
      ).to.be.revertedWith(
        `NotDIVAOwner("${user1.address}", "${contractOwner.address}")`
      );
    });

    it("Reverts if token addresses which are pointed by indices are different", async () => {
      // ---------
      // Act & Assert: Check that withdraw fails
      // ---------
      await expect(
        divaDevelopmentFund
          .connect(contractOwner)
          .withdraw(ethers.constants.AddressZero, [
            ethDepositIndex1,
            erc20DepositIndex1,
          ])
      ).to.be.revertedWith("DifferentTokens()");
    });
  });

  describe("getDepositIndices", async () => {
    let startIndex: number, endIndex: number;
    let depositIndex: number;

    before(async function () {
      // Set `startIndex`
      startIndex = (
        await divaDevelopmentFund.getDepositIndicesLengthForToken(
          ethers.constants.AddressZero
        )
      ).toNumber();

      // Set release period
      const releasePeriodInSeconds = ONE_HOUR; // 1 hour

      // Set ETH amount to deposit
      const user1EthBalanceBefore = await user1.getBalance();
      expect(user1EthBalanceBefore).to.gt(0);
      depositAmount = user1EthBalanceBefore.div(10);

      // Deposit native asset
      const tx = await divaDevelopmentFund
        .connect(user1)
        ["deposit(uint256)"](releasePeriodInSeconds, {
          value: depositAmount,
        });
      const receipt = await tx.wait();
      depositIndex = receipt.events?.find((x: any) => x.event === "Deposited")
        ?.args?.depositIndex;
    });

    it("Should get deposit indices with `endIndex = startIndex + 1`", async () => {
      // ---------
      // Arrange: Set `endIndex`
      // ---------
      endIndex = (
        await divaDevelopmentFund.getDepositIndicesLengthForToken(
          ethers.constants.AddressZero
        )
      ).toNumber();
      expect(endIndex).to.eq(startIndex + 1);

      // ---------
      // Assert: Check that returned values are correct
      // ---------
      // Get indices for native asset
      const indices = await divaDevelopmentFund.getDepositIndices(
        ethers.constants.AddressZero,
        startIndex,
        endIndex
      );
      // Confirm that indices value for native asset is correct
      expect(indices[0]).to.eq(depositIndex);
    });

    it("Should get deposit indices with `endindex` larger than length of indices deposited", async () => {
      // ---------
      // Arrange: Set `endindex` as larger than length of indices
      // ---------
      endIndex =
        (
          await divaDevelopmentFund.getDepositIndicesLengthForToken(
            ethers.constants.AddressZero
          )
        ).toNumber() + 1;

      // ---------
      // Assert: Check that returned values are correct
      // ---------
      // Get indices for native asset
      const indices = await divaDevelopmentFund.getDepositIndices(
        ethers.constants.AddressZero,
        startIndex,
        endIndex
      );
      // Confirm that indices value for native asset is correct
      expect(indices[0]).to.eq(depositIndex);
      expect(indices[1]).to.eq(0);
    });

    it("Should get empty array with `endIndex <= startIndex`", async () => {
      // ---------
      // Arrange: Set start and end index as `endIndex = startIndex - 1`
      // ---------
      startIndex = 1;
      endIndex = startIndex - 1;

      // ---------
      // Assert: Check that params are correct
      // ---------
      // Get indices for native asset
      const indices = await divaDevelopmentFund.getDepositIndices(
        ethers.constants.AddressZero,
        startIndex,
        endIndex
      );
      // Confirm that returned value is an empty array
      expect(indices.length).to.eq(0);
    });
  });
});
