/**
 * Script to set the allowance for a given spender address.
 * Run: `yarn erc20::balanceOf --network mumbai`
 */

import { ethers } from "hardhat";
import { formatUnits } from "@ethersproject/units";

async function main() {
  // ************************************
  //           INPUT ARGUMENTS
  // ************************************

  // Address of token
  const token = "0x183714f60C659EAE1BAC73Cb37D7f48fb531812E";

  // User address
  const user = "0x2e33876D29BAC51e1FFD128659BF9D36ba13259D";

  // ************************************
  //              EXECUTION
  // ************************************

  // Connect to token contract
  const erc20 = await ethers.getContractAt("MockERC20", token);

  // Get token decimals
  const decimals = await erc20.decimals();

  // Get balance
  const balance = await erc20.balanceOf(user);

  // Log relevant info
  console.log("User: ", user);
  console.log("Token: ", token);
  console.log("Token balance: ", formatUnits(balance, decimals));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
