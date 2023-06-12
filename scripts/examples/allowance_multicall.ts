/**
 * Script to get the allowances using multicall contract.
 * Run: `yarn erc20::allowance_multicall --network mumbai`
 */

import { ethers, network } from "hardhat";
import ERC20_ABI from "../../abis/erc20.json";
import { multicall } from "../../utils";
import { DIVA_ADDRESS, COLLATERAL_TOKENS } from "../../constants";

async function main() {
  // ************************************
  //           INPUT ARGUMENTS
  // ************************************
  
  // Collateral token
  const collateralTokenSymbol = "WAGMI18";

  // Set approving accounts
  const [user1, user2, user3] = await ethers.getSigners();


  // ************************************
  //              EXECUTION
  // ************************************

  const spenderAddress = DIVA_ADDRESS[network.name];
  const tokenAddress = COLLATERAL_TOKENS[network.name][collateralTokenSymbol];
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

  const allowances = await multicall(network.name, ERC20_ABI, calls);
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
