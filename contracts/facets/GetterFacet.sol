// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {PositionToken} from "../PositionToken.sol";
import {IGetter} from "../interfaces/IGetter.sol";
import {LibDIVA} from "../libraries/LibDIVA.sol";
import {LibDIVAStorage} from "../libraries/LibDIVAStorage.sol";
import {LibEIP712} from "../libraries/LibEIP712.sol";
import {LibEIP712Storage} from "../libraries/LibEIP712Storage.sol";
import {LibOwnership} from "../libraries/LibOwnership.sol";

contract GetterFacet is IGetter {
    function getPoolCount() external view override returns (uint256) {
        return LibDIVA._getPoolCount();
    }

    function getPoolParameters(bytes32 _poolId)
        external
        view
        override
        returns (LibDIVAStorage.Pool memory)
    {
        return LibDIVA._poolParameters(_poolId);
    }

    function getPoolParametersByAddress(address _positionToken)
        external
        view
        override
        returns (LibDIVAStorage.Pool memory)
    {
        // Read the `poolId` from the `PositionToken` contract
        PositionToken positionToken = PositionToken(_positionToken);
        bytes32 _poolId = positionToken.poolId();
                
        // Load pool information
        LibDIVAStorage.Pool storage _pool = LibDIVAStorage._poolStorage().pools[_poolId];

        // Return pool information only if the provided position token address is valid.
        // Otherwise, return the default struct.
        if (_pool.shortToken == _positionToken || _pool.longToken == _positionToken) {
            return _pool;
        }        
        LibDIVAStorage.Pool memory _zeroPool;
        return _zeroPool;
    }

    function getGovernanceParameters()
        external
        view
        override
        returns (
            LibDIVAStorage.Fees memory currentFees,
            LibDIVAStorage.SettlementPeriods memory currentSettlementPeriods,
            address treasury,
            address fallbackDataProvider,
            uint256 pauseReturnCollateralUntil
        )
    {
        // Get references to relevant storage slot
        LibDIVAStorage.GovernanceStorage storage gs = LibDIVAStorage
            ._governanceStorage();

        (, currentFees) = LibDIVA._getCurrentFees(gs);
        (, currentSettlementPeriods) = LibDIVA._getCurrentSettlementPeriods(gs);
        treasury = LibDIVA._getCurrentTreasury(gs);
        fallbackDataProvider = LibDIVA._getCurrentFallbackDataProvider(gs);
        pauseReturnCollateralUntil = gs.pauseReturnCollateralUntil;
    }

    function getFees(uint48 _indexFees)
        external
        view
        override
        returns (LibDIVAStorage.Fees memory)
    {
        // Get the fees applicable for the provided `_indexFees`
        LibDIVAStorage.Fees memory _fees =
            LibDIVAStorage._governanceStorage().fees[_indexFees];

        return _fees;
    }

    function getSettlementPeriods(uint48 _indexSettlementPeriods)
        external
        view
        override
        returns (LibDIVAStorage.SettlementPeriods memory)
    {
        // Get the settlement periods applicable
        // for the provided `_indexSettlementPeriods`
        LibDIVAStorage.SettlementPeriods memory _settlementPeriods =
            LibDIVAStorage._governanceStorage().settlementPeriods[_indexSettlementPeriods];

        return _settlementPeriods;
    }

    function getFeesHistory(uint256 _nbrLastUpdates)
        external
        view
        override
        returns (LibDIVAStorage.Fees[] memory)
    {
        return LibDIVA._getFeesHistory(
            _nbrLastUpdates,
            LibDIVAStorage._governanceStorage()
        );
    }

    function getSettlementPeriodsHistory(uint256 _nbrLastUpdates)
        external
        view
        override
        returns (LibDIVAStorage.SettlementPeriods[] memory)
    {
        return LibDIVA._getSettlementPeriodsHistory(
            _nbrLastUpdates,
            LibDIVAStorage._governanceStorage()
        );
    }

    function getFeesHistoryLength() external view override returns (uint256) {
        return LibDIVAStorage._governanceStorage().fees.length;
    }

    function getSettlementPeriodsHistoryLength()
        external
        view
        override
        returns (uint256)
    {
        return LibDIVAStorage._governanceStorage().settlementPeriods.length;
    }

    function getFallbackDataProviderInfo()
        external
        view
        override
        returns (
            address previousFallbackDataProvider,
            address fallbackDataProvider,
            uint256 startTimeFallbackDataProvider
        )
    {
        // Return values
        (
            previousFallbackDataProvider,
            fallbackDataProvider,
            startTimeFallbackDataProvider
        ) = LibDIVA._getFallbackDataProviderInfo(LibDIVAStorage._governanceStorage());
    }

    function getTreasuryInfo()
        external
        view
        override
        returns (
            address previousTreasury,
            address treasury,
            uint256 startTimeTreasury
        )
    {
        // Return values
        (previousTreasury, treasury, startTimeTreasury) = LibDIVA
            ._getTreasuryInfo(LibDIVAStorage._governanceStorage());
    }

    function getClaim(address _collateralToken, address _recipient)
        external
        view
        override
        returns (uint256)
    {
        return LibDIVA._getClaim(_collateralToken, _recipient);
    }

    function getReservedClaim(bytes32 _poolId) external view override returns (uint256) {
        return LibDIVA._getReservedClaim(_poolId);
    }

    function getPoolIdByTypedCreateOfferHash(bytes32 _typedOfferHash)
        external
        view
        override
        returns (bytes32)
    {
        return
            LibEIP712Storage._eip712Storage().typedOfferHashToPoolId[
                _typedOfferHash
            ];
    }

    function getTakerFilledAmount(bytes32 _typedOfferHash)
        external
        view
        override
        returns (uint256)
    {
        return LibEIP712._takerFilledAmount(_typedOfferHash);
    }

    function getChainId() external view override returns (uint256) {
        return LibEIP712._chainId();
    }

    function getOfferRelevantStateCreateContingentPool(
        LibEIP712.OfferCreateContingentPool calldata _offerCreateContingentPool,
        LibEIP712.Signature calldata _signature
    )
        external
        view
        override
        returns (
            LibEIP712.OfferInfo memory offerInfo,
            uint256 actualTakerFillableAmount,
            bool isSignatureValid,
            bool isValidInputParamsCreateContingentPool
        )
    {
        (
            offerInfo,
            actualTakerFillableAmount,
            isSignatureValid,
            isValidInputParamsCreateContingentPool
        ) = LibEIP712._getOfferRelevantStateCreateContingentPool(
            _offerCreateContingentPool,
            _signature
        );
    }

    function getOfferRelevantStateAddLiquidity(
        LibEIP712.OfferAddLiquidity calldata _offerAddLiquidity,
        LibEIP712.Signature calldata _signature
    )
        external
        view
        override
        returns (
            LibEIP712.OfferInfo memory offerInfo,
            uint256 actualTakerFillableAmount,
            bool isSignatureValid,
            bool poolExists
        )
    {
        (
            offerInfo,
            actualTakerFillableAmount,
            isSignatureValid,
            poolExists
        ) = LibEIP712._getOfferRelevantStateAddLiquidity(
            _offerAddLiquidity,
            _signature
        );
    }

    function getOfferRelevantStateRemoveLiquidity(
        LibEIP712.OfferRemoveLiquidity calldata _offerRemoveLiquidity,
        LibEIP712.Signature calldata _signature
    )
        external
        view
        override
        returns (
            LibEIP712.OfferInfo memory offerInfo,
            uint256 actualTakerFillableAmount,
            bool isSignatureValid,
            bool poolExists
        )
    {
        (
            offerInfo,
            actualTakerFillableAmount,
            isSignatureValid,
            poolExists
        ) = LibEIP712._getOfferRelevantStateRemoveLiquidity(
            _offerRemoveLiquidity,
            _signature
        );
    }

    function getOwnershipContract()
        external
        view
        override
        returns (address ownershipContract_)
    {
        ownershipContract_ = LibOwnership._ownershipContract();
    }

    function getOwner() external view override returns (address owner_) {
        owner_ = LibOwnership._contractOwner();
    }
}
