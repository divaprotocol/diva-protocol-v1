/**
 * Script to challenge the value submitted by the data feed provider. Only works if
 * challenge was enabled by the data feed provider at value submission and if within the challenge period (24h after submission)
 * Run: `yarn diva::challengeFinalReferenceValue`
 */

import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { parseUnits, formatUnits } from "@ethersproject/units";

import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS, STATUS, Status } from "../../constants";

// Auxiliary function to perform checks required for successful execution, in line with those implemented
// inside the smart contract function. It is recommended to perform those checks in frontend applications
// to save users gas fees on reverts.
const _checkConditions = async (
  msgSender: string,
  shortToken: string,
  longToken: string,
  statusFinalReferenceValue: Status,
  statusTimestamp: BigNumber,
  challengePeriod: BigNumber,
  reviewPeriod: BigNumber
) => {
  // Get instance of short and long token
  const shortTokenInstance = await ethers.getContractAt(
    "MockERC20",
    shortToken
  );
  const longTokenInstance = await ethers.getContractAt("MockERC20", longToken);

  // Get current time (proxy for block timestamp)
  const now = Math.floor(Date.now() / 1000);

  // Check that user holds position tokens
  if (
    (await shortTokenInstance.balanceOf(msgSender)).eq(0) &&
    (await longTokenInstance.balanceOf(msgSender)).eq(0)
  ) {
    throw new Error("No position tokens");
  }

  if (statusFinalReferenceValue == Status.Submitted) {
    // Check that challenge period did not expire yet
    if (now > statusTimestamp.add(challengePeriod).toNumber()) {
      throw new Error("Challenge period expired");
    }
  } else if (statusFinalReferenceValue == Status.Challenged) {
    // Check that review period did not expire yet
    if (now > statusTimestamp.add(reviewPeriod).toNumber()) {
      throw new Error("Review period expired");
    }
  } else {
    throw new Error("Nothing to challenge");
  }
};

async function main() {
  // INPUT: network
  const network = "goerli";

  // INPUT: arguments into `setFinalReferenceValue` function
  const poolId = 5; // id of an existing pool
  const proposedFinalReferenceValue = parseUnits("1670"); // 18 decimals

  // Get signer of position token holder
  const [positionTokenHolder] = await ethers.getSigners();
  console.log("Position token holder address: " + positionTokenHolder.address);

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network]);
  console.log("DIVA address: ", diva.address);

  // Get settlement relevant periods and parameters used to perform checks before executing the `setFinalReferenceValue` function.
  const governanceParameters = await diva.getGovernanceParameters();

  // Get pool parameters before submitted final reference value was challenged
  const poolParamsBefore = await diva.getPoolParameters(poolId);

  // Check conditions
  await _checkConditions(
    positionTokenHolder.address,
    poolParamsBefore.shortToken,
    poolParamsBefore.longToken,
    poolParamsBefore.statusFinalReferenceValue,
    poolParamsBefore.statusTimestamp,
    governanceParameters.currentSettlementPeriods.challengePeriod,
    governanceParameters.currentSettlementPeriods.reviewPeriod
  );

  console.log(
    "Final reference value before: " +
      formatUnits(poolParamsBefore.finalReferenceValue)
  );
  console.log(
    "Status final reference value before: " +
      STATUS[poolParamsBefore.statusFinalReferenceValue as Status]
  );

  // Set final reference value
  const tx = await diva.challengeFinalReferenceValue(
    poolId,
    proposedFinalReferenceValue
  );
  await tx.wait();

  // Get pool parameters after submitted final reference value was challenged
  const poolParamsAfter = await diva.getPoolParameters(poolId);
  console.log(
    "Final reference value after: " +
      formatUnits(poolParamsAfter.finalReferenceValue)
  ); // Value doesn't change; get proposed final reference value from TheGraph (TODO)
  console.log(
    "Status final reference value after: " +
      STATUS[poolParamsAfter.statusFinalReferenceValue as Status]
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
