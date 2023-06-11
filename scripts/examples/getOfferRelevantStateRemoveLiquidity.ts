/**
 * Script to get the state of an add liquidity offer. The offer details
 * can be retrieved from the API server or a JSON file.
 * Run: `yarn diva::getOfferRelevantStateRemoveLiquidity --network mumbai`
 */

import { ethers, network } from "hardhat";
import { formatUnits } from "@ethersproject/units";
import DIVA_ABI from "../../diamondABI/diamond.json";
import { queryOffer } from "../../utils";
import {
  DIVA_ADDRESS,
  OfferStatus,
  OfferRemoveLiquidity,
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
    offerHash: "0x072a9a39a4e93d55250a5c7f80d994adfaaba8b8149121f2dc576f134f8cb3d7",
    jsonFilePath: "./offers/removeLiquidityOffer_1686504610070.json",
  };

  
  // ************************************
  //              EXECUTION
  // ************************************

  // Retrieve offer information from the specified source
  const offerInfo = await queryOffer(
    offer.sourceOfferDetails,
    offer.offerHash,
    offer.jsonFilePath,
    "remove"
  );
  
  // Get offerRemoveLiquidity object from offerInfo
  const offerRemoveLiquidity = offerInfo as OfferRemoveLiquidity;
  
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
  const offerState = await diva.getOfferRelevantStateRemoveLiquidity(
    offerRemoveLiquidity,
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
