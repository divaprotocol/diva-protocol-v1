// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

interface IGovernance {
    enum FeeType {
        PROTOCOL_FEE,
        SETTLEMENT_FEE
    }

    enum SettlementPeriodType {
        SUBMISSION_PERIOD,
        CHALLENGE_PERIOD,
        REVIEW_PERIOD,
        FALLBACK_SUBMISSION_PERIOD
    }

    // Thrown in `updateFees` if contract owner attempts to set
    // 0 < protocol/settlement fee < 0.01% (non-zero minimum)
    error FeeBelowMinimum();

    // Thrown in `updateFees` if contract owner attempts to set
    // protocol/settlement fee > 1.5% (maximum)
    error FeeAboveMaximum();

    // Thrown in `updateSettlementPeriods` if contract owner attempts to set
    // a settlement related period to less than 3 day or more than 15 days
    error OutOfBounds();

    // Thrown in `updateTreasury` and `updateFallbackDataProvider` if contract
    // owner attempts to set the treasury or fallback data provider address equal
    // to the zero address
    error ZeroAddress();

    // Thrown in `pauseReturnCollateral` if contract owner attempts to pause
    // `redeemPositionToken` and `removeLiquidity` before the two day delay period
    // has passed
    error TooEarlyToPauseAgain();

    // Thrown in `updateFees` if there is already a pending fees update
    error PendingFeesUpdate(uint256 _timestampBlock, uint256 _startTimeFees);

    // Thrown in `updateSettlementPeriods` if there is already a pending
    // settlement periods update
    error PendingSettlementPeriodsUpdate(
        uint256 _timestampBlock,
        uint256 _startTimeSettlementPeriods
    );

    // Thrown in `updateFallbackDataProvider` if there is already a
    // pending fallback data provider update
    error PendingFallbackDataProviderUpdate(
        uint256 _timestampBlock,
        uint256 _startTimeFallbackDataProvider
    );

    // Thrown in `setTreasury` if there is already a
    // pending treasury address update
    error PendingTreasuryUpdate(
        uint256 _timestampBlock,
        uint256 _startTimeTreasury
    );

    // Thrown in `revokeLastFeesSet` if the fees update to be revoked is already active
    error FeesAlreadyActive(uint256 _timestampBlock, uint256 _startTimeFees);

    // Thrown in `revokeLastSettlementPeriodsSet` if the settlement periods update
    // to be revoked is already active
    error SettlementPeriodsAlreadyActive(
        uint256 _timestampBlock,
        uint256 _startTimeSettlementPeriods
    );

    // Thrown in `revokePendingFallbackDataProviderUpdate` if the fallback data provider
    // update to be revoked is already active
    error FallbackProviderAlreadyActive(
        uint256 _timestampBlock,
        uint256 _startTimeFallbackDataProvider
    );

    // Thrown in `revokePendingTreasuryUpdate` if the treasury address update
    // to be revoked is already active
    error TreasuryAlreadyActive(
        uint256 _timestampBlock,
        uint256 _startTimeTreasury
    );

    /**
     * @notice Emitted when a fee parameter is updated by the contract owner.
     * @param from Address that initiated the change (contract owner).
     * @param fee New fee amount in % expressed as an integer with 18 decimals
     * (e.g., 2500000000000000 for 0.25%).
     * @param startTime Timestamp in seconds since epoch at which the
     * new fee will be activated.
     * @param feeType Fee Type.
     */
    event FeeUpdated(
        address indexed from,
        uint96 fee,
        uint256 startTime,
        FeeType feeType
    );

    /**
     * @notice Emitted when a settlement related period is updated by the contract owner.
     * @param from Address that initiated the change (contract owner).
     * @param period New period length in seconds.
     * @param startTime The timestamp in seconds since epoch at which the
     * new settlement period will be activated.
     * @param periodType Settlement period type.
     */
    event SettlementPeriodUpdated(
        address indexed from,
        uint24 period,
        uint256 startTime,
        SettlementPeriodType periodType
    );

