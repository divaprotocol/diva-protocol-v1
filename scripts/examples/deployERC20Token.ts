/**
 * Script to deploy an ERC20 token for testing purposes
 * Run: `yarn erc20::deploy`
 */

import { ethers } from "hardhat";
import { parseUnits } from "@ethersproject/units";

async function main() {
  const tokenName = "WAGMI6";
  const symbol = "WAGMI6";
  const decimals = 6;
  const totalSupply = parseUnits("10000000000000000000000000000000", decimals);
  const recipient = "0x9AdEFeb576dcF52F5220709c1B267d89d5208D78";

  const ERC20 = await ethers.getContractFactory("MockERC20");
  const erc20 = await ERC20.deploy(
    tokenName,
    symbol,
    totalSupply,
    recipient,
    decimals
  );

  await erc20.deployed();

  console.log("ERC20 token to:", erc20.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
