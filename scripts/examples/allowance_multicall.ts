/**
 * Script to get the allowances using multicall contract
 * Run: `yarn erc20::allowance_multicall`
 */

import { ethers } from "hardhat";

import ERC20_ABI from "../../abis/erc20.json";
import { multicall } from "../../utils";
import { DIVA_ADDRESS, COLLATERAL_TOKENS } from "../../constants";

async function main() {
  // INPUT: network
  const network = "goerli";

  // INPUT: collateral token
  const collateralTokenSymbol = "dUSD";

  // Get signer of users
  const [user1, user2, user3] = await ethers.getSigners();

  const spenderAddress = DIVA_ADDRESS[network];
  const tokenAddress = COLLATERAL_TOKENS[network][collateralTokenSymbol];
  const calls = [
    {
      address: tokenAddress,
      name: "allowance",
      params: [user1.address, spenderAddress],
    },
    {
      address: tokenAddress,
      name: "allowance",
      params: [user2.address, spenderAddress],
    },
    {
      address: tokenAddress,
      name: "allowance",
      params: [user3.address, spenderAddress],
    },
  ];

  const allowances = await multicall(network, ERC20_ABI, calls);
  calls.forEach((call: any, index: number) => {
    console.log(`Allowance for ${call.params[0]} is: ${allowances[index]}`);
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
