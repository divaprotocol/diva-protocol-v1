// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {UsingTellor} from "./UsingTellor.sol";
import {IDIVAOwnershipSecondary} from "./interfaces/IDIVAOwnershipSecondary.sol";

/**
 * @notice Ownership contract for secondary chain which uses the Tellor oracle protocol to sync
 * the main chain owner returned by `getCurrentOwner()` function in `DIVAOwnershipMain.sol`.
 * @dev `setOwner()` function pulls the latest value that remained undisputed for more than 12 hours.
 * - Reverts with `NoOracleSubmission` if there is no value inside the Tellor smart contract that remained
 *   undisputed for more than 12 hours.
 * - Reverts with `ValueTooOld` if the last reported undisputed value is older than 36 hours.
 * 
 * Tellor reporters can verify the validity of a reported value by simulating the return value
 * of `getCurrentOwner()` on the main chain as of a block with a timestamp shortly before the
 * time of reporting using an archive node.
 *  
 * As Tellor is a permissionless system that allows anyone to report outcomes, constant
 * monitoring of value submissions is required. Incentives built into the Tellor system encourage
 * Tellor watchers to dispute inaccurate reportings. The main chain owner has a
 * natural incentive to participate as a Tellor watcher and dispute any wrong submissions.
 * In the event that an invalid submission goes unnoticed and a bad actor takes over ownership
 * on a secondary chain, the potential harm is limited. Functions such as `updateFees`,
 * `updateSettlementPeriods`, `updateFallbackDataProvider`, and `updateTreasury` have an
 * activation delay and can be revoked as soon as the rightful owner regains control. The
 * revoke functions as well as `pauseReturnCollateral` do not implement a delay and changes will
 * take immediate effect if triggered by an unauthorized account. Former will require the rightful
 * owner to trigger the updates again after regaining control. Latter will delay the possibility
 * to redeem by a maximum of 8 days, but will not interrupt the settlement process, ensuring that
 * all outstanding pools will settle correctly. The pause can be immediately reversed once the
 * rightful owner regains control.
 */
contract DIVAOwnershipSecondary is UsingTellor, IDIVAOwnershipSecondary {

    address private _owner;
    address private immutable _OWNERSHIP_CONTRACT_MAIN_CHAIN;
    uint256 private immutable _MAIN_CHAIN_ID;
    uint256 private constant _MIN_UNDISPUTED_PERIOD = 12 hours;
    uint256 private constant _MAX_ALLOWED_AGE_OF_REPORTED_VALUE = 36 hours;

    constructor(
        address _initialOwner,
        address payable _tellorAddress,
        uint256 _mainChainId,
        address _ownershipContractMainChain
    ) payable UsingTellor(_tellorAddress) {
        _owner = _initialOwner; 
        _MAIN_CHAIN_ID = _mainChainId;
        _OWNERSHIP_CONTRACT_MAIN_CHAIN = _ownershipContractMainChain;
    }
    
    function setOwner() external override {
        
        // Get reported owner address from Tellor smart contract.
        // Only values that remained undisputed for at least 12 hours and are not older
        // than 36 hours are accepted.

        // Get queryId
        (, bytes32 _queryId) = getQueryDataAndId();

        // Retrieve the latest value (encoded owner address) that remained undisputed for at least
        // 12 hours as well as the reporting timestamp
        (bytes memory _valueRetrieved, uint256 _timestampRetrieved) = 
            getDataBefore(_queryId, block.timestamp - _MIN_UNDISPUTED_PERIOD);
        
        // Check that data exists
        if (_timestampRetrieved == 0) {
            revert NoOracleSubmission();
        }

        // Check that value is not older than 36 hours
        uint256 _maxAllowedTimestampRetrieved = block.timestamp - _MAX_ALLOWED_AGE_OF_REPORTED_VALUE;
        if (_timestampRetrieved < _maxAllowedTimestampRetrieved) {
            revert ValueTooOld(_timestampRetrieved, _maxAllowedTimestampRetrieved);
        }

        // Reported owner address is expected to match the address returned by `getCurrentOwner`
        // in `DIVAOwnershipMain.sol` as of the time of reporting (`_timestampRetrieved`).
        address _formattedOwner = abi.decode(_valueRetrieved, (address));

        // Update owner to the owner returned by the Tellor protocol
        _owner = _formattedOwner;

        // Log set owner on secondary chain
        emit OwnerSet(_formattedOwner);
    }

    function getCurrentOwner() external view override returns (address) {
        return _owner;
    }

    function getOwnershipContractMainChain() external view override returns (address) {
        return _OWNERSHIP_CONTRACT_MAIN_CHAIN;
    }

    function getMainChainId() external view override returns (uint256) {
        return _MAIN_CHAIN_ID;
    }

    function getQueryDataAndId()
        public
        view
        override
        returns (
            bytes memory queryData,
            bytes32 queryId
        )
    {
        // Construct Tellor queryData and queryId:
        // https://github.com/tellor-io/dataSpecs/blob/main/types/EVMCall.md
        queryData = 
                abi.encode(
                    "EVMCall",
                    abi.encode(
                        _MAIN_CHAIN_ID,
                        _OWNERSHIP_CONTRACT_MAIN_CHAIN,
                        abi.encodeWithSignature("getCurrentOwner()")
                    )
                );

        queryId = keccak256(queryData);        
    }
}