/**
 * Script to post OfferAddLiquidity to backend
 * Run: `yarn diva::postAddLiquidityOffer`
 */

import fetch from "cross-fetch";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { parseUnits } from "@ethersproject/units";
import {
  DIVA_ADDRESS,
  ADD_LIQUIDITY_TYPE,
  OfferAddLiquidity,
} from "../../constants";
import {
  getExpiryTime,
  generateSignatureAndTypedMessageHash,
} from "../../utils";
import DIVA_ABI from "../../diamondABI/diamond.json";
import { GetterFacet } from "../../typechain-types";

async function main() {
  const API_URL = "https://eip712api.xyz/diva/offer/v1/add_liquidity";
  const network = "goerli";
  const poolId = "0x872feb863492cbe8b7f6e9fa6085cdf9ba38c3553a12b2f9dae499417fbff968";

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network]);

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
  const offerExpiry = await getExpiryTime(50);
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
  const getterFacet: GetterFacet = await ethers.getContractAt(
    "GetterFacet",
    DIVA_ADDRESS[network]
  );
  const chainId = (await getterFacet.getChainId()).toNumber();
  const verifyingContract = DIVA_ADDRESS[network];
  const divaDomain = {
    name: "DIVA Protocol",
    version: "1",
    chainId,
    verifyingContract: DIVA_ADDRESS[network],
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
  const relevantStateParams =
    await getterFacet.getOfferRelevantStateAddLiquidity(
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
  await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  console.log("Hash of add liquidity offer: ", offerHash);

  // Get posted offer
  const getUrl = `${API_URL}/${offerHash}`;
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
