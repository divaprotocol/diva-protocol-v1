/**
 * Script to get facet addresses of DIVA contract
 * Run: `yarn diva::facetAddresses`
 */

import { ethers, network } from "hardhat";

import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS } from "../../constants";

async function main() {
  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);
  console.log("DIVA address: ", diva.address);

  // Get facet addresses
  console.log("Facet addresses: ", await diva.facetAddresses());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
