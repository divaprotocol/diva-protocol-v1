import { BigNumber } from "ethers";
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
