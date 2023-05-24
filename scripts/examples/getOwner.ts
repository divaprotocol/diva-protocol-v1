/**
 * Script to get the DIVA Protocol owner.
 * Run: `yarn diva::getOwner`
 */

import { ethers, network } from "hardhat";
import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS } from "../../constants";

async function main() {
  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);
  console.log("DIVA address: ", diva.address);

  // Get current owner
  console.log("Current owner: ", await diva.getOwner());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
