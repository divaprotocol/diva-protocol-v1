/**
 * Script to cancel a create a contingent pool offer.
 * Run: `yarn diva::cancelOfferCreateContingentPool --network mumbai`
 * 
 * Example usage (append corresponding network):
 * 1. `yarn diva::postCreateContingentPoolOffer`: Post a create offer to the API server.
 * 2. `yarn diva::getOfferRelevantStateCreateContingentPool`: Check the offer state.
 * 3. `yarn diva::cancelOfferCreateContingentPool`: Cancel the offer.
 * 4. `yarn diva::getOfferRelevantStateCreateContingentPool`: Check the offer state (read from JSON
 *    as the offer will no longer exist on the API server).
 */

import { ethers, network } from "hardhat";
import DIVA_ABI from "../../diamondABI/diamond.json";
import { queryOffer } from "../../utils";
import {
  DIVA_ADDRESS,
  OfferStatus,
  OfferCreateContingentPool,
  Offer
} from "../../constants";

async function main() {
  // ************************************
  //           INPUT ARGUMENTS
  // ************************************

  // sourceOfferDetails: Set the source for the offer details. If offer is filled/expired/cancelled/invalid,
  // choose "JSON" as source as it will no longer exist on the API server.
  // offerHash: Hash of offer to cancel. Only required if `sourceOfferDetails` = "API" was selected.
  // jsonFilePath: Only required if `sourceOfferDetails` = "JSON" was selected
  const offer: Offer = {
    sourceOfferDetails: "API",
    offerHash: "0x8a086324cbf100792f492d858b3e004cfe703406b5c6111c2df165dfbee6e0f6",
    jsonFilePath: "./offers/createContingentPoolOffer_1686503510947.json",
  };

  // Note that the maker signer is derived from the offer details. Must be an account
  // derived from the MNEMONIC stored in `.env`.


  // ************************************
  //              EXECUTION
  // ************************************

  // Retrieve offer information from the specified source
  const offerInfo = await queryOffer(
    offer.sourceOfferDetails,
    offer.offerHash,
    offer.jsonFilePath,
    "create"
  );

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
  console.log("chainId: ", offerInfo.chainId);
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
