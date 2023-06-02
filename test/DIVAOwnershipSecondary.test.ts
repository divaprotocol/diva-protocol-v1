import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, BigNumberish, Signer } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { mineUpTo, takeSnapshot, time } from "@nomicfoundation/hardhat-network-helpers";


import { 
    GetterFacet,
    GovernanceFacet,
    DIVAOwnershipSecondary,
    DIVAOwnershipMain,
    TellorPlayground
} from "../typechain-types";

import { TELLOR_PLAYGROUND_ADDRESS, ONE_DAY, ONE_HOUR } from "../constants";
import { deployMain } from "../scripts/deployMain";
import { deploySecondary } from "../scripts/deploySecondary";

// INPUTS
const network = "arbitrumTestnet"; // for tellorPlayground address; should be the same as in hardhat -> forking -> url settings in hardhat.config.js
const mainChainId = 5;

const getQueryDataAndId = (chainId: number, ownershipContractAddressMain: string): [string, string] => {
   
    // Perform equivalent of `abi.encodeWithSignature("getCurrentOwner()")` in Solidity using ethers
    const ABI = [
        "function getCurrentOwner()"
    ];
    const iface = new ethers.utils.Interface(ABI);
    const encodedFunctionSignature = iface.encodeFunctionData("getCurrentOwner"); // 0xa18a186b
    
    // Generate `queryData` and `queryId`
    const abiCoder = new ethers.utils.AbiCoder();
    const queryDataArgs = abiCoder.encode(
      ["uint256", "address", "bytes"],
      [chainId, ownershipContractAddressMain, encodedFunctionSignature]
    );
    const queryData = abiCoder.encode(
      ["string", "bytes"],
      ["EVMCall", queryDataArgs]
    );
    const queryId = ethers.utils.keccak256(queryData);
    return [queryData, queryId];
};

// Function to encode value for Tellor submission
const encodeOracleValue = (currentOwner: string): string => {
    return new ethers.utils.AbiCoder().encode(
      ["address"],
      [currentOwner]
    );
};

// Function to decode values submitted to Tellor
const decodeOracleValue = (tellorValue: string) => {
    return new ethers.utils.AbiCoder().decode(
        ["address"],
        tellorValue
    );
};

