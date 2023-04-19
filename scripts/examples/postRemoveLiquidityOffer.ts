/**
 * Script to post OfferRemoveLiquidity to backend
 * Run: `yarn diva::postRemoveLiquidityOffer`
 */

import fetch from "cross-fetch";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { parseUnits } from "@ethersproject/units";
import {
  DIVA_ADDRESS,
  REMOVE_LIQUIDITY_TYPE,
  OfferRemoveLiquidity,
} from "../../constants";
import {
  getExpiryTime,
  generateSignatureAndTypedMessageHash,
} from "../../utils";
import DIVA_ABI from "../../diamondABI/diamond.json";
import { GetterFacet } from "../../typechain-types";

async function main() {
  const API_URL = "https://eip712api.xyz/diva/offer/v1/remove_liquidity";
  const network = "goerli";
  const poolId = BigNumber.from(2);

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

  const maker = "0x9AdEFeb576dcF52F5220709c1B267d89d5208D78";
  const taker = "0x0000000000000000000000000000000000000000";
  const makerCollateralAmount = parseUnits("1", decimals).toString();
  const positionTokenAmount = parseUnits("1", decimals).toString();
  const makerIsLong = true;
  const offerExpiry = await getExpiryTime(50);
  const minimumTakerFillAmount = parseUnits("1", decimals).toString();
  const salt = Date.now().toString();

  // Prepare remove liquidity offer
  const offerRemoveLiquidity: OfferRemoveLiquidity = {
    maker,
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
    REMOVE_LIQUIDITY_TYPE,
    offerRemoveLiquidity,
    "OfferRemoveLiquidity"
  );

  // Get offer hash
  const relevantStateParams =
    await getterFacet.getOfferRelevantStateRemoveLiquidity(
      offerRemoveLiquidity,
      signature
    );
  const offerHash = relevantStateParams.offerInfo.typedOfferHash;

  // Prepare data to be posted to the api server
  const data = {
    ...offerRemoveLiquidity,
    poolId: poolId.toString(), // overwriting poolId inside `offerRemoveLiquidity` to switch from BigNumber to String type
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

  console.log("Hash of remove liquidity offer: ", offerHash);

  // Get posted offer
  const getUrl = `${API_URL}/${offerHash}`;
  const res = await fetch(getUrl, {
    method: "GET",
  });

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
