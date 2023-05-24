/**
 * Script to revoke pending settlement periods update.
 * The execution of this function is reserved to the protocol owner only.
 * Run: `yarn diva::revokePendingSettlementPeriodsUpdate`
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
  lastSettlementPeriods: LibDIVAStorage.SettlementPeriodsStructOutput
) => {
  // Confirm that signer of owner is correct
  if ((await diva.getOwner()) !== owner.address) {
    throw new Error("Invalid signer of owner.");
  }

  // Confirm that settlement periods are not active yet
  if (lastSettlementPeriods.startTime.lte(getCurrentTimestamp())) {
    throw new Error("Settlement periods are already active.");
  }
};

async function main() {
  // Get signers
  const [owner] = await ethers.getSigners();

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Get settlement periods history before revoke
  const settlementPeriodsHistoryLengthBefore =
    await diva.getSettlementPeriodsHistoryLength();
  const settlementPeriodsHistoryBefore = await diva.getSettlementPeriodsHistory(
    settlementPeriodsHistoryLengthBefore
  );

  // Confirm that all conditions are met before continuing
  await _checkConditions(diva, owner, settlementPeriodsHistoryBefore[0]);

  // Get settlement periods before revoke
  const settlementPeriodsBefore = (await diva.getGovernanceParameters())
    .currentSettlementPeriods;

  // Revoke pending settlement periods update
  const tx = await diva.connect(owner).revokePendingSettlementPeriodsUpdate();
  await tx.wait();

  // Get settlement periods history after revoke
  const settlementPeriodsHistoryLengthAfter =
    await diva.getSettlementPeriodsHistoryLength();
  const settlementPeriodsHistoryAfter = await diva.getSettlementPeriodsHistory(
    settlementPeriodsHistoryLengthAfter
  );

  // Get settlement periods after revoke
  const settlementPeriodsAfter = (await diva.getGovernanceParameters())
    .currentSettlementPeriods;

  // Log relevant info
  console.log("DIVA address: ", diva.address);
  console.log("Contract owner address: ", owner.address);
  console.log("Settlement periods before revoke: ", settlementPeriodsBefore);
  console.log("Settlement periods after revoke: ", settlementPeriodsAfter);
  console.log(
    "Settlement periods history length before revoke: ",
    settlementPeriodsHistoryLengthBefore
  );
  console.log(
    "Settlement periods history length after revoke: ",
    settlementPeriodsHistoryLengthAfter
  );
  console.log(
    "Settlement periods history before revoke: ",
    settlementPeriodsHistoryBefore
  );
  console.log(
    "Settlement periods history after revoke: ",
    settlementPeriodsHistoryAfter
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
