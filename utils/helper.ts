import { BigNumber, ContractTransaction } from "ethers";
import { parseUnits } from "ethers/lib/utils";
import fs from "fs";
import fetch from "cross-fetch";

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

export async function getOfferInfoFromAPI(getURL: string): Promise<any> {
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

export async function getOfferInfoFromJSONFile(jsonFilePath: string): Promise<any> {
  let offerInfo;

  console.log("JSON file path: ", jsonFilePath);

  // Get offer details from JSON file
  if (!fs.existsSync(jsonFilePath)) {
    throw new Error("Invalid JSON file path.");
  }
  offerInfo = JSON.parse(fs.readFileSync(jsonFilePath).toString());

  return offerInfo;
}
