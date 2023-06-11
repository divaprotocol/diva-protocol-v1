/**
 * Script to cancel an offer to remove liquidity on an existing contingent pool.
 * Run: `yarn diva::cancelOfferRemoveLiquidity --network mumbai`
 * 
 * Example usage (append corresponding network):
 * 1. `yarn diva::createContingentPool`: Create a contingent pool.
 * 2. `yarn diva::postRemoveLiquidityOffer`: Post a remove liquidity offer to the API server.
 * 3. `yarn diva::getOfferRelevantStateRemoveLiquidity`: Check the offer state.
 * 4. `yarn diva::cancelOfferRemoveLiquidity`: Cancel the offer.
 * 5. `yarn diva::getOfferRelevantStateRemoveLiquidity`: Check the offer state (read from JSON
 *    as the offer will no longer exist on the API server).
 */

import { ethers, network } from "hardhat";
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
  // offerHash: Hash of offer to cancel. Only required if `sourceOfferDetails` = "API" was selected.
  // jsonFilePath: Only required if `sourceOfferDetails` = "JSON" was selected
  const offer: Offer = {
    sourceOfferDetails: "API",
    offerHash: "0x072a9a39a4e93d55250a5c7f80d994adfaaba8b8149121f2dc576f134f8cb3d7",
    jsonFilePath: "./offers/removeLiquidityOffer_1686504610070.json",
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
    "remove"
  );

  // Connect to deployed DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Get offerRemoveLiquidity from offer info
  const offerRemoveLiquidity = offerInfo as OfferRemoveLiquidity;

  // Get maker signer. Must be an account derived from the MNEMONIC stored in `.env`.
  const maker = await ethers.getSigner(offerRemoveLiquidity.maker);

  // Cancel offer with maker account
  const tx = await diva
    .connect(maker)
    .cancelOfferRemoveLiquidity(offerRemoveLiquidity);
  await tx.wait();

  console.log("Offer successfully filled");

  // Get information about the state of the remove liquidity offer
  const relevantStateParams = await diva.getOfferRelevantStateRemoveLiquidity(
    offerRemoveLiquidity,
    offerInfo.signature
  );

  // Log relevant info
  console.log("chainId", offerInfo.chainId);
  console.log("DIVA address: ", diva.address);
  console.log("PoolId: ", offerInfo.poolId);
  console.log("offerRemoveLiquidity object: ", offerRemoveLiquidity);
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
