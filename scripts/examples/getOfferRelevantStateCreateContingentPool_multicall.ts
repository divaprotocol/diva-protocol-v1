/**
 * Script to get the state of multiple create contingent pool offers using multicall contract.
 * Run: `yarn diva::getOfferRelevantStateCreateContingentPool_multicall --network mumbai`
 */

import { ethers, network } from "hardhat";
import { formatUnits } from "@ethersproject/units";
import DIVA_ABI from "../../diamondABI/diamond.json";
import {
  multicall,
  queryOffers
} from "../../utils";
import {
  DIVA_ADDRESS,
  OfferInfo,
  OfferCreateContingentPool,
  Offer,
  OfferStatus
} from "../../constants";
import { BigNumber } from "ethers";


async function main() {
  // ************************************
  //           INPUT ARGUMENTS
  // ************************************

  // Specify the offers to query. Set the source to "JSON" if an offer
  // is filled/expired/cancelled/invalid and does no longer exist on the API server.
  // Specify `offerHash` if `sourceOfferDetails` = "API".
  // Specify `jsonFilePath` if `sourceOfferDetails` = "JSON".
  const offers: Offer[] = [
    {
      sourceOfferDetails: "API",
      offerHash: "0xd559d140621ff23b3c24bcaf47e03a73afe5c1b53ebd77ac9400d91d8476b4cd",
      jsonFilePath: "./offers/createContingentPoolOffer_1686464547545.json",
    },
    {
      sourceOfferDetails: "API",
      offerHash: "0xef5f5bfcc00851be7dd00ef76d34f6eb5bbcb647970587011b8886b02853b403",
      jsonFilePath: "./offers/createContingentPoolOffer_1686464570587.json",
    },
    // Add more offer objects as needed
  ];


  // ************************************
  //              EXECUTION
  // ************************************

  // Get DIVA contract address
  const divaAddress = DIVA_ADDRESS[network.name];

  // Retrieve offer infos from specified sources
  let offerInfos;
  try {
    offerInfos = await queryOffers(offers, "create");
  } catch (error: unknown) {
    throw new Error("An error occurred:", error.message);
  }
  
  // Extract relevant offer details to prepare data for multicall
  const results = await Promise.all(
    offerInfos.map(async (offerInfo) => {
      // Get subset of fields required for `getOfferRelevantStateCreateContingentPool` call
      const offerCreateContingentPool = offerInfo as OfferCreateContingentPool;
      
      // Prepare data for multicall
      const offerRelevantState = {
        address: divaAddress,
        name: "getOfferRelevantStateCreateContingentPool",
        params: [offerCreateContingentPool, offerInfo.signature],
      };

      // Get collateral token decimals
      const collateralToken = await ethers.getContractAt(
        "MockERC20",
        offerInfo.collateralToken
      );
      const decimals = await collateralToken.decimals();
      
      return {        
        offerRelevantState,
        decimals
      };
    })
  );

  const offersRelevantState = results.map((result) => result.offerRelevantState);
  const decimals = results.map((result) => result.decimals);

  // Execute multicall
  const offerRelevantStatesCreateContingentPool = await multicall(
    network.name,
    DIVA_ABI,
    offersRelevantState
  );

  // Log results
  offerRelevantStatesCreateContingentPool.forEach(
    (
      offerRelevantStateCreateContingentPool: {
        offerInfo: OfferInfo;
        actualTakerFillableAmount: BigNumber;
        isSignatureValid: boolean;
        isValidInputParamsCreateContingentPool: boolean;
      },
      index: number
    ) => {
      console.log(
        `OfferRelevantStateCreateContingentPool for #${
          index + 1
        } is:`
      );
      console.log(
        "Offer hash:", offerRelevantStateCreateContingentPool.offerInfo.typedOfferHash
      )
      console.log("Offer status: ", OfferStatus[offerRelevantStateCreateContingentPool.offerInfo.status]);
      console.log("Taker filled amount: ", 
        formatUnits(
          offerRelevantStateCreateContingentPool.offerInfo.takerFilledAmount, decimals[index]
        )
      );
      console.log("Actual taker fillable amount: ", formatUnits(offerRelevantStateCreateContingentPool.actualTakerFillableAmount, decimals[index]));
      console.log("Valid signature: ", offerRelevantStateCreateContingentPool.isSignatureValid);
      console.log("Valid create contingent pool parameters: ", offerRelevantStateCreateContingentPool.isValidInputParamsCreateContingentPool);
    }
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
