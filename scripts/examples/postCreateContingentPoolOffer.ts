/**
 * Script to post CreateContingentPoolOffer to backend
 * Run: `yarn diva::postCreateContingentPoolOffer`
 */

import fetch from "cross-fetch";
import { ethers } from "hardhat";
import { parseUnits } from "@ethersproject/units";
import {
  DIVA_ADDRESS,
  COLLATERAL_TOKENS,
  OfferCreateContingentPool,
  CREATE_POOL_TYPE,
} from "../../constants";
import {
  getExpiryTime,
  generateSignatureAndTypedMessageHash,
} from "../../utils";
import { GetterFacet } from "../../typechain-types";

async function main() {
  const API_URL = "https://eip712api.xyz/diva/offer/v1/create_contingent_pool";
  const network = "goerli";
  const collateralTokenSymbol = "dUSD";

  // Get collateral token decimals
  const collateralTokenAddress =
    COLLATERAL_TOKENS[network][collateralTokenSymbol];
  const collateralToken = await ethers.getContractAt(
    "MockERC20",
    collateralTokenAddress
  );
  const decimals = await collateralToken.decimals();

  // Offer terms
  const maker = "0x9AdEFeb576dcF52F5220709c1B267d89d5208D78";
  const taker = "0x0000000000000000000000000000000000000000";
  const makerCollateralAmount = parseUnits("20", decimals).toString();
  const takerCollateralAmount = parseUnits("80", decimals).toString();
  const makerIsLong = true;
  const offerExpiry = await getExpiryTime(50);
  const minimumTakerFillAmount = parseUnits("60", decimals).toString();
  const referenceAsset = "BTC/USD";
  const expiryTime = await getExpiryTime(200);
  const floor = parseUnits("40").toString();
  const inflection = parseUnits("60").toString();
  const cap = parseUnits("80").toString();
  const gradient = parseUnits("70", decimals).toString();
  const dataProvider = "0x245b8abbc1b70b370d1b81398de0a7920b25e7ca";
  const capacity = parseUnits("200", decimals).toString();
  const permissionedERC721Token = "0x0000000000000000000000000000000000000000"; // ERC721 token address
  const salt = Date.now().toString();

  // Prepare create contingent pool offer
  const offerCreateContingentPool: OfferCreateContingentPool = {
    maker,
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
    CREATE_POOL_TYPE,
    offerCreateContingentPool,
    "OfferCreateContingentPool"
  );

  // Get offer hash
  const relevantStateParamsBefore =
    await getterFacet.getOfferRelevantStateCreateContingentPool(
      offerCreateContingentPool,
      signature
    );
  const offerHash = relevantStateParamsBefore.offerInfo.typedOfferHash;

  // Prepare data to be posted to the api server
  const data = {
    ...offerCreateContingentPool,
    signature,
    offerHash,
    chainId,
    verifyingContract,
  };

  // Post offer data to the api server
  await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  console.log("Hash of create contingent pool offer: ", offerHash);

  // Get posted offer
  const getUrl = `${API_URL}/${offerHash}`;
  const res = await fetch(getUrl, {
    method: "GET",
  });

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
