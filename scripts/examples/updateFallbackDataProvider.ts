/**
 * Script to update the fallback data provider address.
 * The execution of this function is reserved to the protocol owner only.
 * Run: `yarn diva::updateFallbackDataProvider`
 */

import { ethers, network } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS, FallbackDataProviderInfo } from "../../constants";
import { getCurrentTimestamp } from "../../utils";

// Auxiliary function to perform checks required for successful execution, in line with those implemented
// inside the smart contract function. It is recommended to perform those checks in frontend applications
// to save users gas fees on reverts.
const _checkConditions = async (
  diva: Contract,
  owner: SignerWithAddress,
  newFallbackDataProvider: string,
  fallbackDataProviderInfo: FallbackDataProviderInfo
) => {
  // Confirm that signer of owner is correct
  if ((await diva.getOwner()) !== owner.address) {
    throw new Error("Invalid signer of owner.");
  }

  // Confirm that provided fallback data provider address is not zero address
  if (newFallbackDataProvider == ethers.constants.AddressZero) {
    throw new Error(
      "Fallback data provider address could not be zero address."
    );
  }

  // Confirm that there is no pending fallback data provider update. Revoke to update pending value.
  if (
    fallbackDataProviderInfo.startTimeFallbackDataProvider.gt(
      getCurrentTimestamp()
    )
  ) {
    throw new Error("There is a pending fallback data provider update.");
  }
};

async function main() {
  // Input argument for `updateFallbackDataProvider` function
  const newFallbackDataProvider = "0x47566C6c8f70E4F16Aa3E7D8eED4a2bDb3f4925b";

  // Get signers
  const [owner] = await ethers.getSigners();

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Get fallback data provider info before update
  const fallbackDataProviderInfoBefore =
    await diva.getFallbackDataProviderInfo();

  // Confirm that all conditions are met before continuing
  await _checkConditions(
    diva,
    owner,
    newFallbackDataProvider,
    fallbackDataProviderInfoBefore
  );

  // Get fallback data provider before update
  const fallbackDataProviderBefore = (await diva.getGovernanceParameters())
    .fallbackDataProvider;

  // Update fallback data provider
  const tx = await diva
    .connect(owner)
    .updateFallbackDataProvider(newFallbackDataProvider);
  const receipt = await tx.wait();

  // Get fallback data provider from events
  const fallbackDataProviderFromEvent = receipt.events.find(
    (item: any) => item.event === "FallbackDataProviderUpdated"
  ).args.fallbackDataProvider;

  // Get fallback data provider info after update
  const fallbackDataProviderInfoAfter =
    await diva.getFallbackDataProviderInfo();

  // Get fallback data provider after update
  const fallbackDataProviderAfter = (await diva.getGovernanceParameters())
    .fallbackDataProvider;

  // Log relevant info
  console.log("DIVA address: ", diva.address);
  console.log("Contract owner address: ", owner.address);
  console.log(
    "Fallback data provider info before update: ",
    fallbackDataProviderInfoBefore
  );
  console.log(
    "Fallback data provider info after update: ",
    fallbackDataProviderInfoAfter
  );
  console.log(
    "Fallback data provider before update: ",
    fallbackDataProviderBefore
  );
  console.log(
    "Fallback data provider after update: ",
    fallbackDataProviderAfter
  );
  console.log(
    "Fallback data provider from event: ",
    fallbackDataProviderFromEvent
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
