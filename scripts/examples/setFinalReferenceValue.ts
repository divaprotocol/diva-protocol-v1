/**
 * Script to set the final reference price for an already expired pool.
 * Run: `yarn diva::setFinalReferenceValue --network mumbai`
 * 
 * Example usage (append corresponding network):
 * 1. `yarn diva::createContingentPool`: Create pool with a short expiration and a
 *    data provider account that you control.
 * 2. `yarn diva::getPoolParameters`: Check the pool status before reporting.
 * 3. `yarn diva::setFinalReferenceValue`: Report final value.
 * 4. `yarn diva::getPoolParameters`: Check the updated pool status.
 */

import { ethers, network } from "hardhat";
import { BigNumber } from "ethers";
import { parseUnits, formatUnits } from "@ethersproject/units";
import { LibDIVAStorage } from "../../typechain-types/contracts/interfaces/IGetter";
import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS, Status, STATUS } from "../../constants";
import { getCurrentTimestamp } from "../../utils";

async function main() {
  // ************************************
  //           INPUT ARGUMENTS
  // ************************************

  // Id of an existing pool
  const poolId =
    "0x645f2a5924b93b93af4a29c4759422e24d7096c5e16bd72571410efe3cb2bcbd";
  
  // Final reference value expressed as an integer with 18 decimals
  const finalReferenceValue = parseUnits("2444.8");

  // false: first value submitted will automatically be confirmed
  // true: challenge by position token holders is enabled
  const allowChallenge = true;


  // ************************************
  //              EXECUTION
  // ************************************

  // Get signer of data provider
  const [dataProvider] = await ethers.getSigners();

  // Connect to deployed DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Load pool parameters
  const poolParamsBefore = await diva.getPoolParameters(poolId);

  // Get settlement relevant periods and parameters used to perform checks before executing the `setFinalReferenceValue` function.
  const governanceParameters = await diva.getGovernanceParameters();

  // Confirm that all conditions are met before continuing
  _checkConditions(
    poolParamsBefore,
    governanceParameters,
    dataProvider.address
  );

  // Set final reference value
  const tx = await diva
    .connect(dataProvider)
    .setFinalReferenceValue(poolId, finalReferenceValue, allowChallenge);
  await tx.wait();

  // Get pool parameters after final reference value was set
  const poolParamsAfter = await diva.getPoolParameters(poolId);

  // Get collateral token decimals to perform conversions from integer to decimal. Note that position tokens have the same number of decimals.
  const erc20Contract = await ethers.getContractAt(
    "MockERC20",
    poolParamsBefore.collateralToken.toString()
  );
  const decimals = await erc20Contract.decimals();

  // Get collateral token symbol for print
  const collateralTokenSymbol = await erc20Contract.symbol();

  // Log relevant info
  console.log("DIVA address: ", diva.address);
  console.log("PoolId: ", poolId);
  console.log("Data provider address: ", dataProvider.address);
  console.log("Reference asset: ", poolParamsBefore.referenceAsset);
  console.log(
    "Final reference value before: ",
    formatUnits(poolParamsBefore.finalReferenceValue)
  );
  console.log(
    "Final reference value after: ",
    formatUnits(poolParamsAfter.finalReferenceValue)
  );
  console.log(
    "Status final reference value before: ",
    STATUS[Number(poolParamsBefore.statusFinalReferenceValue) as Status]
  );
  console.log(
    "Status final reference value after: ",
    STATUS[Number(poolParamsAfter.statusFinalReferenceValue) as Status]
  );
  console.log(
    "Status timestamp before: ",
    poolParamsBefore.statusTimestamp +
      " (" +
      new Date(
        Number(poolParamsBefore.statusTimestamp) * 1000
      ).toLocaleString() +
      ")"
  );
  console.log(
    "Status timestamp after: ",
    poolParamsAfter.statusTimestamp +
      " (" +
      new Date(poolParamsAfter.statusTimestamp * 1000).toLocaleString() +
      ")"
  );
  console.log(
    "Payout per long token: ",
    formatUnits(poolParamsAfter.payoutLong, decimals) +
      " " +
      collateralTokenSymbol
  );
  console.log(
    "Payout per short token: ",
    formatUnits(poolParamsAfter.payoutShort, decimals) +
      " " +
      collateralTokenSymbol
  );
}

// Auxiliary function to perform checks required for successful execution, in line with those implemented
// inside the smart contract function. It is recommended to perform those checks in frontend applications
// to save users gas fees on reverts.
const _checkConditions = (
  poolParams: LibDIVAStorage.PoolStruct,
  governanceParameters: [
    LibDIVAStorage.FeesStructOutput,
    LibDIVAStorage.SettlementPeriodsStructOutput,
    string,
    string,
    BigNumber
  ] & {
    currentFees: LibDIVAStorage.FeesStructOutput;
    currentSettlementPeriods: LibDIVAStorage.SettlementPeriodsStructOutput;
    treasury: string;
    fallbackDataProvider: string;
    pauseReturnCollateralUntil: BigNumber;
  },
  callerAddress: string
) => {
  // Get current time (proxy for block timestamp)
  const now = getCurrentTimestamp();

  // All periods are expressed in seconds
  const submissionPeriod =
    governanceParameters.currentSettlementPeriods.submissionPeriod;
  const reviewPeriod =
    governanceParameters.currentSettlementPeriods.reviewPeriod;
  const fallbackSubmissionPeriod =
    governanceParameters.currentSettlementPeriods.fallbackSubmissionPeriod;
  const initialSubmissionPeriodEnd = BigNumber.from(poolParams.expiryTime).add(
    submissionPeriod
  ); // Submission period after expiration
  const fallbackSubmissionPeriodEnd = initialSubmissionPeriodEnd.add(
    fallbackSubmissionPeriod
  );
  const fallbackDataProvider = governanceParameters.fallbackDataProvider;

  // Check that status is either Open (0) or Challenged (2)
  if (
    poolParams.statusFinalReferenceValue != Status.Open &&
    poolParams.statusFinalReferenceValue != Status.Challenged
  ) {
    throw new Error(
      "Status is already submitted or confirmed. No submission possible."
    );
  }

  if (poolParams.statusFinalReferenceValue === Status.Open) {
    // Check that pool already expired
    if (Number(poolParams.expiryTime) >= now) {
      throw new Error("Pool not yet expired.");
    }

    if (now <= initialSubmissionPeriodEnd.toNumber()) {
      // Check that caller is the data provider if called within initial submission period
      if (callerAddress != poolParams.dataProvider) {
        throw new Error("Caller is not data provider.");
      }
    } else if (
      now > initialSubmissionPeriodEnd.toNumber() &&
      now <= fallbackSubmissionPeriodEnd.toNumber()
    ) {
      // Check that caller is the fallbackDataProvider if called within fallback period
      if (callerAddress === fallbackDataProvider) {
        throw new Error("Caller is not fallback data provider.");
      }
    }
  } else if (poolParams.statusFinalReferenceValue === Status.Challenged) {
    // Check that review period didn't expire
    const reviewPeriodEnd = BigNumber.from(
      poolParams.statusFinalReferenceValue
    ).add(reviewPeriod);
    if (now > reviewPeriodEnd.toNumber()) {
      throw new Error("Review period expired.");
    }

    // Check that caller is the data provider
    if (callerAddress != poolParams.dataProvider) {
      throw new Error("Caller is not data provider.");
    }
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
