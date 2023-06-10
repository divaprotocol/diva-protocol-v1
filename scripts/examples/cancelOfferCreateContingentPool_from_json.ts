/**
 * Script to cancel a create contingent pool offer.
 * Run: `yarn diva::cancelOfferCreateContingentPool_from_json --network mumbai`
 * 
  * Example usage (append corresponding network):
 * 1. `yarn diva::postCreateContingentPoolOffer`: Post a create offer to the API server.
 * 2. `yarn diva::getOfferRelevantStateCreateContingentPool`: Check the offer state.
 * 3. `yarn diva::cancelOfferCreateContingentPool_from_json`: Cancel the offer.
 * 4. `yarn diva::getOfferRelevantStateCreateContingentPool`: Check the offer state.
 */

// @todo test the example usage

import fs from "fs";
import { ethers, network } from "hardhat";
import DIVA_ABI from "../../diamondABI/diamond.json";
import {
  DIVA_ADDRESS,
  OfferStatus,
  OfferCreateContingentPool,
} from "../../constants";

async function main() {
  // ************************************
  //           INPUT ARGUMENTS
  // ************************************

  // json file path for offer info
  const jsonFilePath = "./offers/createContingentPoolOffer_1686309422934.json";

  // Note that the maker signer is derived from the offer details. Must be an account
  // derived from the MNEMONIC stored in `.env`.


  // ************************************
  //              EXECUTION
  // ************************************

  // Get offer info from json file
  const offerInfo = JSON.parse(fs.readFileSync(jsonFilePath).toString());

  // Connect to deployed DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Get offerCreateContingentPool from offer info
  const offerCreateContingentPool = offerInfo as OfferCreateContingentPool;

  // Get maker signer. Must be an account derived from the MNEMONIC stored in `.env`.
  const maker = await ethers.getSigner(offerCreateContingentPool.maker);

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
  console.log(
    "offerInfo.status: ", OfferStatus[relevantStateParams.offerInfo.status]
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
