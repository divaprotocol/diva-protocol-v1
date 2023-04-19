/**
 * Script to update the treasury address
 * Run: `yarn diva::updateTreasury`
 */

import { ethers } from "hardhat";

import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS } from "../../constants";

async function main() {
  // INPUTS: network name
  const network = "goerli"; // has to be one of the networks included in constants.js
  const newTreasuryAddress = "0x47566C6c8f70E4F16Aa3E7D8eED4a2bDb3f4925b";

  // Get signers
  const [owner] = await ethers.getSigners();
  console.log("contract owner address: ", owner.address);

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network]);
  console.log("DIVA address: ", diva.address);

  // Check if signer of owner is correct
  if ((await diva.getOwner()) !== owner.address) {
    throw new Error("Invalid signer of owner");
  }

  // Get current treasury address
  console.log(
    "Current treasury address: " +
      (await diva.getGovernanceParameters()).treasury
  );

  // Set new treasury address
  const tx = await diva.connect(owner).updateTreasury(newTreasuryAddress);
  const receipt = await tx.wait();

  // Get newly set treasury address from event
  const treasuryUpdatedEvent = receipt.events.find(
    (item: any) => item.event === "TreasuryUpdated"
  );
  const treasuryFromEvent = treasuryUpdatedEvent.args.treasury;

  // Get new treasury address
  console.log("New treasury address: " + treasuryFromEvent);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
