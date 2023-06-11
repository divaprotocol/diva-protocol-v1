/**
 * Script to post an add liquidity offer to the API service.
 * The offer is also stored in a JSON file located in the "offers" folder.
 * If the folder does not exist, it will be created automatically.
 * Run: `yarn diva::postAddLiquidityOffer --network mumbai`
 */

import fs from "fs";
import fetch from "cross-fetch";
import { ethers, network } from "hardhat";
import { parseUnits } from "@ethersproject/units";
import {
  DIVA_ADDRESS,
  ADD_LIQUIDITY_TYPE,
  OfferAddLiquidity,
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

  // Specify maker
  const [maker] = await ethers.getSigners();

  // Specify Id of pool to add liquidity to
  const poolId =
    "0x9f324918873a1cadd70b830cbe6fd164bb777fc955186887f8c28ae80034aede";

  // Offer terms
  const taker = "0x0000000000000000000000000000000000000000";
  const makerCollateralAmountInput = "20";
  const takerCollateralAmountInput = "80";
  const makerIsLong = false;
  const offerExpiry = await getExpiryTime(5000);
  const minimumTakerFillAmountInput = "60";


  // ************************************
  //              EXECUTION
  // ************************************

  // Set the API url to post the offer to
  const apiUrl = `${EIP712API_URL[network.name]}/add_liquidity`;

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Check whether pool exists (collateral token is zero address if it doesn't)
  const poolParamsBefore = await diva.getPoolParameters(poolId);
  if (poolParamsBefore.collateralToken === ethers.constants.AddressZero) {
    console.log("Error: pool Id does not exist");
    return;
  }

  // Get collateral token decimals needed to convert into integer representation
  const collateralToken = await ethers.getContractAt(
    "MockERC20",
    poolParamsBefore.collateralToken
  );
  const decimals = await collateralToken.decimals();

  // Convert inputs into integers
  const makerCollateralAmount = parseUnits(makerCollateralAmountInput, decimals).toString();
  const takerCollateralAmount = parseUnits(takerCollateralAmountInput, decimals).toString();
  const minimumTakerFillAmount = parseUnits(minimumTakerFillAmountInput, decimals).toString();
  const salt = Date.now().toString();

  // Prepare add liquidity offer
  const offerAddLiquidity: OfferAddLiquidity = {
    maker: maker.address,
    taker,
    makerCollateralAmount,
    takerCollateralAmount,
    makerIsLong,
    offerExpiry,
    minimumTakerFillAmount,
    poolId,
    salt,
  };

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
    ADD_LIQUIDITY_TYPE,
    offerAddLiquidity,
    "OfferAddLiquidity"
  );

  // Get offer hash
  const relevantStateParams = await diva.getOfferRelevantStateAddLiquidity(
    offerAddLiquidity,
    signature
  );
  const offerHash = relevantStateParams.offerInfo.typedOfferHash;

  // Prepare data to be posted to the API server
  const data = {
    ...offerAddLiquidity,
    chainId,
    verifyingContract,
    signature,
    offerHash,
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
  const jsonFilePath = `offers/addLiquidityOffer_${offerAddLiquidity.salt}.json`;
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
  console.log("Add liquidity offer returned from server: ", await res.json());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
