/**
 * Script to remove liquidity from an existing pool
 * Run: `yarn diva::remove`
 */

import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { parseUnits, formatUnits } from "@ethersproject/units";

import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS, Status } from "../../constants";

// Auxiliary function to perform checks required for successful execution, in line with those implemented
// inside the smart contract function. It is recommended to perform those checks in frontend applications
// to save users gas fees on reverts.
const _checkConditions = (
  amountTokens: BigNumber,
  longBalance: BigNumber,
  shortBalance: BigNumber,
  statusFinalReferenceValue: Status,
  pauseReturnCollateralUntil: number,
  decimals: number
) => {
  // Check that `removeLiquidity` function is not paused
  if (pauseReturnCollateralUntil * 1000 > Date.now()) {
    throw new Error(
      "Function is paused. No removal of liquidity possible at the moment."
    );
  }

  // Check that pool hasn't been confirmed yet
  if (statusFinalReferenceValue === Status.Confirmed) {
    throw new Error(
      "Pool has already been confirmed. No removal of liquidity possible."
    );
  }

  // Check whether user owns enough long and short tokens to perform the operation
  if (longBalance.lt(amountTokens)) {
    console.log(
      "Long token balance user: " + formatUnits(longBalance, decimals)
    );
    throw new Error("Insufficient long token amount in wallet.");
  } else if (shortBalance.lt(amountTokens)) {
    console.log(
      "Short token balance user: " + formatUnits(shortBalance, decimals)
    );
    throw new Error("Insufficient short token amount in wallet.");
  }
};

async function main() {
  // Set network. Should be the same as in diva::remove command.
  const network = "goerli";

  // Input arguments for `removeLiquidity` function
  const poolId = 28; // id of an existing pool
  const amountTokensNumber = 1; // number of long and short tokens to return to the pool; conversion into large integer happens below in the code

  // Get signer of account that will remove liquidity
  const [user] = await ethers.getSigners();

  // Connect to deployed DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network]);

  // Get pool parameters before liquidity is removed
  const poolParamsBefore = await diva.getPoolParameters(poolId);

  // Get collateral token decimals to perform conversions from integer to decimal. Note that position tokens have the same number of decimals.
  const erc20Contract = await ethers.getContractAt(
    "MockERC20",
    poolParamsBefore.collateralToken
  );
  const decimals = await erc20Contract.decimals();

  // Convert amountTokens into large integer with collateral token decimals
  const amountTokens = parseUnits(amountTokensNumber.toString(), decimals);

  // Connect to long and short tokens
  const longToken = await ethers.getContractAt(
    "PositionToken",
    poolParamsBefore.longToken
  );
  const shortToken = await ethers.getContractAt(
    "PositionToken",
    poolParamsBefore.shortToken
  );

  // Get short and long token supply before liquidity is removed
  const supplyLongBefore = await longToken.totalSupply();
  const supplyShortBefore = await shortToken.totalSupply();

  // Get user's long and short token balances
  const longBalance = await longToken.balanceOf(user.address);
  const shortBalance = await shortToken.balanceOf(user.address);

  // Get governance parameters (pauseReturnCollateralUntil is the relevant field for the checks)
  const governanceParameters = await diva.getGovernanceParameters();

  // Confirm that all conditions are met before continuing
  _checkConditions(
    amountTokens,
    longBalance,
    shortBalance,
    poolParamsBefore.statusFinalReferenceValue,
    governanceParameters.pauseReturnCollateralUntil,
    decimals
  );

  // Remove liquidity
  const tx = await diva.removeLiquidity(poolId, amountTokens);
  await tx.wait();

  // Get pool parameters after liquidity has been removed
  const poolParamsAfter = await diva.getPoolParameters(poolId);
  const supplyLongAfter = await longToken.totalSupply();
  const supplyShortAfter = await shortToken.totalSupply();

  // Log relevant information
  console.log("DIVA address: ", diva.address);
  console.log("PoolId: ", poolId);
  console.log(
    "Pool collateral balance before: ",
    formatUnits(poolParamsBefore.collateralBalance, decimals)
  );
  console.log(
    "Long token supply before: ",
    formatUnits(supplyLongBefore, decimals)
  );
  console.log(
    "Short token supply before: ",
    formatUnits(supplyShortBefore, decimals)
  );
  console.log(
    "Pool collateral balance after: ",
    formatUnits(poolParamsAfter.collateralBalance, decimals)
  );
  console.log(
    "Long token supply after: ",
    formatUnits(supplyLongAfter, decimals)
  );
  console.log(
    "Short token supply after: ",
    formatUnits(supplyShortAfter, decimals)
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
