/**
 * Script to cancel an offer to remove liquidity on an existing contingent pool.
 * Run: `yarn diva::cancelOfferRemoveLiquidity_from_api --network mumbai`
 */

import fetch from "cross-fetch";
import { ethers, network } from "hardhat";
import DIVA_ABI from "../../diamondABI/diamond.json";
import {
  DIVA_ADDRESS,
  EIP712API_URL,
  OfferStatus,
  OfferRemoveLiquidity,
} from "../../constants";

async function main() {
  // INPUT: offer hash value
  const offerHash =
    "0x2dc0d0930c0186c160cfbab6b7e7267dfa67266486c27c489a98032eb9834321";

  // Get offer info from api service
  const res = await fetch(
    `${EIP712API_URL[network.name]}/remove_liquidity/${offerHash}`,
    {
      method: "GET",
    }
  );
  const offerInfo = await res.json();

  // Connect to deployed DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Get signer of maker
  const [maker] = await ethers.getSigners();

  // Get offerRemoveLiquidity from offer info
  const offerRemoveLiquidity = offerInfo as OfferRemoveLiquidity;

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
