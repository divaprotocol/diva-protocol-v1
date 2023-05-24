/**
 * Script to update settlement periods.
 * The execution of this function is reserved to the protocol owner only.
 * Run: `yarn diva::updateSettlementPeriods`
 */

import { ethers, network } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { LibDIVAStorage } from "../../typechain-types/contracts/facets/GetterFacet";

import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS, ONE_DAY, SettlementPeriodType } from "../../constants";
import { getCurrentTimestamp } from "../../utils";

// Auxiliary function to perform checks required for successful execution, in line with those implemented
// inside the smart contract function. It is recommended to perform those checks in frontend applications
// to save users gas fees on reverts.
const _checkConditions = async (
  diva: Contract,
  owner: SignerWithAddress,
  newSubmissionPeriod: number,
  newChallengePeriod: number,
  newReviewPeriod: number,
  newFallbackSubmissionPeriod: number,
  lastSettlementPeriods: LibDIVAStorage.SettlementPeriodsStructOutput
) => {
  // Confirm that signer of owner is correct
  if ((await diva.getOwner()) !== owner.address) {
    throw new Error("Invalid signer of owner.");
  }

  // Confirm that new settlement periods are valid
  _isValidPeriod(newSubmissionPeriod);
  _isValidPeriod(newChallengePeriod);
  _isValidPeriod(newReviewPeriod);
  _isValidPeriod(newFallbackSubmissionPeriod);

  // Confirm that there is no pending settlement periods update.
  if (lastSettlementPeriods.startTime.gt(getCurrentTimestamp())) {
    throw new Error("There is a pending settlement periods update.");
  }
};

const _isValidPeriod = (period: number) => {
  if (period < 3 * ONE_DAY || period > 15 * ONE_DAY) {
    throw new Error("Period is out of bounds.");
  }
};

async function main() {
  // Input arguments for `updateSettlementPeriods` function
  const newSubmissionPeriod = 4 * ONE_DAY;
  const newChallengePeriod = 5 * ONE_DAY;
  const newReviewPeriod = 6 * ONE_DAY;
  const newFallbackSubmissionPeriod = 7 * ONE_DAY;

  // Get signers
  const [owner] = await ethers.getSigners();

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Get settlement periods history before update
  const settlementPeriodsHistoryLengthBefore =
    await diva.getSettlementPeriodsHistoryLength();
  const settlementPeriodsHistoryBefore = await diva.getSettlementPeriodsHistory(
    settlementPeriodsHistoryLengthBefore
  );

  // Get last settlement periods before update
  const lastSettlementPeriodsBefore = await diva.getSettlementPeriods(
    settlementPeriodsHistoryLengthBefore - 1
  );

  // Confirm that all conditions are met before continuing
  await _checkConditions(
    diva,
    owner,
    newSubmissionPeriod,
    newChallengePeriod,
    newReviewPeriod,
    newFallbackSubmissionPeriod,
    lastSettlementPeriodsBefore
  );

  // Get settlement periods before update
  const settlementPeriodsBefore = (await diva.getGovernanceParameters())
    .currentSettlementPeriods;

  // Update settlement periods
  const tx = await diva
    .connect(owner)
    .updateSettlementPeriods(
      newSubmissionPeriod,
      newChallengePeriod,
      newReviewPeriod,
      newFallbackSubmissionPeriod
    );
  const receipt = await tx.wait();

  // Get settlement periods from events
  const submissionPeriodFromEvent = receipt.events.find(
    (item: any) =>
      item.event === "SettlementPeriodUpdated" &&
      item.args.periodType === SettlementPeriodType.SUBMISSION_PERIOD
  ).args.period;
  const challengePeriodFromEvent = receipt.events.find(
    (item: any) =>
      item.event === "SettlementPeriodUpdated" &&
      item.args.periodType === SettlementPeriodType.CHALLENGE_PERIOD
  ).args.period;
  const reviewPeriodFromEvent = receipt.events.find(
    (item: any) =>
      item.event === "SettlementPeriodUpdated" &&
      item.args.periodType === SettlementPeriodType.REVIEW_PERIOD
  ).args.period;
  const fallbackSubmissionPeriodFromEvent = receipt.events.find(
    (item: any) =>
      item.event === "SettlementPeriodUpdated" &&
      item.args.periodType === SettlementPeriodType.FALLBACK_SUBMISSION_PERIOD
  ).args.period;

  // Get settlement periods history after update
  const settlementPeriodsHistoryLengthAfter =
    await diva.getSettlementPeriodsHistoryLength();
  const settlementPeriodsHistoryAfter = await diva.getSettlementPeriodsHistory(
    settlementPeriodsHistoryLengthAfter
  );

  // Get last settlement periods before update
  const lastSettlementPeriodsAfter = await diva.getSettlementPeriods(
    settlementPeriodsHistoryLengthAfter - 1
  );

  // Get settlement periods after update
  const settlementPeriodsAfter = (await diva.getGovernanceParameters())
    .currentSettlementPeriods;

  // Log relevant info
  console.log("DIVA address: ", diva.address);
  console.log("Contract owner address: ", owner.address);
  console.log("Settlement periods before update: ", settlementPeriodsBefore);
  console.log("Settlement periods after update: ", settlementPeriodsAfter);
  console.log(
    "Settlement periods history length before update: ",
    settlementPeriodsHistoryLengthBefore
  );
  console.log(
    "Settlement periods history length after update: ",
    settlementPeriodsHistoryLengthAfter
  );
  console.log(
    "Settlement periods history before update: ",
    settlementPeriodsHistoryBefore
  );
  console.log(
    "Settlement periods history after update: ",
    settlementPeriodsHistoryAfter
  );
  console.log(
    "Last settlement periods before update: ",
    lastSettlementPeriodsBefore
  );
  console.log(
    "Last settlement periods after update: ",
    lastSettlementPeriodsAfter
  );
  console.log("Submission period from event: ", submissionPeriodFromEvent);
  console.log("Challenge period from event: ", challengePeriodFromEvent);
  console.log("Review period from event: ", reviewPeriodFromEvent);
  console.log(
    "Fallback submission period from event: ",
    fallbackSubmissionPeriodFromEvent
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
