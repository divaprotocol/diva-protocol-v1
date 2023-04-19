import { ethers, network } from "hardhat";
import { JsonRpcProvider } from "@ethersproject/providers";

export const getExpiryTime = async (
  offsetInSeconds: number // 60*60 = 1h; 60*60*24 = 1d, 60*60*24*365 = 1y
): Promise<string> => {
  return ((await getLastTimestamp()) + offsetInSeconds).toString();
};

export const setNextTimestamp = async (
  provider: JsonRpcProvider,
  timestamp: number
) => {
  await provider.send("evm_setNextBlockTimestamp", [timestamp]);
};

export const mineBlock = async (timestamp = 0) => {
  if (timestamp) {
    return network.provider.send("evm_mine", [timestamp]);
  }
  return network.provider.send("evm_mine");
};

export const getLastTimestamp = async () => {
  /**
   * Changed this from ethers.provider.getBlockNumber since if evm_revert is used to return
   * to a snapshot, getBlockNumber will still return the last mined block rather than the
   * block height of the snapshot.
   */
  let currentBlock = await ethers.provider.getBlock("latest");
  return currentBlock.timestamp;
};
