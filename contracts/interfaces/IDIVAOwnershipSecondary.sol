// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {IDIVAOwnershipShared} from "../interfaces/IDIVAOwnershipShared.sol";

interface IDIVAOwnershipSecondary is IDIVAOwnershipShared {
    // Thrown in `setOwner` if Tellor reporting timestamp is older than 36 hours
    error ValueTooOld(
        uint256 _timestampRetrieved,
        uint256 _maxAllowedTimestampRetrieved
    );

    // Thrown in `setOwner` if there is no value inside the Tellor smart contract
    // that remained undisputed for more than 12 hours
    error NoOracleSubmission();

    /**
     * @notice Emitted when owner is set on the secondary chain.
     * @param owner The owner address set on the secondary chain.
     */
    event OwnerSet(address indexed owner);

    /**
     * @notice Function to update the owner on the secondary chain based on the
     * value reported to the Tellor smart contract. The reported value has to
     * satisfy the following two conditions in order to be considered valid:
     *   1. Reported value hasn't been disputed for at least 12 hours
     *   2. Timestamp of reporting is not older than 36 hours
     * @dev Reverts if:
     * - there is no value inside the Tellor smart contract that remained
     *   undisputed for more than 12 hours.
     * - the last reported undisputed value is older than 36 hours.
     */
    function setOwner() external;

    /**
     * @notice Function to return the ownership contract address on the main chain.
     */
    function getOwnershipContractMainChain() external view returns (address);

    /**
     * @notice Function to return the main chain id.
     */
    function getMainChainId() external view returns (uint256);

    /**
     * @notice Function to return the Tellor query data and Id which are required
     * for reporting values to Tellor protocol.
     * @dev The query data is an encoded string consisting of the query type
     * string "EVMCall", the main chain Id (1 for Ethereum), the address of
     * the ownership contract on main chain as well as the encoded function signature of the main
     * chain function `getCurrentOwner()` (`0xa18a186b`). The query Id is the `keccak256`
     * hash of the query Data. Refer to the Tellor specs
     * (https://github.com/tellor-io/dataSpecs/blob/main/types/EVMCall.md)
     * for details.
     */
    function getQueryDataAndId() external view returns (bytes memory, bytes32);
}
