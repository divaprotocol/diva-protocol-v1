import { BigNumber, ContractTransaction } from "ethers";
import { parseUnits } from "ethers/lib/utils";

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
): Promise<BigNumber> => {
  const receipt = await tx.wait();
  return (
    receipt.events?.find((x: any) => x.event === "PoolIssued")?.args?.poolId ||
    BigNumber.from(0)
  );
};
