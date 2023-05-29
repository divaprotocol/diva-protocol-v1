/**
 * Script to cancel an offer to add liquidity to an existing contingent pool.
 * Run: `yarn diva::cancelOfferAddLiquidity_from_json --network mumbai`
 */

import fs from "fs";
import { ethers, network } from "hardhat";
import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS, OfferStatus, OfferAddLiquidity } from "../../constants";

async function main() {
  // INPUT: json file path for offer info
  const jsonFilePath = "./offers/addLiquidityOffer_1685374306280.json";

  // Get offer info from json file
  const offerInfo = JSON.parse(fs.readFileSync(jsonFilePath).toString());

  // Connect to deployed DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Get signer of maker
  const [maker] = await ethers.getSigners();

  // Get offerAddLiquidity from offer info
  const offerAddLiquidity = offerInfo as OfferAddLiquidity;

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
  console.log("Signed offer hash: ", offerInfo.offerHash);
  console.log("Signature: ", offerInfo.signature);
  console.log(
    "offerInfo.status === Cancelled: ",
    relevantStateParams.offerInfo.status === OfferStatus.Cancelled
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
