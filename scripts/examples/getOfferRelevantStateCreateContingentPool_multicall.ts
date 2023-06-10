/**
 * Script to get the state of multiple create contingent pool offers using multicall contract.
 * Run: `yarn diva::getOfferRelevantStateCreateContingentPool_multicall --network mumbai`
 */

import { network } from "hardhat";
import DIVA_ABI from "../../diamondABI/diamond.json";
import {
  multicall,
  getOfferInfoFromAPI,
  getOfferInfoFromJSONFile
} from "../../utils";
import {
  DIVA_ADDRESS,
  EIP712API_URL,
  OfferInfo,
  OfferCreateContingentPool,
  Offer
} from "../../constants";
import { BigNumber } from "ethers";


async function main() {
  // ************************************
  //           INPUT ARGUMENTS
  // ************************************

  // Specify the offers to query. Set the source to "JSON" if an offer
  // is filled/expired/cancelled/invalid and no longer exist on the API server.
  // Specify `offerHashInput` if `sourceOfferDetails` = "API".
  // Specify `jsonFilePath` if `sourceOfferDetails` = "JSON".
  const offers: Offer[] = [
    {
      sourceOfferDetails: "API",
      offerHashInput: "0x4ba5b8afdd48a7d96b72611dfa3ff947d1699df5603148df0ed2d4f33a5db524",
      jsonFilePath: "./offers/createContingentPoolOffer_1686376553697.json",
    },
    {
      sourceOfferDetails: "API",
      offerHashInput: "0x3e36961ae90c1df22a032510bb70195093cb5bae906244be616ac91daf14ed75",
      jsonFilePath: "./offers/createContingentPoolOffer_1686376572499.json",
    },
    // Add more offer objects as needed
  ];


  // ************************************
  //              EXECUTION
  // ************************************

  // Get DIVA contract address
  const divaAddress = DIVA_ADDRESS[network.name];

  // Retrieve offer info from specified sources
  let offerInfos;
  try {
    offerInfos = await queryOffers(offers);
  } catch (error) {
    console.error("An error occurred:", error.message);
  }
  
  // Extract relevant offer details to prepare data for multicall
  const offersRelevantState = await Promise.all(
    offerInfos.map(async (offerInfo) => {
      const offerCreateContingentPool = offerInfo as OfferCreateContingentPool;
        
      const offerRelevantState = {
        address: divaAddress,
        name: "getOfferRelevantStateCreateContingentPool",
        params: [offerCreateContingentPool, offerInfo.signature],
      };
      
      return offerRelevantState;
    })
  );
  
  const offerRelevantStatesCreateContingentPool = await multicall(
    network.name,
    DIVA_ABI,
    offersRelevantState
  );
  offerRelevantStatesCreateContingentPool.forEach(
    (
      offerRelevantStateCreateContingentPool: {
        offerInfo: OfferInfo;
        actualTakerFillableAmount: BigNumber;
        isSignatureValid: boolean;
        poolExists: boolean;
      },
      index: number
    ) => {
      console.log(
        `OfferRelevantStateCreateContingentPool for #${
          index + 1
        } is: ${offerRelevantStateCreateContingentPool}`
      );
    }
  );
}

async function queryOffers(offers) {
  const queryPromises = offers.map(async (offer) => {
    const { sourceOfferDetails, offerHashInput, jsonFilePath } = offer;
    return queryItem(sourceOfferDetails, offerHashInput, jsonFilePath);
  });

  try {
    const offerInfos = await Promise.all(queryPromises);
    return offerInfos;
  } catch (error) {
    throw new Error("An error occurred during offer queries: " + error.message);
  }
}

async function queryItem(sourceOfferDetails, offerHashInput, jsonFilePath) {
  if (sourceOfferDetails === "API") {
    const getURL = `${EIP712API_URL[network.name]}/create_contingent_pool/${offerHashInput}`;    
    return await getOfferInfoFromAPI(getURL);
  } else if (sourceOfferDetails === "JSON") {   
    return await getOfferInfoFromJSONFile(jsonFilePath);
  } else {
    throw new Error("Invalid sourceOfferDetails provided. Set to API or JSON.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
