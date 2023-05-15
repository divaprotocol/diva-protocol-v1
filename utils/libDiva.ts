import { ethers, BigNumber, ContractTransaction, BigNumberish } from "ethers";
import { getExpiryTime } from "../utils";
import { PoolFacet } from "../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { parseUnits } from "@ethersproject/units";
import { PayoffsPerToken } from "../constants";
import type { PromiseOrValue } from "../typechain-types/common";

// Returns payoff per long and short token in collateral token decimals net of fees
export const calcPayoffPerToken = (
  floor: BigNumber,
  inflection: BigNumber,
  cap: BigNumber,
  gradient: BigNumber,
  finalReferenceValue: BigNumber,
  collateralTokenDecimals: number, // 1.00  -> 1000  (3 decimals) 1.1 * 2.2 = 2.42 -> 1100 * 2200 / 1000 = 2420
  fee: BigNumber
): PayoffsPerToken => {
  const SCALING = parseUnits("1", 18 - collateralTokenDecimals);
  const UNIT = parseUnits("1");

  const _gradientScaled = gradient.mul(SCALING);

  let payoffLong = BigNumber.from(0);
  if (finalReferenceValue.eq(inflection)) {
    payoffLong = _gradientScaled;
  } else if (finalReferenceValue.lte(floor)) {
    payoffLong = BigNumber.from(0);
  } else if (finalReferenceValue.gte(cap)) {
    payoffLong = UNIT;
  } else if (finalReferenceValue.lt(inflection)) {
    payoffLong = _gradientScaled
      .mul(finalReferenceValue.sub(floor))
      .div(inflection.sub(floor));
  } else if (finalReferenceValue.gt(inflection)) {
    payoffLong = _gradientScaled.add(
      UNIT.sub(_gradientScaled)
        .mul(finalReferenceValue.sub(inflection))
        .div(cap.sub(inflection))
    );
  }

  let payoffShort = UNIT.sub(payoffLong);

  let payoffLongNet = payoffLong.mul(UNIT.sub(fee)).div(UNIT).div(SCALING);
  let payoffShortNet = payoffShort.mul(UNIT.sub(fee)).div(UNIT).div(SCALING);

  return { payoffLongNet, payoffShortNet };
};

// Calculate amount to return given payoff per token and number of tokens to redeem
// Output in collateral token decimals
export const calcPayout = (
  payoffPerToken: BigNumber, // integer expressed with collateral token decimals
  tokensToRedeem: BigNumber, // integer expressed with collateral token decimals
  collateralTokenDecimals: number
) => {
  const UNIT = parseUnits("1", collateralTokenDecimals);

  const payout = payoffPerToken.mul(tokensToRedeem).div(UNIT);

  return payout;
};

// Collateral token decimals (>= 6 && <= 18). Use those decimals in the test files
// in order to match the decimals used in `createContingentPool` (see function below).
export const decimals = 6;

// Function to create a contingent pool pre-populated with default values that can be overwritten depending
// on the test case. The `CreateContingentPoolParams` type is specific for this test function.
export const defaultPoolParameters = {
  referenceAsset: "BTC/USD",
  expireInSeconds: 7200,
  floor: parseUnits("1198.53"),
  inflection: parseUnits("1605.33"),
  cap: parseUnits("2001.17"),
  gradient: parseUnits("0.33", decimals),
  collateralAmount: parseUnits("15001.358", decimals), // update minimumTakerFillAmount in remove liquidity offer part in `eip712.ts` if you change that value
  capacity: parseUnits("100000000", decimals),
  permissionedERC721Token: ethers.constants.AddressZero,
};

export type CreateContingentPoolParams = {
  expiryTime?: PromiseOrValue<BigNumberish>; // if expiryTime is defined, it will overwrite the expiryTime set based on `expireInSeconds`
  collateralToken: string;
  dataProvider: string;
  longRecipient: string;
  shortRecipient: string;
  poolCreater: SignerWithAddress;
  poolFacet: PoolFacet;
} & typeof defaultPoolParameters;

