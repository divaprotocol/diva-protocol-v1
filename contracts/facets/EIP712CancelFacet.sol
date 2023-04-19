// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {ReentrancyGuard} from "@solidstate/contracts/utils/ReentrancyGuard.sol";
import {IEIP712Cancel} from "../interfaces/IEIP712Cancel.sol";
import {LibEIP712} from "../libraries/LibEIP712.sol";
import {LibEIP712Storage} from "../libraries/LibEIP712Storage.sol";

contract EIP712CancelFacet is IEIP712Cancel, ReentrancyGuard {
    function cancelOfferCreateContingentPool(
        LibEIP712.OfferCreateContingentPool calldata _offerCreateContingentPool
    ) external override nonReentrant {
        _cancelOfferCreateContingentPool(_offerCreateContingentPool);
    }

    function batchCancelOfferCreateContingentPool(
        LibEIP712.OfferCreateContingentPool[]
            calldata _offersCreateContingentPool
    ) external override nonReentrant {
        uint256 len = _offersCreateContingentPool.length;
        for (uint256 i = 0; i < len; ) {
            _cancelOfferCreateContingentPool(_offersCreateContingentPool[i]);
            unchecked {
                ++i;
            }
        }
    }

    function cancelOfferAddLiquidity(
        LibEIP712.OfferAddLiquidity calldata _offerAddLiquidity
    ) external override nonReentrant {
        _cancelOfferAddLiquidity(_offerAddLiquidity);
    }

    function batchCancelOfferAddLiquidity(
        LibEIP712.OfferAddLiquidity[] calldata _offersAddLiquidity
    ) external override nonReentrant {
        uint256 len = _offersAddLiquidity.length;
        for (uint256 i = 0; i < len; ) {
            _cancelOfferAddLiquidity(_offersAddLiquidity[i]);
            unchecked {
                ++i;
            }
        }
    }

    function cancelOfferRemoveLiquidity(
        LibEIP712.OfferRemoveLiquidity calldata _offerRemoveLiquidity
    ) external override nonReentrant {
        _cancelOfferRemoveLiquidity(_offerRemoveLiquidity);
    }

    function batchCancelOfferRemoveLiquidity(
        LibEIP712.OfferRemoveLiquidity[] calldata _offersRemoveLiquidity
    ) external override nonReentrant {
        uint256 len = _offersRemoveLiquidity.length;
        for (uint256 i = 0; i < len; ) {
            _cancelOfferRemoveLiquidity(_offersRemoveLiquidity[i]);
            unchecked {
                ++i;
            }
        }
    }

    function _cancelOfferCreateContingentPool(
        LibEIP712.OfferCreateContingentPool calldata _offerCreateContingentPool
    ) private {
        // Validate message sender
        LibEIP712._validateMessageSenderIsOfferMaker(
            _offerCreateContingentPool.maker
        );

        // Get typed offer hash with `_offerCreateContingentPool`
        bytes32 _typedOfferHash = LibEIP712._toTypedMessageHash(
            LibEIP712._getOfferHashCreateContingentPool(
                _offerCreateContingentPool
            )
        );

        // Cancel offer
        _cancelTypedOfferHash(_typedOfferHash);
    }

    function _cancelOfferAddLiquidity(
        LibEIP712.OfferAddLiquidity calldata _offerAddLiquidity
    ) private {
        // Validate message sender
        LibEIP712._validateMessageSenderIsOfferMaker(_offerAddLiquidity.maker);

        // Get typed offer hash with `_offerAddLiquidity`
        bytes32 _typedOfferHash = LibEIP712._toTypedMessageHash(
            LibEIP712._getOfferHashAddLiquidity(_offerAddLiquidity)
        );

        // Cancel offer
        _cancelTypedOfferHash(_typedOfferHash);
    }

    function _cancelOfferRemoveLiquidity(
        LibEIP712.OfferRemoveLiquidity calldata _offerRemoveLiquidity
    ) private {
        // Validate message sender
        LibEIP712._validateMessageSenderIsOfferMaker(
            _offerRemoveLiquidity.maker
        );

        // Get typed offer hash with `_offerRemoveLiquidity`
        bytes32 _typedOfferHash = LibEIP712._toTypedMessageHash(
            LibEIP712._getOfferHashRemoveLiquidity(_offerRemoveLiquidity)
        );

        // Cancel offer
        _cancelTypedOfferHash(_typedOfferHash);
    }

    // Cancel offer with `_typedOfferHash`
    function _cancelTypedOfferHash(bytes32 _typedOfferHash) private {
        // Get reference to relevant storage slot
        LibEIP712Storage.EIP712Storage storage es = LibEIP712Storage
            ._eip712Storage();

        // Set the max int value on the taker filled amount to indicate
        // a cancel. It's OK to cancel twice.
        es.typedOfferHashToTakerFilledAmount[_typedOfferHash] = LibEIP712
            .MAX_INT;

        // Log offer cancellation (msg.sender = maker)
        emit OfferCancelled(_typedOfferHash, msg.sender);
    }
}
