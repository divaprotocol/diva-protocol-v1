/**
 * Script to cancel an offer to add liquidity to an existing contingent pool.
 * Run: `yarn diva::cancelOfferAddLiquidity_from_api --network mumbai`
 */

import fetch from "cross-fetch";
import { ethers, network } from "hardhat";
import DIVA_ABI from "../../diamondABI/diamond.json";
import {
  DIVA_ADDRESS,
  EIP712API_URL,
  OfferStatus,
  OfferAddLiquidity,
} from "../../constants";

async function main() {
  // INPUT: offer hash value
  const offerHash =
    "0x68c5600e26eb089dc8567c026b6449a8cdf275be3406ac5d863e07aa86577450";

  // Get offer info from api service
  const res = await fetch(
    `${EIP712API_URL[network.name]}/add_liquidity/${offerHash}`,
    {
      method: "GET",
    }
  );
  const offerInfo = await res.json();

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
  console.log("Signed offer hash: ", offerHash);
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
