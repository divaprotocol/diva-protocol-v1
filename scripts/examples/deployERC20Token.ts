/**
 * Script to deploy an ERC20 token for testing purposes.
 * Run: `yarn erc20::deploy`
 */

import { ethers } from "hardhat";
import { parseUnits } from "@ethersproject/units";

async function main() {
  // ************************************
  //           INPUT ARGUMENTS
  // ************************************

  const tokenName = "DIVATest";
  const symbol = "DIVATest";
  const decimals = 18;
  const totalSupply = parseUnits("10000000000000000000000000000000", decimals);
  const recipient = "0x9AdEFeb576dcF52F5220709c1B267d89d5208D78";


  // ************************************
  //              EXECUTION
  // ************************************
  
  const ERC20 = await ethers.getContractFactory("MockERC20");
  const erc20 = await ERC20.deploy(
    tokenName,
    symbol,
    totalSupply,
    recipient,
    decimals,
    "0"
  );

  await erc20.deployed();

  console.log("ERC20 token address:", erc20.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
