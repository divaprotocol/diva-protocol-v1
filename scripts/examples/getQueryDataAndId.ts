/**
 * Script to get the queryId and the queryId from the secondary ownership contract.
 * This function is only implemented in secondary contracts.
 * Run: `yarn ownershipSecondary::getQueryDataAndId --network mumbai`
 */

import { ethers, network } from "hardhat";

async function main() {
  // ************************************
  //           INPUT ARGUMENTS
  // ************************************

  // See `addresses.json` file for secondary ownership contract address
  const ownershipContractAddressSecondary = "0x0a7B725F595F44d38b1c16091EDE5945aF4De9FE";
  

  // ************************************
  //              EXECUTION
  // ************************************

  const ownershipContractSecondary = await ethers.getContractAt(
    "DIVAOwnershipSecondary",
    ownershipContractAddressSecondary
)
  const [queryData, queryId] = await ownershipContractSecondary.getQueryDataAndId();

  // Log relevant info
  console.log("Network: ", network.name);
  console.log("queryId: ", queryId);
  console.log("queryData: ", queryData);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
