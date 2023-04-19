import { use } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { solidity } from "ethereum-waffle";

use(solidity);

export const erc20DeployFixture = async (
  name: string,
  symbol: string,
  tokenSupply: BigNumber,
  recipient: string,
  decimals: number
) => {
  const factory = await ethers.getContractFactory("MockERC20");
  return await factory.deploy(name, symbol, tokenSupply, recipient, decimals);
};

export const erc20AttachFixture = async (tokenAddress: string) => {
  const factory = await ethers.getContractFactory("MockERC20");
  return factory.attach(tokenAddress);
};
