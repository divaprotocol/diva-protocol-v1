/**
 * Script to revoke pending treasury update.
 * The execution of this function is reserved to the protocol owner only.
 * Run: `yarn diva::revokePendingTreasuryUpdate`
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

  // Set owner
  const [owner] = await ethers.getSigners();


  // ************************************
  //              EXECUTION
  // ************************************

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Get treasury info before revoke
  const treasuryInfoBefore = await diva.getTreasuryInfo();

  // Confirm that all conditions are met before continuing
  await _checkConditions(diva, owner, treasuryInfoBefore);

  // Get treasury address before revoke
  const treasuryAddressBefore = (await diva.getGovernanceParameters()).treasury;

  // Revoke pending treasury update
  const tx = await diva.connect(owner).revokePendingTreasuryUpdate();
  await tx.wait();

  // Get treasury info after revoke
  const treasuryInfoAfter = await diva.getTreasuryInfo();

  // Get treasury address after revoke
  const treasuryAddressAfter = (await diva.getGovernanceParameters()).treasury;

  // Log relevant info
  console.log("DIVA address: ", diva.address);
  console.log("Contract owner address: ", owner.address);
  console.log("Treasury info before revoke: ", treasuryInfoBefore);
  console.log("Treasury info after revoke: ", treasuryInfoAfter);
  console.log("Treasury address before revoke: ", treasuryAddressBefore);
  console.log("Treasury address after revoke: ", treasuryAddressAfter);
}

// Auxiliary function to perform checks required for successful execution, in line with those implemented
// inside the smart contract function. It is recommended to perform those checks in frontend applications
// to save users gas fees on reverts. Alternatively, use Tenderly to pre-simulate the tx and catch any errors
// before actually executing it.
const _checkConditions = async (
  diva: Contract,
  owner: SignerWithAddress,
  treasuryInfo: TreasuryInfo
) => {
  // Confirm that signer of owner is correct
  if ((await diva.getOwner()) !== owner.address) {
    throw new Error("Invalid signer of owner.");
  }

  // Confirm that new treasury address is not active yet
  if (treasuryInfo.startTimeTreasury.lte(getCurrentTimestamp())) {
    throw new Error("Treasury address is already active.");
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
