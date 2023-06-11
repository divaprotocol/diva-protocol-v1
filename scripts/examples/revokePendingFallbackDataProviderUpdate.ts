/**
 * Script to revoke pending fallback data provider update.
 * The execution of this function is reserved to the protocol owner only.
 * Run: `yarn diva::revokePendingFallbackDataProviderUpdate --network mumbai`
 */

import { ethers, network } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS, FallbackDataProviderInfo } from "../../constants";
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

  // Get fallback data provider info before revoke
  const fallbackDataProviderInfoBefore =
    await diva.getFallbackDataProviderInfo();

  // Confirm that all conditions are met before continuing
  await _checkConditions(diva, owner, fallbackDataProviderInfoBefore);

  // Get fallback data provider before revoke
  const fallbackDataProviderBefore = (await diva.getGovernanceParameters())
    .fallbackDataProvider;

  // Revoke pending fallback data provider update
  const tx = await diva
    .connect(owner)
    .revokePendingFallbackDataProviderUpdate();
  await tx.wait();

  // Get fallback data provider info after revoke
  const fallbackDataProviderInfoAfter =
    await diva.getFallbackDataProviderInfo();

  // Get fallback data provider after revoke
  const fallbackDataProviderAfter = (await diva.getGovernanceParameters())
    .fallbackDataProvider;

  // Log relevant info
  console.log("DIVA address: ", diva.address);
  console.log("Contract owner address: ", owner.address);
  console.log(
    "Fallback data provider info before revoke: ",
    fallbackDataProviderInfoBefore
  );
  console.log(
    "Fallback data provider info after revoke: ",
    fallbackDataProviderInfoAfter
  );
  console.log(
    "Fallback data provider before revoke: ",
    fallbackDataProviderBefore
  );
  console.log(
    "Fallback data provider after revoke: ",
    fallbackDataProviderAfter
  );
}

// Auxiliary function to perform checks required for successful execution, in line with those implemented
// inside the smart contract function. It is recommended to perform those checks in frontend applications
// to save users gas fees on reverts. Alternatively, use Tenderly to pre-simulate the tx and catch any errors
// before actually executing it.
const _checkConditions = async (
  diva: Contract,
  owner: SignerWithAddress,
  fallbackDataProviderInfo: FallbackDataProviderInfo
) => {
  // Confirm that signer of owner is correct
  if ((await diva.getOwner()) !== owner.address) {
    throw new Error("Invalid signer of owner.");
  }

  // Confirm that new fallback provider is not active yet
  if (
    fallbackDataProviderInfo.startTimeFallbackDataProvider.lte(
      getCurrentTimestamp()
    )
  ) {
    throw new Error("Fallback provider is already active.");
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
