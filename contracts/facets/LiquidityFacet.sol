// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {ReentrancyGuard} from "@solidstate/contracts/utils/ReentrancyGuard.sol";
import {ILiquidity} from "../interfaces/ILiquidity.sol";
import {LibDIVAStorage} from "../libraries/LibDIVAStorage.sol";
import {LibDIVA} from "../libraries/LibDIVA.sol";

contract LiquidityFacet is ILiquidity, ReentrancyGuard {
    function addLiquidity(
        uint256 _poolId,
        uint256 _collateralAmountIncr,
        address _longRecipient,
        address _shortRecipient
    ) external override nonReentrant {
        // Confirm that function inputs are valid and addition of liquidity is
        // still possible.
        _isValidAddLiquidityTx(
            _poolId,
            _collateralAmountIncr
        );

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
        for (uint256 i = 0; i < len; ) {
            // Confirm that function inputs are valid and addition of liquidity is
            // still possible.
            _isValidAddLiquidityTx(
                _argsBatchAddLiquidity[i].poolId,
                _argsBatchAddLiquidity[i].collateralAmountIncr
            );

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

    function removeLiquidity(uint256 _poolId, uint256 _amount)
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
        for (uint256 i = 0; i < len; ) {
            _removeLiquidity(
                _argsBatchRemoveLiquidity[i].poolId,
                _argsBatchRemoveLiquidity[i].amount
            );

            unchecked {
                ++i;
            }
        }
    }

    function _isValidAddLiquidityTx(
        uint256 _poolId,
        uint256 _collateralAmountIncr
    ) private view {
        // Get pool params using `_poolId`
        LibDIVAStorage.PoolStorage storage ps = LibDIVAStorage._poolStorage();
        LibDIVAStorage.Pool storage _pool = ps.pools[_poolId];

        // Check whether addition of liquidity is still possible. Reverts if pool expired
        // or new collateral balance exceeds pool capacity
        LibDIVA._checkAddLiquidityAllowed(_pool, _collateralAmountIncr);
    }

    function _removeLiquidity(uint256 _poolId, uint256 _amount) private {
        LibDIVAStorage.PoolStorage storage ps = LibDIVAStorage._poolStorage();
        LibDIVAStorage.Pool storage _pool = ps.pools[_poolId];

        uint256 collateralAmountRemovedNet = LibDIVA._removeLiquidityLib(
            LibDIVA.RemoveLiquidityParams({
                poolId: _poolId,
                amount: _amount,
                longTokenHolder: msg.sender,
                shortTokenHolder: msg.sender
            })
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
