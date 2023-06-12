/**
 * Script to get the state of an add liquidity offer. The offer details
 * can be retrieved from the API server or a JSON file.
 * Run: `yarn diva::getOfferRelevantStateAddLiquidity --network mumbai`
 */

import { ethers, network } from "hardhat";
import { formatUnits } from "@ethersproject/units";
import DIVA_ABI from "../../diamondABI/diamond.json";
import { queryOffer } from "../../utils";
import {
  DIVA_ADDRESS,
  OfferStatus,
  OfferAddLiquidity,
  OfferAddLiquiditySigned,
  Offer
} from "../../constants";

async function main() {
  // ************************************
  //           INPUT ARGUMENTS
  // ************************************

  // sourceOfferDetails: Set the source for the offer details. If offer is filled/expired/cancelled/invalid,
  // choose "JSON" as source as it will no longer exist on the API server.
  // offerHash: Hash of offer to retrieve. Only required if `sourceOfferDetails` = "API" was selected.
  // jsonFilePath: Only required if `sourceOfferDetails` = "JSON" was selected
  const offer: Offer = {
    sourceOfferDetails: "API",
    offerHash: "0x0b95c391a73b64f5903c2df62dbe41dcf74c0bfa46fcaa19612f1fc06a7113a9",
    jsonFilePath: "./offers/addLiquidityOffer_1686467035892.json",
  };

  
  // ************************************
  //              EXECUTION
  // ************************************

  // Retrieve offer information from the specified source
  const offerInfo = await queryOffer(
    offer.sourceOfferDetails,
    offer.offerHash,
    offer.jsonFilePath,
    "add"
  ) as OfferAddLiquiditySigned;
  
  // Get offerAddLiquidity object from offerInfo
  const offerAddLiquidity: OfferAddLiquidity = offerInfo.offerAddLiquidity;
  
  // Connect to deployed DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Get pool params
  const poolParams = await diva.getPoolParameters(offerAddLiquidity.poolId);

  // Connect to collateral token to obtain the decimals, needed to convert from integer
  // to decimal representation
  const collateralToken = await ethers.getContractAt(
    "MockERC20",
    poolParams.collateralToken
  );
  const decimals = await collateralToken.decimals();

  // Read the offer relevant state information
  const offerState = await diva.getOfferRelevantStateAddLiquidity(
    offerAddLiquidity,
    offerInfo.signature
  );

  // Log relevant info  
  console.log("Offer hash: ", offer.offerHash);
  console.log("Offer status: ", OfferStatus[offerState.offerInfo.status]);
  console.log("Taker filled amount: ", formatUnits(offerState.offerInfo.takerFilledAmount, decimals));
  console.log("Actual taker fillable amount: ", formatUnits(offerState.actualTakerFillableAmount, decimals));
  console.log("Valid signature: ", offerState.isSignatureValid);
  console.log("Pool exists: ", offerState.poolExists);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
