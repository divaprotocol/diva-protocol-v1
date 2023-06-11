/**
 * Script to post a create contingent pool offer to the API service.
 * The offer is also stored in a JSON file located in the "offers" folder.
 * If the folder does not exist, it will be created automatically.
 * Run: `yarn diva::postCreateContingentPoolOffer --network mumbai`
 */

import fs from "fs";
import fetch from "cross-fetch";
import { ethers, network } from "hardhat";
import { parseUnits } from "@ethersproject/units";
import {
  DIVA_ADDRESS,
  COLLATERAL_TOKENS,
  OfferCreateContingentPool,
  CREATE_POOL_TYPE,
  EIP712API_URL,
} from "../../constants";
import {
  getExpiryTime,
  generateSignatureAndTypedMessageHash,
  writeFile,
} from "../../utils";
import DIVA_ABI from "../../diamondABI/diamond.json";

async function main() {
  // ************************************
  //           INPUT ARGUMENTS
  // ************************************

  // Maker account
  const [maker] = await ethers.getSigners();

  // Collateral token to use
  const collateralTokenSymbol = "WAGMI18";

  // Offer terms
  const taker = "0x0000000000000000000000000000000000000000";
  const makerCollateralAmountInput = "1";
  const takerCollateralAmountInput = "9";
  const makerIsLong = true;
  const offerExpiry = await getExpiryTime(5000);
  const minimumTakerFillAmountInput = "0";
  const referenceAsset = "BTC/USD";
  const expiryTime = await getExpiryTime(2000);
  const floorInput = "200";
  const inflectionInput = "200";
  const capInput = "200";
  const gradientInput = "1";
  const dataProvider = "0x9AdEFeb576dcF52F5220709c1B267d89d5208D78";
  const capacityInput = "200";
  const permissionedERC721Token = "0x0000000000000000000000000000000000000000";


  // ************************************
  //              EXECUTION
  // ************************************

  // Set the API url to post the offer to
  const apiUrl = `${EIP712API_URL[network.name]}/create_contingent_pool`;

  // Get collateral token decimals needed to convert into integer representation
  const collateralTokenAddress =
    COLLATERAL_TOKENS[network.name][collateralTokenSymbol];
  const collateralToken = await ethers.getContractAt(
    "MockERC20",
    collateralTokenAddress
  );
  const decimals = await collateralToken.decimals();

  // Convert inputs into integers
  const makerCollateralAmount = parseUnits(makerCollateralAmountInput, decimals).toString();
  const takerCollateralAmount = parseUnits(takerCollateralAmountInput, decimals).toString();
  const minimumTakerFillAmount = parseUnits(minimumTakerFillAmountInput, decimals).toString();
  const floor = parseUnits(floorInput).toString();
  const inflection = parseUnits(inflectionInput).toString();
  const cap = parseUnits(capInput).toString();
  const gradient = parseUnits(gradientInput, decimals).toString();
  const capacity = parseUnits(capacityInput, decimals).toString();
  const salt = Date.now().toString();

  // Prepare create contingent pool offer
  const offerCreateContingentPool: OfferCreateContingentPool = {
    maker: maker.address,
    taker,
    makerCollateralAmount,
    takerCollateralAmount,
    makerIsLong,
    offerExpiry,
    minimumTakerFillAmount,
    referenceAsset,
    expiryTime,
    floor,
    inflection,
    cap,
    gradient,
    collateralToken: collateralTokenAddress,
    dataProvider,
    capacity,
    permissionedERC721Token,
    salt,
  };

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Prepare data for signing
  const chainId = (await diva.getChainId()).toNumber();
  const verifyingContract = DIVA_ADDRESS[network.name];
  const divaDomain = {
    name: "DIVA Protocol",
    version: "1",
    chainId,
    verifyingContract: DIVA_ADDRESS[network.name],
  };

  // Sign offer
  const [signature] = await generateSignatureAndTypedMessageHash(
    maker,
    divaDomain,
    CREATE_POOL_TYPE,
    offerCreateContingentPool,
    "OfferCreateContingentPool"
  );

  // Get offer hash
  const relevantStateParamsBefore =
    await diva.getOfferRelevantStateCreateContingentPool(
      offerCreateContingentPool,
      signature
    );
  const offerHash = relevantStateParamsBefore.offerInfo.typedOfferHash;

  // Prepare data to be posted to the API server
  const data = {
    ...offerCreateContingentPool,
    signature,
    offerHash,
    chainId,
    verifyingContract,
  };

  // Post offer data to the API server
  await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  // Check if the offers folder exists
  const offersFolderPath = "offers";
  if (!fs.existsSync(offersFolderPath)) {
    // Create the offers folder if it doesn't exist
    fs.mkdirSync(offersFolderPath);
    console.log("New folder called 'offers' created to store the offer json files.")
  }

  // Save offer as JSON. File path is logged as part of the `writeFile` function.
  const jsonFilePath = `offers/createContingentPoolOffer_${offerCreateContingentPool.salt}.json`;
  writeFile(
    jsonFilePath,
    JSON.stringify(data)
  );
  
  // Get posted offer
  const getUrl = `${apiUrl}/${offerHash}`;
  const res = await fetch(getUrl, {
    method: "GET",
  });

  // Log relevant info
  console.log("Offer url: ", getUrl);
  console.log(
    "Create contingent pool offer returned from server: ",
    await res.json()
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
