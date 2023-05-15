import { ethers, BigNumber } from "ethers";
import { parseUnits } from "@ethersproject/units";

import { PayoffsPerToken } from "../constants";

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


// Define the PoolParams and CreatePoolParams structs
interface PoolParams {
  referenceAsset: string;
  expiryTime: number;
  floor: string;
  inflection: string;
  cap: string;
  gradient: string;
  collateralAmount: string;
  collateralToken: string;
  dataProvider: string;
  capacity: string;
  longRecipient: string;
  shortRecipient: string;
  permissionedERC721Token: string;
}

// The last three fields are only relevant for EIP712 based offers.
// When creating a contingent pool directly, `collateralAmountMsgSender`
// is equal to `poolParams.collateralAmount`, `collateralAmountMaker` is zero
// and `maker` is the zero address.
interface CreatePoolParams {
  poolParams: PoolParams;
  collateralAmountMsgSender: string;
  collateralAmountMaker: string;
  maker: string;
}

export const getPoolId = (
  referenceAsset: string, // keccak256 hash of original string (type: bytes32)
  expiryTime: number,
  floor: string,
  inflection: string,
  cap: string,
  gradient: string,
  collateralAmount: string,
  collateralToken: string,
  dataProvider: string,
  capacity: string,
  longRecipient: string,
  shortRecipient: string,
  permissionedERC721Token: string,
  collateralAmountMsgSender: string,
  collateralAmountMaker: string,
  maker: string,
  msgSender: string,
  nonce: string,
  ): string => {
  
  // Convert `referenceAsset` string to bytes32
  const bytes = ethers.utils.toUtf8Bytes(referenceAsset);
  const referenceAssetBytes32 = ethers.utils.keccak256(bytes);

  const abiCoder = new ethers.utils.AbiCoder();
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

