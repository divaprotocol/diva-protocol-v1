/**
 * Script to get the pool parameters for a position token address.
 * Run: `yarn diva::getPoolParametersByAddress`
 */

import { ethers, network } from "hardhat";
import { formatUnits } from "@ethersproject/units";

import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS, Status, STATUS } from "../../constants";

async function main() {
  // Input argument for `getPoolParametersByAddress` function
  const positionToken = "0x09630c89aA8ea22452F010C52F94254721D04464";

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Get pool id from position token contract
  const positionTokenContract = await ethers.getContractAt(
    "PositionToken",
    positionToken
  );
  const poolId = await positionTokenContract.poolId();

  // Get pool parameters
  const poolParams = await diva.getPoolParametersByAddress(positionToken);

  // Get collateral token decimals to perform conversions from integer to decimal. Note that position tokens have the same number of decimals.
  const erc20Contract = await ethers.getContractAt(
    "MockERC20",
    poolParams.collateralToken
  );
  const decimals = await erc20Contract.decimals();

  // Log relevant info
  console.log("DIVA address: ", diva.address);
  console.log("PoolId: ", poolId.toString());
  console.log("Floor: ", formatUnits(poolParams.floor));
  console.log("Inflection: ", formatUnits(poolParams.inflection));
  console.log("Cap: ", formatUnits(poolParams.cap));
  console.log("Gradient: ", formatUnits(poolParams.gradient, decimals));
  console.log(
    "Pool collateral balance: ",
    formatUnits(poolParams.collateralBalance, decimals)
  );
  console.log(
    "Final referencen value: ",
    formatUnits(poolParams.finalReferenceValue)
  );
  console.log("Capacity: ", formatUnits(poolParams.capacity, decimals));
  console.log("Status timestamp: ", poolParams.statusTimestamp.toString());
  console.log("Short token: ", poolParams.shortToken);
  console.log(
    "Payout short token: ",
    formatUnits(poolParams.payoutShort, decimals)
  );
  console.log("Long token: ", poolParams.longToken);
  console.log(
    "Payout long token: ",
    formatUnits(poolParams.payoutLong, decimals)
  );
  console.log("Collateral token: ", poolParams.collateralToken);
  console.log("Expiry time: ", poolParams.expiryTime.toString());
  console.log("Data provider: ", poolParams.dataProvider);
  console.log(
    "Status final reference value: ",
    STATUS[Number(poolParams.statusFinalReferenceValue) as Status]
  );
  console.log("Reference asset: ", poolParams.referenceAsset);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
