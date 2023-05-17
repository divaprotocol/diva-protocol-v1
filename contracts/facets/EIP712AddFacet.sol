// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {ReentrancyGuard} from "@solidstate/contracts/utils/ReentrancyGuard.sol";
import {IEIP712Add} from "../interfaces/IEIP712Add.sol";
import {LibEIP712} from "../libraries/LibEIP712.sol";

contract EIP712AddFacet is IEIP712Add, ReentrancyGuard {
    function fillOfferAddLiquidity(
        LibEIP712.OfferAddLiquidity calldata _offerAddLiquidity,
        LibEIP712.Signature calldata _signature,
        uint256 _takerFillAmount
    ) external override nonReentrant {
        _fillOfferAddLiquidity(
            _offerAddLiquidity,
            _signature,
            _takerFillAmount
        );
    }

    function batchFillOfferAddLiquidity(
        ArgsBatchFillOfferAddLiquidity[] calldata _argsBatchOfferAddLiquidity
    ) external override nonReentrant {
        uint256 len = _argsBatchOfferAddLiquidity.length;
        for (uint256 i; i < len; ) {
            _fillOfferAddLiquidity(
                _argsBatchOfferAddLiquidity[i].offerAddLiquidity,
                _argsBatchOfferAddLiquidity[i].signature,
                _argsBatchOfferAddLiquidity[i].takerFillAmount
            );
            unchecked {
                ++i;
            }
        }
    }

    function _fillOfferAddLiquidity(
        LibEIP712.OfferAddLiquidity calldata _offerAddLiquidity,
        LibEIP712.Signature calldata _signature,
        uint256 _takerFillAmount
    ) private {
        // Get offer info
        LibEIP712.OfferInfo memory _offerInfo = LibEIP712
            ._getOfferInfoAddLiquidity(_offerAddLiquidity);

        // Check fillability and validity of offer
        LibEIP712._checkFillableAndSignature(
            _signature,
            _offerAddLiquidity.maker,
            _offerAddLiquidity.taker,
            _offerInfo
        );

        // Fill add liquidity offer
        LibEIP712._fillOfferAddLiquidityLib(
            _offerAddLiquidity,
            _takerFillAmount,
            _offerInfo.typedOfferHash
        );

        // Emit an offer filled event
        emit OfferFilled(
            _offerInfo.typedOfferHash,
            _offerAddLiquidity.maker,
            msg.sender,
            _takerFillAmount
        );
    }
}
