/**
 * Script to cancel an offer to create a contingent pool.
 * Run: `yarn diva::cancelOfferCreateContingentPool_from_api`
 */

import fetch from "cross-fetch";
import { ethers, network } from "hardhat";

import DIVA_ABI from "../../diamondABI/diamond.json";
import {
  DIVA_ADDRESS,
  OfferStatus,
  EIP712API_URL,
  OfferCreateContingentPool,
} from "../../constants";

async function main() {
  // INPUT: offer hash value
  const offerHash =
    "0xe60301f7727289aa88d573ec11edf967b95fd1711c3894a6033251c822fd19e6";

  // Get offer info from api service
  const res = await fetch(
    `${EIP712API_URL[network.name]}/create_contingent_pool/${offerHash}`,
    {
      method: "GET",
    }
  );
  const offerInfo = await res.json();

  // Connect to deployed DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Get signer of maker
  const [maker] = await ethers.getSigners();

  // Get offerCreateContingentPool from offer info
  const offerCreateContingentPool = offerInfo as OfferCreateContingentPool;

  // Cancel offer with maker account
  const tx = await diva
    .connect(maker)
    .cancelOfferCreateContingentPool(offerCreateContingentPool);
  await tx.wait();

  console.log("Offer successfully cancelled");

  // Get information about the state of the create contingent pool offer
  const relevantStateParams =
    await diva.getOfferRelevantStateCreateContingentPool(
      offerCreateContingentPool,
      offerInfo.signature
    );

  // Log relevant info
  console.log("chainId", offerInfo.chainId);
  console.log("DIVA address: ", diva.address);
  console.log("offerCreateContingentPool object: ", offerCreateContingentPool);
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
