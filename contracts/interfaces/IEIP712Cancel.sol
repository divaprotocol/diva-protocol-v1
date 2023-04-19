// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {LibEIP712} from "../libraries/LibEIP712.sol";

interface IEIP712Cancel {
    /**
     * @notice Emitted whenever an offer is cancelled
     * @param typedOfferHash Offer hash
     * @param maker Offer maker address (equal to `msg.sender`)
     */
    event OfferCancelled(bytes32 indexed typedOfferHash, address indexed maker);

    /**
     * @notice Function to cancel a create pool offer
     * @dev An offer cancellation is reflected by setting the `takerFilledAmount`
     * to `max(uint256)` for the corresponding offer hash
     * @param _offerCreateContingentPool Struct containing the create pool offer details
     */
    function cancelOfferCreateContingentPool(
        LibEIP712.OfferCreateContingentPool calldata _offerCreateContingentPool
    ) external;

    /**
     * @notice Batch version of `cancelOfferCreateContingentPool`
     * @param _offersCreateContingentPool Array of OfferCreateContingentPool struct
     */
    function batchCancelOfferCreateContingentPool(
        LibEIP712.OfferCreateContingentPool[]
            calldata _offersCreateContingentPool
    ) external;

    /**
     * @notice Function to cancel an add liquidity offer
     * @dev An offer cancellation is reflected by setting the `takerFilledAmount`
     * to `max(uint256)` for the corresponding offer hash
     * @param _offerAddLiquidity Struct containing the add liquidity offer details
     */
    function cancelOfferAddLiquidity(
        LibEIP712.OfferAddLiquidity calldata _offerAddLiquidity
    ) external;

    /**
     * @notice Batch version of `cancelOfferAddLiquidity`
     * @param _offersAddLiquidity Array of OfferAddLiquidity struct
     */
    function batchCancelOfferAddLiquidity(
        LibEIP712.OfferAddLiquidity[] calldata _offersAddLiquidity
    ) external;

    /**
     * @notice Function to cancel a remove liquidity offer
     * @dev An offer cancellation is reflected by setting the `takerFilledAmount`
     * to `max(uint256)` for the corresponding offer hash
     * @param _offerRemoveLiquidity Struct containing the remove liquidity offer details
     */
    function cancelOfferRemoveLiquidity(
        LibEIP712.OfferRemoveLiquidity calldata _offerRemoveLiquidity
    ) external;

    /**
     * @notice Batch version of `cancelOfferRemoveLiquidity`
     * @param _offersRemoveLiquidity Array of OfferRemoveLiquidity struct
     */
    function batchCancelOfferRemoveLiquidity(
        LibEIP712.OfferRemoveLiquidity[] calldata _offersRemoveLiquidity
    ) external;
}
