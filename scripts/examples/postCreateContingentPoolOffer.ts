/**
 * Script to post CreateContingentPoolOffer to backend
 * Run: `yarn diva::postCreateContingentPoolOffer`
 */

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
  const apiUrl = `${EIP712API_URL[network.name]}/create_contingent_pool`;
  const collateralTokenSymbol = "dUSD";

  // Get collateral token decimals
  const collateralTokenAddress =
    COLLATERAL_TOKENS[network.name][collateralTokenSymbol];
  const collateralToken = await ethers.getContractAt(
    "MockERC20",
    collateralTokenAddress
  );
  const decimals = await collateralToken.decimals();

  // Offer terms
  const maker = "0x9AdEFeb576dcF52F5220709c1B267d89d5208D78";
  const taker = "0x0000000000000000000000000000000000000000";
  const makerCollateralAmount = parseUnits("1", decimals).toString();
  const takerCollateralAmount = parseUnits("9", decimals).toString();
  const makerIsLong = true;
  const offerExpiry = await getExpiryTime(5000);
  const minimumTakerFillAmount = parseUnits("0", decimals).toString();
  const referenceAsset = "BTC/USD";
  const expiryTime = await getExpiryTime(2000);
  const floor = parseUnits("200").toString();
  const inflection = parseUnits("200").toString();
  const cap = parseUnits("200").toString();
  const gradient = parseUnits("1", decimals).toString();
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

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

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

  // Prepare data to be posted to the api server
  const data = {
    ...offerCreateContingentPool,
    signature,
    offerHash,
    chainId,
    verifyingContract,
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
    `offers/createContingentPoolOffer_${offerCreateContingentPool.salt}.json`,
    JSON.stringify(data)
  );

  console.log("Hash of create contingent pool offer: ", offerHash);

  // Get posted offer
  const getUrl = `${apiUrl}/${offerHash}`;
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
