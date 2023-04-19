// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {ReentrancyGuard} from "@solidstate/contracts/utils/ReentrancyGuard.sol";
import {IPool} from "../interfaces/IPool.sol";
import {LibDIVA} from "../libraries/LibDIVA.sol";

contract PoolFacet is IPool, ReentrancyGuard {
    function createContingentPool(LibDIVA.PoolParams memory _poolParams)
        external
        override
        nonReentrant
        returns (uint256)
    {
        uint256 poolId = LibDIVA._createContingentPoolLib(
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
        returns (uint256[] memory)
    {
        uint256 len = _poolsParams.length;
        uint256[] memory poolIds = new uint256[](len);
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
