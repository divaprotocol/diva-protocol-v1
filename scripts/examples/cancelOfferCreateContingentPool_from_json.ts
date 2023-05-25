/**
 * Script to cancel an offer to create a contingent pool.
 * Run: `yarn diva::cancelOfferCreateContingentPool_from_json --network mumbai`
 */

import fs from "fs";
import { ethers, network } from "hardhat";
import DIVA_ABI from "../../diamondABI/diamond.json";
import {
  DIVA_ADDRESS,
  OfferStatus,
  OfferCreateContingentPool,
} from "../../constants";

async function main() {
  // INPUT: json file path for offer info
  const jsonFilePath = "./offers/createContingentPoolOffer_1684824667771.json";

  // Get offer info from json file
  const offerInfo = JSON.parse(fs.readFileSync(jsonFilePath).toString());

  // Connect to deployed DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Get signer of maker
  const [maker] = await ethers.getSigners();

  // Get offerCreateContingentPool from offer info
  const offerCreateContingentPool = offerInfo as OfferCreateContingentPool;

  // Cancel offer with maker account
  const tx = await diva
    .connect(maker)
    .cancelOfferCreateContingentPool(offerCreateContingentPool);
  await tx.wait();

  console.log("Offer successfully cancelled");

  // Get information about the state of the create contingent pool offer
  const relevantStateParams =
    await diva.getOfferRelevantStateCreateContingentPool(
      offerCreateContingentPool,
      offerInfo.signature
    );

  // Log relevant info
  console.log("chainId", offerInfo.chainId);
  console.log("DIVA address: ", diva.address);
  console.log("offerCreateContingentPool object: ", offerCreateContingentPool);
  console.log("Signed offer hash: ", offerInfo.offerHash);
  console.log("Signature: ", offerInfo.signature);
  console.log(
    "offerInfo.status === Cancelled: ",
    relevantStateParams.offerInfo.status === OfferStatus.Cancelled
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
