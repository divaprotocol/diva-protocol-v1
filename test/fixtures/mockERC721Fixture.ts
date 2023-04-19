import { use } from "chai";
import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";

use(solidity);

export const erc721DeployFixture = async (name: string, symbol: string) => {
  const mockERC721Factory = await ethers.getContractFactory("MockERC721");
  return await mockERC721Factory.deploy(name, symbol);
};

export const erc721AttachFixture = async (tokenAddress: string) => {
  const mockERC721Factory = await ethers.getContractFactory("MockERC721");
  return mockERC721Factory.attach(tokenAddress);
};
