import { use } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { solidity } from "ethereum-waffle";

use(solidity);

export const divaTokenDeployFixture = async (
  name: string,
  symbol: string,
  tokenSupply: BigNumber,
  recipient: string
) => {
  const factory = await ethers.getContractFactory("DIVAToken");
  return await factory.deploy(name, symbol, tokenSupply, recipient);
};

export const divaTokenAttachFixture = async (tokenAddress: string) => {
  const factory = await ethers.getContractFactory("DIVAToken");
  return factory.attach(tokenAddress);
};
