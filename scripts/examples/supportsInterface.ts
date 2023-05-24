/**
 * Script to check whether an interface is supported on DIVA contract.
 * Run: `yarn diva::supportsInterface`
 */

import { ethers, network } from "hardhat";
import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS } from "../../constants";

async function main() {
  // ************************************
  //           INPUT ARGUMENTS
  // ************************************

  // Interface Id to check
  const interfaceId = "0x01ffc9a7"; // EIP165 interface
  console.log("Interface ID: ", interfaceId);


  // ************************************
  //              EXECUTION
  // ************************************

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);
  console.log("DIVA address: ", diva.address);

  // Check whether the interface is supported
  console.log(
    "Supports interface or not: ",
    await diva.supportsInterface(interfaceId)
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
