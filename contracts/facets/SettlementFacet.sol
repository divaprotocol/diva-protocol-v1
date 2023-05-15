// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ReentrancyGuard} from "@solidstate/contracts/utils/ReentrancyGuard.sol";
import {IPositionToken} from "../interfaces/IPositionToken.sol";
import {ISettlement} from "../interfaces/ISettlement.sol";
import {LibDIVA} from "../libraries/LibDIVA.sol";
import {LibDIVAStorage} from "../libraries/LibDIVAStorage.sol";

contract SettlementFacet is ISettlement, ReentrancyGuard {
    function setFinalReferenceValue(
        bytes32 _poolId,
        uint256 _finalReferenceValue,
        bool _allowChallenge
    ) external override nonReentrant {
        // Get references to relevant storage slots
        LibDIVAStorage.PoolStorage storage ps = LibDIVAStorage._poolStorage();
        LibDIVAStorage.GovernanceStorage storage gs = LibDIVAStorage
            ._governanceStorage();

        _setFinalReferenceValue(
            _poolId,
            _finalReferenceValue,
            _allowChallenge,
            ps,
            gs
        );
    }

    function batchSetFinalReferenceValue(
        ArgsBatchSetFinalReferenceValue[]
            calldata _argsBatchSetFinalReferenceValue
    ) external override nonReentrant {
        // Get references to relevant storage slots
        LibDIVAStorage.PoolStorage storage ps = LibDIVAStorage._poolStorage();
        LibDIVAStorage.GovernanceStorage storage gs = LibDIVAStorage
            ._governanceStorage();

        uint256 len = _argsBatchSetFinalReferenceValue.length;
        for (uint256 i = 0; i < len; ) {
            _setFinalReferenceValue(
                _argsBatchSetFinalReferenceValue[i].poolId,
                _argsBatchSetFinalReferenceValue[i].finalReferenceValue,
                _argsBatchSetFinalReferenceValue[i].allowChallenge,
                ps,
                gs
            );
            unchecked {
                ++i;
            }
        }
    }

    function challengeFinalReferenceValue(
        bytes32 _poolId,
        uint256 _proposedFinalReferenceValue
    ) external override nonReentrant {
        // Get references to relevant storage slots
        LibDIVAStorage.PoolStorage storage ps = LibDIVAStorage._poolStorage();
        LibDIVAStorage.GovernanceStorage storage gs = LibDIVAStorage
            ._governanceStorage();

        _challengeFinalReferenceValue(
            _poolId,
            _proposedFinalReferenceValue,
            ps,
            gs
        );
    }

    function batchChallengeFinalReferenceValue(
        ArgsBatchChallengeFinalReferenceValue[]
            calldata _argsBatchChallengeFinalReferenceValue
    ) external override nonReentrant {
        // Get references to relevant storage slots
        LibDIVAStorage.PoolStorage storage ps = LibDIVAStorage._poolStorage();
        LibDIVAStorage.GovernanceStorage storage gs = LibDIVAStorage
            ._governanceStorage();

        uint256 len = _argsBatchChallengeFinalReferenceValue.length;
        for (uint256 i = 0; i < len; ) {
            _challengeFinalReferenceValue(
                _argsBatchChallengeFinalReferenceValue[i].poolId,
                _argsBatchChallengeFinalReferenceValue[i]
                    .proposedFinalReferenceValue,
                ps,
                gs
            );
            unchecked {
                ++i;
            }
        }
    }

    function redeemPositionToken(address _positionToken, uint256 _amount)
        external
        override
        nonReentrant
    {
        // Get references to relevant storage slots
        LibDIVAStorage.PoolStorage storage ps = LibDIVAStorage._poolStorage();
        LibDIVAStorage.GovernanceStorage storage gs = LibDIVAStorage
            ._governanceStorage();

        _redeemPositionToken(_positionToken, _amount, ps, gs);
    }

    function batchRedeemPositionToken(
        ArgsBatchRedeemPositionToken[] calldata _argsBatchRedeemPositionToken
    ) external override nonReentrant {
        // Get references to relevant storage slots
        LibDIVAStorage.PoolStorage storage ps = LibDIVAStorage._poolStorage();
        LibDIVAStorage.GovernanceStorage storage gs = LibDIVAStorage
            ._governanceStorage();

        uint256 len = _argsBatchRedeemPositionToken.length;
        for (uint256 i = 0; i < len; ) {
            _redeemPositionToken(
                _argsBatchRedeemPositionToken[i].positionToken,
                _argsBatchRedeemPositionToken[i].amount,
                ps,
                gs
            );
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @dev Updates status, timestamp and finalReferenceValue (latter if
     * status is not "Challenged"). Emits a `StatusChanged` event on success.
     * @param _poolId Pool Id for which the updates are made.
     * @param _pool Pool struct.
     * @param _newStatus New status of `finalReferenceValue`.
     * @param _finalReferenceValue The proposed final value by the
     * caller expressed as an integer with 18 decimals.
     */
    function _updateFinalReferenceValueState(
        bytes32 _poolId,
        LibDIVAStorage.Pool storage _pool,
        LibDIVAStorage.Status _newStatus,
        uint256 _finalReferenceValue
    ) internal {
        // Only update `finalReferenceValue` if status != Challenged
        if (_newStatus != LibDIVAStorage.Status.Challenged) {
            _pool.finalReferenceValue = _finalReferenceValue;
        }

        _pool.statusFinalReferenceValue = _newStatus;
        _pool.statusTimestamp = block.timestamp;

        // Log the new status, the caller, the poolId and the proposed value
        // by the challenger
        emit StatusChanged(
            _newStatus,
            msg.sender,
            _poolId,
            _finalReferenceValue
        );
    }

    /**
     * @dev Confirm final reference value, allocated fees and set payout amounts.
     * @param _poolId Pool Id for which the final reference value is confirmed.
     * @param _pool Pool struct.
     * @param _receiverProtocolFee Address of protocol fee recipient.
     * @param _receiverSettlementFee Address of settlement fee recipient.
     * @param _finalReferenceValue The final reference value to be
     * confirmed expressed as an integer with 18 decimals.
     * @param _gs Governance storage pointer.
     */
    function _confirmFinalReferenceValue(
        bytes32 _poolId,
        LibDIVAStorage.Pool storage _pool,
        address _receiverProtocolFee,
        address _receiverSettlementFee,
        uint256 _finalReferenceValue,
        LibDIVAStorage.GovernanceStorage storage _gs
    ) internal {
        // Update `statusFinalReferenceValue` and `statusTimestamp`. Emits a
        // `StatusChanged` event.
        _updateFinalReferenceValueState(
            _poolId,
            _pool,
            LibDIVAStorage.Status.Confirmed,
            _finalReferenceValue
        );

        // Get collateral token decimals which is used for scaling
        // inside `_calcAndAllocateFeeClaim`
        uint8 _decimals = IERC20Metadata(_pool.collateralToken).decimals();

        // Get the collateral balance to use as the fee basis inside
        // `_calcAndAllocateFeeClaim`
        uint256 _collateralBalance = _pool.collateralBalance;

        // Get fee parameters applicable for given pool
        LibDIVAStorage.Fees memory _fees = _gs.fees[_pool.indexFees];

        // Allocate fees to the DIVA treasury and the data provider.
        // Reduces `collateralBalance` in pool parameters accordingly.
        // Emits two `FeeClaimAllocated` events on success.
        LibDIVA._calcAndAllocateFeeClaim(
            _poolId,
            _pool,
            _fees.protocolFee,
            _receiverProtocolFee,
            _collateralBalance,
            _decimals
        );
        LibDIVA._calcAndAllocateFeeClaim(
            _poolId,
            _pool,
            _fees.settlementFee,
            _receiverSettlementFee,
            _collateralBalance,
            _decimals
        );

        // Allocate reserved fees and tips to `_receiverSettlementFee` (fallback provider
        // if data provider didn't report any value and fallback provider
        // had to step in). Does NOT update `collateralBalance` in pool
        // parameters. Emits a `ReservedClaimAllocated` event.
        LibDIVA._allocateReservedClaim(_poolId, _receiverSettlementFee);

        // Set payout amounts in pool parameters (net of fees)
        LibDIVA._setPayoutAmount(_pool, _fees, _decimals);
    }

    function _redeemPositionToken(
        address _positionToken,
        uint256 _amount,
        LibDIVAStorage.PoolStorage storage _ps,
        LibDIVAStorage.GovernanceStorage storage _gs
    ) private {
        // Confirm that functionality is not paused
        if (block.timestamp < _gs.pauseReturnCollateralUntil)
            revert ReturnCollateralPaused();

        // Get reference to the provided `_positionToken`. Reverts if
        // `_positionToken` is zero address
        IPositionToken _positionTokenInstance = IPositionToken(_positionToken);

        // Read the poolId from the position token
        bytes32 _poolId = _positionTokenInstance.poolId();

        // Load corresponding pool data
        LibDIVAStorage.Pool storage _pool = _ps.pools[_poolId];

        // Get settlement periods
        LibDIVAStorage.SettlementPeriods memory _settlementPeriods = _gs
            .settlementPeriods[_pool.indexSettlementPeriods];

        // Check that position token address is valid
        if (
            _pool.shortToken != _positionToken &&
            _pool.longToken != _positionToken
        ) revert InvalidPositionToken();

        // Check that a reference value was already set
        if (_pool.statusFinalReferenceValue == LibDIVAStorage.Status.Open)
            revert FinalReferenceValueNotSet();

        // Get current treasury address
        address _treasury = LibDIVA._getCurrentTreasury(_gs);

        // Scenarios under which the submitted value will be set to Confirmed at
        // first redemption
        if (
            _pool.statusFinalReferenceValue == LibDIVAStorage.Status.Submitted
        ) {
            // Scenario 1: Data provider submitted a final value and it was
            // not challenged during the challenge period. In that case the
            // submitted value is considered the final one.
            if (
                block.timestamp <=
                _pool.statusTimestamp + _settlementPeriods.challengePeriod
            ) revert ChallengePeriodNotExpired();

            _confirmFinalReferenceValue(
                _poolId,
                _pool,
                _treasury,
                _pool.dataProvider,
                _pool.finalReferenceValue,
                _gs
            );
        } else if (
            _pool.statusFinalReferenceValue == LibDIVAStorage.Status.Challenged
        ) {
            // Scenario 2: Submitted value was challenged, but data provider did not
            // respond during the review period. In that case, the initially submitted
            // value is considered the final one.
            if (
                block.timestamp <=
                _pool.statusTimestamp + _settlementPeriods.reviewPeriod
            ) revert ReviewPeriodNotExpired();

            _confirmFinalReferenceValue(
                _poolId,
                _pool,
                _treasury,
                _pool.dataProvider,
                _pool.finalReferenceValue,
                _gs
            );
        }

        uint8 _decimals = (IERC20Metadata(_pool.collateralToken)).decimals();

        // At this point, the status is always "Confirmed". Proceed with burning position tokens
        // and returnning collateral to user.

        // Burn position tokens. Will revert if `msg.sender` has a balance less than
        // `_amount` (checked inside `burn` function).
        _positionTokenInstance.burn(msg.sender, _amount);

        uint256 _tokenPayoutAmount;

        if (_positionToken == _pool.longToken) {
            _tokenPayoutAmount = _pool.payoutLong; // net of fees
        } else {
            // Can only be shortToken due to require statement at the beginning

            _tokenPayoutAmount = _pool.payoutShort; // net of fees
        }

        // Calculate collateral amount to return. Note that for small values of `_amount`, 
        // the position token may get burnt but no collateral returned due to
        // rounding. Handle on frontend side accordingly.
        uint256 _amountToReturn = (_tokenPayoutAmount * _amount) /
            (10**uint256(_decimals));

        // Return collateral to caller and reduce `collateralBalance` accordingly
        LibDIVA._returnCollateral(_pool, msg.sender, _amountToReturn);

        // Log redemption of position token
        emit PositionTokenRedeemed(
            _poolId,
            _positionToken,
            _amount,
            _amountToReturn,
            msg.sender
        );
    }

    function _challengeFinalReferenceValue(
        bytes32 _poolId,
        uint256 _proposedFinalReferenceValue,
        LibDIVAStorage.PoolStorage storage _ps,
        LibDIVAStorage.GovernanceStorage storage _gs
    ) private {
        // Initialize Pool struct
        LibDIVAStorage.Pool storage _pool = _ps.pools[_poolId];

        // Get settlement periods applicable for the pool
        LibDIVAStorage.SettlementPeriods memory _settlementPeriods = _gs
            .settlementPeriods[_pool.indexSettlementPeriods];

        // Check that user holds position tokens
        if (
            IPositionToken(_pool.shortToken).balanceOf(msg.sender) == 0 &&
            IPositionToken(_pool.longToken).balanceOf(msg.sender) == 0
        ) revert NoPositionTokens();

        if (
            _pool.statusFinalReferenceValue == LibDIVAStorage.Status.Submitted
        ) {
            // Check that challenge period did not expire yet
            if (
                block.timestamp >
                _pool.statusTimestamp + _settlementPeriods.challengePeriod
            ) revert ChallengePeriodExpired();

            // First challenge updates the status to "Challenged".
            // `_proposedFinalReferenceValue` will NOT update `finalReferenceValue`,
            // but only emitted as part of the `StatusChanged` event.
            _updateFinalReferenceValueState(
                _poolId,
                _pool,
                LibDIVAStorage.Status.Challenged,
                _proposedFinalReferenceValue
            );
        } else if (
            _pool.statusFinalReferenceValue == LibDIVAStorage.Status.Challenged
        ) {
            // Check that review period did not expire yet
            if (
                block.timestamp >
                _pool.statusTimestamp + _settlementPeriods.reviewPeriod
            ) revert ReviewPeriodExpired();

            // Log the proposed value by the challenger. Status and timestamp
            // do not change.
            emit StatusChanged(
                LibDIVAStorage.Status.Challenged,
                msg.sender,
                _poolId,
                _proposedFinalReferenceValue
            );
        } else {
            // Value cannot be challenged if status is "Open" or already "Confirmed"
            revert NothingToChallenge();
        }
    }

    function _setFinalReferenceValue(
        bytes32 _poolId,
        uint256 _finalReferenceValue,
        bool _allowChallenge,
        LibDIVAStorage.PoolStorage storage _ps,
        LibDIVAStorage.GovernanceStorage storage _gs
    ) private {
        // Initialize Pool struct
        LibDIVAStorage.Pool storage _pool = _ps.pools[_poolId];

        // Get settlement periods
        LibDIVAStorage.SettlementPeriods memory _settlementPeriods = _gs
            .settlementPeriods[_pool.indexSettlementPeriods];

        // Check status of final reference value
        if (
            _pool.statusFinalReferenceValue != LibDIVAStorage.Status.Open &&
            _pool.statusFinalReferenceValue != LibDIVAStorage.Status.Challenged
        ) revert AlreadySubmittedOrConfirmed();

        // Get current treasury address
        address _treasury = LibDIVA._getCurrentTreasury(_gs);

        if (_pool.statusFinalReferenceValue == LibDIVAStorage.Status.Open) {
            // Check that the contingent pool already expired
            if (block.timestamp < _pool.expiryTime) revert PoolNotExpired();

            // Calculate end of submission period
            uint256 submissionEndTime = _pool.expiryTime +
                _settlementPeriods.submissionPeriod;

            // If within the submission period ...
            if (block.timestamp <= submissionEndTime) {
                // Check that `msg.sender` is the data provider for the given pool
                if (msg.sender != _pool.dataProvider) revert NotDataProvider();

                // If challenge is disabled, the submitted final value is directly confirmed
                if (!_allowChallenge) {
                    // Confirm final value
                    _confirmFinalReferenceValue(
                        _poolId,
                        _pool,
                        _treasury,
                        _pool.dataProvider,
                        _finalReferenceValue,
                        _gs
                    );
                } else {
                    // If challenge is enabled, update status to "Submitted" which marks
                    // the start of the challenge period.

                    // Update `statusFinalReferenceValue` and `statusTimestamp`. Emits a
                    // `StatusChanged` event.
                    _updateFinalReferenceValueState(
                        _poolId,
                        _pool,
                        LibDIVAStorage.Status.Submitted,
                        _finalReferenceValue
                    );
                }
            }
            // If within the fallback period (the case when the data provider
            // failed to submit a value). Note that `block.timestamp > submissionEndTime`
            // at this point.
            else if (
                block.timestamp <=
                submissionEndTime + _settlementPeriods.fallbackSubmissionPeriod
            ) {
                // Check that the `msg.sender` is the fallback data provider
                if (msg.sender != LibDIVA._getCurrentFallbackDataProvider(_gs))
                    revert NotFallbackDataProvider();

                _confirmFinalReferenceValue(
                    _poolId,
                    _pool,
                    _treasury,
                    msg.sender,
                    _finalReferenceValue,
                    _gs
                );
            }
            // If both the data provider and fallback do not provide a value,
            // anyone can trigger this function to set and confirm the final
            // reference value equal to inflection
            else {
                // Confirm final value
                _confirmFinalReferenceValue(
                    _poolId,
                    _pool,
                    _treasury,
                    _treasury,
                    _pool.inflection,
                    _gs
                );
            }
        } else if (
            _pool.statusFinalReferenceValue == LibDIVAStorage.Status.Challenged
        ) {
            // Calculate end of review period
            uint256 reviewEndTime = _pool.statusTimestamp +
                _settlementPeriods.reviewPeriod;

            // Check that called inside the review period. No pool expiry end check
            // needed here as "Challenged" status cannot be before expiry end.
            if (block.timestamp > reviewEndTime) revert ReviewPeriodExpired();

            // Check that the `msg.sender` is the data provider for the given pool
            if (msg.sender != _pool.dataProvider) revert NotDataProvider();

            // If challenge is disabled or the data provider submits the same
            // value as before following a challenge, the submitted final value
            // is directly confirmed
            if (
                !_allowChallenge ||
                (_finalReferenceValue == _pool.finalReferenceValue)
            ) {
                _confirmFinalReferenceValue(
                    _poolId,
                    _pool,
                    _treasury,
                    _pool.dataProvider,
                    _finalReferenceValue,
                    _gs
                );
            } else {
                // If challenge is enabled, status is set to "Submitted" and
                // position token holders get the opportunity to challenge again.

                // Update `statusFinalReferenceValue` and `statusTimestamp`. Emits a
                // `StatusChanged` event.
                _updateFinalReferenceValueState(
                    _poolId,
                    _pool,
                    LibDIVAStorage.Status.Submitted,
                    _finalReferenceValue
                );
            }
        }
    }
}
