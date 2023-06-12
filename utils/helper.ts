import { BigNumber, ContractTransaction } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import fs from "fs";
import fetch from "cross-fetch";
import { network } from "hardhat";
import { 
  EIP712API_URL,
  SourceOfferDetails,
  Offer,
  OfferCreateContingentPoolSigned,
  OfferAddLiquiditySigned,
  OfferRemoveLiquiditySigned
} from "../constants";

// Fee in collateral token decimals
export const calcFee = (
  fee: BigNumber, // integer expressed with 18 decimals
  collateralBalance: BigNumber, // integer expressed with collateral token decimals
  collateralTokenDecimals: number
): BigNumber => {
  const SCALING = parseUnits("1", 18 - collateralTokenDecimals);
  const UNIT = parseUnits("1");

  fee = fee.mul(collateralBalance).mul(SCALING).div(UNIT).div(SCALING);

  return fee;
};

export const getPoolIdFromTx = async (
  tx: ContractTransaction
): Promise<string> => {
  const receipt = await tx.wait();
  return (
    receipt.events?.find((x: any) => x.event === "PoolIssued")?.args?.poolId ||
    "0"
  );
};

export const getCurrentTimestamp = () => {
  return Math.floor(Date.now() / 1000);
};

export async function getOfferInfoFromAPI(
  getURL: string
): Promise<OfferCreateContingentPoolSigned | OfferAddLiquiditySigned | OfferRemoveLiquiditySigned> {
  let offerInfo;

  console.log("Offer URL: ", getURL);

  // Get offer details from API service
  try {
    const res = await fetch(getURL, {
      method: "GET",
    });
    if (res.ok) {
      offerInfo = await res.json();
    } else {
      throw new Error("Request failed with status " + res.status);
    }
  } catch (error: any) {
    throw new Error(error.message);
  }

  return offerInfo;
}

export async function getOfferInfoFromJSONFile(
  jsonFilePath: string
): Promise<OfferCreateContingentPoolSigned | OfferAddLiquiditySigned | OfferRemoveLiquiditySigned> {
  let offerInfo;

  console.log("JSON file path: ", jsonFilePath);

  // Get offer details from JSON file
  if (!fs.existsSync(jsonFilePath)) {
    throw new Error("Invalid JSON file path.");
  }
  offerInfo = JSON.parse(fs.readFileSync(jsonFilePath).toString());

  return offerInfo;
}

export async function queryOffers(
  offers: Offer[], action: string
): Promise<OfferCreateContingentPoolSigned[] | OfferAddLiquiditySigned[] | OfferRemoveLiquiditySigned[]> {
  const queryPromises = offers.map(async (offer) => {
    const { sourceOfferDetails, offerHash, jsonFilePath } = offer;
    return queryOffer(sourceOfferDetails, offerHash, jsonFilePath, action);
  });

  try {
    const offerInfos = await Promise.all(queryPromises);
    return offerInfos as OfferCreateContingentPoolSigned[] | OfferAddLiquiditySigned[] | OfferRemoveLiquiditySigned[];;
  } catch (error: unknown) {
    throw new Error("An error occurred during offer queries: " + (error as Error).message);
  }
}

export async function queryOffer(
  sourceOfferDetails: SourceOfferDetails,
  offerHash: string,
  jsonFilePath: string,
  action: string
): Promise<OfferCreateContingentPoolSigned | OfferAddLiquiditySigned | OfferRemoveLiquiditySigned> {
  if (sourceOfferDetails === "API") {
    let getURL;
    if (action === "create") {
      getURL = `${EIP712API_URL[network.name]}/create_contingent_pool/${offerHash}`;
    } else if (action === "add") {
      getURL = `${EIP712API_URL[network.name]}/add_liquidity/${offerHash}`;
    } else if (action === "remove") {
      getURL = `${EIP712API_URL[network.name]}/remove_liquidity/${offerHash}`;
    } else {
      throw new Error("Invalid action string provided. Can onyl be create, add or remove.")
    }
    return await getOfferInfoFromAPI(getURL);
  } else if (sourceOfferDetails === "JSON") {   
    return await getOfferInfoFromJSONFile(jsonFilePath);
  } else {
    throw new Error("Invalid sourceOfferDetails provided. Set to API or JSON.");
  }
}
