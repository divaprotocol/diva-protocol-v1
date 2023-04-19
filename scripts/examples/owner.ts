/**
 * Script to get owner of DIVA contract
 * Run: `yarn diva::owner`
 */

import { ethers } from "hardhat";

import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS } from "../../constants";

async function main() {
  // INPUTS: network name
  const network = "goerli";

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network]);
  console.log("DIVA address: ", diva.address);

  // Get current owner
  console.log("Current owner: " + (await diva.getOwner()));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
