import { use } from "chai";
import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";

use(solidity);

export const permissionedPositionTokenAttachFixture = async (
  tokenAddress: string
) => {
  const permissionedPositionTokenFactory = await ethers.getContractFactory(
    "PermissionedPositionToken"
  );
  return permissionedPositionTokenFactory.attach(tokenAddress);
};