export async function createContingentPool(params: CreateContingentPoolParams): Promise<ContractTransaction> {
  const mergedParams: CreateContingentPoolParams = {
    ...defaultPoolParameters,
    ...params,
  };

  // If expiryTime attribute is set, use that. If not, derive it based on `expireInSeconds`
  let expiryTime: PromiseOrValue<BigNumberish>;

  if (mergedParams.expiryTime) {
    expiryTime = mergedParams.expiryTime;
  } else {
    expiryTime = await getExpiryTime(mergedParams.expireInSeconds);
  }

  return await mergedParams.poolFacet.connect(mergedParams.poolCreater).createContingentPool({
    referenceAsset: mergedParams.referenceAsset,
    expiryTime: expiryTime,
    floor: mergedParams.floor,
    inflection: mergedParams.inflection,
    cap: mergedParams.cap,
    gradient: mergedParams.gradient,
    collateralAmount: mergedParams.collateralAmount,
    collateralToken: mergedParams.collateralToken,
    dataProvider: mergedParams.dataProvider,
    capacity: mergedParams.capacity,
    longRecipient: mergedParams.longRecipient,
    shortRecipient: mergedParams.shortRecipient,
    permissionedERC721Token: mergedParams.permissionedERC721Token,
  });
}

// Function to calculate the poolId by hashing the pool parameters, the msg.sender and an
// internal nonce to ensure uniqueness of the Id.
export const getPoolId = (
  referenceAsset: string, // keccak256 hash of original string (type: bytes32)
  expiryTime: BigNumberish,
  floor: BigNumberish,
  inflection: BigNumberish,
  cap: BigNumberish,
  gradient: BigNumberish,
  collateralAmount: BigNumberish,
  collateralToken: string,
  dataProvider: string,
  capacity: BigNumberish,
  longRecipient: string,
  shortRecipient: string,
  permissionedERC721Token: string,
  collateralAmountMsgSender: BigNumberish,
  collateralAmountMaker: string,
  maker: string,
  msgSender: string,
  nonce: string,
  ): string => {
  
  // Convert `referenceAsset` string to bytes32
  const bytes = ethers.utils.toUtf8Bytes(referenceAsset);
  const referenceAssetBytes32 = ethers.utils.keccak256(bytes);

  const abiCoder = new ethers.utils.AbiCoder();
  // Prepare data for hashing by encoding the relevant values. Note that 
  // the three fields `collateralAmountMsgSender`, `collateralAmountMaker`, and `maker`
  // are only relevant for EIP712 based offers. When creating a contingent pool directly,
  // `collateralAmountMsgSender` is equal to `poolParams.collateralAmount`, `collateralAmountMaker` is zero
  // and `maker` is the zero address.
  const encodedData = abiCoder.encode(
    ["tuple(bytes32, uint96, uint256, uint256, uint256, uint256, uint256, address, address, uint256, address, address, address)", "uint256", "uint256", "address", "address", "uint256"],
    [
      [
        referenceAssetBytes32, expiryTime, floor, inflection, cap, gradient, collateralAmount, collateralToken, dataProvider, capacity, longRecipient, shortRecipient, permissionedERC721Token
      ],
      collateralAmountMsgSender, collateralAmountMaker, maker, msgSender, nonce
    ]
  );
  const poolId = ethers.utils.keccak256(encodedData);
  return poolId;
};

// Function to extract the nonce from the position token name (e.g., "S3255" or "L3225")
// It was a conscious decision to not provide a mapping from `nonce` to `poolId` to
// protect users from being exploited in the event of chain reorgs.
export async function extractNumberFromString(str: string): Promise<string> {
  const regex = /(\d+)/;
  const match = regex.exec(str);
  if (match) {
    return String(match[0]);
  } else {
    return "";
  }
}