describe("DIVAOwnershipSecondary", async function () {
    let contractOwner: SignerWithAddress,
        user1: SignerWithAddress,
        user2: SignerWithAddress,
        user3: SignerWithAddress,
        candidate: SignerWithAddress,
        treasury: SignerWithAddress,
        dummyOwner: SignerWithAddress;

    let diamondAddressMain: string;
    let diamondSecondaryDeployment: [string, number];
    let diamondAddressSecondary: string;
    let tellorPlaygroundAddress = TELLOR_PLAYGROUND_ADDRESS[network];
    let getterFacetMain: GetterFacet,
        governanceFacetMain: GovernanceFacet,
        ownershipContractMain: DIVAOwnershipMain,
        getterFacetSecondary: GetterFacet,
        governanceFacetSecondary: GovernanceFacet,
        ownershipContractSecondary: DIVAOwnershipSecondary;
    let tellorPlayground: TellorPlayground;
    let govParamsSecondaryBefore: any,
        govParamsSecondaryAfter: any;
    let newFee: BigNumber;
    let newPeriod: number;
    
    let ownershipContractAddressMain: string;
    let ownershipContractAddressSecondary: string;
    let newFallbackDataProvider: string;
    
    let blockTimestampOwnershipContractDeployment: number;
    let lastBlockTimestamp: number;
    let nextBlockTimestamp: number;
    let queryId: string, queryData: string, oracleValue: string, oracleValue2: string;
    let snapshot: any;
    let maxAllowedAgeOfReportedValue: number = 36 * ONE_HOUR;

    let dummyOwner2: SignerWithAddress;
    let blockTimestampSetOwner: BigNumberish;
    let blockTimestampFirstSubmission: BigNumberish;
    let blockTimestampSecondSubmission: BigNumberish;
    let blockTimestampSetOwnerFirstTrial: BigNumberish;
    let blockTimestampSetOwnerSecondTrial: BigNumberish;

    let disputePeriod: number = 12 * ONE_HOUR;



    before(async () => {
        [contractOwner, user1, user2, user3, candidate, treasury] = await ethers.getSigners(); // keep contractOwner and treasury at first two positions in line with deploy script
        
        // -------------------------------------------
        // Setup
        // -------------------------------------------

        // -------------------------------------------
        // Deploy DIVA system on main chain and obtain ownership contract address which will be used
        // in the constructor args for the ownership contract deployment on the secondary chain
        // -------------------------------------------
        diamondAddressMain = (await deployMain())[0];

        // Connect to the diamond contract on main chain via facet specific ABI's
        getterFacetMain = await ethers.getContractAt("GetterFacet", diamondAddressMain);
        governanceFacetMain = await ethers.getContractAt("GovernanceFacet", diamondAddressMain);

        // Get the main chain ownership contract address (ownership contract is deployed inside `deployMain()`) and connect to contract
        ownershipContractAddressMain = await getterFacetMain.getOwnershipContract();
        ownershipContractMain = await ethers.getContractAt(
            "DIVAOwnershipMain",
            ownershipContractAddressMain
        )

        // Deploy DIVA system on secondary chain (to simplify the tests, we deploy it on the main chain used in the test setup). 
        // The contract owner, the Tellor address as well as the main chain
        // ownership contract address are passed on to the `deploySecondary.ts` script as constructor
        // arguments for ownership contract deployment on the secondary chain
        diamondSecondaryDeployment = await deploySecondary(
            contractOwner.address,
            tellorPlaygroundAddress,
            mainChainId.toString(),
            ownershipContractAddressMain
        );
        diamondAddressSecondary = diamondSecondaryDeployment[0];
        blockTimestampOwnershipContractDeployment = diamondSecondaryDeployment[1];

        // Connect to the diamond contract on secondary chain via facet specific ABI's
        getterFacetSecondary = await ethers.getContractAt("GetterFacet", diamondAddressSecondary);
        governanceFacetSecondary = await ethers.getContractAt("GovernanceFacet", diamondAddressSecondary);

        // Get the secondary chain ownership contract address and connect to contract        
        ownershipContractAddressSecondary = await getterFacetSecondary.getOwnershipContract();
        ownershipContractSecondary = await ethers.getContractAt(
            "DIVAOwnershipSecondary",
            ownershipContractAddressSecondary
        )

        // Connect to TellorPlayground contract on forked network (secondary chain)
        tellorPlayground = await ethers.getContractAt(
            "TellorPlayground",
            tellorPlaygroundAddress
        );

        // Prepare Tellor value submission
        [queryData, queryId] = getQueryDataAndId(mainChainId, ownershipContractAddressMain);

        // Take snapshot after the system has been deployed and before any Tellor submissions have been done
        snapshot = await takeSnapshot();
    });

    beforeEach(async () => {
        // Revert back to a state where the system is deployed but no values have been submitted to Tellor yet
        await snapshot.restore();
    })

    describe("Initialization", async () => {
        it("Should initialize parameters correctly at contract deployment", async () => {                        
            // DIVA system on the secondary chain is deployed inside the `before` block

            // -------------------------------------------
            // Assert: Confirm that initial values are as expected
            // -------------------------------------------
            const currentOwnerSecondary = await ownershipContractSecondary.getCurrentOwner();
            expect(currentOwnerSecondary).to.eq(contractOwner.address);

            // Confirm that `getQueryDataAndId()` returns the correct values
            const queryDataAndId = getQueryDataAndId(mainChainId, ownershipContractAddressMain);
            const [queryDataFromContract, queryIdFromContract] =
                await ownershipContractSecondary.getQueryDataAndId();
            expect(queryDataFromContract).to.eq(queryDataAndId[0])
            expect(queryIdFromContract).to.eq(queryDataAndId[1])

            // Confirm that `getOwnershipContractMainChain()` returns the correct main chain ownership contract address
            expect(await ownershipContractSecondary.getOwnershipContractMainChain()).to.eq(ownershipContractAddressMain);

            // Confirm that `getMainChainId()` returns the correct main chainId
            expect(await ownershipContractSecondary.getMainChainId()).to.eq(mainChainId);  
        })
    })
    
    describe("submitValue (Tellor)", async () => {
        it("Should report the ownership information to TellorPlayground", async () => {
            // ---------
            // Arrange: Prepare value for Tellor submission
            // ---------
            const currentOwnerMain = await ownershipContractMain.getCurrentOwner();
            oracleValue = encodeOracleValue(currentOwnerMain);
    
            // ---------
            // Act: Submit value to tellorPlayground
            // ---------
            await tellorPlayground
              .connect(contractOwner) // theoretically could be anyone, but contract owner has a natural interest
              .submitValue(queryId, oracleValue, 0, queryData);
    
            // ---------
            // Assert: Check that timestamp and values have been set in tellorPlayground contract
            // ---------
            lastBlockTimestamp = await time.latest();
            const tellorDataTimestamp = await tellorPlayground.timestamps(
              queryId,
              0
            );
            const tellorValue = await tellorPlayground.values(
              queryId,
              tellorDataTimestamp
            );
            const formattedTellorValue = decodeOracleValue(tellorValue);
            expect(tellorDataTimestamp).to.eq(lastBlockTimestamp);
            expect(formattedTellorValue[0]).to.eq(currentOwnerMain);
        });
    })

    describe("setOwner", async () => {

        // -------------------------------------------
        // Functionality
        // -------------------------------------------
        
        it("Should retrieve the reported owner address and update the corresponding variable inside the secondary ownership contract", async () => {
            // ---------
            // Arrange: Prepare value for Tellor submission. Using a dummy owner in this test to make the owner variable update visible
            // ---------
            dummyOwner = user2;
            oracleValue = encodeOracleValue(dummyOwner.address);
    
            // Submit value to tellorPlayground
            await tellorPlayground
              .connect(contractOwner) // theoretically could be anyone, but contract owner is most incentivized
              .submitValue(queryId, oracleValue, 0, queryData);
                  
            const tellorDataTimestamp = await tellorPlayground.timestamps(
                queryId,
                0
            );

            // Let the minimum dispute period of 12 hours expire
            nextBlockTimestamp = Number(tellorDataTimestamp.add(disputePeriod + 1));
            await time.setNextBlockTimestamp(nextBlockTimestamp);

            // ---------
            // Act: Trigger `setOwner` function in ownership contract on secondary chain
            // ---------
            const tx = await ownershipContractSecondary.connect(contractOwner).setOwner();
            const receipt = await tx.wait();

            // ---------
            // Assert: `OwnerSet` event is emitted and owner variable is set as expected
            // inside the ownership contract on the secondary chain
            // ---------
            // Check event
            const ownerSetEvent = receipt.events?.find(
                (item: any) => item.event === "OwnerSet"
              );
            expect(ownerSetEvent?.args?.owner).to.eq(dummyOwner.address);

            // Check storage variables
            const currentOwnerSecondary = await ownershipContractSecondary.getCurrentOwner();
            expect(currentOwnerSecondary).to.eq(dummyOwner.address);
        });
        
        it("Should retrieve the first value that remained undisputed for 12 hours if multiple values have been submitted", async () => {
            // ---------
            // Arrange: Simulate two Tellor submissions with a distance of 6 hours
            // ---------
            // *** Submission 1 ***
            // Prepare data to report
            dummyOwner = user2;
            oracleValue = encodeOracleValue(dummyOwner.address);

            // Set block timestamp for first submission
            blockTimestampFirstSubmission = (await time.latest()) + 1;
            await time.setNextBlockTimestamp(blockTimestampFirstSubmission);

            // Submit first value to tellorPlayground
            await tellorPlayground
              .connect(contractOwner) // theoretically could be anyone, but contract owner is most incentivized
              .submitValue(queryId, oracleValue, 0, queryData);
                
            // Get reporting timestamp of first submission
            const tellorDataTimestamp1 = await tellorPlayground.timestamps(
                queryId,
                0
            );
            expect(tellorDataTimestamp1).to.be.eq(blockTimestampFirstSubmission);

            // Set the block timestamp for the `setOwner` call, 12 hours (min dispute period) after the FIRST submission
            blockTimestampSetOwner = tellorDataTimestamp1.add(disputePeriod + 1);

            // *** Submission 2 ***
            // Fast forward by six hours for the second submission
            blockTimestampSecondSubmission = tellorDataTimestamp1.add(6 * ONE_HOUR);
            await time.setNextBlockTimestamp(Number(blockTimestampSecondSubmission));

            // Prepare data to report. Choosing different data here to check whether the right values are set.
            dummyOwner2 = candidate;
            oracleValue2 = encodeOracleValue(dummyOwner2.address);

            // Submit second value to tellorPlayground
            await tellorPlayground
              .connect(contractOwner) // theoretically could be anyone, but contract owner is most incentivized
              .submitValue(queryId, oracleValue2, 0, queryData);
        
            // Get reporting timestamp of second submission
            const tellorDataTimestamp2 = await tellorPlayground.timestamps(
                queryId,
                1
            );
            expect(tellorDataTimestamp2).to.be.eq(blockTimestampSecondSubmission);

            // ---------
            // Act: Trigger `setOwner` function in ownership contract on secondary chain, 12h after first value submission
            // ---------
            await time.setNextBlockTimestamp(Number(blockTimestampSetOwner));
            await ownershipContractSecondary.connect(contractOwner).setOwner();

            // ---------
            // Assert: Confirm that owner from the first submission is set
            // ---------
            const currentOwnerSecondary = await ownershipContractSecondary.getCurrentOwner();
            expect(currentOwnerSecondary).to.eq(dummyOwner.address);
        })

        it("Should retrieve the second value if the first value submitted was disputed", async () => {
            // ---------
            // Arrange: Simulate two Tellor submissions with a distance of 6 hours
            // ---------
            // *** Submission 1 ***
            // Prepare data to report
            dummyOwner = user2;
            oracleValue = encodeOracleValue(dummyOwner.address);

            // Set block timestamp for first submission
            blockTimestampFirstSubmission = (await time.latest()) + 1;
            await time.setNextBlockTimestamp(blockTimestampFirstSubmission);

            // Submit first value to tellorPlayground
            await tellorPlayground
              .connect(contractOwner) // theoretically could be anyone, but contract owner is most incentivized
              .submitValue(queryId, oracleValue, 0, queryData);
                
            // Get reporting timestamp of first submission
            const tellorDataTimestamp1 = await tellorPlayground.timestamps(
                queryId,
                0 // index for first submission
            );
            expect(tellorDataTimestamp1).to.be.eq(blockTimestampFirstSubmission);
            
            // Set the block timestamp for the `setOwner` call, 12 hours (min dispute period) after the FIRST submission
            blockTimestampSetOwnerFirstTrial = tellorDataTimestamp1.add(disputePeriod + 1);

            // *** Submission 2 ***
            // Fast forward by six hours for the second submission
            blockTimestampSecondSubmission = tellorDataTimestamp1.add(6 * ONE_HOUR);
            await time.setNextBlockTimestamp(Number(blockTimestampSecondSubmission));

            // Prepare data to report. Choosing different data here to check whether the right values are set.
            dummyOwner2 = candidate;
            oracleValue2 = encodeOracleValue(dummyOwner2.address);

            // Submit second set of values to tellorPlayground
            await tellorPlayground
              .connect(contractOwner) // theoretically could be anyone, but contract owner is most incentivized
              .submitValue(queryId, oracleValue2, 0, queryData);
        
            // Get reporting timestamp of second submission
            const tellorDataTimestamp2 = await tellorPlayground.timestamps(
                queryId,
                1 // index for first submission
            );
            expect(tellorDataTimestamp2).to.be.eq(blockTimestampSecondSubmission);

            // Let the minimum dispute period of 12 hours pass starting from the SECOND submission
            blockTimestampSetOwnerSecondTrial = tellorDataTimestamp2.add(disputePeriod + 1);

            // Dispute first value submission
            await tellorPlayground.beginDispute(queryId, tellorDataTimestamp1);
            
            // Confirm that the first value is in dispute
            expect(
                await tellorPlayground.isInDispute(queryId, tellorDataTimestamp1)
            ).to.eq(true);

            // ---------
            // Act & Assert 1: Trigger `setOwner` function in ownership contract on secondary chain, 12h after first value submission.
            // Should revert with `NoOracleSubmission` as first submission was disputed and hence is no longer available
            // ---------
            await time.setNextBlockTimestamp(Number(blockTimestampSetOwnerFirstTrial));
            await expect(ownershipContractSecondary.connect(dummyOwner).setOwner()
            ).to.be.revertedWith(
                `NoOracleSubmission()`
            );

            // ---------
            // Act 2: Trigger `setOwner` function after the minimum dispute period for the second submission has passed
            // ---------
            await time.setNextBlockTimestamp(Number(blockTimestampSetOwnerSecondTrial));
            await ownershipContractSecondary.connect(contractOwner).setOwner();

            // ---------
            // Assert 2: Confirm that second reported owner is set
            // ---------
            const currentOwnerSecondary = await ownershipContractSecondary.getCurrentOwner();
            expect(currentOwnerSecondary).to.eq(dummyOwner2.address);
        })

        it("Should retrieve the first value if the second value submitted was disputed", async () => {
            // ---------
            // Arrange: Simulate two Tellor submissions with a distance of 6 hours
            // ---------
            // *** Submission 1 ***
            // Prepare data to report
            dummyOwner = user2;
            oracleValue = encodeOracleValue(dummyOwner.address);

            // Set block timestamp for first submission
            blockTimestampFirstSubmission = (await time.latest()) + 1;
            await time.setNextBlockTimestamp(blockTimestampFirstSubmission);

            // Submit first value to tellorPlayground
            await tellorPlayground
              .connect(contractOwner) // theoretically could be anyone, but contract owner is most incentivized
              .submitValue(queryId, oracleValue, 0, queryData);
                
            // Get reporting timestamp of first submission
            const tellorDataTimestamp1 = await tellorPlayground.timestamps(
                queryId,
                0 // index for first submission
            );
            expect(tellorDataTimestamp1).to.be.eq(blockTimestampFirstSubmission);
            
            // Set the block timestamp for the `setOwner` call, 24 hours after the first submission.
            // 24 hours was chosen so that the minimum dispute period passes for the second submission as
            // well. It shouldn't be that important, but good test of whether the update of the owner
            // variable still works 12 hours after it's considered valid and a disputed value shouldn't
            // appear if the minimum dispute period has passed.
            blockTimestampSetOwner= tellorDataTimestamp1.add(2 * disputePeriod + 1);

            // *** Submission 2 ***
            // Fast forward by six hours for the second submission
            blockTimestampSecondSubmission = tellorDataTimestamp1.add(6 * ONE_HOUR);
            await time.setNextBlockTimestamp(Number(blockTimestampSecondSubmission));

            // Prepare data to report. Choosing different data here to check whether the right values are set.
            dummyOwner2 = candidate;
            oracleValue2 = encodeOracleValue(dummyOwner2.address);

            // Submit second value to tellorPlayground
            await tellorPlayground
              .connect(contractOwner) // theoretically could be anyone, but contract owner is most incentivized
              .submitValue(queryId, oracleValue2, 0, queryData);
        
            // Get reporting timestamp of second submission
            const tellorDataTimestamp2 = await tellorPlayground.timestamps(
                queryId,
                1 // index for first submission
            );
            expect(tellorDataTimestamp2).to.be.eq(blockTimestampSecondSubmission);

            // Dispute second value submission
            await tellorPlayground.beginDispute(queryId, tellorDataTimestamp2);
            
            // Confirm that the second value is in dispute
            expect(
                await tellorPlayground.isInDispute(queryId, tellorDataTimestamp2)
            ).to.eq(true);

            // ---------
            // Act & Assert 1: Trigger `setOwner` function in ownership contract on secondary chain, 24 hours
            // after the first value submission.
            // ---------
            await time.setNextBlockTimestamp(Number(blockTimestampSetOwner));
            await ownershipContractSecondary.connect(dummyOwner).setOwner();

            // ---------
            // Assert 2: Confirm that second reported owner is set
            // ---------
            const currentOwnerSecondary = await ownershipContractSecondary.getCurrentOwner();
            expect(currentOwnerSecondary).to.eq(dummyOwner.address);
        })
        
        // -------------------------------------------
        // Reverts
        // -------------------------------------------
                
        it("Should revert with `NoOracleSubmission` if the very first value submitted is undisputed for less than 12 hours", async () => {
            // ---------
            // Arrange: Prepare value for Tellor submission
            // ---------
            dummyOwner = user2;
            oracleValue = encodeOracleValue(dummyOwner.address);
    
            // Submit value to tellorPlayground
            await tellorPlayground
              .connect(contractOwner) // theoretically could be anyone, but contract owner is most incentivized
              .submitValue(queryId, oracleValue, 0, queryData);
                  
            const tellorDataTimestamp = await tellorPlayground.timestamps(
                queryId,
                0
            );

            // Set the next block's timestamp before the minimum dispute period of 12 hours expires
            nextBlockTimestamp = Number(tellorDataTimestamp.add(disputePeriod - 1));
            await time.setNextBlockTimestamp(nextBlockTimestamp);

            // ---------
            // Act & Assert: Confirm that `setOwner` call fails because called before the dispute
            // period expired
            // ---------
            await expect(
                ownershipContractSecondary.connect(contractOwner).setOwner()
            ).to.be.revertedWith("NoOracleSubmission()");            
        })
    
        it("Should revert with `ValueTooOld` if timestamp of reporting is older than 36 hours", async () => {
            // ---------
            // Arrange: Prepare value for Tellor submission
            // ---------
            dummyOwner = user2;
            oracleValue = encodeOracleValue(dummyOwner.address);
    
            // Submit value to tellorPlayground
            await tellorPlayground
              .connect(contractOwner) // theoretically could be anyone, but contract owner is most incentivized
              .submitValue(queryId, oracleValue, 0, queryData);
                  
            const tellorDataTimestamp = await tellorPlayground.timestamps(
                queryId,
                0
            );

            // Set the next block's timestamp more than 36 hours after time of reporting
            nextBlockTimestamp = Number(tellorDataTimestamp.add(maxAllowedAgeOfReportedValue + 1));
            await time.setNextBlockTimestamp(nextBlockTimestamp);

            const maxAllowedTimestampRetrieved = nextBlockTimestamp - maxAllowedAgeOfReportedValue;

            // ---------
            // Act & Assert: Confirm that `setOwner` call fails because called before the dispute
            // period expired
            // ---------
            await expect(
                ownershipContractSecondary.connect(contractOwner).setOwner()
            ).to.be.revertedWith(`ValueTooOld(${tellorDataTimestamp}, ${maxAllowedTimestampRetrieved})`);    
        })    
    })

    describe("Governance functions on the secondary chain", async () => {
        beforeEach(async function () {
            // Prepare value for Tellor submission
            dummyOwner = user2;
            oracleValue = encodeOracleValue(dummyOwner.address);
    
            // Submit value to tellorPlayground
            await tellorPlayground
              .connect(contractOwner) // theoretically could be anyone, but contract owner is most incentivized
              .submitValue(queryId, oracleValue, 0, queryData);
                  
            const tellorDataTimestamp = await tellorPlayground.timestamps(
                queryId,
                0
            );

            // Let the minimum dispute period of 12 hours pass
            nextBlockTimestamp = Number(tellorDataTimestamp.add(disputePeriod + 1));
            await time.setNextBlockTimestamp(nextBlockTimestamp);

            // Set owner information on secondary chain
            await ownershipContractSecondary.connect(contractOwner).setOwner();
        });

        it("Should allow to update the treasury address on the secondary chain", async () => {
            // ---------
            // Arrange: Prepare inputs for `updateTreasury` function call
            // ---------
            const newTreasuryAddress = user2.address;
            govParamsSecondaryBefore = await getterFacetSecondary.getGovernanceParameters();
            expect(govParamsSecondaryBefore.treasury).to.not.eq(newTreasuryAddress);

            // ---------
            // Act: Trigger `updateTreasury` on secondary chain
            // ---------
            await governanceFacetSecondary
                .connect(dummyOwner)
                .updateTreasury(newTreasuryAddress);

            // Fast forward in time to activate the new treasury address
            const treasuryInfo = await getterFacetSecondary.getTreasuryInfo();
            await mineUpTo(treasuryInfo.startTimeTreasury);

            // ---------
            // Assert: Confirm that treasury address on secondary chain is updated
            // ---------
            expect((await getterFacetSecondary.getGovernanceParameters()).treasury).to.eq(newTreasuryAddress);
        })

        it("Should allow to update the treasury address on the secondary chain 100 days after owner was set", async () => {
            // ---------
            // Arrange: Fast forward 100 days in time and prepare inputs for `updateTreasury` function call
            // ---------
            lastBlockTimestamp = await time.latest();
            nextBlockTimestamp = lastBlockTimestamp + 100 * ONE_DAY;
            await time.setNextBlockTimestamp(nextBlockTimestamp);
            const newTreasuryAddress = user2.address;
            govParamsSecondaryBefore = await getterFacetSecondary.getGovernanceParameters();
            expect(govParamsSecondaryBefore.treasury).to.not.eq(newTreasuryAddress);

            // ---------
            // Act: Trigger `updateTreasury` on secondary chain (using a new treasury address to make
            // the update visible)
            // ---------
            await governanceFacetSecondary
                .connect(dummyOwner)
                .updateTreasury(newTreasuryAddress);

            // Fast forward in time to activate the new treasury address
            const treasuryInfo = await getterFacetSecondary.getTreasuryInfo();
            await mineUpTo(treasuryInfo.startTimeTreasury);

            // ---------
            // Assert: Confirm that treasury address on secondary chain is updated
            // ---------
            expect((await getterFacetSecondary.getGovernanceParameters()).treasury).to.eq(newTreasuryAddress);
        })

        it("Should allow to pause the contract on the secondary chain", async () => {
            // ---------
            // Act: Trigger `pauseReturnCollateral` on secondary chain
            // ---------
            await governanceFacetSecondary.connect(dummyOwner).pauseReturnCollateral();

            // ---------
            // Assert: Confirm that contract is paused on secondary chain
            // ---------
            lastBlockTimestamp = await time.latest();
            govParamsSecondaryAfter = await getterFacetSecondary.getGovernanceParameters();
            expect(govParamsSecondaryAfter.pauseReturnCollateralUntil).to.be.eq(
                lastBlockTimestamp + 8 * ONE_DAY
            );
        })

        it("Should allow to pause the contract on the secondary chain 100 days after owner was set", async () => {
            // ---------
            // Arrange: Fast forward 100 days in time
            // ---------
            lastBlockTimestamp = await time.latest();
            nextBlockTimestamp = lastBlockTimestamp + 100 * ONE_DAY;
            await time.setNextBlockTimestamp(nextBlockTimestamp);

            // ---------
            // Act: Trigger `pauseReturnCollateral` on secondary chain
            // ---------
            await governanceFacetSecondary.connect(dummyOwner).pauseReturnCollateral();

            // ---------
            // Assert: Confirm that contract is paused on secondary chain
            // ---------
            lastBlockTimestamp = await time.latest();
            govParamsSecondaryAfter = await getterFacetSecondary.getGovernanceParameters();
            expect(govParamsSecondaryAfter.pauseReturnCollateralUntil).to.be.eq(
                lastBlockTimestamp + 8 * ONE_DAY
            );

            // ---------
            // Reset: Unpause contract to avoid any implications on the tests downstream 
            // ---------
            await governanceFacetSecondary.connect(dummyOwner).unpauseReturnCollateral();
        })

        it("Should allow to update fees on the secondary chain", async () => {
            // ---------
            // Arrange: Prepare inputs for `updateFees` function call
            // ---------                     
            newFee = parseUnits("0.01");   

            // ---------
            // Act: Trigger `updateFees` on secondary chain
            // ---------                     
            await governanceFacetSecondary.connect(dummyOwner).updateFees(newFee, newFee)
            
            // Fast forward in time to activate the new fees
            const latestFees = await getterFacetSecondary.getFeesHistory(1);
            await mineUpTo(latestFees[0].startTime);
            
            // ---------
            // Assert: Confirm that fees have been updated on the secondary chain
            // ---------
            govParamsSecondaryAfter = await getterFacetSecondary.getGovernanceParameters();
            expect(govParamsSecondaryAfter.currentFees.protocolFee).to.eq(newFee);
            expect(govParamsSecondaryAfter.currentFees.settlementFee).to.eq(newFee);
        })

        it("Should allow to update settlement periods on the secondary chain", async () => {
            // ---------
            // Arrange: Prepare inputs for `updateSettlementPeriods` function call
            // ---------                     
            newPeriod = 4 * ONE_DAY;

            // ---------
            // Act: Trigger `updateSettlementPeriods` on secondary chain
            // ---------                     
            await governanceFacetSecondary
                .connect(dummyOwner)
                .updateSettlementPeriods(
                    newPeriod,
                    newPeriod,
                    newPeriod,
                    newPeriod
                );
      
            // Fast forward in time to activate the new settlement periods
            const latestSettlementPeriods = await getterFacetSecondary.getSettlementPeriodsHistory(1);
            await mineUpTo(latestSettlementPeriods[0].startTime);

            // ---------
            // Assert: Confirm that settlement periods have been updated on the secondary chain
            // ---------
            govParamsSecondaryAfter = await getterFacetSecondary.getGovernanceParameters();
            expect(govParamsSecondaryAfter.currentSettlementPeriods.submissionPeriod).to.eq(
                newPeriod
            );
            expect(govParamsSecondaryAfter.currentSettlementPeriods.challengePeriod).to.eq(
                newPeriod
            );
            expect(govParamsSecondaryAfter.currentSettlementPeriods.reviewPeriod).to.eq(
                newPeriod
            );
            expect(
                govParamsSecondaryAfter.currentSettlementPeriods.fallbackSubmissionPeriod
            ).to.eq(newPeriod);
        });

        it("Should allow to update the fallback data provider address on the secondary chain", async () => {
            // ---------
            // Arrange: Prepare inputs for `updateFallbackDataProvider` function call
            // ---------            
            newFallbackDataProvider = user3.address;
            expect((await getterFacetSecondary.getGovernanceParameters()).fallbackDataProvider).to.not.eq(newFallbackDataProvider);

            // ---------
            // Act: Trigger `updateFallbackDataProvider` on secondary chain
            // ---------
            await governanceFacetSecondary.connect(dummyOwner).updateFallbackDataProvider(newFallbackDataProvider);
            
            // Fast forward in time to activate the new fallback data provider
            const fallbackDataProviderInfo = await getterFacetSecondary.getFallbackDataProviderInfo();
            await mineUpTo(fallbackDataProviderInfo.startTimeFallbackDataProvider);

            // ---------
            // Assert: Confirm that fallback data provider address on secondary chain is updated
            // ---------
            expect((await getterFacetSecondary.getGovernanceParameters()).fallbackDataProvider).to.eq(newFallbackDataProvider);
        })

        // -------------------------------------------
        // Reverts
        // -------------------------------------------

        it("Should revert if non-owner account tries to call any of the governance functions on the secondary chain", async () => {
            // ---------
            // Arrange: Define non-owner account and prepare the arguments for the governance functions
            // ---------
            const nonOwnerAccount = user3;
            const currentOwnerSecondary = await ownershipContractSecondary.getCurrentOwner();
            expect(currentOwnerSecondary).to.not.eq(nonOwnerAccount.address);
            
            // Prepare arguments for governance functions
            newFee = parseUnits("0.01");
            newPeriod = 4 * ONE_DAY;

            // ---------
            // Act & Assert: Confirm that governance related function calls revert
            // ---------
            // updateTreasury
            await expect(
                governanceFacetSecondary.connect(nonOwnerAccount).updateTreasury(treasury.address)
            ).to.be.revertedWith(
                `NotContractOwner("${nonOwnerAccount.address}", "${currentOwnerSecondary}")`
            );

            // pauseReturnCollateral
            await expect(
                governanceFacetSecondary.connect(nonOwnerAccount).pauseReturnCollateral()
            ).to.be.revertedWith(
                `NotContractOwner("${nonOwnerAccount.address}", "${currentOwnerSecondary}")`
            );

            // updateFees
            await expect(
                governanceFacetSecondary.connect(nonOwnerAccount).updateFees(newFee, newFee)
                ).to.be.revertedWith(
                    `NotContractOwner("${nonOwnerAccount.address}", "${currentOwnerSecondary}")`
                );
            
            // updateSettlementPeriods
            await expect(
                governanceFacetSecondary
                .connect(nonOwnerAccount)
                .updateSettlementPeriods(
                    newPeriod,
                    newPeriod,
                    newPeriod,
                    newPeriod
                )
            ).to.be.revertedWith(
                `NotContractOwner("${nonOwnerAccount.address}", "${currentOwnerSecondary}")`
            );

            // updateFallbackDataProvider
            await expect(
                governanceFacetSecondary.connect(nonOwnerAccount).updateFallbackDataProvider(user3.address)
                ).to.be.revertedWith(
                    `NotContractOwner("${nonOwnerAccount.address}", "${currentOwnerSecondary}")`
                );
            
            // revokePendingFeesUpdate
            await expect(
                governanceFacetSecondary.connect(nonOwnerAccount).revokePendingFeesUpdate()
                ).to.be.revertedWith(
                    `NotContractOwner("${nonOwnerAccount.address}", "${currentOwnerSecondary}")`
                );

            // revokePendingSettlementPeriodsUpdate
            await expect(
                governanceFacetSecondary.connect(nonOwnerAccount).revokePendingSettlementPeriodsUpdate()
                ).to.be.revertedWith(
                    `NotContractOwner("${nonOwnerAccount.address}", "${currentOwnerSecondary}")`
                );

            // revokePendingFallbackDataProviderUpdate
            await expect(
                governanceFacetSecondary.connect(nonOwnerAccount).revokePendingFallbackDataProviderUpdate()
                ).to.be.revertedWith(
                    `NotContractOwner("${nonOwnerAccount.address}", "${currentOwnerSecondary}")`
                );
        });            
    });
});





