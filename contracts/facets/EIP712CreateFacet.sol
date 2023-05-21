// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {ReentrancyGuard} from "@solidstate/contracts/utils/ReentrancyGuard.sol";
import {IEIP712Create} from "../interfaces/IEIP712Create.sol";
import {LibDIVA} from "../libraries/LibDIVA.sol";
import {LibEIP712} from "../libraries/LibEIP712.sol";
import {LibEIP712Storage} from "../libraries/LibEIP712Storage.sol";

contract EIP712CreateFacet is IEIP712Create, ReentrancyGuard {
    function fillOfferCreateContingentPool(
        LibEIP712.OfferCreateContingentPool calldata _offerCreateContingentPool,
        LibEIP712.Signature calldata _signature,
        uint256 _takerFillAmount
    ) external override nonReentrant {
        _fillOfferCreateContingentPool(
            _offerCreateContingentPool,
            _signature,
            _takerFillAmount,
            LibEIP712Storage._eip712Storage()
        );
    }

    function batchFillOfferCreateContingentPool(
        ArgsBatchFillOfferCreateContingentPool[]
            calldata _argsBatchFillOfferCreateContingentPool
    ) external override nonReentrant {
        uint256 len = _argsBatchFillOfferCreateContingentPool.length;
        for (uint256 i; i < len; ) {
            _fillOfferCreateContingentPool(
                _argsBatchFillOfferCreateContingentPool[i]
                    .offerCreateContingentPool,
                _argsBatchFillOfferCreateContingentPool[i].signature,
                _argsBatchFillOfferCreateContingentPool[i].takerFillAmount,
                LibEIP712Storage._eip712Storage()
            );
            unchecked {
                ++i;
            }
        }
    }

    function _fillOfferCreateContingentPool(
        LibEIP712.OfferCreateContingentPool calldata _offerCreateContingentPool,
        LibEIP712.Signature calldata _signature,
        uint256 _takerFillAmount,
        LibEIP712Storage.EIP712Storage storage _es
    ) private {
        // Get offer info
        LibEIP712.OfferInfo memory _offerInfo = LibEIP712
            ._getOfferInfoCreateContingentPool(_offerCreateContingentPool);

        // Check fillability and validity of offer
        LibEIP712._checkFillableAndSignature(
            _signature,
            _offerCreateContingentPool.maker,
            _offerCreateContingentPool.taker,
            _offerInfo
        );

        // Get poolId with `typedOfferHash` from `typedOfferHashToPoolId`.
        // If poolId is 0, then no pool has been created yet out of the given offer.
        // poolIds in DIVA Protocol start at 1
        bytes32 _poolId = _es.typedOfferHashToPoolId[_offerInfo.typedOfferHash];
        if (_poolId == 0) {
            // If there is no pool created with `typedOfferHash`, then fill create contingent pool offer
            // and store poolId in `typedOfferHashToPoolId` mapping

            // Validate taker fill amount and increase taker filled amount
            LibEIP712._validateTakerFillAmountAndIncreaseTakerFilledAmount(
                _offerCreateContingentPool.takerCollateralAmount,
                _offerCreateContingentPool.minimumTakerFillAmount,
                _takerFillAmount,
                _offerInfo.typedOfferHash
            );

            // Calc maker fill amount
            uint256 _makerFillAmount = LibEIP712
                ._calcMakerFillAmountAndPoolFillAmount(
                    _offerCreateContingentPool.makerCollateralAmount,
                    _offerCreateContingentPool.takerCollateralAmount,
                    _takerFillAmount
                );

            // Create contingent pool on DIVA protocol
            _es.typedOfferHashToPoolId[_offerInfo.typedOfferHash] = LibDIVA
                ._createContingentPoolLib(
                    LibDIVA.CreatePoolParams({
                        poolParams: LibDIVA.PoolParams({
                            referenceAsset: _offerCreateContingentPool
                                .referenceAsset,
                            expiryTime: _offerCreateContingentPool.expiryTime,
                            floor: _offerCreateContingentPool.floor,
                            inflection: _offerCreateContingentPool.inflection,
                            cap: _offerCreateContingentPool.cap,
                            gradient: _offerCreateContingentPool.gradient,
                            collateralAmount: _makerFillAmount +
                                _takerFillAmount,
                            collateralToken: _offerCreateContingentPool
                                .collateralToken,
                            dataProvider: _offerCreateContingentPool
                                .dataProvider,
                            capacity: _offerCreateContingentPool.capacity,
                            longRecipient: _offerCreateContingentPool
                                .makerIsLong
                                ? _offerCreateContingentPool.maker
                                : msg.sender,
                            shortRecipient: _offerCreateContingentPool
                                .makerIsLong
                                ? msg.sender
                                : _offerCreateContingentPool.maker,
                            permissionedERC721Token: _offerCreateContingentPool
                                .permissionedERC721Token
                        }),
                        collateralAmountMsgSender: _takerFillAmount,
                        collateralAmountMaker: _makerFillAmount,
                        maker: _offerCreateContingentPool.maker
                    })
                );
        } else {
            // If there is pool already created with `typedOfferHash`, then fill add liquidity offer
            LibEIP712._fillOfferAddLiquidityLib(
                LibEIP712.OfferAddLiquidity({
                    maker: _offerCreateContingentPool.maker,
                    taker: _offerCreateContingentPool.taker,
                    makerCollateralAmount: _offerCreateContingentPool
                        .makerCollateralAmount,
                    takerCollateralAmount: _offerCreateContingentPool
                        .takerCollateralAmount,
                    makerIsLong: _offerCreateContingentPool.makerIsLong,
                    offerExpiry: _offerCreateContingentPool.offerExpiry,
                    minimumTakerFillAmount: _offerCreateContingentPool
                        .minimumTakerFillAmount,
                    poolId: _poolId,
                    salt: _offerCreateContingentPool.salt
                }),
                _takerFillAmount,
                _offerInfo.typedOfferHash
            );
        }

        // Emit an offer filled event
        emit OfferFilled(
            _offerInfo.typedOfferHash,
            _offerCreateContingentPool.maker,
            msg.sender,
            _takerFillAmount
        );
    }
}
