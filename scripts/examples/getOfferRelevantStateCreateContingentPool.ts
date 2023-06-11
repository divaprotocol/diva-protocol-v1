/**
 * Script to get the state of a create contingent pool offer. The offer details
 * can be retrieved from the API server or a JSON file.
 * Run: `yarn diva::getOfferRelevantStateCreateContingentPool --network mumbai`
 */
// @todo add same getter functions for addLiquidity and removeliquidity offers

import { ethers, network } from "hardhat";
import { formatUnits } from "@ethersproject/units";
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
  // offerHash: Hash of offer to fill. Only required if `sourceOfferDetails` = "API" was selected.
  // jsonFilePath: Only required if `sourceOfferDetails` = "JSON" was selected
  const offer: Offer = {
    sourceOfferDetails: "API",
    offerHash: "0xee71a95189b8d0b8e3e61773ee1c6b51d2ac907f11e9b68cc4b7e7c5bbee4a1f",
    jsonFilePath: "./offers/createContingentPoolOffer_1686465438670.json",
  };

  
  // ************************************
  //              EXECUTION
  // ************************************

  // Retrieve offer information from the specified source
  const offerInfo = await queryOffer(
    offer.sourceOfferDetails,
    offer.offerHash,
    offer.jsonFilePath
  );
  
  // Get offerCreateContingentPool object from offerInfo
  const offerCreateContingentPool = offerInfo as OfferCreateContingentPool;
  
  // Connect to collateral token to obtain the decimals, needed to convert from integer
  // to decimal representation
  const collateralToken = await ethers.getContractAt(
    "MockERC20",
    offerInfo.collateralToken
  );
  const decimals = await collateralToken.decimals();

  // Connect to deployed DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Read the offer relevant state information
  const offerState = await diva.getOfferRelevantStateCreateContingentPool(
    offerCreateContingentPool,
    offerInfo.signature
  );

  // Log relevant info  
  console.log("Offer hash: ", offer.offerHash);
  console.log("Offer status: ", OfferStatus[offerState.offerInfo.status]);
  console.log("Taker filled amount: ", formatUnits(offerState.offerInfo.takerFilledAmount, decimals));
  console.log("Actual taker fillable amount: ", formatUnits(offerState.actualTakerFillableAmount, decimals));
  console.log("Valid signature: ", offerState.isSignatureValid);
  console.log("Valid create contingent pool parameters: ", offerState.isValidInputParamsCreateContingentPool);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
