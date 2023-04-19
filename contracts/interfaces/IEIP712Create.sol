// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {LibEIP712} from "../libraries/LibEIP712.sol";

interface IEIP712Create {
    // Struct for `batchFillOfferCreateContingentPool` function input
    struct ArgsBatchFillOfferCreateContingentPool {
        LibEIP712.OfferCreateContingentPool offerCreateContingentPool;
        LibEIP712.Signature signature;
        uint256 takerFillAmount;
    }

    /**
     * @dev Emitted whenever an offer is filled
     * @param typedOfferHash Offer hash
     * @param maker Offer maker address
     * @param taker Offer taker address
     * @param takerFilledAmount Incremental taker filled amount
     */
    event OfferFilled(
        bytes32 indexed typedOfferHash,
        address indexed maker,
        address indexed taker,
        uint256 takerFilledAmount
    );

    /**
     * @notice Function to fill an EIP712 based offer to a create contingent pool.
     * @dev As opposed to `createContingentPool`, the collateral is contributed by
     * both `maker` and `taker` instead of `msg.sender` only according to the
     * ratios implied by `makerCollateralAmount` and `takerCollateralAmount` defined in
     * the offer details.
     * As a result, both `maker` and `taker` need to have a sufficient
     * collateral token balance as well as sufficient allowance to `this` contract
     * to transfer the collateral token from their accounts.
     * The fillability and validity of an offer can be checked via
     * `getOfferRelevantStateCreateContingentPool` prior to execution.
     * @param _offerCreateContingentPool Struct containing the create pool offer details
     * @param _signature Offer signature
     * @param _takerFillAmount Taker collateral amount that the user attempts to fill
     */
    function fillOfferCreateContingentPool(
        LibEIP712.OfferCreateContingentPool calldata _offerCreateContingentPool,
        LibEIP712.Signature calldata _signature,
        uint256 _takerFillAmount
    ) external;

    /**
     * @notice Batch version of `fillOfferCreateContingentPool`
     * @param _argsBatchFillOfferCreateContingentPool Struct array containing
     * offerCreateContingentPool, signature and taker fill amount
     */
    function batchFillOfferCreateContingentPool(
        ArgsBatchFillOfferCreateContingentPool[]
            calldata _argsBatchFillOfferCreateContingentPool
    ) external;
}
