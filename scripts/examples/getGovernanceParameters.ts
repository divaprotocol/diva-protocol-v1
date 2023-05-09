/**
 * Script to get the current governance parameters
 * Run: `yarn diva::getGovernanceParameters`
 */

import { ethers } from "hardhat";

import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS } from "../../constants";

async function main() {
  // INPUT: network
  const network = "goerli";

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network]);
  console.log("DIVA address: ", diva.address);

  // Get governance parameters
  const govParams = await diva.getGovernanceParameters();
  console.log(govParams);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
