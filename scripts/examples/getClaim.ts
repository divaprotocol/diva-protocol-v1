/**
 * Script to transfer fee claim
 * Run: `yarn diva::getClaim`
 */

import { ethers } from "hardhat";

import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS, COLLATERAL_TOKENS } from "../../constants";

async function main() {
  // INPUT: network
  const network = "goerli";

  // INPUT: collateral token
  const collateralTokenSymbol = "dUSD";

  // Lookup collateral token address
  const collateralToken = COLLATERAL_TOKENS[network][collateralTokenSymbol];

  // Get signer of fee recipient
  const [, recipient] = await ethers.getSigners();

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network]);
  console.log("DIVA address: ", diva.address);

  // Get fee claim amount
  const fee = await diva.getClaim(collateralToken, recipient.address);
  console.log("Claiming address: " + recipient.address);
  console.log("Collateral token address: " + collateralToken);
  console.log("Fee claim amount recipient: " + fee);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
