// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {LibEIP712} from "../libraries/LibEIP712.sol";

interface IEIP712Remove {
    // Struct for `batchFillOfferRemoveLiquidity` function input
    struct ArgsBatchFillOfferRemoveLiquidity {
        LibEIP712.OfferRemoveLiquidity offerRemoveLiquidity;
        LibEIP712.Signature signature;
        uint256 positionTokenFillAmount;
    }

    /**
     * @dev Emitted whenever an offer is filled
     * @param typedOfferHash Offer hash
     * @param maker Offer maker address
     * @param taker Offer taker address
     * @param takerFilledAmount Incremental position token amount filled
     */
    event OfferFilled(
        bytes32 indexed typedOfferHash,
        address indexed maker,
        address indexed taker,
        uint256 takerFilledAmount
    );

    /**
     * @notice Function to fill an EIP712 based offer to remove liquidity from an existing pool.
     * @dev As opposed to `removeLiquidity`, the collateral is returned to the `maker`
     * and `taker` instead of `msg.sender` only according to the ratios implied by
     * `positionTokenAmount` and `makerCollateralAmount` defined in the offer details. In particular,
     * the collateral amount returned to the `taker` is given by `positionTokenAmount - makerCollateralAmount`
     * due to the 1:1 relationship between collateral and position token amount.
     * The fillability and validity of an offer can be checked via `getOfferRelevantStateRemoveLiquidity`
     * prior to execution.
     * @param _offerRemoveLiquidity Struct containing the remove liquidity offer details
     * @param _signature Offer signature
     * @param _positionTokenFillAmount Position token amount that the taker attempts to return
     */
    function fillOfferRemoveLiquidity(
        LibEIP712.OfferRemoveLiquidity calldata _offerRemoveLiquidity,
        LibEIP712.Signature calldata _signature,
        uint256 _positionTokenFillAmount
    ) external;

    /**
     * @notice Batch version of `fillOfferRemoveLiquidity`
     * @param _argsBatchOfferRemoveLiquidity Struct array containing OfferRemoveLiquidity, signature
     * and position token fill amount
     */
    function batchFillOfferRemoveLiquidity(
        ArgsBatchFillOfferRemoveLiquidity[]
            calldata _argsBatchOfferRemoveLiquidity
    ) external;
}
