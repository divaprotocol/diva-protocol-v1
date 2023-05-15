import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, BigNumberish } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { mineUpTo, takeSnapshot, time } from "@nomicfoundation/hardhat-network-helpers";

import { 
    GetterFacet,
    GovernanceFacet,
    DIVAToken,
    DIVAOwnershipMain
} from "../typechain-types";

import { deployMain } from "../scripts/deployMain";
import { ONE_DAY } from "../constants";
import { getLastTimestamp } from "../utils";
import { setNextBlockTimestamp } from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time";

describe("DIVAOwnershipMain", async function () {
    let contractOwner: SignerWithAddress,
        user1: SignerWithAddress,
        user2: SignerWithAddress,
        user3: SignerWithAddress,
        candidate: SignerWithAddress;

    let diamondAddress: string;
    let getterFacet: GetterFacet,
        governanceFacet: GovernanceFacet,
        ownershipContract: DIVAOwnershipMain,
        divaToken: DIVAToken;
    let snapshot: any;
    
    let ownershipContractAddress: string;
    let divaTokenAddress: string;
    
    let ownerStake: BigNumber;
    let user2Stake: BigNumber;
    let user3Stake: BigNumber;
    let candidateStake: BigNumber;
    let showdownPeriod: number = 30 * ONE_DAY;
    let showdownPeriodEnd: BigNumberish;
    let submitOwnershipClaimPeriodEnd: BigNumber;
    let lastBlockTimestamp: number;
    let cooldownPeriodEnd: BigNumberish;
    let submitOwnershipClaimPeriod: number = 7 * ONE_DAY;
    let cooldownPeriod: number = 7 * ONE_DAY;
    let minStakingPeriod: number = 7 * ONE_DAY;
    let nextBlockTimestamp: number;
    let amountToUnstake: string;
    let currentOwner: string;

    before(async function () {
        [contractOwner, user1, user2, user3, candidate] = await ethers.getSigners(); // keep contractOwner and treasury at first two positions in line with deploy script

        // ---------
        // Setup: Deploy diamond contract (incl. facets) and connect to the diamond contract via facet specific ABI's
        // ---------
        diamondAddress = (await deployMain())[0];
        getterFacet = await ethers.getContractAt("GetterFacet", diamondAddress);
        governanceFacet = await ethers.getContractAt("GovernanceFacet", diamondAddress);

        // DIVAOwnership and DIVA Token contract deployments are part of the `deployMain()` script
        ownershipContractAddress = await getterFacet.getOwnershipContract();
        ownershipContract = await ethers.getContractAt(
        "DIVAOwnershipMain",
        ownershipContractAddress 
        )

        divaTokenAddress = await ownershipContract.getDIVAToken();
        divaToken = await ethers.getContractAt(
          "DIVAToken",
          divaTokenAddress 
        )
    
        // Approve DIVA token for staking
        await divaToken.connect(contractOwner).approve(ownershipContractAddress, ethers.constants.MaxUint256);
        await divaToken.connect(user2).approve(ownershipContractAddress, ethers.constants.MaxUint256);

        // Transfer half of the DIVA tokens from contract owner to user2
        const divaTokenBalanceContractOwner = await divaToken.balanceOf(contractOwner.address);
        await divaToken.connect(contractOwner).transfer(user2.address, divaTokenBalanceContractOwner.div(2))

        // Put user2 in a position to trigger an election cycle by setting user2 stake > owner stake
        ownerStake = await ownershipContract["getStakedAmount(address)"](
            contractOwner.address // set as the initial owner inside the deploy script
        );
        user2Stake = await ownershipContract["getStakedAmount(address)"](
            user2.address
        );
        if (ownerStake.gte(user2Stake)) {
            await ownershipContract.connect(user2).stake(user2.address, ownerStake.sub(user2Stake).add(1));
        }
        user2Stake = await ownershipContract["getStakedAmount(address)"](
            user2.address
        );
        expect(user2Stake).to.be.gt(ownerStake);

        // Take snapshot after the system has been deployed and user2 has been prepared to trigger an election cycle
        snapshot = await takeSnapshot();
    });

    beforeEach(async () => {
        // Revert back to a state where the system is deployed and user2 is prepared to trigger an election cycle
        await snapshot.restore();
    });

    describe("Initialization", async () => {
        it("Should initialize parameters at contract deployment", async () => {
            // -------------------------------------------
            // Arrange: Define owner and diva token address
            // -------------------------------------------
            const initialOwner = contractOwner.address;
            const initializedDivaTokenAddress = divaTokenAddress;
            
            // -------------------------------------------
            // Act: Deploy Ownership contract
            // -------------------------------------------
            const OwnershipContractTest = await ethers.getContractFactory("DIVAOwnershipMain");
            const ownershipContractTest = await OwnershipContractTest.deploy(
                initialOwner, 
                initializedDivaTokenAddress
            );
            await ownershipContractTest.deployed();

            // -------------------------------------------
            // Assert: Confirm that initial values are as expected
            // -------------------------------------------
            currentOwner = await ownershipContractTest.getCurrentOwner();
            expect(currentOwner).to.eq(initialOwner);
            expect(await getterFacet.getOwner()).to.eq(initialOwner);
            expect(await ownershipContractTest.getDIVAToken()).to.eq(initializedDivaTokenAddress);
            expect(await ownershipContractTest.getShowdownPeriodEnd()).to.eq(0);
            expect(await ownershipContractTest.getSubmitOwnershipClaimPeriodEnd()).to.eq(0);
            expect(await ownershipContractTest.getShowdownPeriod()).to.eq(30 * ONE_DAY);
            expect(await ownershipContractTest.getSubmitOwnershipClaimPeriod()).to.eq(7 * ONE_DAY);
            expect(await ownershipContractTest.getCooldownPeriod()).to.eq(7 * ONE_DAY);
            expect(await ownershipContractTest.getMinStakingPeriod()).to.eq(7 * ONE_DAY);            
        })
    })

    describe("stake", async () => {

        // -------------------------------------------
        // Functionality
        // -------------------------------------------
        
        it("Should allow to stake", async () => {
            // -------------------------------------------
            // Arrange: Set stake amount, staker account and get balances before staking
            // -------------------------------------------
            const stakeAmount = "100";
            const staker = user2; // Could be any other address
            const divaTokenBalanceStakerBefore = await divaToken.balanceOf(staker.address);
            const divaTokenBalanceOwnershipContractBefore = await divaToken.balanceOf(ownershipContractAddress);

            // -------------------------------------------
            // Act: Stake
            // -------------------------------------------
            await ownershipContract.connect(staker).stake(candidate.address, stakeAmount);

            // -------------------------------------------
            // Assert: Check that relevant state variables and balances have been updated
            // -------------------------------------------
            // Storage variables are as expected
            expect(await ownershipContract["getStakedAmount(address,address)"](
                staker.address,
                candidate.address
            )).to.eq(stakeAmount);
            expect(await ownershipContract["getStakedAmount(address)"](
                candidate.address
            )).to.eq(stakeAmount);
            
            // DIVA Token balances are as expected
            const divaTokenBalanceStakerAfter = await divaToken.balanceOf(staker.address);
            const divaTokenBalanceOwnershipContractAfter = await divaToken.balanceOf(ownershipContractAddress);
            expect(divaTokenBalanceStakerAfter).to.eq(divaTokenBalanceStakerBefore.sub(stakeAmount))
            expect(divaTokenBalanceOwnershipContractAfter).to.eq(divaTokenBalanceOwnershipContractBefore.add(stakeAmount))
        })

        it("Should allow two different users to stake for a candidate", async () => {
            // -------------------------------------------
            // Arrange: Set stake amounts, set staker accounts, get current stakes and balances before staking
            // -------------------------------------------            
            // Setup
            const stakeAmount1 = "90";
            const stakeAmount2 = "80";
            const staker1 = contractOwner; // Could be any other address
            const staker2 = user2; // Could be any other address
            
            // Get current stakes
            const currentStakeStaker1ToCandidate = await ownershipContract["getStakedAmount(address,address)"](
                staker1.address,
                candidate.address
            )
            const currentStakeStaker2ToCandidate = await ownershipContract["getStakedAmount(address,address)"](
                staker2.address,
                candidate.address
            )

            const currentStakeCandidate = await ownershipContract["getStakedAmount(address)"](
                candidate.address
            )
            
            // Get current DIVA token balances
            const divaTokenBalanceStaker1Before = await divaToken.balanceOf(staker1.address);
            const divaTokenBalanceStaker2Before = await divaToken.balanceOf(staker2.address);
            const divaTokenBalanceOwnershipContractBefore = await divaToken.balanceOf(ownershipContractAddress);

            // -------------------------------------------
            // Act: Stake
            // -------------------------------------------
            await ownershipContract.connect(staker1).stake(candidate.address, stakeAmount1);
            await ownershipContract.connect(staker2).stake(candidate.address, stakeAmount2);

            // -------------------------------------------
            // Assert: Check that relevant state variables and balances have been updated
            // -------------------------------------------
            // Storage variables are as expected
            expect(await ownershipContract["getStakedAmount(address,address)"](
                staker1.address,
                candidate.address
            )).to.eq(currentStakeStaker1ToCandidate.add(stakeAmount1))
            expect(await ownershipContract["getStakedAmount(address,address)"](
                staker2.address,
                candidate.address
            )).to.eq(currentStakeStaker2ToCandidate.add(stakeAmount2))
            expect(await ownershipContract["getStakedAmount(address)"](
                candidate.address
            )).to.eq(currentStakeCandidate.add(stakeAmount1).add(stakeAmount2))

            // DIVA Token balances are as expected
            const divaTokenBalanceStaker1After = await divaToken.balanceOf(staker1.address);
            const divaTokenBalanceStaker2After = await divaToken.balanceOf(staker2.address);
            const divaTokenBalanceOwnershipContractAfter = await divaToken.balanceOf(ownershipContractAddress);
            expect(divaTokenBalanceStaker1After).to.eq(divaTokenBalanceStaker1Before.sub(stakeAmount1))
            expect(divaTokenBalanceStaker2After).to.eq(divaTokenBalanceStaker2Before.sub(stakeAmount2))
            expect(divaTokenBalanceOwnershipContractAfter).to.eq(divaTokenBalanceOwnershipContractBefore.add(stakeAmount1).add(stakeAmount2))
        })

        it("Should allow to stake during showdown period", async () => {
            // -------------------------------------------
            // Arrange: Trigger election cycle
            // -------------------------------------------            
            await ownershipContract.connect(user2).triggerElectionCycle();
                        
            // -------------------------------------------
            // Act: Stake (existing owner increases stake for themselves)
            // -------------------------------------------
            await ownershipContract.connect(contractOwner).stake(contractOwner.address, "1");
            
            // Confirm that call was within the showdown period
            lastBlockTimestamp = await time.latest();
            expect(lastBlockTimestamp).to.be.lte(await ownershipContract.getShowdownPeriodEnd())

            // -------------------------------------------
            // Assert: Confirm that staking was successful by checking only one getStakedAmount function
            // as more detailed checks have been done in previous tests
            // -------------------------------------------
            expect(await ownershipContract["getStakedAmount(address)"](
                contractOwner.address
            )).to.eq(ownerStake.add(ownerStake.add(1)));
        })

        it("Should allow to stake during cooldown period", async () => {
            // -------------------------------------------
            // Arrange: Trigger election cycle and set the next block's timestamp within the cooldown period
            // -------------------------------------------            
            // Trigger election cycle
            await ownershipContract.connect(user2).triggerElectionCycle();

            // Set next block's timestamp within the cooldown period
            cooldownPeriodEnd = await ownershipContract.getCooldownPeriodEnd();
            nextBlockTimestamp = cooldownPeriodEnd.sub(1).toNumber();
            await time.setNextBlockTimestamp(nextBlockTimestamp);

            // -------------------------------------------
            // Act: Stake (existing owner increases stake for themselves)
            // -------------------------------------------
            await ownershipContract.connect(contractOwner).stake(contractOwner.address, "1");
            
            // Confirm that call was within the cooldown period
            lastBlockTimestamp = await time.latest();
            expect(lastBlockTimestamp).to.be.lte(await ownershipContract.getCooldownPeriodEnd())

            // -------------------------------------------
            // Assert: Confirm that staking was successful by checking only one getStakedAmount function
            // as more detailed checks have been done in previous tests
            // -------------------------------------------
            expect(await ownershipContract["getStakedAmount(address)"](
                contractOwner.address
            )).to.eq(ownerStake.add(ownerStake.add(1)));
        })

        // -------------------------------------------
        // Events
        // -------------------------------------------
    
        it("Emits a `Staked` event", async () => {
            // -------------------------------------------
            // Act: Stake
            // -------------------------------------------
            const tx = await ownershipContract.connect(contractOwner).stake(contractOwner.address, "1");
            const receipt = await tx.wait();
            
            // -------------------------------------------
            // Assert: Check event output
            // -------------------------------------------
            const stakedEvent = receipt.events?.find(
                (item: any) => item.event === "Staked"
              );
            expect(stakedEvent?.args?.by).to.eq(contractOwner.address);
            expect(stakedEvent?.args?.candidate).to.eq(contractOwner.address);
            expect(stakedEvent?.args?.amount).to.eq("1");
        })

        // -------------------------------------------
        // Reverts
        // -------------------------------------------

        it("Reverts if user tries to stake during the ownership claim submission period", async () => {
            // -------------------------------------------
            // Arrange: Trigger new election cycle
            // -------------------------------------------
            await ownershipContract.connect(user2).triggerElectionCycle();

            // Fast forward into ownership claim submission period
            showdownPeriodEnd = await ownershipContract.getShowdownPeriodEnd();
            nextBlockTimestamp = showdownPeriodEnd.add(1).toNumber();
            await time.setNextBlockTimestamp(nextBlockTimestamp);

            // -------------------------------------------
            // Act & Assert: Check that the stake operation reverts
            // -------------------------------------------
            await expect(
                ownershipContract.connect(contractOwner).stake(
                    contractOwner.address,
                    "1"
                )).to.be.revertedWith(`WithinSubmitOwnershipClaimPeriod(${nextBlockTimestamp}, ${showdownPeriodEnd.add(submitOwnershipClaimPeriod)})`);
        })
    })

    describe("triggerElectionCycle", async () => {

        // -------------------------------------------
        // Functionality
        // -------------------------------------------
        
        it("Updates the relevant period end dates", async () => {
            // -------------------------------------------
            // Arrange: Get current end dates
            // -------------------------------------------
            const currentShowdownPeriodEnd = await ownershipContract.getShowdownPeriodEnd();
            const currentSubmitOwnershipClaimPeriodEnd = await ownershipContract.getSubmitOwnershipClaimPeriodEnd();            
            const currentCooldownPeriodEnd = await ownershipContract.getCooldownPeriodEnd();            
            
            // -------------------------------------------
            // Act: Trigger election cycle
            // -------------------------------------------
            await ownershipContract.connect(user2).triggerElectionCycle();

            // -------------------------------------------
            // Assert: Confirm that end dates have been updated correctly
            // -------------------------------------------
            const newShowdownPeriodEnd = await ownershipContract.getShowdownPeriodEnd();
            const newSubmitOwnershipClaim = await ownershipContract.getSubmitOwnershipClaimPeriodEnd();
            const newCooldownPeriodEnd = await ownershipContract.getCooldownPeriodEnd(); 
            expect(newShowdownPeriodEnd).to.be.gt(currentShowdownPeriodEnd);
            expect(newSubmitOwnershipClaim).to.be.gt(currentSubmitOwnershipClaimPeriodEnd);
            expect(newCooldownPeriodEnd).to.be.gt(currentCooldownPeriodEnd);

            lastBlockTimestamp = await time.latest();
            expect(newShowdownPeriodEnd).to.be.eq(lastBlockTimestamp + showdownPeriod);
            expect(newSubmitOwnershipClaim).to.be.eq(newShowdownPeriodEnd.add(submitOwnershipClaimPeriod));
            expect(newCooldownPeriodEnd).to.be.eq(newSubmitOwnershipClaim.add(cooldownPeriod));
        })

        // -------------------------------------------
        // Events
        // -------------------------------------------
    
        it("Emits an `ElectionCycleTriggered` event", async () => {
            // -------------------------------------------
            // Act: Trigger election cycle
            // -------------------------------------------
            const tx = await ownershipContract.connect(user2).triggerElectionCycle();
            const receipt = await tx.wait();
            lastBlockTimestamp = await time.latest();

            // -------------------------------------------
            // Assert: Check event output
            // -------------------------------------------
            const electionCycleTriggeredEvent = receipt.events?.find(
                (item: any) => item.event === "ElectionCycleTriggered"
              );
            expect(electionCycleTriggeredEvent?.args?.candidate).to.eq(user2.address);
            expect(electionCycleTriggeredEvent?.args?.startTime).to.eq(lastBlockTimestamp);
        })

        // -------------------------------------------
        // Reverts
        // -------------------------------------------

        it("Reverts if triggered during an on-going election cycle", async () => {
            // -------------------------------------------
            // Arrange: Trigger election cycle and fast forward shortly before the end
            // -------------------------------------------
            await ownershipContract.connect(user2).triggerElectionCycle();

            // Fast forward towards the end of the ownership claim submission period
            submitOwnershipClaimPeriodEnd = await ownershipContract.getSubmitOwnershipClaimPeriodEnd();
            nextBlockTimestamp = submitOwnershipClaimPeriodEnd.sub(1).toNumber();
            await time.setNextBlockTimestamp(nextBlockTimestamp);

            // -------------------------------------------
            // Act & Assert: Check that the triggerElectionCycle operation reverts
            // -------------------------------------------
            await expect(
                ownershipContract.connect(user2).triggerElectionCycle(
                )).to.be.revertedWith(`WithinElectionCycle(${nextBlockTimestamp}, ${submitOwnershipClaimPeriodEnd})`);
        })

        it("Reverts if triggered during the cooldown period", async () => {
            // -------------------------------------------
            // Arrange: Trigger election cycle and fast forward into the cooldown period
            // -------------------------------------------
            await ownershipContract.connect(user2).triggerElectionCycle();

            // Fast forward towards the end of the ownership claim submission period
            submitOwnershipClaimPeriodEnd = await ownershipContract.getSubmitOwnershipClaimPeriodEnd();
            cooldownPeriodEnd = await ownershipContract.getCooldownPeriodEnd();
            nextBlockTimestamp = submitOwnershipClaimPeriodEnd.add(1).toNumber();
            await time.setNextBlockTimestamp(nextBlockTimestamp);

            // -------------------------------------------
            // Act & Assert: Check that the triggerElectionCycle operation reverts
            // -------------------------------------------
            await expect(
                ownershipContract.connect(user2).triggerElectionCycle(
                )).to.be.revertedWith(`WithinCooldownPeriod(${nextBlockTimestamp}, ${cooldownPeriodEnd})`);
        })

        it("Reverts if `msg.sender` has less stake than current owner", async () => {
            // -------------------------------------------
            // Arrange: Ensure that user3 (`msg.sender` in test description) has less stake than the current owner
            // -------------------------------------------
            ownerStake = await ownershipContract["getStakedAmount(address)"](
                contractOwner.address
            );
            user3Stake = await ownershipContract["getStakedAmount(address)"](
                user3.address
            );
            if (user3Stake.gte(ownerStake)) {
                await ownershipContract.connect(contractOwner).stake(contractOwner.address, user3Stake.sub(ownerStake).add(1));
            }
            ownerStake = await ownershipContract["getStakedAmount(address)"](
                contractOwner.address
            );
            expect(user3Stake).to.be.lt(ownerStake),
            
            // -------------------------------------------
            // Act & Assert: Check that the triggerElectionCycle operation fails
            // -------------------------------------------
            await expect(
                ownershipContract.connect(user3).triggerElectionCycle()
                ).to.be.revertedWith("InsufficientStakingSupport()");
        })

        it("Reverts if `msg.sender` has an equal amount of stake than current owner", async () => {
            // -------------------------------------------
            // Arrange: Increase owner's stake to match user2's stake (latter is greater, see beforeEach block)
            // -------------------------------------------
            ownerStake = await ownershipContract["getStakedAmount(address)"](
                contractOwner.address
            );
            user2Stake = await ownershipContract["getStakedAmount(address)"](
                user2.address
            );
            if (user2Stake.gt(ownerStake)) {
                await ownershipContract.connect(contractOwner).stake(contractOwner.address, user2Stake.sub(ownerStake));
            }
            ownerStake = await ownershipContract["getStakedAmount(address)"](
                user2.address
            );
            expect(ownerStake).to.eq(user2Stake)   
            
            // -------------------------------------------
            // Act & Assert: Check that the triggerElectionCycle operation fails
            // -------------------------------------------
            await expect(
                ownershipContract.connect(user3).triggerElectionCycle()
                ).to.be.revertedWith("InsufficientStakingSupport()");
        })
    })

    describe("submitOwnershipClaim", async () => {

        beforeEach(async function () {
            // Works because moved outside of cooldown period inside overarching `beforeEach` block
            await ownershipContract.connect(user2).triggerElectionCycle();
        });

        // -------------------------------------------
        // Functionality
        // -------------------------------------------

        it("Should set user2 as the new owner and allow to execute the `updateTreasury` governance function", async () => {
            // -------------------------------------------
            // Arrange: Confirm that user2 is not current owner and fast forward to beginning of ownership claim 
            // submission period (election cycle is already triggered inside `beforeEach` block)
            // -------------------------------------------
            expect(await getterFacet.getOwner()).to.not.eq(user2.address);
            showdownPeriodEnd = await ownershipContract.getShowdownPeriodEnd();
            nextBlockTimestamp = showdownPeriodEnd.add(1).toNumber();
            await time.setNextBlockTimestamp(nextBlockTimestamp);

            // -------------------------------------------
            // Act: User2 submits ownership claim and becomes new owner after election cycle end
            // -------------------------------------------
            ownerStake = await ownershipContract["getStakedAmount(address)"](
                contractOwner.address
            );
            user2Stake = await ownershipContract["getStakedAmount(address)"](
                user2.address
            );
            expect(user2Stake).to.be.gt(ownerStake)
            await ownershipContract.connect(user2).submitOwnershipClaim();

            // Fast forward after the end of the election cycle
            submitOwnershipClaimPeriodEnd = await ownershipContract.getSubmitOwnershipClaimPeriodEnd();
            
            // Mine a block with the new timestamp as running a getter function will not update the block timestamp
            await mineUpTo(submitOwnershipClaimPeriodEnd.add(1).toNumber());

            // -------------------------------------------
            // Assert: Confirm that user2 is set to new owner and that user2 can execute a 
            // governance function after the end of the election cycle 
            // -------------------------------------------
            currentOwner = await ownershipContract.getCurrentOwner();
            expect(await getterFacet.getOwner()).to.eq(user2.address);
            expect(currentOwner).to.eq(user2.address);

            // Confirm that user2 can update the treasury address
            
            // Prepare inputs for `updateTreasury` function call
            const newTreasuryAddress = user2.address;
            const govParamsBefore = await getterFacet.getGovernanceParameters();
            expect(govParamsBefore.treasury).to.not.eq(newTreasuryAddress);
            
            // Update treasury address
            await governanceFacet.connect(user2).updateTreasury(newTreasuryAddress);
            
            // Fast forward in time to activate the new treasury address
            const treasuryInfo = await getterFacet.getTreasuryInfo();
            await mineUpTo(treasuryInfo.startTimeTreasury);

            expect(await (await getterFacet.getGovernanceParameters()).treasury).to.eq(newTreasuryAddress);

            // Note: contractOwner is reset in afterEach block
        })

        // -------------------------------------------
        // Events
        // -------------------------------------------
    
        it("Emits an `OwnershipClaimSubmitted` event", async () => {
            // -------------------------------------------
            // Arrange: Confirm that user2 is not current contract owner and fast forward to the beginning
            // of the ownership claim submission period
            // -------------------------------------------
            expect(await getterFacet.getOwner()).to.eq(contractOwner.address);

            // Fast forward into ownership claim submission period
            showdownPeriodEnd = await ownershipContract.getShowdownPeriodEnd();
            nextBlockTimestamp = showdownPeriodEnd.add(1).toNumber();
            await time.setNextBlockTimestamp(nextBlockTimestamp);

            // -------------------------------------------
            // Arrange: User2 submits ownership claim
            // -------------------------------------------
            const tx = await ownershipContract.connect(user2).submitOwnershipClaim();
            const receipt = await tx.wait();

            // -------------------------------------------
            // Assert: Check event output
            // -------------------------------------------
            const ownershipClaimSubmittedEvent = receipt.events?.find(
                (item: any) => item.event === "OwnershipClaimSubmitted"
              );
            expect(ownershipClaimSubmittedEvent?.args?.candidate).to.eq(user2.address);
        })

        // -------------------------------------------
        // Reverts
        // -------------------------------------------

        it("Reverts if called BEFORE or AFTER the ownership claim submission period", async () => {
            // -------------------------------------------
            // Arrange: Fast forward shortly before beginning of ownership claim submission period
            // -------------------------------------------
            showdownPeriodEnd = await ownershipContract.getShowdownPeriodEnd();
            nextBlockTimestamp = showdownPeriodEnd.sub(1).toNumber();
            await time.setNextBlockTimestamp(nextBlockTimestamp);

            // -------------------------------------------
            // Act & Assert: Check that the submitOwnershipClaim operation reverts
            // -------------------------------------------
            await expect(
                ownershipContract.connect(user2).submitOwnershipClaim(
                )).to.be.revertedWith("NotWithinSubmitOwnershipClaimPeriod()");
            
            // -------------------------------------------
            // Arrange: Fast forward shortly after ownership claim submission period end
            // -------------------------------------------
            submitOwnershipClaimPeriodEnd = await ownershipContract.getSubmitOwnershipClaimPeriodEnd();
            nextBlockTimestamp = submitOwnershipClaimPeriodEnd.add(1).toNumber();
            await time.setNextBlockTimestamp(nextBlockTimestamp);

            // -------------------------------------------
            // Act & Assert: Check that the submitOwnershipClaim operation fails
            // -------------------------------------------
            await expect(
                ownershipContract.connect(user2).submitOwnershipClaim()
                ).to.be.revertedWith("NotWithinSubmitOwnershipClaimPeriod()");            
        })

        it("Reverts if `msg.sender` has less stake than current leading candidate", async () => {
            // -------------------------------------------
            // Arrange: Fast forward into ownership claim submission period and render user2 the leading candidate
            // -------------------------------------------
            showdownPeriodEnd = await ownershipContract.getShowdownPeriodEnd();
            nextBlockTimestamp = showdownPeriodEnd.add(1).toNumber();
            await time.setNextBlockTimestamp(nextBlockTimestamp);

            await ownershipContract.connect(user2).submitOwnershipClaim();

            // -------------------------------------------
            // Act & Assert: Check that the submitOwnershipClaim operation fails
            // -------------------------------------------
            await expect(
                ownershipContract.connect(contractOwner).submitOwnershipClaim()
                ).to.be.revertedWith("NotLeader()");
        })

        it("Reverts if `msg.sender`'s has equal stake as current leading candidate", async () => {
            // -------------------------------------------
            // Arrange: Set candidate's stake equal to user2's stake, fast forward into ownership claim submission period
            // and render user2 the leading candidate
            // -------------------------------------------
            // Set candidate's stake equal to user2's stake
            candidateStake = await ownershipContract["getStakedAmount(address)"](
                candidate.address
            );
            user2Stake = await ownershipContract["getStakedAmount(address)"](
                user2.address
            );
            if (user2Stake.gt(candidateStake)) {
                await ownershipContract.connect(contractOwner).stake(candidate.address, user2Stake.sub(candidateStake));
            } else {
                await ownershipContract.connect(user2).stake(user2.address, candidateStake.sub(user2Stake));
            }
            candidateStake = await ownershipContract["getStakedAmount(address)"](
                candidate.address
            );
            user2Stake = await ownershipContract["getStakedAmount(address)"](
                user2.address
            );
            expect(candidateStake).to.eq(user2Stake);
            
            // Fast forward into ownership claim submission period
            showdownPeriodEnd = await ownershipContract.getShowdownPeriodEnd();
            nextBlockTimestamp = showdownPeriodEnd.add(1).toNumber();
            await time.setNextBlockTimestamp(nextBlockTimestamp);

            // Render user2 the leading candidate
            await ownershipContract.connect(user2).submitOwnershipClaim();

            // -------------------------------------------
            // Act & Assert: Check that the submitOwnershipClaim operation fails
            // -------------------------------------------
            await expect(
                ownershipContract.connect(candidate).submitOwnershipClaim()
                ).to.be.revertedWith("NotLeader()");
        })
    })

    describe("unstake", async () => {
       
        beforeEach(async function () {
            // Stake for user 2
            await ownershipContract.connect(user2).stake(user2.address, 1);

            // Skip minimum staking period
            const minStakePeriodEnd = (
                await ownershipContract.getTimestampLastStakedForCandidate(user2.address, user2.address)
            )
                .add(minStakingPeriod).toNumber();
            await mineUpTo(minStakePeriodEnd);
            
            // Confirm that user2's stake > owner's stake so that user2 can trigger an election cycle
            // during tests
            ownerStake = await ownershipContract["getStakedAmount(address)"](
                contractOwner.address
            )
            user2Stake = await ownershipContract["getStakedAmount(address)"](
                user2.address
            )
            expect(user2Stake).to.be.gt(ownerStake);
        });

        // -------------------------------------------
        // Functionality
        // -------------------------------------------
        
        it("Should allow to unstake", async () => {
            // -------------------------------------------
            // Arrange: Stake for candidate with user2 and obtain all relevant stakes and balances before unstaking
            // -------------------------------------------
            // Stake for candidate with user2
            await ownershipContract.connect(user2).stake(candidate.address, 1);

            // Get user2's current stake for candidate
            const user2ToCandidateStake = await ownershipContract["getStakedAmount(address,address)"](
                user2.address,
                candidate.address
            )
            expect(user2ToCandidateStake).to.be.gt(0)

            // Get candidate's current aggregate stake
            const candidateStake = await ownershipContract["getStakedAmount(address)"](
                candidate.address
            )
            expect(candidateStake).to.be.gt(0)

            // Fast forward in time to respect the 7 day minimum staking period
            const timestampLastStake =
                await ownershipContract.getTimestampLastStakedForCandidate(user2.address, candidate.address); // @todo check whether user2.address as candidate is correct here
            nextBlockTimestamp = timestampLastStake.add(minStakingPeriod + 1).toNumber();
            await time.setNextBlockTimestamp(nextBlockTimestamp);
            
            // Get DIVA token balances before unstaking
            const divaTokenBalanceUser2Before = await divaToken.balanceOf(user2.address);
            const divaTokenBalanceOwnershipContractBefore = await divaToken.balanceOf(ownershipContractAddress);
            
            // -------------------------------------------
            // Act: Unstake
            // -------------------------------------------
            await ownershipContract.connect(user2).unstake(candidate.address, "1");

            // -------------------------------------------
            // Assert: Check that relevant state variables and balances have been updated
            // -------------------------------------------
            // Storage variables are as expected
            expect(await ownershipContract["getStakedAmount(address,address)"](
                user2.address,
                candidate.address
            )).to.eq(user2ToCandidateStake.sub(1));
            expect(await ownershipContract["getStakedAmount(address)"](
                candidate.address
            )).to.eq(candidateStake.sub(1));

            // DIVA Token balances are as expected
            const divaTokenBalanceStakerAfter = await divaToken.balanceOf(user2.address);
            const divaTokenBalanceOwnershipContractAfter = await divaToken.balanceOf(ownershipContractAddress);
            expect(divaTokenBalanceStakerAfter).to.eq(divaTokenBalanceUser2Before.add(1))
            expect(divaTokenBalanceOwnershipContractAfter).to.eq(divaTokenBalanceOwnershipContractBefore.sub(1))                    
        })

        it("Should allow to unstake the first stake after 7 days if staked for two different candidates", async () => {
            // -------------------------------------------
            // Arrange 1: Stake for two different candidates with user2 and obtain all relevant stakes
            // and balances before unstaking
            // -------------------------------------------
            // Specify two different candidates
            const firstCandidate = candidate;
            const secondCandidate = user3;
            expect(firstCandidate.address).to.not.eq(secondCandidate.address);

            // Stake for first candidate with user2 and get the timestamp
            await ownershipContract.connect(user2).stake(firstCandidate.address, 1);
            const timestampLastStakedForFirstCandidate =
                await ownershipContract.getTimestampLastStakedForCandidate(user2.address, firstCandidate.address);

            // Stake for second candidate with user2 three days later and get the timestamp
            nextBlockTimestamp = await getLastTimestamp() + 86400*3;
            await time.setNextBlockTimestamp(nextBlockTimestamp);
            await ownershipContract.connect(user2).stake(secondCandidate.address, 1);
            const timestampLastStakedForSecondCandidate =
                await ownershipContract.getTimestampLastStakedForCandidate(user2.address, secondCandidate.address);

            // Confirm that the last staked timestamp for the first candidate was unaffected by the stake
            // operation for the second candidate
            expect(
                await ownershipContract.getTimestampLastStakedForCandidate(user2.address, firstCandidate.address)
            ).to.eq(timestampLastStakedForFirstCandidate);

            // Get user2's current stake for first candidate
            const user2ToFirstCandidateStake = await ownershipContract["getStakedAmount(address,address)"](
                user2.address,
                firstCandidate.address
            )
            expect(user2ToFirstCandidateStake).to.be.gt(0)

            // Get user2's current stake for second candidate
            const user2ToSecondCandidateStake = await ownershipContract["getStakedAmount(address,address)"](
                user2.address,
                secondCandidate.address
            )
            expect(user2ToSecondCandidateStake).to.be.gt(0)

            // Get first candidate's current aggregate stake
            const firstCandidateStake = await ownershipContract["getStakedAmount(address)"](
                firstCandidate.address
            )
            expect(firstCandidateStake).to.be.gt(0)

            // Get second candidate's current aggregate stake
            const secondCandidateStake = await ownershipContract["getStakedAmount(address)"](
                secondCandidate.address
            )
            expect(secondCandidateStake).to.be.gt(0)
           
            // Get DIVA token balances before unstaking
            const divaTokenBalanceUser2Before = await divaToken.balanceOf(user2.address);
            const divaTokenBalanceOwnershipContractBefore = await divaToken.balanceOf(ownershipContractAddress);

            // Fast forward in time to respect the 7 day minimum staking period after the first candidate stake
            nextBlockTimestamp = timestampLastStakedForFirstCandidate.add(minStakingPeriod + 1).toNumber();
            await time.setNextBlockTimestamp(nextBlockTimestamp);
            
            // -------------------------------------------
            // Act 1: Unstake first candidate stake
            // -------------------------------------------
            await ownershipContract.connect(user2).unstake(firstCandidate.address, "1");

            // -------------------------------------------
            // Assert 1: Check that relevant state variables and balances have been updated correctly
            // -------------------------------------------
            // Storage variables are as expected
            expect(await ownershipContract["getStakedAmount(address,address)"](
                user2.address,
                firstCandidate.address
            )).to.eq(user2ToFirstCandidateStake.sub(1));
            expect(await ownershipContract["getStakedAmount(address)"](
                firstCandidate.address
            )).to.eq(firstCandidateStake.sub(1));

            // DIVA Token balances are as expected
            const divaTokenBalanceStakerAfterFirstUnstake = await divaToken.balanceOf(user2.address);
            const divaTokenBalanceOwnershipContractAfterFirstUnstake = await divaToken.balanceOf(ownershipContractAddress);
            expect(divaTokenBalanceStakerAfterFirstUnstake).to.eq(divaTokenBalanceUser2Before.add(1))
            expect(divaTokenBalanceOwnershipContractAfterFirstUnstake).to.eq(divaTokenBalanceOwnershipContractBefore.sub(1));

            // Define next block timestamp so we know the `MinStakingPeriodNotExpired` in the following revert
            nextBlockTimestamp = (await getLastTimestamp()) + 1;
            await time.setNextBlockTimestamp(nextBlockTimestamp);
            expect(nextBlockTimestamp).to.be.lt(timestampLastStakedForSecondCandidate.add(minStakingPeriod));

            // -------------------------------------------
            // Act & Assert 2: Confirm that unstake operation for second candidate will fail because
            // the 7 days minimum waiting period haven't passed since second stake
            // -------------------------------------------
            await expect(
                ownershipContract.connect(user2).unstake(
                    secondCandidate.address,
                    "1"
                )).to.be.revertedWith(`MinStakingPeriodNotExpired(${nextBlockTimestamp}, ${timestampLastStakedForSecondCandidate.add(minStakingPeriod)})`
            );

            // -------------------------------------------
            // Arrange 3: Fast forward in time to respect the 7 day minimum staking period after the second candidate stake
            // -------------------------------------------   
            nextBlockTimestamp = timestampLastStakedForSecondCandidate.add(minStakingPeriod + 1).toNumber();
            await time.setNextBlockTimestamp(nextBlockTimestamp);

            // -------------------------------------------
            // Act 3: Unstake for second candidate
            // -------------------------------------------   
            await ownershipContract.connect(user2).unstake(secondCandidate.address, "1");

            // -------------------------------------------
            // Assert 3: Check that relevant state variables and balances have been updated correctly
            // -------------------------------------------
            // Storage variables are as expected
            expect(await ownershipContract["getStakedAmount(address,address)"](
                user2.address,
                secondCandidate.address
            )).to.eq(user2ToSecondCandidateStake.sub(1));
            expect(await ownershipContract["getStakedAmount(address)"](
                secondCandidate.address
            )).to.eq(secondCandidateStake.sub(1));

            // DIVA Token balances are as expected
            const divaTokenBalanceStakerAfterSecondUnstake = await divaToken.balanceOf(user2.address);
            const divaTokenBalanceOwnershipContractAfterSecondUnstake = await divaToken.balanceOf(ownershipContractAddress);
            expect(divaTokenBalanceStakerAfterSecondUnstake).to.eq(divaTokenBalanceStakerAfterFirstUnstake.add(1))
            expect(divaTokenBalanceOwnershipContractAfterSecondUnstake).to.eq(divaTokenBalanceOwnershipContractAfterFirstUnstake.sub(1));
        })
        
        it("Should allow to unstake during showdown period", async () => {
            // -------------------------------------------
            // Arrange: Set amount to unstake, get user2's stake and trigger election cycle
            // -------------------------------------------
            amountToUnstake = "1";
            user2Stake = await ownershipContract["getStakedAmount(address)"](
                user2.address
            )
            expect(user2Stake).to.be.gte(amountToUnstake);

            // Trigger election cycle
            await ownershipContract.connect(user2).triggerElectionCycle();
                        
            // -------------------------------------------
            // Act: Unstake during showdown period
            // -------------------------------------------
            await ownershipContract.connect(user2).unstake(user2.address, amountToUnstake);

            // Confirm that call was within the showdown period
            lastBlockTimestamp = await time.latest();
            expect(lastBlockTimestamp).to.be.lte(await ownershipContract.getShowdownPeriodEnd())
            
            // -------------------------------------------
            // Assert: Confirm that unstaking was successful by checking only one getStakedAmount function
            // as more detailed checks have been done in previous tests
            // -------------------------------------------
            expect(await ownershipContract["getStakedAmount(address)"](
                user2.address
            )).to.eq(user2Stake.sub(amountToUnstake));
        })

        it("Should allow to unstake during cooldown period", async () => {
            // -------------------------------------------
            // Arrange: Set amount to unstake, get user2's stake, trigger election cycle and
            // fast forward inside the cooldown period
            // -------------------------------------------                        
            amountToUnstake = "1";
            user2Stake = await ownershipContract["getStakedAmount(address)"](
                user2.address
            )
            expect(user2Stake).to.be.gt(amountToUnstake);

            // Trigger election cycle
            await ownershipContract.connect(user2).triggerElectionCycle();

            // Set next block's timestamp within the cooldown period
            cooldownPeriodEnd = await ownershipContract.getCooldownPeriodEnd();
            nextBlockTimestamp = cooldownPeriodEnd.sub(1).toNumber();
            await time.setNextBlockTimestamp(nextBlockTimestamp);

            // -------------------------------------------
            // Act: Unstake during cooldown period
            // -------------------------------------------
            await ownershipContract.connect(user2).unstake(user2.address, amountToUnstake);

            // Confirm that call was within the cooldown period
            lastBlockTimestamp = await time.latest();
            expect(lastBlockTimestamp).to.be.lte(await ownershipContract.getCooldownPeriodEnd())
            
            // -------------------------------------------
            // Assert: Confirm that unstaking was successful by checking only one getStakedAmount function
            // as more detailed checks have been done in previous tests
            // -------------------------------------------
            expect(await ownershipContract["getStakedAmount(address)"](
                user2.address
            )).to.eq(user2Stake.sub(amountToUnstake));
        })

        it("Should only allow to unstake the first stake 7 days after second stake if staked for the same candidates", async () => {
            // -------------------------------------------
            // Arrange 1: Stake for the same candidate twice with user2 and obtain all relevant stakes
            // and balances before unstaking
            // -------------------------------------------
            // Stake for candidate with user2 and get the timestamp
            await ownershipContract.connect(user2).stake(candidate.address, 1);
            const timestampFirstStake =
                await ownershipContract.getTimestampLastStakedForCandidate(user2.address, candidate.address);

            // Stake for same candidate again with user2 three days later and get the timestamp
            nextBlockTimestamp = await getLastTimestamp() + 86400*3;
            await time.setNextBlockTimestamp(nextBlockTimestamp);
            await ownershipContract.connect(user2).stake(candidate.address, 1);
            const timestampSecondStake =
                await ownershipContract.getTimestampLastStakedForCandidate(user2.address, candidate.address);

            // Get user2's current stake for candidate
            const user2ToCandidateStake = await ownershipContract["getStakedAmount(address,address)"](
                user2.address,
                candidate.address
            )
            expect(user2ToCandidateStake).to.be.gt(0)

            // Get candidate's current aggregate stake
            const candidateStake = await ownershipContract["getStakedAmount(address)"](
                candidate.address
            )
            expect(candidateStake).to.be.gt(0)

            // Get DIVA token balances before unstaking
            const divaTokenBalanceUser2Before = await divaToken.balanceOf(user2.address);
            const divaTokenBalanceOwnershipContractBefore = await divaToken.balanceOf(ownershipContractAddress);

            // Fast forward in time 7 days after the first stake
            nextBlockTimestamp = timestampFirstStake.add(minStakingPeriod + 1).toNumber();
            await time.setNextBlockTimestamp(nextBlockTimestamp);
                        
            // -------------------------------------------
            // Act & Assert 1: Confirm that unstake reverts because the timestamp was overwritten by the second stake
            // -------------------------------------------
            await expect(
                ownershipContract.connect(user2).unstake(
                    candidate.address,
                    "1"
                )).to.be.revertedWith(`MinStakingPeriodNotExpired(${nextBlockTimestamp}, ${timestampSecondStake.add(minStakingPeriod)})`
            );

            // -------------------------------------------
            // Arrange 2: Fast forward in time 7 days after the second stake
            // -------------------------------------------
            nextBlockTimestamp = timestampSecondStake.add(minStakingPeriod + 1).toNumber();
            await time.setNextBlockTimestamp(nextBlockTimestamp);

            // -------------------------------------------
            // Act 2: Unstake
            // -------------------------------------------
            await ownershipContract.connect(user2).unstake(candidate.address, "2");

            // -------------------------------------------
            // Assert 2: Check that relevant state variables and balances have been updated correctly
            // -------------------------------------------
            // Storage variables are as expected
            expect(await ownershipContract["getStakedAmount(address,address)"](
                user2.address,
                candidate.address
            )).to.eq(user2ToCandidateStake.sub(2));
            expect(await ownershipContract["getStakedAmount(address)"](
                candidate.address
            )).to.eq(candidateStake.sub(2));

            // DIVA Token balances are as expected
            const divaTokenBalanceStakerAfter = await divaToken.balanceOf(user2.address);
            const divaTokenBalanceOwnershipContractAfter = await divaToken.balanceOf(ownershipContractAddress);
            expect(divaTokenBalanceStakerAfter).to.eq(divaTokenBalanceUser2Before.add(2))
            expect(divaTokenBalanceOwnershipContractAfter).to.eq(divaTokenBalanceOwnershipContractBefore.sub(2));
        })

        // -------------------------------------------
        // Events
        // -------------------------------------------
    
        it("Emits an `Unstaked` event", async () => {
            // -------------------------------------------
            // Arrange: Set amount to unstake and get user2's current stake
            // -------------------------------------------
            amountToUnstake = "1";
            user2Stake = await ownershipContract["getStakedAmount(address)"](
                user2.address
            )
            expect(user2Stake).to.be.gt(amountToUnstake);

            // -------------------------------------------
            // Act: Unstake
            // -------------------------------------------
            const tx = await ownershipContract.connect(user2).unstake(user2.address, amountToUnstake);
            const receipt = await tx.wait();
            
            // -------------------------------------------
            // Assert: Check event output
            // -------------------------------------------
            const unstakedEvent = receipt.events?.find(
                (item: any) => item.event === "Unstaked"
              );
            expect(unstakedEvent?.args?.by).to.eq(user2.address);
            expect(unstakedEvent?.args?.candidate).to.eq(user2.address);
            expect(unstakedEvent?.args?.amount).to.eq(amountToUnstake);
        })

        // -------------------------------------------
        // Reverts
        // -------------------------------------------

        it("Reverts if user tries to unstake during the ownership claim submission period", async () => {
            // -------------------------------------------
            // Arrange: Trigger an election cycle
            // -------------------------------------------
            await ownershipContract.connect(user2).triggerElectionCycle();

            // Fast forward into ownership claim submission period
            lastBlockTimestamp = await time.latest();
            showdownPeriodEnd = await ownershipContract.getShowdownPeriodEnd();
            
            // Fast forward into the ownership claim submission period
            nextBlockTimestamp = showdownPeriodEnd.add(1).toNumber();
            await time.setNextBlockTimestamp(nextBlockTimestamp);

            // -------------------------------------------
            // Act & Assert: Check that the unstake operation reverts
            // -------------------------------------------
            await expect(
                ownershipContract.connect(user2).unstake(
                    user2.address,
                    "1"
                )).to.be.revertedWith(`WithinSubmitOwnershipClaimPeriod(${nextBlockTimestamp}, ${showdownPeriodEnd.add(submitOwnershipClaimPeriod)})`
            );
        })

        it("Reverts if 7 day minimum staking period has not passed", async () => {
            // -------------------------------------------
            // Arrange: Stake, get the timestamp at stake and fast forward in time
            // -------------------------------------------
            // Stake with user2          
            await ownershipContract.connect(user2).stake(user2.address, "1");
            
            // Set timestamp 7 days after last stake timestamp
            const timestampLastStake =
                await ownershipContract.getTimestampLastStakedForCandidate(user2.address, user2.address);

            // Fast forward in time but stay within the minimum staking period
            nextBlockTimestamp = timestampLastStake.add(minStakingPeriod - 1).toNumber();
            await time.setNextBlockTimestamp(nextBlockTimestamp);

            // -------------------------------------------
            // Act & Assert: Check that the unstake operation reverts
            // -------------------------------------------
            await expect(
                ownershipContract.connect(user2).unstake(
                    user2.address,
                    "1"
                )).to.be.revertedWith(`MinStakingPeriodNotExpired(${nextBlockTimestamp}, ${timestampLastStake.add(minStakingPeriod)})`
            );
        })
    })
})