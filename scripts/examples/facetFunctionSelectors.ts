/**
 * Script to get facet function selectors for a given facet address.
 * Run: `yarn diva::facetFunctionSelectors --network mumbai`
 */

import { ethers, network } from "hardhat";
import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS } from "../../constants";

async function main() {
  // ************************************
  //           INPUT ARGUMENTS
  // ************************************

  // Facet address
  const facetAddress = "0xbee9E37b40804c1367A5282398773cE671b1BBb2";
  console.log("Facet address: ", facetAddress);


  // ************************************
  //              EXECUTION
  // ************************************

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);
  console.log("DIVA address: ", diva.address);

  // Get facet function selectors
  console.log(
    "Facet function selectors: ",
    await diva.facetFunctionSelectors(facetAddress)
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
