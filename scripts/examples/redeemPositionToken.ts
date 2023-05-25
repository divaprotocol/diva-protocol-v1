/**
 * Script to redeem position tokens from a pool that has expired and the 
 * final value has been confirmed.
 * Run: `yarn diva::redeemPositionToken --network mumbai`
 *
 * Example usage (append corresponding network):
 * 1. `yarn diva::createContingentPool`: Create pool with a short expiration and a
 *    data provider account that you control.
 * 2. `yarn diva::getPoolParameters`: Check the pool collateral balance before reporting.
 * 3. `yarn diva::setFinalReferenceValue`: Report final value with `allowChallenge = false`.
 * 4. `yarn diva::redeemPositionToken`: Redeem position tokens.
 * 5. `yarn diva::getPoolParameters`: Check the payout per position token and the
 *    updated pool collateral balance.
 */

import { ethers, network } from "hardhat";
import { BigNumber } from "ethers";
import { formatUnits, parseUnits } from "@ethersproject/units";
import { MockERC20 } from "../../typechain-types/contracts/mocks/MockERC20";
import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS, LONG_OR_SHORT, Status } from "../../constants";
import { getCurrentTimestamp } from "../../utils";

async function main() {
  // ************************************
  //           INPUT ARGUMENTS
  // ************************************
  
  // Id of an existing pool
  const poolId =
    "0x0fe386eff10c6903026ac911ea5e2d5076148a8f55aeea170f69a12e6da4353f";

  // Specifc position token holder that will redeem their position token
  const [positionTokenHolder] = await ethers.getSigners();

  // Position tokens to redeem. Conversion into integer happens below
  // in the code as it depends on the token decimals (same as collateral token decimals).
  const redemptionAmountInput = "10";

  const sideToRedeem = LONG_OR_SHORT.long; // short / long


  // ************************************
  //              EXECUTION
  // ************************************

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Get pool parameters
  const poolParams = await diva.getPoolParameters(poolId);

  // Get governance parameters (pauseReturnCollateralUntil is the relevant field for the checks)
  const governanceParameters = await diva.getGovernanceParameters();

  // Confirm that all conditions are met before continuing
  _checkConditions(
    governanceParameters.pauseReturnCollateralUntil,
    poolParams.statusFinalReferenceValue,
    poolParams.statusTimestamp,
    governanceParameters.currentSettlementPeriods.challengePeriod,
    governanceParameters.currentSettlementPeriods.reviewPeriod
  );

  // Connect to collateral token contract
  const collateralToken = await ethers.getContractAt(
    "MockERC20",
    poolParams.collateralToken
  );
  const decimals = await collateralToken.decimals();

  // Convert redemption amount into integer with the corresponding amount of decimals
  const redemptionAmount = parseUnits(redemptionAmountInput, decimals);

  // Connect to position token
  let positionTokenInstance: MockERC20;
  if (sideToRedeem === "short") {
    positionTokenInstance = await ethers.getContractAt(
      "MockERC20",
      poolParams.shortToken
    );
  } else if (sideToRedeem === "long") {
    positionTokenInstance = await ethers.getContractAt(
      "MockERC20",
      poolParams.longToken
    );
  } else {
    throw new Error("Invalid input for sideToRedeem. Choose short or long.");
  }

  // Get total supply of position token before redemption
  const positionTokenTotalSupplyBefore =
    await positionTokenInstance.totalSupply();

  // Get positionTokenHolder's collateral token balance before redemption
  const collateralBalanceBefore = await collateralToken.balanceOf(
    positionTokenHolder.address
  );

  // Get positionTokenHolder's position token balance before redemption
  const positionTokenBalanceBefore = await positionTokenInstance.balanceOf(
    positionTokenHolder.address
  );

  // Check positionTokenHolder's position token wallet balance
  if (positionTokenBalanceBefore.lt(redemptionAmount)) {
    throw "Insufficient position token balance";
  }

  // Redeem position tokens
  const tx = await diva.redeemPositionToken(
    positionTokenInstance.address,
    redemptionAmount
  );
  await tx.wait();

  // Get total supply of position token after redemption
  const positionTokenTotalSupplyAfter =
    await positionTokenInstance.totalSupply();

  // Get positionTokenHolder's collateral token balance after redemption
  const collateralBalanceAfter = await collateralToken.balanceOf(
    positionTokenHolder.address
  );

  // Get positionTokenHolder's position token balance after redemption
  const positionTokenBalanceAfter = await positionTokenInstance.balanceOf(
    positionTokenHolder.address
  );

  // Log relevant info
  console.log("DIVA address: ", diva.address);
  console.log("PositionTokenHolder address: ", positionTokenHolder.address);
  console.log(
    "Position token supply before: ",
    formatUnits(positionTokenTotalSupplyBefore, decimals)
  );
  console.log(
    "Collateral token balance positionTokenHolder before: ",
    formatUnits(collateralBalanceBefore, decimals)
  );
  console.log(
    "Position token balance positionTokenHolder before: ",
    formatUnits(positionTokenBalanceBefore, decimals)
  );
  console.log(
    "Position token supply after: ",
    formatUnits(positionTokenTotalSupplyAfter, decimals)
  );
  console.log(
    "Collateral token balance positionTokenHolder after: ",
    formatUnits(collateralBalanceAfter, decimals)
  );
  console.log(
    "position token balance positionTokenHolder after: ",
    formatUnits(positionTokenBalanceAfter, decimals)
  );
}

// Auxiliary function to perform checks required for successful execution, in line with those implemented
// inside the smart contract function. It is recommended to perform those checks in frontend applications
// to save users gas fees on reverts. Alternatively, use Tenderly to pre-simulate the tx and catch any errors
// before actually executing it.
const _checkConditions = (
  pauseReturnCollateralUntil: BigNumber,
  statusFinalReferenceValue: Status,
  statusTimestamp: BigNumber,
  challengePeriod: BigNumber,
  reviewPeriod: BigNumber
) => {
  // Get current time (proxy for block timestamp)
  const now = getCurrentTimestamp();

  // Confirm that functionality is not paused
  if (now < pauseReturnCollateralUntil.toNumber()) {
    throw new Error("Return collateral paused.");
  }

  // Check that a reference value was already set
  if (statusFinalReferenceValue == Status.Open) {
    throw new Error("Final reference value not set.");
  }

  // Scenarios under which the submitted value will be set to Confirmed at
  // first redemption
  if (statusFinalReferenceValue == Status.Submitted) {
    // Scenario 1: Data provider submitted a final value and it was
    // not challenged during the challenge period. In that case the
    // submitted value is considered the final one.
    if (now <= statusTimestamp.add(challengePeriod).toNumber()) {
      throw new Error("Challenge period not expired.");
    }
  } else if (statusFinalReferenceValue == Status.Challenged) {
    // Scenario 2: Submitted value was challenged, but data provider did not
    // respond during the review period. In that case, the initially submitted
    // value is considered the final one.
    if (now <= statusTimestamp.add(reviewPeriod).toNumber()) {
      throw new Error("Review period not expired.");
    }
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
