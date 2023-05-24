/**
 * Script to unpause the `removeLiquidity` and `redeemPositionToken` functions.
 * The execution of this function is reserved to the protocol owner only.
 * Run: `yarn diva::unpauseReturnCollateral`
 */

import { ethers, network } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS } from "../../constants";
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

  // Get `pauseReturnCollateralUntil` before unpause
  const pauseReturnCollateralUntilBefore = (
    await diva.getGovernanceParameters()
  ).pauseReturnCollateralUntil;

  // Confirm that all conditions are met before continuing
  await _checkConditions(diva, owner, pauseReturnCollateralUntilBefore);

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

// Auxiliary function to perform checks required for successful execution, in line with those implemented
// inside the smart contract function. It is recommended to perform those checks in frontend applications
// to save users gas fees on reverts. Alternatively, use Tenderly to pre-simulate the tx and catch any errors
// before actually executing it.
const _checkConditions = async (
  diva: Contract,
  owner: SignerWithAddress,
  pauseReturnCollateralUntil: number,
) => {
  // Get current time (proxy for block timestamp)
  const now = getCurrentTimestamp();

  // Confirm that caller is the owner
  if ((await diva.getOwner()) !== owner.address) {
    throw new Error("Caller is not owner.");
  }

  // Check that the return of collateral is not already unpaused
  if (now >= pauseReturnCollateralUntil) {
    throw new Error("Already unpaused.");  
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
