/**
 * Script to update the treasury address.
 * The execution of this function is reserved to the protocol owner only.
 * Run: `yarn diva::updateTreasury`
 */

import { ethers, network } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS, TreasuryInfo } from "../../constants";
import { getCurrentTimestamp } from "../../utils";

async function main() {
  // ************************************
  //           INPUT ARGUMENTS
  // ************************************

  // New treasury address
  const newTreasuryAddress = "0x47566C6c8f70E4F16Aa3E7D8eED4a2bDb3f4925b";

  // Set owner
  const [owner] = await ethers.getSigners();


  // ************************************
  //              EXECUTION
  // ************************************

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Get treasury info before update
  const treasuryInfoBefore = await diva.getTreasuryInfo();

  // Confirm that all conditions are met before continuing
  await _checkConditions(diva, owner, newTreasuryAddress, treasuryInfoBefore);

  // Get treasury address before update
  const treasuryAddressBefore = (await diva.getGovernanceParameters()).treasury;

  // Update treasury address
  const tx = await diva.connect(owner).updateTreasury(newTreasuryAddress);
  const receipt = await tx.wait();

  // Get treasury address from event
  const treasuryFromEvent = receipt.events.find(
    (item: any) => item.event === "TreasuryUpdated"
  ).args.treasury;

  // Get treasury info after update
  const treasuryInfoAfter = await diva.getTreasuryInfo();

  // Get treasury address after update
  const treasuryAddressAfter = (await diva.getGovernanceParameters()).treasury;

  // Log relevant info
  console.log("DIVA address: ", diva.address);
  console.log("Contract owner address: ", owner.address);
  console.log("Treasury info before update: ", treasuryInfoBefore);
  console.log("Treasury info after update: ", treasuryInfoAfter);
  console.log("Treasury address before update: ", treasuryAddressBefore);
  console.log("Treasury address after update: ", treasuryAddressAfter);
  console.log("Treasury address from event: ", treasuryFromEvent);
}

// Auxiliary function to perform checks required for successful execution, in line with those implemented
// inside the smart contract function. It is recommended to perform those checks in frontend applications
// to save users gas fees on reverts. Alternatively, use Tenderly to pre-simulate the tx and catch any errors
// before actually executing it.
const _checkConditions = async (
  diva: Contract,
  owner: SignerWithAddress,
  newTreasuryAddress: string,
  treasuryInfo: TreasuryInfo
) => {
  // Confirm that caller is the owner
  if ((await diva.getOwner()) !== owner.address) {
    throw new Error("Caller is not owner.");
  }

  // Confirm that the provided treasury address is not the zero address
  if (newTreasuryAddress === ethers.constants.AddressZero) {
    throw new Error("Treasury address cannot be the zero address.");
  }

  // Confirm that there is no pending treasury address update. Revoke to update pending value.
  if (treasuryInfo.startTimeTreasury.gt(getCurrentTimestamp())) {
    throw new Error("There is a pending treasury address update.");
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
