// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {IGovernance} from "../interfaces/IGovernance.sol";
import {LibOwnership} from "../libraries/LibOwnership.sol";
import {LibDIVAStorage} from "../libraries/LibDIVAStorage.sol";
import {LibDIVA} from "../libraries/LibDIVA.sol";

contract GovernanceFacet is IGovernance {
    modifier onlyOwner() {
        LibOwnership._enforceIsContractOwner();
        _;
    }

    function updateFees(uint96 _protocolFee, uint96 _settlementFee)
        external
        override
        onlyOwner
    {
        // Check validity of new fee parameters
        _isValidFee(_protocolFee);
        _isValidFee(_settlementFee);

        // Get reference to relevant storage slot
        LibDIVAStorage.GovernanceStorage storage gs = LibDIVAStorage
            ._governanceStorage();

        // Load latest fee regime
        LibDIVAStorage.Fees memory _fees = gs.fees[gs.fees.length - 1];

        // Confirm that there is no pending fees update. Revoke to update
        // pending values.
        if (_fees.startTime > block.timestamp) {
            revert PendingFeesUpdate(block.timestamp, _fees.startTime);
        }

        // Set time at which the new fees will become applicable
        uint256 _startTime = block.timestamp + 60 days;

        // Add new fee regime to the fees array. New fee regime become active after
        // a delay of 60 days unless revoked.
        gs.fees.push(
            LibDIVAStorage.Fees({
                startTime: _startTime,
                protocolFee: _protocolFee,
                settlementFee: _settlementFee
            })
        );

        // Log the new fees as well as the address that initiated the change
        emit FeeUpdated(
            msg.sender,
            _protocolFee,
            _startTime,
            FeeType.PROTOCOL_FEE
        );
        emit FeeUpdated(
            msg.sender,
            _settlementFee,
            _startTime,
            FeeType.SETTLEMENT_FEE
        );
    }

    function updateSettlementPeriods(
        uint24 _submissionPeriod,
        uint24 _challengePeriod,
        uint24 _reviewPeriod,
        uint24 _fallbackSubmissionPeriod
    ) external override onlyOwner {
        // Check validity of new settlement periods
        _isValidPeriod(_submissionPeriod);
        _isValidPeriod(_challengePeriod);
        _isValidPeriod(_reviewPeriod);
        _isValidPeriod(_fallbackSubmissionPeriod);

        // Get reference to relevant storage slot
        LibDIVAStorage.GovernanceStorage storage gs = LibDIVAStorage
            ._governanceStorage();

        // Load latest settlement period regime
        LibDIVAStorage.SettlementPeriods memory _settlementPeriods = gs
            .settlementPeriods[gs.settlementPeriods.length - 1];

        // Confirm that there is no pending settlement periods update.
        // Revoke to update pending values.
        if (_settlementPeriods.startTime > block.timestamp) {
            revert PendingSettlementPeriodsUpdate(
                block.timestamp,
                _settlementPeriods.startTime
            );
        }

        // Set time at which the new periods will become applicable
        uint256 _startTime = block.timestamp + 60 days;

        // Add new settlement period regime to the settlement periods array. New periods
        // become active after a delay of 60 days unless revoked.
        gs.settlementPeriods.push(
            LibDIVAStorage.SettlementPeriods({
                startTime: _startTime,
                submissionPeriod: _submissionPeriod,
                challengePeriod: _challengePeriod,
                reviewPeriod: _reviewPeriod,
                fallbackSubmissionPeriod: _fallbackSubmissionPeriod
            })
        );

        // Log the new settlement periods as well as the address that initiated the change
        emit SettlementPeriodUpdated(
            msg.sender,
            _submissionPeriod,
            _startTime,
            SettlementPeriodType.SUBMISSION_PERIOD
        );
        emit SettlementPeriodUpdated(
            msg.sender,
            _challengePeriod,
            _startTime,
            SettlementPeriodType.CHALLENGE_PERIOD
        );
        emit SettlementPeriodUpdated(
            msg.sender,
            _reviewPeriod,
            _startTime,
            SettlementPeriodType.REVIEW_PERIOD
        );
        emit SettlementPeriodUpdated(
            msg.sender,
            _fallbackSubmissionPeriod,
            _startTime,
            SettlementPeriodType.FALLBACK_SUBMISSION_PERIOD
        );
    }

    function updateFallbackDataProvider(address _newFallbackDataProvider)
        external
        override
        onlyOwner
    {
        // Confirm that provided fallback data provider address is not zero address
        if (_newFallbackDataProvider == address(0)) revert ZeroAddress();

        // Get reference to relevant storage slot
        LibDIVAStorage.GovernanceStorage storage gs = LibDIVAStorage
            ._governanceStorage();

        // Get start time of fallback provider
        uint256 _startTimeFallbackDataProvider = gs
            .startTimeFallbackDataProvider;

        // Confirm that there is no pending fallback data provider update.
        // Revoke to update pending value.
        if (_startTimeFallbackDataProvider > block.timestamp) {
            revert PendingFallbackDataProviderUpdate(
                block.timestamp,
                _startTimeFallbackDataProvider
            );
        }

        // Store current fallback provider in `previousFallbackDataProvider` variable
        gs.previousFallbackDataProvider = gs.fallbackDataProvider;

        // Set time at which the new fallback will become applicable
        uint256 _startTimeNewFallbackDataProvider = block.timestamp + 60 days;

        // Store start time and new fallback data provider
        gs.startTimeFallbackDataProvider = _startTimeNewFallbackDataProvider;
        gs.fallbackDataProvider = _newFallbackDataProvider;

        // Log the new fallback data provider as well as the address that initiated the change
        emit FallbackDataProviderUpdated(
            msg.sender,
            _newFallbackDataProvider,
            _startTimeNewFallbackDataProvider
        );
    }

    function updateTreasury(address _newTreasury) external override onlyOwner {
        // Confirm that provided treasury address is not zero address
        if (_newTreasury == address(0)) revert ZeroAddress();

        // Get reference to relevant storage slot
        LibDIVAStorage.GovernanceStorage storage gs = LibDIVAStorage
            ._governanceStorage();

        // Get start time of new treasury address
        uint256 _startTimeTreasury = gs.startTimeTreasury;

        // Confirm that there is no pending treasury address update.
        // Revoke to update pending value.
        if (_startTimeTreasury > block.timestamp) {
            revert PendingTreasuryUpdate(block.timestamp, _startTimeTreasury);
        }

        // Store current treasury address in `previousTreasury` variable
        gs.previousTreasury = gs.treasury;

        // Set time at which the new treasury address will become applicable
        uint256 _startTimeNewTreasury = block.timestamp + 2 days;

        // Store start time and new treasury address
        gs.startTimeTreasury = _startTimeNewTreasury;
        gs.treasury = _newTreasury;

        // Log the new treasury address as well as the address that initiated the change
        emit TreasuryUpdated(msg.sender, _newTreasury, _startTimeNewTreasury);
    }

    function pauseReturnCollateral() external override onlyOwner {
        // Get reference to relevant storage slot
        LibDIVAStorage.GovernanceStorage storage gs = LibDIVAStorage
            ._governanceStorage();

        // Minimum time between two pause events is 10 days, but users can interact
        // with `redeemPositionToken` and `removeLiquidity` already after 8 days giving them
        // at least 2 days to remove collateral until the next pause can be activated.
        if (block.timestamp <= gs.pauseReturnCollateralUntil + 2 days)
            revert TooEarlyToPauseAgain();
        gs.pauseReturnCollateralUntil = block.timestamp + 8 days;

        // Log the timestamp until when collateral withdrawals are paused as well as the
        // address that initiated the change
        emit ReturnCollateralPaused(msg.sender, gs.pauseReturnCollateralUntil);
    }

    function unpauseReturnCollateral() external override onlyOwner {
        // Get reference to relevant storage slot
        LibDIVAStorage.GovernanceStorage storage gs = LibDIVAStorage
            ._governanceStorage();

        // Unpause return of collateral by setting `pauseReturnCollateralUntil` to
        // the current block's timestamp
        gs.pauseReturnCollateralUntil = block.timestamp;

        // Log the updated `pauseReturnCollateralUntil` timestamp
        emit ReturnCollateralUnpaused(
            msg.sender,
            gs.pauseReturnCollateralUntil
        );
    }

    function revokePendingFeesUpdate() external override onlyOwner {
        // Get reference to relevant storage slot
        LibDIVAStorage.GovernanceStorage storage gs = LibDIVAStorage
            ._governanceStorage();

        // Load latest fee regime
        LibDIVAStorage.Fees memory _fees = gs.fees[gs.fees.length - 1];

        // Confirm that fees are not active yet
        if (_fees.startTime <= block.timestamp) {
            revert FeesAlreadyActive(block.timestamp, _fees.startTime);
        }

        // Store pending fees for event log
        LibDIVAStorage.Fees memory _pendingFees = _fees;

        // Remove pending fees from array
        gs.fees.pop();

        // Get new applicable fees
        LibDIVAStorage.Fees memory _previousFees = gs.fees[gs.fees.length - 1];

        // Log the fees revoked, the previous fees that now apply as well as
        // the address that initiated the change
        emit PendingFeeUpdateRevoked(
            msg.sender,
            _pendingFees.protocolFee,
            _previousFees.protocolFee,
            FeeType.PROTOCOL_FEE
        );
        emit PendingFeeUpdateRevoked(
            msg.sender,
            _pendingFees.settlementFee,
            _previousFees.settlementFee,
            FeeType.SETTLEMENT_FEE
        );
    }

    function revokePendingSettlementPeriodsUpdate()
        external
        override
        onlyOwner
    {
        // Get reference to relevant storage slot
        LibDIVAStorage.GovernanceStorage storage gs = LibDIVAStorage
            ._governanceStorage();

        // Load latest settlement period regime
        LibDIVAStorage.SettlementPeriods memory _settlementPeriods = gs
            .settlementPeriods[gs.settlementPeriods.length - 1];

        // Confirm that settlement periods are not active yet
        if (_settlementPeriods.startTime <= block.timestamp) {
            revert SettlementPeriodsAlreadyActive(
                block.timestamp,
                _settlementPeriods.startTime
            );
        }

        // Store pending periods for event log
        LibDIVAStorage.SettlementPeriods
            memory _pendingSettlementPeriods = _settlementPeriods;

        // Remove pending periods from array
        gs.settlementPeriods.pop();

        // Get new applicable periods
        LibDIVAStorage.SettlementPeriods memory _previousSettlementPeriods = gs
            .settlementPeriods[gs.settlementPeriods.length - 1];

        // Log the periods revoked, the previous periods that now apply as well as
        // the address that initiated the change
        emit PendingSettlementPeriodUpdateRevoked(
            msg.sender,
            _pendingSettlementPeriods.submissionPeriod,
            _previousSettlementPeriods.submissionPeriod,
            SettlementPeriodType.SUBMISSION_PERIOD
        );
        emit PendingSettlementPeriodUpdateRevoked(
            msg.sender,
            _pendingSettlementPeriods.challengePeriod,
            _previousSettlementPeriods.challengePeriod,
            SettlementPeriodType.CHALLENGE_PERIOD
        );
        emit PendingSettlementPeriodUpdateRevoked(
            msg.sender,
            _pendingSettlementPeriods.reviewPeriod,
            _previousSettlementPeriods.reviewPeriod,
            SettlementPeriodType.REVIEW_PERIOD
        );
        emit PendingSettlementPeriodUpdateRevoked(
            msg.sender,
            _pendingSettlementPeriods.fallbackSubmissionPeriod,
            _previousSettlementPeriods.fallbackSubmissionPeriod,
            SettlementPeriodType.FALLBACK_SUBMISSION_PERIOD
        );
    }

    function revokePendingFallbackDataProviderUpdate()
        external
        override
        onlyOwner
    {
        // Get reference to relevant storage slot
        LibDIVAStorage.GovernanceStorage storage gs = LibDIVAStorage
            ._governanceStorage();

        // Get start time of fallback provider
        uint256 _startTimeFallbackDataProvider = gs
            .startTimeFallbackDataProvider;

        // Confirm that new fallback provider is not active yet
        if (_startTimeFallbackDataProvider <= block.timestamp) {
            revert FallbackProviderAlreadyActive(
                block.timestamp,
                _startTimeFallbackDataProvider
            );
        }

        address _revokedFallbackDataProvider = gs.fallbackDataProvider;

        // Reset fallback data provider related variables
        gs.startTimeFallbackDataProvider = block.timestamp;
        gs.fallbackDataProvider = gs.previousFallbackDataProvider;

        // Log the fallback data provider revoked, the previous one that now applies as well as
        // the address that initiated the change
        emit PendingFallbackDataProviderUpdateRevoked(
            msg.sender,
            _revokedFallbackDataProvider,
            gs.previousFallbackDataProvider
        );
    }

    function revokePendingTreasuryUpdate() external override onlyOwner {
        // Get reference to relevant storage slot
        LibDIVAStorage.GovernanceStorage storage gs = LibDIVAStorage
            ._governanceStorage();

        // Get start time of treasury address
        uint256 _startTimeTreasury = gs.startTimeTreasury;

        // Confirm that new treasury address is not active yet
        if (_startTimeTreasury <= block.timestamp) {
            revert TreasuryAlreadyActive(block.timestamp, _startTimeTreasury);
        }

        address _revokedTreasury = gs.treasury;

        // Reset treasury related variables
        gs.startTimeTreasury = block.timestamp;
        gs.treasury = gs.previousTreasury;

        // Log the treasury address revoked, the previous one that now applies as well as
        // the address that initiated the change
        emit PendingTreasuryUpdateRevoked(
            msg.sender,
            _revokedTreasury,
            gs.previousTreasury
        );
    }

    function _isValidFee(uint96 _fee) private pure {
        if (_fee > 0) {
            // Min fee of 0.01% introduced to have a minimum non-zero fee in `removeLiquidity`
            if (_fee < 100000000000000) revert FeeBelowMinimum(); // 0.01% = 0.0001
            if (_fee > 15000000000000000) revert FeeAboveMaximum(); // 1.5% = 0.015
        }
    }

    function _isValidPeriod(uint256 _period) private pure {
        if (_period < 3 days || _period > 15 days) revert OutOfBounds();
    }
}
