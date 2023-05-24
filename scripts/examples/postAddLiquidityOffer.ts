/**
 * Script to post an add liquidity offer to the API service.
 * Run: `yarn diva::postAddLiquidityOffer`
 */

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
  const apiUrl = `${EIP712API_URL[network.name]}/add_liquidity`;
  const poolId =
    "0x8329855b0ce0036b8c709724078f2f20e0f579b97527b7c444c2ad77b5c2364b";

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Check whether pool exists (collateral token address is zero if it doesn't)
  const poolParamsBefore = await diva.getPoolParameters(poolId);
  if (poolParamsBefore.collateralToken === ethers.constants.AddressZero) {
    console.log("Error: pool Id does not exist");
    return;
  }

  // Get collateral token decimals
  const erc20Contract = await ethers.getContractAt(
    "MockERC20",
    poolParamsBefore.collateralToken
  );
  const decimals = await erc20Contract.decimals();

  // Offer terms
  const maker = "0x9AdEFeb576dcF52F5220709c1B267d89d5208D78";
  const taker = "0x0000000000000000000000000000000000000000";
  const makerCollateralAmount = parseUnits("20", decimals).toString();
  const takerCollateralAmount = parseUnits("80", decimals).toString();
  const makerIsLong = false;
  const offerExpiry = await getExpiryTime(5000);
  const minimumTakerFillAmount = parseUnits("60", decimals).toString();
  const salt = Date.now().toString();

  // Prepare add liquidity offer
  const offerAddLiquidity: OfferAddLiquidity = {
    maker,
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
  const [signer] = await ethers.getSigners();
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
    signer,
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

  // Prepare data to be posted to the api server
  const data = {
    ...offerAddLiquidity,
    chainId,
    verifyingContract,
    signature,
    offerHash,
  };

  // Post offer data to the api server
  await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  // Save offer as json
  writeFile(
    `offers/addLiquidityOffer_${offerAddLiquidity.salt}.json`,
    JSON.stringify(data)
  );

  console.log("Hash of add liquidity offer: ", offerHash);

  // Get posted offer
  const getUrl = `${apiUrl}/${offerHash}`;
  const res = await fetch(getUrl, {
    method: "GET",
  });

  console.log("Add liquidity offer returned from server: ", await res.json());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
