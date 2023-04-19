import { ethers } from "hardhat";
import { Contract, ethers as ethersF } from "ethers";

import MULTICALL_ABI from "../abis/Multicall.json";
import { MULTICALL_ADDRESS } from "../constants";

export type MultiCallResponse<T> = T | null;

export interface Call {
  address: string; // Address of the contract
  name: string; // Function name on the contract (example: balanceOf)
  params?: any[]; // Function params
}

interface MulticallOptions {
  requireSuccess?: boolean;
}

export const getMulticallContract = async (
  network: string
): Promise<Contract> => {
  return await ethers.getContractAt(MULTICALL_ABI, MULTICALL_ADDRESS[network]);
};

export const multicall = async <T = any>(
  network: string,
  abi: any[],
  calls: Call[]
): Promise<T> => {
  try {
    const multi = await getMulticallContract(network);
    const itf = new ethersF.utils.Interface(abi);

    const calldata = calls.map((call) => [
      call.address.toLowerCase(),
      itf.encodeFunctionData(call.name, call.params),
    ]);
    const { returnData } = await multi.aggregate(calldata);

    const res = returnData.map((call: string, i: number) =>
      itf.decodeFunctionResult(calls[i].name, call)
    );

    return res;
  } catch (error: any) {
    throw new Error(error);
  }
};

/**
 * Multicall V2 uses the new "tryAggregate" function. It is different in 2 ways
 *
 * 1. If "requireSuccess" is false multicall will not bail out if one of the calls fails
 * 2. The return inclues a boolean whether the call was successful e.g. [wasSuccessfull, callResult]
 */
export const multicallv2 = async <T = any>(
  network: string,
  abi: any[],
  calls: Call[],
  options: MulticallOptions = { requireSuccess: true }
): Promise<MultiCallResponse<T>> => {
  const { requireSuccess } = options;
  const multi = await getMulticallContract(network);
  const itf = new ethersF.utils.Interface(abi);

  const calldata = calls.map((call) => [
    call.address.toLowerCase(),
    itf.encodeFunctionData(call.name, call.params),
  ]);
  const returnData = await multi.tryAggregate(requireSuccess, calldata);
  const res = returnData.map((call: string, i: number) => {
    const [result, data] = call;
    return result ? itf.decodeFunctionResult(calls[i].name, data) : null;
  });

  return res;
};