    /**
     * @notice Emitted when the treasury address is set.
     * @param from The address that initiated the change (contract owner).
     * @param treasury New treasury address.
     * @param startTimeTreasury Timestamp in seconds since epoch at which
     * the new treasury address will be activated.
     */
    event TreasuryUpdated(
        address indexed from,
        address indexed treasury,
        uint256 startTimeTreasury
    );

    /**
     * @notice Emitted when the fallback data provider is updated.
     * @param from The address that initiated the change (contract owner).
     * @param fallbackDataProvider New fallback data provider.
     * @param startTimeFallbackDataProvider Timestamp in seconds since epoch
     * at which the new fallback provider will be activated.
     */
    event FallbackDataProviderUpdated(
        address indexed from,
        address indexed fallbackDataProvider,
        uint256 startTimeFallbackDataProvider
    );

    /**
     * @notice Emitted when the `pauseReturnCollateral` function is called
     * by the contract owner to pause withdrawals via `removeLiquidity`
     * and `redeemPositionToken`.
     * @param from Address that initiated the change (contract owner).
     * @param pausedUntil Timestamp in seconds since epoch until when withdrawals
     * are paused.
     */
    event ReturnCollateralPaused(address indexed from, uint256 pausedUntil);

    /**
     * @notice Emitted when the `unpauseReturnCollateral` function is called
     * by the contract owner to unpause withdrawals.
     * @param from Address that initiated the change (contract owner).
     * @param timestamp Block timestamp prevailing at the time of the call.
     */
    event ReturnCollateralUnpaused(address indexed from, uint256 timestamp);

    /**
     * @notice Emitted when a pending fees update is revoked.
     * @param revokedBy The address that initiated the revocation.
     * @param revokedFee Pending fee that was revoked.
     * @param restoredFee Previous fee that was restored.
     * @param feeType Fee type.
     */
    event PendingFeeUpdateRevoked(
        address indexed revokedBy,
        uint96 revokedFee,
        uint96 restoredFee,
        FeeType feeType
    );

    /**
     * @notice Emitted when a pending settlement periods update is revoked.
     * @param revokedBy The address that initiated the revocation.
     * @param revokedPeriod Pending period length that was revoked.
     * @param restoredPeriod Previous period length that was restored.
     * @param periodType Settlement period type.
     */
    event PendingSettlementPeriodUpdateRevoked(
        address indexed revokedBy,
        uint24 revokedPeriod,
        uint24 restoredPeriod,
        SettlementPeriodType periodType
    );

    /**
     * @notice Emitted when a pending fallback data provider update is revoked.
     * @param revokedBy The address that initiated the revocation.
     * @param revokedFallbackDataProvider Pending fallback data provider that was
     * revoked.
     * @param restoredFallbackDataProvider Previous fallback data provider that was
     * restored.
     */
    event PendingFallbackDataProviderUpdateRevoked(
        address indexed revokedBy,
        address indexed revokedFallbackDataProvider,
        address indexed restoredFallbackDataProvider
    );

    /**
     * @notice Emitted when a pending treasury address update is revoked.
     * @param revokedBy The address that initiated the revocation.
     * @param revokedTreasury Pending treasury address that was revoked.
     * @param restoredTreasury Previous treasury address that was restored.
     */
    event PendingTreasuryUpdateRevoked(
        address indexed revokedBy,
        address indexed revokedTreasury,
        address indexed restoredTreasury
    );

    /**
     * @notice Function to update the protocol and settlement fee.
     * @dev Activation is restricted to the contract owner and subject to
     * a 60-day delay. To keep a fee parameter unchanged, simply pass the current
     * value as argument. New fees will only apply for pools that are created
     * at or after activation time.
     *
     * Reverts if:
     * - `msg.sender` is not contract owner.
     * - one of the new fee parameters is smaller than 0.01% (`1e14`
     *   in integer terms with 18 decimals) or greater than 1.5% (`1.5e16`
     *   in integer terms with 18 decimals) if fee > 0; 0% is possible though.
     * - there is already a pending fee update.
     * @param _protocolFee New protocol fee.
     * @param _settlementFee New settlement fee.
     */
    function updateFees(uint96 _protocolFee, uint96 _settlementFee) external;

