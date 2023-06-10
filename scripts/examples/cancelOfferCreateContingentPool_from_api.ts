/**
 * Script to cancel a create a contingent pool offer.
 * Run: `yarn diva::cancelOfferCreateContingentPool_from_api --network mumbai`
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
  // ************************************
  //           INPUT ARGUMENTS
  // ************************************

  // Hash of offer to cancel
  const offerHash =
    "0x727ed09b2004e34b0064f60bb20d62f7596aace2919a05ab8d57cab485a173a7";

  // Note that the maker signer is derived from the offer details. Must be an account
  // derived from the MNEMONIC stored in `.env`.


  // ************************************
  //              EXECUTION
  // ************************************

  // Get offer info from API service
  const getURL = `${EIP712API_URL[network.name]}/create_contingent_pool/${offerHash}`;
  const res = await fetch(
    getURL,
    {
      method: "GET",
    }
  );
  const offerInfo = await res.json();

  // Connect to deployed DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Get offerCreateContingentPool from offer info
  const offerCreateContingentPool = offerInfo as OfferCreateContingentPool;

  // Get maker signer. Must be an account derived from the MNEMONIC stored in `.env`.
  const maker = await ethers.getSigner(offerCreateContingentPool.maker);

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
  console.log("chainId: ", offerInfo.chainId);
  console.log("DIVA address: ", diva.address);
  console.log("offerCreateContingentPool object: ", offerCreateContingentPool);
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
