/**
 * Script to get the fee claim for a given collateral token and recipient.
 * Run: `yarn diva::getClaim`
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

  // Connect to deployed DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Get fee claim
  const feeClaim = await diva.getClaim(collateralToken, recipient);

  // Get collateral token decimals to perform conversions from integer to decimal.
  // Note that position tokens have the same number of decimals.
  const decimals = await collateralTokenInstance.decimals();

  // Log relevant info
  console.log("DIVA address: ", diva.address);
  console.log("Collateral token: ", collateralToken);
  console.log("Recipient: ", recipient);
  console.log("Fee claim: ", formatUnits(feeClaim, decimals));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
