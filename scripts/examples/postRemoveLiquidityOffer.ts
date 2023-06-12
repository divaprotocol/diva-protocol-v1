/**
* Script to post a remove liquidity offer to the API service.
 * The offer is also stored in a JSON file located in the "offers" folder.
 * If the folder does not exist, it will be created automatically.
 * Run: `yarn diva::postRemoveLiquidityOffer --network mumbai`
 */

import fs from "fs";
import fetch from "cross-fetch";
import { ethers, network } from "hardhat";
import { parseUnits } from "@ethersproject/units";
import {
  DIVA_ADDRESS,
  REMOVE_LIQUIDITY_TYPE,
  OfferRemoveLiquidity,
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

  // Id of pool to remove liquidity from
  const poolId =
    "0x7e5b34f6dc058ace5b51b90e4b60d2b8a80df1e6198de89f4c941290b3c7bfc1";

  // Offer terms
  const taker = "0x0000000000000000000000000000000000000000";
  const makerCollateralAmountInput = "1";
  const positionTokenAmountInput = "1";
  const makerIsLong = true;
  const offerExpiry = await getExpiryTime(5000);
  const minimumTakerFillAmountInput = "1";


  // ************************************
  //              EXECUTION
  // ************************************

  // Set the API url to post the offer to
  const apiUrl = `${EIP712API_URL[network.name]}/remove_liquidity`;

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Check whether pool exists (collateral token address is zero if it doesn't)
  const poolParamsBefore = await diva.getPoolParameters(poolId);
  if (poolParamsBefore.collateralToken === ethers.constants.AddressZero) {
    console.log("Error: pool Id does not exist");
    return;
  }

  // Get collateral token decimals needed to convert into integer representation
  const erc20Contract = await ethers.getContractAt(
    "MockERC20",
    poolParamsBefore.collateralToken
  );
  const decimals = await erc20Contract.decimals();

  // Convert inputs into integers
  const makerCollateralAmount = parseUnits(makerCollateralAmountInput, decimals).toString();
  const positionTokenAmount = parseUnits(positionTokenAmountInput, decimals).toString();
  const minimumTakerFillAmount = parseUnits(minimumTakerFillAmountInput, decimals).toString();
  const salt = Date.now().toString();

  // Prepare remove liquidity offer
  const offerRemoveLiquidity: OfferRemoveLiquidity = {
    maker: maker.address,
    taker,
    makerCollateralAmount,
    positionTokenAmount,
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
    REMOVE_LIQUIDITY_TYPE,
    offerRemoveLiquidity,
    "OfferRemoveLiquidity"
  );

  // Get offer hash
  const relevantStateParams = await diva.getOfferRelevantStateRemoveLiquidity(
    offerRemoveLiquidity,
    signature
  );
  const offerHash = relevantStateParams.offerInfo.typedOfferHash;

  // Prepare data to be posted to the API server
  const data = {
    ...offerRemoveLiquidity,
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

  // Save offer as json
  const jsonFilePath = `offers/removeLiquidityOffer_${offerRemoveLiquidity.salt}.json`;
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
    "Remove liquidity offer returned from server: ",
    await res.json()
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
