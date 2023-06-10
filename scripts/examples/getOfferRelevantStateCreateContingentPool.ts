/**
 * Script to get the state of a create contingent pool offer. The offer details
 * can be retrieved from the API server or a JSON file.
 * Run: `yarn diva::getOfferRelevantStateCreateContingentPool --network mumbai`
 */

import fs from "fs";
import fetch from "cross-fetch";
import { ethers, network } from "hardhat";
import { formatUnits } from "@ethersproject/units";
import DIVA_ABI from "../../diamondABI/diamond.json";
import {
  DIVA_ADDRESS,
  EIP712API_URL,
  OfferStatus,
  OfferCreateContingentPool
} from "../../constants";

async function main() {
  // ************************************
  //           INPUT ARGUMENTS
  // ************************************

  // Set the source for the offer details. If offer is filled/expired/cancelled/invalid,
  // choose "JSON" as source as it will no longer exist on the API server.
  const sourceOfferDetails = "JSON"  as "JSON" | "API";
  
  // Offer hash to check the relevant state for
  const offerHashInput =
    "0xe2acb16a04dfb1e37f48f9ca7d1a974536d1856effdbf495e2cb33a53d3ca719";  

  // Only required if `sourceOfferDetails` = "JSON" was selected
  const jsonFilePath = "./offers/createContingentPoolOffer_1686316705787.json";

  
  // ************************************
  //              EXECUTION
  // ************************************

  let offerInfo;
  let getURL = `${EIP712API_URL[network.name]}/create_contingent_pool/${offerHashInput}`;
  if (sourceOfferDetails == "API") {
    console.log("Offer URL: ", getURL);

    // Get offer details from API service
    try {
      const res = await fetch(
        getURL,
        {
          method: "GET",
        }
      );    
      if (res.ok) {
        offerInfo = await res.json();      
      } else {
        throw new Error("Request failed with status " + res.status);
      }
    } catch (error) {
      throw new Error(error.message);
    }
  } else if (sourceOfferDetails == "JSON") {
    console.log("JSON file path: ", jsonFilePath)

    // Get offer details from JSON file
    if (!fs.existsSync(jsonFilePath)) {
      throw new Error("Invalid JSON file path.");
    }
    offerInfo = JSON.parse(fs.readFileSync(jsonFilePath).toString());
  } else {
    throw new Error("Invalid sourceOfferDetails provided. Set to API or JSON.");
  }
  
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
  console.log("Offer hash: ", offerHashInput);
  console.log("Offer status: ", OfferStatus[offerState.offerInfo[1]]);
  console.log("Taker filled amount: ", formatUnits(offerState.offerInfo[2], decimals));
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
