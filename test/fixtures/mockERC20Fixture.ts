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
  decimals: number,
  fee: string, // 1% = 100, 0.1% = 1000
) => {
  const factory = await ethers.getContractFactory("MockERC20");
  return await factory.deploy(name, symbol, tokenSupply, recipient, decimals, fee);
};

export const erc20AttachFixture = async (tokenAddress: string) => {
  const factory = await ethers.getContractFactory("MockERC20");
  return factory.attach(tokenAddress);
};
