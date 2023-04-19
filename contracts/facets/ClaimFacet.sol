// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@solidstate/contracts/utils/ReentrancyGuard.sol";
import {IClaim} from "../interfaces/IClaim.sol";
import {LibDIVAStorage} from "../libraries/LibDIVAStorage.sol";

contract ClaimFacet is IClaim, ReentrancyGuard {
    using SafeERC20 for IERC20Metadata;

    function claimFee(address _collateralToken, address _recipient)
        external
        override
        nonReentrant
    {
        // Get reference to relevant storage slot
        LibDIVAStorage.FeeClaimStorage storage fs = LibDIVAStorage
            ._feeClaimStorage();

        // Claim fee
        _claimFee(_collateralToken, _recipient, fs);
    }

    function batchClaimFee(ArgsBatchClaimFee[] calldata _argsBatchClaimFee)
        external
        override
        nonReentrant
    {
        // Get reference to relevant storage slot
        LibDIVAStorage.FeeClaimStorage storage fs = LibDIVAStorage
            ._feeClaimStorage();

        // Claim fees
        uint256 len = _argsBatchClaimFee.length;
        for (uint256 i = 0; i < len; ) {
            _claimFee(
                _argsBatchClaimFee[i].collateralToken,
                _argsBatchClaimFee[i].recipient,
                fs
            );
            unchecked {
                ++i;
            }
        }
    }

    function transferFeeClaim(
        address _recipient,
        address _collateralToken,
        uint256 _amount
    ) external override nonReentrant {
        // Get reference to relevant storage slot
        LibDIVAStorage.FeeClaimStorage storage fs = LibDIVAStorage
            ._feeClaimStorage();

        // Transfer fee claim
        _transferFeeClaim(_recipient, _collateralToken, _amount, fs);
    }

    function batchTransferFeeClaim(
        ArgsBatchTransferFeeClaim[] calldata _argsBatchTransferFeeClaim
    ) external override nonReentrant {
        // Get reference to relevant storage slot
        LibDIVAStorage.FeeClaimStorage storage fs = LibDIVAStorage
            ._feeClaimStorage();

        // Transfer fee claims
        uint256 len = _argsBatchTransferFeeClaim.length;
        for (uint256 i = 0; i < len; ) {
            _transferFeeClaim(
                _argsBatchTransferFeeClaim[i].recipient,
                _argsBatchTransferFeeClaim[i].collateralToken,
                _argsBatchTransferFeeClaim[i].amount,
                fs
            );
            unchecked {
                ++i;
            }
        }
    }

    function _claimFee(
        address _collateralToken,
        address _recipient,
        LibDIVAStorage.FeeClaimStorage storage _fs
    ) private {
        // Get the claimable amount
        uint256 _amount = _fs.claimableFeeAmount[_collateralToken][_recipient];

        // Set claimable amount to zero
        _fs.claimableFeeAmount[_collateralToken][_recipient] = 0;

        // Transfer amount to `_recipient`
        IERC20Metadata(_collateralToken).safeTransfer(_recipient, _amount);

        // Log event
        emit FeeClaimed(_recipient, _collateralToken, _amount);
    }

    function _transferFeeClaim(
        address _recipient,
        address _collateralToken,
        uint256 _amount,
        LibDIVAStorage.FeeClaimStorage storage _fs
    ) private {
        // Confirm that `_recipient` is not the zero address
        if (_recipient == address(0)) revert RecipientIsZeroAddress();

        // Confirm that `msg.sender` owns the specified `_amount`
        if (_fs.claimableFeeAmount[_collateralToken][msg.sender] < _amount)
            revert AmountExceedsClaimableFee();

        // Update fee claim balances of `msg.sender` and `_recipient`
        _fs.claimableFeeAmount[_collateralToken][msg.sender] -= _amount;
        _fs.claimableFeeAmount[_collateralToken][_recipient] += _amount;

        // Log event
        emit FeeClaimTransferred(
            msg.sender,
            _recipient,
            _collateralToken,
            _amount
        );
    }
}
