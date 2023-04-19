import { ethers } from "hardhat";
import { getMessage } from "eip-712";
import { BigNumber } from "ethers";
import { parseUnits, splitSignature } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { getExpiryTime } from "./blocktime";

import {
  OfferAddLiquidity,
  OfferRemoveLiquidity,
  OfferCreateContingentPool,
  DivaDomain,
  Signature,
  EIP712DIVA_TYPES,
} from "../constants";

export const calcMakerFillAmount = (
  takerFillAmount: string,
  makerCollateralAmount: string,
  takerCollateralAmount: string
): string => {
  return BigNumber.from(takerFillAmount)
    .mul(BigNumber.from(makerCollateralAmount))
    .div(BigNumber.from(takerCollateralAmount))
    .toString();
};

export const calcPoolFillAmount = (
  takerFillAmount: string,
  makerFillAmount: string
): string => {
  return BigNumber.from(takerFillAmount)
    .add(BigNumber.from(makerFillAmount))
    .toString();
};

export const calcNewCollateralBalance = (
  poolFillAmount: string,
  collateralBalance: string
): string => {
  return BigNumber.from(poolFillAmount)
    .add(BigNumber.from(collateralBalance))
    .toString();
};

export const calcFillableRemainingAmount = (
  takerCollateralAmount: string,
  filledAmount: string
): string => {
  return BigNumber.from(takerCollateralAmount)
    .sub(BigNumber.from(filledAmount))
    .toString();
};

export const generateCreateContingentPoolOfferDetails = async ({
  collateralTokenDecimals = 18,
  maker,
  taker,
  makerCollateralAmount = parseUnits("20", collateralTokenDecimals).toString(),
  takerCollateralAmount = parseUnits("80", collateralTokenDecimals).toString(),
  makerIsLong = true,
  offerExpiryIn = 100000,
  minimumTakerFillAmount = parseUnits("60", collateralTokenDecimals).toString(),
  referenceAsset = "BTC/USD",
  poolExpiryIn = 7200,
  floor = parseUnits("40000").toString(),
  inflection = parseUnits("60000").toString(),
  cap = parseUnits("80000").toString(),
  gradient = parseUnits("0.7", collateralTokenDecimals).toString(),
  collateralToken,
  dataProvider,
  capacity = parseUnits("200", collateralTokenDecimals).toString(),
}: {
  collateralTokenDecimals?: number;
  maker: string;
  taker: string;
  makerCollateralAmount?: string;
  takerCollateralAmount?: string;
  makerIsLong?: boolean;
  offerExpiryIn?: number;
  minimumTakerFillAmount?: string;
  referenceAsset?: string;
  poolExpiryIn?: number;
  floor?: string;
  inflection?: string;
  cap?: string;
  gradient?: string;
  collateralToken: string;
  dataProvider: string;
  capacity?: string;
}): Promise<OfferCreateContingentPool> => {
  return {
    maker,
    taker,
    makerCollateralAmount,
    takerCollateralAmount,
    makerIsLong,
    offerExpiry: await getExpiryTime(offerExpiryIn),
    minimumTakerFillAmount,
    referenceAsset,
    expiryTime: await getExpiryTime(poolExpiryIn),
    floor,
    inflection,
    cap,
    gradient,
    collateralToken,
    dataProvider,
    capacity,
    permissionedERC721Token: ethers.constants.AddressZero,
    salt: Date.now().toString(),
  };
};

export const generateAddLiquidityOfferDetails = async (
  maker: string,
  taker: string,
  makerIsLong: boolean,
  poolId: BigNumber,
  collateralTokenDecimals: number
): Promise<OfferAddLiquidity> => {
  return {
    maker,
    taker,
    makerCollateralAmount: parseUnits("20", collateralTokenDecimals).toString(),
    takerCollateralAmount: parseUnits("80", collateralTokenDecimals).toString(),
    makerIsLong,
    offerExpiry: await getExpiryTime(1000),
    minimumTakerFillAmount: parseUnits(
      "60",
      collateralTokenDecimals
    ).toString(),
    poolId,
    salt: Date.now().toString(),
  };
};

export const generateRemoveLiquidityOfferDetails = async (
  maker: string,
  taker: string,
  makerIsLong: boolean,
  poolId: BigNumber,
  collateralTokenDecimals: number
): Promise<OfferRemoveLiquidity> => {
  return {
    maker,
    taker,
    positionTokenAmount: parseUnits("20", collateralTokenDecimals).toString(),
    makerCollateralAmount: parseUnits("10", collateralTokenDecimals).toString(),
    makerIsLong,
    offerExpiry: await getExpiryTime(1000),
    minimumTakerFillAmount: parseUnits(
      "10",
      collateralTokenDecimals
    ).toString(),
    poolId,
    salt: Date.now().toString(),
  };
};

export const generateSignatureAndTypedMessageHash = async (
  signer: SignerWithAddress,
  divaDomain: DivaDomain,
  type: Record<string, { type: string; name: string }[]>,
  offer: OfferCreateContingentPool | OfferAddLiquidity | OfferRemoveLiquidity,
  primaryType: string
): Promise<[Signature, string]> => {
  // Sign typed data with user1
  const signedTypedData = await signer._signTypedData(divaDomain, type, offer);

  // Split r, s, v from signedTypedData
  const { r, s, v } = splitSignature(signedTypedData);
  const signature = {
    v: v,
    r: r,
    s: s,
  };

  const typedData = {
    types: EIP712DIVA_TYPES,
    primaryType,
    domain: divaDomain,
    message: offer,
  };

  // Get hash of full typedData object
  const typedMessageHash = ethers.utils.hexlify(getMessage(typedData, true));

  return [signature, typedMessageHash];
};
