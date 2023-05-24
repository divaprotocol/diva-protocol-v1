/**
 * Script to get the rewards (tips + settlement fees from removing liquidity)
 * reserved for the actual data provider.
 * Run: `yarn diva::getReservedClaim`
 */

import { ethers, network } from "hardhat";
import { formatUnits } from "@ethersproject/units";
import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS } from "../../constants";

async function main() {
  // ************************************
  //           INPUT ARGUMENTS
  // ************************************

  // Id of an existing pool
  const poolId =
    "0x079247c64f4f0663fb44af88de2346a264fbd734eafb5d5eb82f664147746902";


  // ************************************
  //              EXECUTION
  // ************************************

  // Connect to deployed DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Get pool parameters
  const reservedClaim = await diva.getReservedClaim(poolId);

  // Get pool parameters
  const poolParams = await diva.getPoolParameters(poolId);

  // Get collateral token decimals to perform conversions from integer to decimal. Note that position tokens have the same number of decimals.
  const erc20Contract = await ethers.getContractAt(
    "MockERC20",
    poolParams.collateralToken
  );
  const decimals = await erc20Contract.decimals();

  // Log relevant info
  console.log("DIVA address: ", diva.address);
  console.log("PoolId: ", poolId);
  console.log("Reserved claim: ", formatUnits(reservedClaim, decimals));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
