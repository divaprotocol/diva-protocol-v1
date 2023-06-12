/**
 * Script to get the facet addresses of the DIVA contract.
 * Run: `yarn diva::facetAddresses --network mumbai`
 */

import { ethers, network } from "hardhat";
import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS } from "../../constants";

async function main() {
  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);
  console.log("DIVA address: ", diva.address);

  // Log facet addresses
  console.log("Facet addresses: ", await diva.facetAddresses());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
