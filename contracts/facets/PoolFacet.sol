// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {ReentrancyGuard} from "@solidstate/contracts/utils/ReentrancyGuard.sol";
import {IPool} from "../interfaces/IPool.sol";
import {LibDIVA} from "../libraries/LibDIVA.sol";
import "hardhat/console.sol";

contract PoolFacet is IPool, ReentrancyGuard {
    function createContingentPool(LibDIVA.PoolParams memory _poolParams)
        external
        override
        nonReentrant
        returns (bytes32)
    {
        {
            bytes32 pointerPoolParams;
            bytes32 memExternal;
            assembly {
                pointerPoolParams := _poolParams // 0x80
                memExternal := mload(0x220) // 0x260 (13 variables inside _poolParams + length + string data = 15 which is exactly the distance between 0x80 and 0x260)
                // Crosscheck: at 0x80 the memory pointer to the string data should be stored, pointing to 0x220 where the length is stored and 0x240 where the dat is located
                // -> next free memory pointer is 0x260 (as string "BTC/USD" < bytes32 in the test)
            }
            // console.log("pointerPoolParams");
            // console.logBytes32(pointerPoolParams);
            // console.log("memExternal");
            // console.logBytes32(memExternal);
        }

        bytes32 poolId = LibDIVA._createContingentPoolLib(
            LibDIVA.CreatePoolParams({
                poolParams: _poolParams,
                collateralAmountMsgSender: _poolParams.collateralAmount,
                collateralAmountMaker: 0,
                maker: address(0)
            })
        );
        return poolId;
    }

    function batchCreateContingentPool(LibDIVA.PoolParams[] memory _poolsParams)
        external
        override
        nonReentrant
        returns (bytes32[] memory)
    {
        uint256 len = _poolsParams.length;
        bytes32[] memory poolIds = new bytes32[](len);
        for (uint256 i = 0; i < len; ) {
            poolIds[i] = LibDIVA._createContingentPoolLib(
                LibDIVA.CreatePoolParams({
                    poolParams: _poolsParams[i],
                    collateralAmountMsgSender: _poolsParams[i].collateralAmount,
                    collateralAmountMaker: 0,
                    maker: address(0)
                })
            );
            unchecked {
                ++i;
            }
        }

        return poolIds;
    }
}
