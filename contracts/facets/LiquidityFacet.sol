// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {ReentrancyGuard} from "@solidstate/contracts/utils/ReentrancyGuard.sol";
import {ILiquidity} from "../interfaces/ILiquidity.sol";
import {LibDIVAStorage} from "../libraries/LibDIVAStorage.sol";
import {LibDIVA} from "../libraries/LibDIVA.sol";

contract LiquidityFacet is ILiquidity, ReentrancyGuard {
    function addLiquidity(
        bytes32 _poolId,
        uint256 _collateralAmountIncr,
        address _longRecipient,
        address _shortRecipient
    ) external override nonReentrant {
        // Transfer approved collateral token from `msg.sender` and mint position tokens
        // to `_longRecipient` and `_shortRecipient`.
        LibDIVA._addLiquidityLib(
            LibDIVA.AddLiquidityParams({
                poolId: _poolId,
                collateralAmountMsgSender: _collateralAmountIncr,
                collateralAmountMaker: 0,
                maker: address(0),
                longRecipient: _longRecipient,
                shortRecipient: _shortRecipient
            })
        );
    }

    function batchAddLiquidity(
        ArgsBatchAddLiquidity[] calldata _argsBatchAddLiquidity
    ) external override nonReentrant {
        uint256 len = _argsBatchAddLiquidity.length;
        for (uint256 i; i < len; ) {
            // Transfer approved collateral token from `msg.sender` and mint position tokens
            // to `_longRecipient` and `_shortRecipient`.
            LibDIVA._addLiquidityLib(
                LibDIVA.AddLiquidityParams({
                    poolId: _argsBatchAddLiquidity[i].poolId,
                    collateralAmountMsgSender: _argsBatchAddLiquidity[i]
                        .collateralAmountIncr,
                    collateralAmountMaker: 0,
                    maker: address(0),
                    longRecipient: _argsBatchAddLiquidity[i].longRecipient,
                    shortRecipient: _argsBatchAddLiquidity[i].shortRecipient
                })
            );
            unchecked {
                ++i;
            }
        }
    }

    function removeLiquidity(bytes32 _poolId, uint256 _amount)
        external
        override
        nonReentrant
    {
        _removeLiquidity(_poolId, _amount);
    }

    function batchRemoveLiquidity(
        ArgsBatchRemoveLiquidity[] calldata _argsBatchRemoveLiquidity
    ) external override nonReentrant {
        uint256 len = _argsBatchRemoveLiquidity.length;
        for (uint256 i; i < len; ) {
            _removeLiquidity(
                _argsBatchRemoveLiquidity[i].poolId,
                _argsBatchRemoveLiquidity[i].amount
            );
            unchecked {
                ++i;
            }
        }
    }

    function _removeLiquidity(bytes32 _poolId, uint256 _amount) private {
        LibDIVAStorage.Pool storage _pool = LibDIVAStorage._poolStorage().pools[_poolId];

        uint256 collateralAmountRemovedNet = LibDIVA._removeLiquidityLib(
            LibDIVA.RemoveLiquidityParams({
                poolId: _poolId,
                amount: _amount,
                longTokenHolder: msg.sender,
                shortTokenHolder: msg.sender
            }),
            _pool
        );

        // Send collateral (net of fees) back to user.
        // Reverts if transfer fails. `collateralBalance` is reduced inside `_returnCollateral`.
        LibDIVA._returnCollateral(
            _pool,
            msg.sender,
            collateralAmountRemovedNet
        );
    }
}
