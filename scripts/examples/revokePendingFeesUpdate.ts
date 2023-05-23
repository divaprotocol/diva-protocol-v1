/**
 * Script to revoke pending fees update
 * Run: `yarn diva::revokePendingFeesUpdate`
 */

import { ethers, network } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { LibDIVAStorage } from "../../typechain-types/contracts/facets/GetterFacet";

import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS } from "../../constants";
import { getCurrentTimestamp } from "../../utils";

// Auxiliary function to perform checks required for successful execution, in line with those implemented
// inside the smart contract function. It is recommended to perform those checks in frontend applications
// to save users gas fees on reverts.
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

async function main() {
  // Get signers
  const [owner] = await ethers.getSigners();

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

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
