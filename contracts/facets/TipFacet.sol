// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@solidstate/contracts/utils/ReentrancyGuard.sol";
import {ITip} from "../interfaces/ITip.sol";
import {LibDIVAStorage} from "../libraries/LibDIVAStorage.sol";

contract TipFacet is ITip, ReentrancyGuard {
    using SafeERC20 for IERC20Metadata;

    function addTip(uint256 _poolId, uint256 _amount)
        external
        override
        nonReentrant
    {
        // Get references to relevant storage slots
        LibDIVAStorage.PoolStorage storage ps = LibDIVAStorage._poolStorage();
        LibDIVAStorage.FeeClaimStorage storage fs = LibDIVAStorage
            ._feeClaimStorage();

        // Add tip
        _addTip(_poolId, _amount, ps, fs);
    }

    function batchAddTip(ArgsBatchAddTip[] calldata _argsBatchAddTip)
        external
        override
        nonReentrant
    {
        // Get references to relevant storage slots
        LibDIVAStorage.PoolStorage storage ps = LibDIVAStorage._poolStorage();
        LibDIVAStorage.FeeClaimStorage storage fs = LibDIVAStorage
            ._feeClaimStorage();

        // Add tips
        uint256 len = _argsBatchAddTip.length;
        for (uint256 i = 0; i < len; ) {
            _addTip(
                _argsBatchAddTip[i].poolId,
                _argsBatchAddTip[i].amount,
                ps,
                fs
            );
            unchecked {
                ++i;
            }
        }
    }

    function _addTip(
        uint256 _poolId,
        uint256 _amount,
        LibDIVAStorage.PoolStorage storage _ps,
        LibDIVAStorage.FeeClaimStorage storage _fs
    ) private {
        // Load pool
        LibDIVAStorage.Pool storage _pool = _ps.pools[_poolId];

        // Confirm that no value has been submitted yet
        if (_pool.statusFinalReferenceValue != LibDIVAStorage.Status.Open) {
            revert FinalValueAlreadySubmitted();
        }

        // Cache collateral token
        IERC20Metadata collateralToken = IERC20Metadata(_pool.collateralToken);

        // Check collateral token balance before and after the transfer to account
        // for potential fees. It is a conscious decision to allow users to add tips
        // in the presence of fees to incentive reporting. Note that the
        // Checks-Effects-Interactions pattern cannot be followed here. This shouldn't
        // be a problem because reentrancy guards are in place.
        uint256 _before = collateralToken.balanceOf(address(this));

        // Transfer approved collateral tokens from `msg.sender` to `this`
        collateralToken.safeTransferFrom(msg.sender, address(this), _amount);

        uint256 _after = collateralToken.balanceOf(address(this));

        // Update `_amount` if a fee was applied during transfer. Throws if
        // `_before > _after`.
        if (_after - _before != _amount) {
            _amount = _after - _before;
        }

        // Update claim mapping.
        _fs.poolIdToReservedClaim[_poolId] += _amount;

        // Log event
        emit TipAdded(msg.sender, _poolId, address(collateralToken), _amount);
    }
}
