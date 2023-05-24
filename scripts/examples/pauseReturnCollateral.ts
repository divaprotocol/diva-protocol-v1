/**
 * Script to pause the `removeLiquidity` and `redeemPositionToken` functions.
 * The execution of this function is reserved to the owner only.
 * Run: `yarn diva::pauseReturnCollateral`
 */

import { ethers, network } from "hardhat";
import { BigNumber, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS, ONE_DAY } from "../../constants";
import { getCurrentTimestamp } from "../../utils";

async function main() {
  // Get signers
  const [owner] = await ethers.getSigners();

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Get `pauseReturnCollateralUntil` before pause
  const pauseReturnCollateralUntilBefore = (
    await diva.getGovernanceParameters()
  ).pauseReturnCollateralUntil;

  // Confirm that all conditions are met before continuing
  await _checkConditions(diva, owner, pauseReturnCollateralUntilBefore);

  // Pause return collateral
  const tx = await diva.connect(owner).pauseReturnCollateral();
  await tx.wait();

  // Get `pauseReturnCollateralUntil` after pause
  const pauseReturnCollateralUntilAfter = (await diva.getGovernanceParameters())
    .pauseReturnCollateralUntil;

  // Log relevant info
  console.log("DIVA address: ", diva.address);
  console.log("Contract owner address: ", owner.address);
  console.log(
    "`pauseReturnCollateralUntil` before pause: ",
    pauseReturnCollateralUntilBefore
  );
  console.log(
    "`pauseReturnCollateralUntil` after pause: ",
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
  pauseReturnCollateralUntil: BigNumber
) => {
  // Confirm that caller is the owner
  if ((await diva.getOwner()) !== owner.address) {
    throw new Error("Caller is not owner.");
  }

  // Minimum time between two pause events is 10 days, but users can interact
  // with `redeemPositionToken` and `removeLiquidity` already after 8 days giving them
  // at least 2 days to remove collateral until the next pause can be activated.
  if (pauseReturnCollateralUntil.gte(getCurrentTimestamp() - 2 * ONE_DAY)) {
    throw new Error("Too early to pause again.");
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
