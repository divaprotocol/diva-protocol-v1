/**
 * Script to cancel an offer to add liquidity to an existing contingent pool.
 * Run: `yarn diva::cancelOfferAddLiquidity --network mumbai`
 * 
 * Example usage (append corresponding network):
 * 1. `yarn diva::createContingentPool`: Create a contingent pool.
 * 2. `yarn diva::postAddLiquidityOffer`: Post an add liquidity offer to the API server.
 * 3. `yarn diva::getOfferRelevantStateAddLiquidity`: Check the offer state.
 * 4. `yarn diva::cancelOfferAddLiquidity`: Cancel the offer.
 * 5. `yarn diva::getOfferRelevantStateAddLiquidity`: Check the offer state (read from JSON
 *    as the offer will no longer exist on the API server).
 */

import { ethers, network } from "hardhat";
import DIVA_ABI from "../../diamondABI/diamond.json";
import { queryOffer } from "../../utils";
import {
  DIVA_ADDRESS,
  OfferStatus,
  OfferAddLiquidity,
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
    offerHash: "0xe03392576478daece24fc61bb763d7871cbe36d9662b6807f4ff760d9ccc3a0c",
    jsonFilePath: "./offers/addLiquidityOffer_1686504183504.json",
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
    "add"
  );

  // Connect to deployed DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Get offerAddLiquidity from offer info
  const offerAddLiquidity = offerInfo as OfferAddLiquidity;

  // Get maker signer. Must be an account derived from the MNEMONIC stored in `.env`.
  const maker = await ethers.getSigner(offerAddLiquidity.maker);

  // Cancel offer with maker account
  const tx = await diva
    .connect(maker)
    .cancelOfferAddLiquidity(offerAddLiquidity);
  await tx.wait();

  console.log("Offer successfully cancelled");

  // Get information about the state of the add liquidity offer
  const relevantStateParams = await diva.getOfferRelevantStateAddLiquidity(
    offerAddLiquidity,
    offerInfo.signature
  );

  // Log relevant info
  console.log("chainId", offerInfo.chainId);
  console.log("DIVA address: ", diva.address);
  console.log("PoolId: ", offerInfo.poolId);
  console.log("offerAddLiquidity object: ", offerAddLiquidity);
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