    /**
     * @notice Function to update settlement related periods.
     * @dev Activation is restricted to the contract owner and subject to
     * a 60-day delay. To keep a period unchanged, simply pass the current
     * value as argument. New periods will only apply for pools that
     * are created at or after activation time.
     *
     * Reverts if:
     * - `msg.sender` is not contract owner.
     * - one of the new periods is outside of the allowed range (i.e., less than 3 days or more than 15 days).
     * - there is already a pending settlement period update.
     * @param _submissionPeriod New submission period in seconds.
     * @param _challengePeriod New challenge period in seconds.
     * @param _reviewPeriod New review period in seconds.
     * @param _fallbackSubmissionPeriod New fallback submission period in seconds.
     */
    function updateSettlementPeriods(
        uint24 _submissionPeriod,
        uint24 _challengePeriod,
        uint24 _reviewPeriod,
        uint24 _fallbackSubmissionPeriod
    ) external;

    /**
     * @notice Function to update the fallback data provider address.
     * @dev Activation is restricted to the contract owner and subject
     * to a 60-day delay. The fallback provider is a global protocol
     * parameter that affects all outstanding pools after activation.
     *
     * Reverts if:
     * - `msg.sender` is not contract owner.
     * - provided address equals zero address.
     * - there is already a pending fallback data provider update.
     * @param _fallbackDataProvider New fallback data provider address.
     */
    function updateFallbackDataProvider(address _fallbackDataProvider) external;

    /**
     * @notice Function to update the treasury address where protocol fees are
     * directed to.
     * @dev Activation is restricted to the contract owner and subject
     * to a 2-day delay.
     *
     * Reverts if:
     * - `msg.sender` is not contract owner.
     * - provided address equals zero address.
     * - there is already a pending treasury address update.
     * @param _treasury New treasury address.
     */
    function updateTreasury(address _treasury) external;

    /**
     * @notice Function to pause the withdrawal of collateral
     * via `removeLiquidity` and `redeemPositionToken`. Note that the pause
     * is limited to a maximum of 8 days and the owner has to wait for at least
     * 2 days before it can be activated again. It is important to highlight
     * that the settlement process will not be interrupted by a pause ensuring
     * that all outstanding pools can be settled correctly. It merely delays
     * the time users can start redeeming their position tokens.
     * @dev The function does not implement a delay to allow the contract owner
     * to act quickly if needed.
     *
     * Reverts if:
     * - `msg.sender` is not contract owner.
     * - triggered during the 2-day delay window after the end of a pause.
     */
    function pauseReturnCollateral() external;

    /**
     * @notice Function to unpause the withdrawal of collateral.
     * @dev Withdrawals are unpaused by updating the `pauseReturnCollateralUntil`
     * variable to the block's timestamp prevailing at the time of the call.
     * The function does not implement a delay.
     */
    function unpauseReturnCollateral() external;

    /**
     * @notice Function to revoke a pending fees update and restore the
     * previous ones.
     * @dev Reverts if:
     * - `msg.sender` is not contract owner.
     * - new fee regime is already active.
     */
    function revokePendingFeesUpdate() external;

    /**
     * @notice Function to revoke a pending settlement periods update and
     * restore the previous ones.
     * @dev Reverts if:
     * - `msg.sender` is not contract owner.
     * - new settlement fee regime is already active.
     */
    function revokePendingSettlementPeriodsUpdate() external;

    /**
     * @notice Function to revoke a pending fallback data provider update
     * and restore the previous one.
     * @dev Reverts if:
     * - `msg.sender` is not contract owner.
     * - new fallback data provider is already active.
     */
    function revokePendingFallbackDataProviderUpdate() external;

    /**
     * @notice Function to revoke a pending treasury address update
     * and restore the previous one.
     * @dev Reverts if:
     * - `msg.sender` is not contract owner.
     * - new treasury address is already active.
     */
    function revokePendingTreasuryUpdate() external;
}
