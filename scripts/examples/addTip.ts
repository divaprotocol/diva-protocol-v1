/**
 * Script to add a tip to an existing contingent pool.
 * Run: `yarn diva::addTip`
 *
 * Example usage:
 * 1. `yarn diva::create`: Create pool.
 * 2. `yarn diva::getReservedClaim`: Check the reserved claim amount before adding a tip.
 * 3. `yarn diva::addTip`: Add a tip in collateral token to that pool. Note that
 * the pool must not be expired.
 * 4. `yarn diva::getReservedClaim`: Confirm that the reserved claim amount increased.
 */

import { ethers, network } from "hardhat";
import { BigNumber } from "ethers";
import { parseUnits, formatUnits } from "@ethersproject/units";
import { LibDIVAStorage } from "../../typechain-types/contracts/facets/GetterFacet";
import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS, Status } from "../../constants";

async function main() {
  // ************************************
  //           INPUT ARGUMENTS
  // ************************************

  // Id of an existing pool
  const poolId =
    "0x079247c64f4f0663fb44af88de2346a264fbd734eafb5d5eb82f664147746902";

  // Collateral token amount to be added to an existing pool as a tip. Conversion into
  // integer happens below in the code as it depends on the collateral token decimals.
  const tipAmountString = "3";


  // ************************************
  //              EXECUTION
  // ************************************

  // Get tipper's signer
  const [tipper] = await ethers.getSigners();

  // Connect to deployed DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Get tip amount of pool on DIVA before the tip was added
  const tipBefore = await diva.getReservedClaim(poolId);

  // Get pool parameters before the tip was added
  const poolParams = await diva.getPoolParameters(poolId);

  // Connect to ERC20 collateral token
  const collateralToken = await ethers.getContractAt(
    "MockERC20",
    poolParams.collateralToken
  );

  // Convert tip amount into integer format expected by `addTip` function
  const decimals = await collateralToken.decimals();
  const tipAmount = parseUnits(tipAmountString, decimals);

  // Get tipper's collateral token balances
  const balanceBefore = await collateralToken.balanceOf(tipper.address);

  // Confirm that all conditions are met before continuing
  await _checkConditions(poolParams, tipAmount, balanceBefore);

  // Get tipper's current allowance
  let allowance = await collateralToken.allowance(tipper.address, diva.address);

  // Increase allowance if insufficient
  if (allowance.lt(tipAmount)) {
    const approveTx = await collateralToken.approve(diva.address, tipAmount);
    await approveTx.wait();

    // Get tipper's new allowance
    allowance = await collateralToken.allowance(tipper.address, diva.address);
  }

  // Add tip
  const tx = await diva.addTip(poolId, tipAmount);
  await tx.wait();

  // Get tip amount of pool on DIVA after the tip was added
  const tipAfter = await diva.getReservedClaim(poolId);

  // Get tipper's collateral token balances after the tip was added
  const balanceAfter = await collateralToken.balanceOf(tipper.address);

  // Log relevant info
  console.log("DIVA address: ", diva.address);
  console.log("PoolId: ", poolId);
  console.log("Tip amount added: ", formatUnits(tipAmount, decimals));
  console.log("Tip added by: ", tipper.address);
  console.log(
    "Collateral token balance of tipper before add tip: ",
    formatUnits(balanceBefore)
  );
  console.log(
    "Collateral token balance of tipper after add tip: ",
    formatUnits(balanceAfter)
  );
  console.log(
    "Tip amount of the pool on DIVA before add tip: ",
    formatUnits(tipBefore)
  );
  console.log(
    "Tip amount of the pool on DIVA after add tip: ",
    formatUnits(tipAfter)
  );
}

// Auxiliary function to perform checks required for successful execution, in line with those implemented
// inside the smart contract function. It is recommended to perform those checks in frontend applications
// to save users gas fees on reverts. Alternatively, use Tenderly to pre-simulate the tx and catch any errors
// before actually executing it.
const _checkConditions = async (
  poolParams: LibDIVAStorage.PoolStruct,
  tipAmount: BigNumber,
  collateralBalanceUser: BigNumber
) => {
  // Check the status of the pool
  if (poolParams.statusFinalReferenceValue !== Status.Open) {
    throw new Error("Final value already submitted.");
  }

  // Check user's collateral token balance
  if (collateralBalanceUser.lt(tipAmount)) {
    throw new Error("Insufficient collateral tokens in wallet.");
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
