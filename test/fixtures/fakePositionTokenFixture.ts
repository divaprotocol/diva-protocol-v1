import { use } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { solidity } from "ethereum-waffle";

use(solidity);

export const fakePositionTokenDeployFixture = async (
  name: string,
  symbol: string,
  poolId: string,
  owner: string
) => {
  const factory = await ethers.getContractFactory("FakePositionToken");
  return await factory.deploy(name, symbol, poolId, owner);
};
