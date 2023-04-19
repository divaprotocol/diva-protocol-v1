// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {ReentrancyGuard} from "@solidstate/contracts/utils/ReentrancyGuard.sol";
import {IEIP712Remove} from "../interfaces/IEIP712Remove.sol";
import {LibEIP712} from "../libraries/LibEIP712.sol";

contract EIP712RemoveFacet is IEIP712Remove, ReentrancyGuard {
    function fillOfferRemoveLiquidity(
        LibEIP712.OfferRemoveLiquidity calldata _offerRemoveLiquidity,
        LibEIP712.Signature calldata _signature,
        uint256 _positionTokenFillAmount
    ) external override nonReentrant {
        _fillOfferRemoveLiquidity(
            _offerRemoveLiquidity,
            _signature,
            _positionTokenFillAmount
        );
    }

    function batchFillOfferRemoveLiquidity(
        ArgsBatchFillOfferRemoveLiquidity[]
            calldata _argsBatchOfferRemoveLiquidity
    ) external override nonReentrant {
        uint256 len = _argsBatchOfferRemoveLiquidity.length;
        for (uint256 i = 0; i < len; ) {
            _fillOfferRemoveLiquidity(
                _argsBatchOfferRemoveLiquidity[i].offerRemoveLiquidity,
                _argsBatchOfferRemoveLiquidity[i].signature,
                _argsBatchOfferRemoveLiquidity[i].positionTokenFillAmount
            );
            unchecked {
                ++i;
            }
        }
    }

    function _fillOfferRemoveLiquidity(
        LibEIP712.OfferRemoveLiquidity calldata _offerRemoveLiquidity,
        LibEIP712.Signature calldata _signature,
        uint256 _positionTokenFillAmount
    ) private {
        // Get offer info
        LibEIP712.OfferInfo memory _offerInfo = LibEIP712
            ._getOfferInfoRemoveLiquidity(_offerRemoveLiquidity);

        // Check fillability and validity of offer
        LibEIP712._checkFillableAndSignature(
            _signature,
            _offerRemoveLiquidity.maker,
            _offerRemoveLiquidity.taker,
            _offerInfo
        );

        // Fill remove liquidity offer
        LibEIP712._fillOfferRemoveLiquidityLib(
            _offerRemoveLiquidity,
            _positionTokenFillAmount,
            _offerInfo.typedOfferHash
        );

        // Emit an offer filled event
        emit OfferFilled(
            _offerInfo.typedOfferHash,
            _offerRemoveLiquidity.maker,
            msg.sender,
            _positionTokenFillAmount
        );
    }
}
