/**
 * Script to unpause return collateral
 * Run: `yarn diva::unpauseReturnCollateral`
 */

import { ethers, network } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS } from "../../constants";

// Auxiliary function to perform checks required for successful execution, in line with those implemented
// inside the smart contract function. It is recommended to perform those checks in frontend applications
// to save users gas fees on reverts.
const _checkConditions = async (diva: Contract, owner: SignerWithAddress) => {
  // Confirm that signer of owner is correct
  if ((await diva.getOwner()) !== owner.address) {
    throw new Error("Invalid signer of owner.");
  }
};

async function main() {
  // Get signers
  const [owner] = await ethers.getSigners();

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Get `pauseReturnCollateralUntil` before unpause
  const pauseReturnCollateralUntilBefore = (
    await diva.getGovernanceParameters()
  ).pauseReturnCollateralUntil;

  // Confirm that all conditions are met before continuing
  await _checkConditions(diva, owner);

  // Unpause return collateral
  const tx = await diva.connect(owner).unpauseReturnCollateral();
  await tx.wait();

  // Get `pauseReturnCollateralUntil` after unpause
  const pauseReturnCollateralUntilAfter = (await diva.getGovernanceParameters())
    .pauseReturnCollateralUntil;

  // Log relevant info
  console.log("DIVA address: ", diva.address);
  console.log("Contract owner address: ", owner.address);
  console.log(
    "`pauseReturnCollateralUntil` before unpause: ",
    pauseReturnCollateralUntilBefore
  );
  console.log(
    "`pauseReturnCollateralUntil` after unpause: ",
    pauseReturnCollateralUntilAfter
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
