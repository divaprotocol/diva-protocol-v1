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
import { formatUnits } from "@ethersproject/units";
import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS, COLLATERAL_TOKENS } from "../../constants";

async function main() {
  // ************************************
  //           INPUT ARGUMENTS
  // ************************************
  
  // Collateral token
  const collateralTokenSymbol = "dUSD";

  // Fee claim recipient
  const [recipientSigner] = await ethers.getSigners();
  const recipient = recipientSigner.address


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

  // Get collateral token decimals to perform conversions from integer to decimal.
  // Note that position tokens have the same number of decimals.
  const decimals = await collateralTokenInstance.decimals();

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Get recipient's collateral token balance before claiming the fee
  const collateralTokenBalanceRecipientBefore = await collateralTokenInstance.balanceOf(recipient);

  // Get fee claim amount
  const tx = await diva.claimFee(collateralToken, recipient);
  await tx.wait();

  // Get recipient's collateral token balance after claiming the fee
  const collateralTokenBalanceRecipientAfter = await collateralTokenInstance.balanceOf(recipient);

  // Log relevant info
  console.log("DIVA address: ", diva.address);
  console.log("Collateral token: ", collateralToken);
  console.log("Recipient: ", recipient);
  console.log("Collateral token balance recipient before: ",
    formatUnits(collateralTokenBalanceRecipientBefore, decimals)
  );
  console.log("Collateral token balance recipient after: ",
    formatUnits(collateralTokenBalanceRecipientAfter, decimals)
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
