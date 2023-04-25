/**
 * Script to add liquidity to an existing contingent pool.
 * Run this function with existing pool id.
 * (i.e. You can create a pool by calling `createContingentPool` or `fillOfferCreateContingentPool`).
 * Run: `yarn diva::add`
 */

import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { parseUnits, formatUnits } from "@ethersproject/units";

import { LibDIVAStorage } from "../../typechain-types/contracts/facets/GetterFacet";

import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS } from "../../constants";

// Auxiliary function to perform checks required for successful execution, in line with those implemented
// inside the smart contract function. It is recommended to perform those checks in frontend applications
// to save users gas fees on reverts.
const _checkConditions = async (
  poolParams: LibDIVAStorage.PoolStruct,
  additionalAmount: BigNumber,
  longRecipient: string,
  shortRecipient: string,
  collateralBalanceUser: BigNumber
) => {
  // Get current time (proxy for block timestamp)
  const now = Math.floor(Date.now() / 1000);

  // Check that neither longRecipient nor shortRecipient equal to the zero address
  if (
    longRecipient === ethers.constants.AddressZero ||
    shortRecipient === ethers.constants.AddressZero
  ) {
    throw new Error(
      "Long or short token recipient cannot be both zero address"
    );
  }

  // Check that pool didn't expiry yet
  if (now >= Number(poolParams.expiryTime)) {
    throw new Error(
      "Pool already expired. No addition of liquidity possible anymore."
    );
  }

  // Check that pool capacity is not exceeded
  if (
    BigNumber.from(poolParams.collateralBalance)
      .add(additionalAmount)
      .gt(BigNumber.from(poolParams.capacity))
  ) {
    throw new Error("Pool capacity exceeded");
  }

  // Check user's collateral token balance
  if (collateralBalanceUser.lt(additionalAmount)) {
    throw new Error("Insufficient collateral tokens in wallet");
  }
};

async function main() {
  // Set network. Should be the same as in diva::add command.
  const network = "goerli";

  // Input arguments for `addLiquidity` function
  const poolId = 28; // id of an existing pool
  const additionalAmountNumber = 3; // collateral token amount to be added to an existing pool; parseUnits conversion is done below as it depends on the collateral token decimals
  const longRecipient = "0x245B8ABbC1B70B370d1b81398dE0a7920B25E7ca";
  const shortRecipient = "0x2ADdE7aBe04Bc1F14a3c397251A01276344Cc8a8";

  // Get liquidity provider's signer
  const [liquidityProvider] = await ethers.getSigners();

  // Connect to deployed DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network]);

  // Get pool parameters before new liquidity is added
  const poolParamsBefore = await diva.getPoolParameters(poolId);

  // Connect to ERC20 collateral token
  const erc20Contract = await ethers.getContractAt(
    "MockERC20",
    poolParamsBefore.collateralToken
  );
  const decimals = await erc20Contract.decimals();
  const additionalAmount = parseUnits(
    additionalAmountNumber.toString(),
    decimals
  );

  // Get liquidityProvider's collateral token balances
  const balance = await erc20Contract.balanceOf(liquidityProvider.address);

  // Confirm that all conditions are met before continuing
  await _checkConditions(
    poolParamsBefore,
    additionalAmount,
    longRecipient,
    shortRecipient,
    balance
  );

  // Get liquidityProvider's current allowance
  let allowance = await erc20Contract.allowance(
    liquidityProvider.address,
    diva.address
  );

  // Set allowance if insufficient
  if (allowance.lt(additionalAmount)) {
    // Increase allowance for DIVA contract
    const approveTx = await erc20Contract.approve(
      diva.address,
      additionalAmount
    );
    await approveTx.wait();

    // Get liquidityProvider's new allowance
    allowance = await erc20Contract.allowance(
      liquidityProvider.address,
      diva.address
    );
  }

  // Add liquidity
  const tx = await diva.addLiquidity(
    poolId,
    additionalAmount,
    longRecipient,
    shortRecipient
  );
  await tx.wait();

  // Get pool parameters and position token supply after new liquidity has been added
  const poolParamsAfter = await diva.getPoolParameters(poolId);
  const longTokenInstance = await ethers.getContractAt(
    "PositionToken",
    poolParamsAfter.longToken
  );
  const shortTokenInstance = await ethers.getContractAt(
    "PositionToken",
    poolParamsAfter.shortToken
  );
  const supplyShort = await shortTokenInstance.totalSupply();
  const supplyLong = await longTokenInstance.totalSupply();

  // Log relevant info
  console.log("DIVA address: ", diva.address);
  console.log("PoolId: ", poolId);
  console.log(
    "Pool collateral balance before: ",
    formatUnits(poolParamsBefore.collateralBalance, decimals)
  );
  console.log(
    "New collateral amount added: ",
    formatUnits(additionalAmount, decimals)
  );
  console.log(
    "Pool collateral balance after: ",
    formatUnits(poolParamsAfter.collateralBalance, decimals)
  );
  console.log("Liquidity added by: ", liquidityProvider.address);
  console.log("Long token recipient: ", longRecipient);
  console.log("Short token recipient: ", shortRecipient);
  console.log("Long token address: ", poolParamsBefore.longToken);
  console.log("Short token address: ", poolParamsBefore.shortToken);
  console.log("New long token supply: ", formatUnits(supplyLong, decimals));
  console.log("New short token supply: ", formatUnits(supplyShort, decimals));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
