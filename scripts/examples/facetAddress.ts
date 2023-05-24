/**
 * Script to get facet address of DIVA contract
 * Run: `yarn diva::facetAddress`
 */

import { ethers, network } from "hardhat";
import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS } from "../../constants";

async function main() {
  // ************************************
  //           INPUT ARGUMENTS
  // ************************************

  // Function selector 
  const functionSelector = "0x8691fb58";
  console.log("Function selector: ", functionSelector);


  // ************************************
  //              EXECUTION
  // ************************************

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);
  console.log("DIVA address: ", diva.address);

  // Get facet address
  console.log("Facet address: ", await diva.facetAddress(functionSelector));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
