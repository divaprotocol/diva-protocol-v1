/**
 * Script to claim fees.
 * Run: `yarn diva::claimFee`
 * 
 * Example usage:
 * 1. `yarn diva::create`: Create pool with a short expiration and a
 * recipient as data provider.
 * 2. `yarn diva::getClaim`: Check the fee claim before confirming the final value.
 * 3. `yarn diva::setFinalReferenceValue`: Confirm the final value on first call using `allowChallenge = false`.
 * 4. `yarn diva::getClaim`: Check the updated fee claim.
 * 5. `yarn diva::claimFee`: Claim fee.
 * 6. `yarn diva::getClaim`: Check the updated fee claim.
 */

import { ethers, network } from "hardhat";

import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS, COLLATERAL_TOKENS } from "../../constants";

async function main() {
  // ************************************
  //           INPUT ARGUMENTS
  // ************************************
  
  // Collateral token
  const collateralTokenSymbol = "dUSD";

  // Fee claim recipient
  const [recipient] = await ethers.getSigners();
  console.log("Recipient address: ", recipient.address);

  // ************************************
  //              EXECUTION
  // ************************************

  // Look-up collateral token address
  const collateralToken =
    COLLATERAL_TOKENS[network.name][collateralTokenSymbol];

  // Connect to collateral token
  const collateralTokenInstance = await ethers.getContractAt(
    "MockERC20",
    collateralToken
  );

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);
  console.log("DIVA address: ", diva.address);

  console.log(
    "Balance before: " +
      (await collateralTokenInstance.balanceOf(recipient.address))
  );

  // Get fee claim amount
  const tx = await diva.claimFee(collateralToken, recipient.address);
  await tx.wait();

  console.log(
    "Balance after: " +
      (await collateralTokenInstance.balanceOf(recipient.address))
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
