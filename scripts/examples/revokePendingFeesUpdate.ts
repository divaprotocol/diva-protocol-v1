/**
 * Script to revoke pending fees update.
 * The execution of this function is reserved to the protocol owner only.
 * Run: `yarn diva::revokePendingFeesUpdate --network mumbai`
 */

import { ethers, network } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { LibDIVAStorage } from "../../typechain-types/contracts/facets/GetterFacet";
import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS } from "../../constants";
import { getCurrentTimestamp } from "../../utils";

async function main() {
  // ************************************
  //           INPUT ARGUMENTS
  // ************************************

  // Set owner account
  const [owner] = await ethers.getSigners();


  // ************************************
  //              EXECUTION
  // ************************************

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Get fees history before revoke
  const feesHistoryLengthBefore = await diva.getFeesHistoryLength();
  const feesHistoryBefore = await diva.getFeesHistory(feesHistoryLengthBefore);

  // Confirm that all conditions are met before continuing
  await _checkConditions(diva, owner, feesHistoryBefore[0]);

  // Get fees before revoke
  const feesBefore = (await diva.getGovernanceParameters()).currentFees;

  // Revoke pending fees update
  const tx = await diva.connect(owner).revokePendingFeesUpdate();
  await tx.wait();

  // Get fees history after revoke
  const feesHistoryLengthAfter = await diva.getFeesHistoryLength();
  const feesHistoryAfter = await diva.getFeesHistory(feesHistoryLengthAfter);

  // Get fees after revoke
  const feesAfter = (await diva.getGovernanceParameters()).currentFees;

  // Log relevant info
  console.log("DIVA address: ", diva.address);
  console.log("Contract owner address: ", owner.address);
  console.log("Fees history length before revoke: ", feesHistoryLengthBefore);
  console.log("Fees history length after revoke: ", feesHistoryLengthAfter);
  console.log("Fees history before revoke: ", feesHistoryBefore);
  console.log("Fees history after revoke: ", feesHistoryAfter);
  console.log("Fees before revoke: ", feesBefore);
  console.log("Fees after revoke: ", feesAfter);
}

// Auxiliary function to perform checks required for successful execution, in line with those implemented
// inside the smart contract function. It is recommended to perform those checks in frontend applications
// to save users gas fees on reverts. Alternatively, use Tenderly to pre-simulate the tx and catch any errors
// before actually executing it.
const _checkConditions = async (
  diva: Contract,
  owner: SignerWithAddress,
  lastFees: LibDIVAStorage.FeesStructOutput
) => {
  // Confirm that signer of owner is correct
  if ((await diva.getOwner()) !== owner.address) {
    throw new Error("Invalid signer of owner.");
  }

  // Confirm that fees are not active yet
  if (lastFees.startTime.lte(getCurrentTimestamp())) {
    throw new Error("Fees are already active.");
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
