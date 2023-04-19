import { use } from "chai";
import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";

use(solidity);

export const positionTokenAttachFixture = async (tokenAddress: string) => {
  const factory = await ethers.getContractFactory("PositionToken");
  return factory.attach(tokenAddress);
};
