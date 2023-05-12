// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {LibDIVAStorage} from "../libraries/LibDIVAStorage.sol";
import {LibEIP712} from "../libraries/LibEIP712.sol";

interface IGetter {
    /**
     * @notice Returns the total number of pools created (equal to
     * the latest nonce).
     * @return Number of pools.
     */
    function getPoolCount() external view returns (uint256);

    /**
     * @notice Returns the pool parameters for a given pool Id. To
     * obtain the fees and settlement periods applicable for the pool,
     * use the `getFees` and `getSettlementPeriods` functions
     * respectively, passing in the returend `indexFees` and
     * `indexSettlementPeriods` as arguments.
     * @param _poolId Id of the pool.
     * @return Pool struct.
     */
    function getPoolParameters(bytes32 _poolId)
        external
        view
        returns (LibDIVAStorage.Pool memory);

    /**
     * @notice Same as `getPoolParameters`, but the pool parameters are
     * retrieved based on a provided position token address instead of a `poolId`.
     * @dev If the provided position token address does not match any pool, the
     * function will return the default `Pool` struct with zero values. This
     * default struct can be identified by properties such as
     * `collateralToken = 0x0000000000000000000000000000000000000000` or
     * `dataProvider = 0x0000000000000000000000000000000000000000`, for example.
     * @param _positionToken Position token address.
     * @return Pool struct.
     */
    function getPoolParametersByAddress(address _positionToken)
        external
        view
        returns (LibDIVAStorage.Pool memory);

    /**
     * @notice Returns the currently applicable governance parameters; ignores
     * parameters pending activation.
     * @return currentFees The current applicable fees.
     * @return currentSettlementPeriods The current applicable settlement periods.
     * @return treasury Current treasury address.
     * @return fallbackDataProvider Current fallback data provider address.
     * @return pauseReturnCollateralUntil Return of collateral paused until in seconds.
     */
    function getGovernanceParameters()
        external
        view
        returns (
            LibDIVAStorage.Fees memory currentFees,
            LibDIVAStorage.SettlementPeriods memory currentSettlementPeriods,
            address treasury,
            address fallbackDataProvider,
            uint256 pauseReturnCollateralUntil
        );

    /**
     * @notice Returns the protocol and settlement fees applicable for
     * a given `_indexFees`.
     * @param _indexFees The index of fees.
     * @return Fees struct.
     */
    function getFees(uint48 _indexFees)
        external
        view
        returns (LibDIVAStorage.Fees memory);

    /**
     * @notice Returns the settlement related periods applicable to
     * a given `_indexSettlementPeriods`.
     * @param _indexSettlementPeriods The index of settlement periods.
     * @return SettlementPeriods struct.
     */
    function getSettlementPeriods(uint48 _indexSettlementPeriods)
        external
        view
        returns (LibDIVAStorage.SettlementPeriods memory);

    /**
     * @notice Returns the last `_nbrLastUpdates` updates of the fees,
     * including any pending updates.
     * @dev `_nbrLastUpdates = 1` returns the most recent update, which
     * may be active or still pending. If the specified number of `_nbrLastUpdates`
     * exceeds the number of available updates, the maximum history will be
     * returned without any error. Returns an empty array if `_nbrLastUpdates = 0`.
     * @param _nbrLastUpdates Number of most recent updates to return.
     * @return Fees struct array.
     */
    function getFeesHistory(uint256 _nbrLastUpdates)
        external
        view
        returns (LibDIVAStorage.Fees[] memory);

    /**
     * @notice Returns the last `_nbrLastUpdates` updates of the settlement periods,
     * including any pending updates.
     * @dev `_nbrLastUpdates = 1` returns the most recent update, which may
     * be active or still pending. If the specified number of `_nbrLastUpdates`
     * exceeds the number of available updates, the maximum history will be
     * returned without any error. Returns an empty array if `_nbrLastUpdates = 0`.
     * @param _nbrLastUpdates Number of most recent updates to return.
     * @return Settlement periods struct array.
     */
    function getSettlementPeriodsHistory(uint256 _nbrLastUpdates)
        external
        view
        returns (LibDIVAStorage.SettlementPeriods[] memory);

    /**
     * @notice Returns the total number of fee updates. At least 1 as the initial
     * fees are set at contract deployment.
     */
    function getFeesHistoryLength() external view returns (uint256);

    /**
     * @notice Returns the total number of settlement period updates. At least 1 as
     * the initial settlement periods are set at contract deployment.
     */
    function getSettlementPeriodsHistoryLength()
        external
        view
        returns (uint256);

    /**
     * @notice Returns the latest update of the fallback data provider, including
     * the activation time and the previous data provider. Since the fallback data
     * provider applies to all pools globally, only the previous data provider
     * is stored for historical reference.
     * @return previousFallbackDataProvider Previous fallback data provider address.
     * @return fallbackDataProvider Latest update of the fallback data provider address.
     * @return startTimeFallbackDataProvider Timestamp in seconds since epoch at which
     * `fallbackDataProvider` is activated.
     */
    function getFallbackDataProviderInfo()
        external
        view
        returns (
            address previousFallbackDataProvider,
            address fallbackDataProvider,
            uint256 startTimeFallbackDataProvider
        );

    /**
     * @notice Returns the latest update of the treasury address, including
     * the activation time and the previous treasury address. Only the
     * previous data address is stored for historical reference.
     * @return previousTreasury Previous treasury address.
     * @return treasury Latest update of the treasury address.
     * @return startTimeTreasury Timestamp in seconds since epoch at which
     * `treasury` is activated.
     */
    function getTreasuryInfo()
        external
        view
        returns (
            address previousTreasury,
            address treasury,
            uint256 startTimeTreasury
        );

    /**
     * @notice Returns the claims by collateral tokens for a given account.
     * @param _recipient Recipient address.
     * @param _collateralToken Collateral token address.
     * @return Fee claim amount.
     */
    function getClaim(address _collateralToken, address _recipient)
        external
        view
        returns (uint256);

    /**
     * @notice Returns the claim amount reserved for the data provider for a
     * given pool. Includes tips as well as settlement fees accrued during `removeLiquidity`.
     * Returns zero after a pool has been confirmed and the reserved amount
     * has been credited to the `claimableFeeAmount`, which can be retrieved using
     * the `getClaim` function.
     * @param _poolId Id of pool.
     * @return Tip amount expressed as an integer in collateral token decimals.
     */
    function getReservedClaim(bytes32 _poolId) external view returns (uint256);

    /**
     * @notice Returns the poolId for a given `_typedOfferHash` derived from a
     * create contingent pool offer (EIP712 specific). Note that for an
     * add liquidity offer, the function will return 0 as the `poolId`
     * is part of the offer terms and not stored inside the contract.
     * @param _typedOfferHash Typed offer hash.
     * @return Pool Id linked to the offer.
     */
    function getPoolIdByTypedCreateOfferHash(bytes32 _typedOfferHash)
        external
        view
        returns (bytes32);

    /**
     * @notice Returns the filled amount for a given `_typedOfferHash` (EIP712 specific).
     * @param _typedOfferHash Typed offer hash.
     * @return PoolId linked to the offer.
     */
    function getTakerFilledAmount(bytes32 _typedOfferHash)
        external
        view
        returns (uint256);

    /**
     * @notice Returns the chain Id.
     */
    function getChainId() external view returns (uint256);

    /**
     * @notice Function to get state of create contingent pool offer.
     * @param _offerCreateContingentPool Struct containing the create pool offer details
     * @param _signature Signature of signed message with `_offerCreateContingentPool` by `maker`
     * @return offerInfo Struct of offer info:
     * - typedOfferHash: Typed hash value of offer.
     * - status: Status of offer.
     * - takerFilledAmount: Already filled amount by taker.
     * @return actualTakerFillableAmount Actual fillable amount for taker.
     * @return isSignatureValid True if signature is valid, false otherwise.
     * @return isValidInputParamsCreateContingentPool True if input parameters specifying the
     * create contingent pool are valid, false otherwise.
     */
    function getOfferRelevantStateCreateContingentPool(
        LibEIP712.OfferCreateContingentPool calldata _offerCreateContingentPool,
        LibEIP712.Signature calldata _signature
    )
        external
        view
        returns (
            LibEIP712.OfferInfo memory offerInfo,
            uint256 actualTakerFillableAmount,
            bool isSignatureValid,
            bool isValidInputParamsCreateContingentPool
        );

    /**
     * @notice Function to get state of add liquidity offer.
     * @param _offerAddLiquidity Struct containing the add liquidity offer details.
     * @param _signature Signature of signed message with `_offerAddLiquidity` by `maker`.
     * @return offerInfo Struct of offer info.
     * @return actualTakerFillableAmount Actual fillable amount for taker.
     * @return isSignatureValid Flag indicating whether the signature is valid or not.
     * @return poolExists Flag indicating whether a pool exists or not.
     */
    function getOfferRelevantStateAddLiquidity(
        LibEIP712.OfferAddLiquidity calldata _offerAddLiquidity,
        LibEIP712.Signature calldata _signature
    )
        external
        view
        returns (
            LibEIP712.OfferInfo memory offerInfo,
            uint256 actualTakerFillableAmount,
            bool isSignatureValid,
            bool poolExists
        );

    /**
     * @notice Function to get state of remove liquidity offer.
     * @param _offerRemoveLiquidity Struct containing the remove liquidity offer details.
     * @param _signature Signature of signed message with `_offerRemoveLiquidity` by `maker`.
     * @return offerInfo Struct of offer info.
     * @return actualTakerFillableAmount Actual fillable amount for taker.
     * @return isSignatureValid Flag indicating whether the signature is valid or not.
     * @return poolExists Flag indicating whether a pool exists or not.
     */
    function getOfferRelevantStateRemoveLiquidity(
        LibEIP712.OfferRemoveLiquidity calldata _offerRemoveLiquidity,
        LibEIP712.Signature calldata _signature
    )
        external
        view
        returns (
            LibEIP712.OfferInfo memory offerInfo,
            uint256 actualTakerFillableAmount,
            bool isSignatureValid,
            bool poolExists
        );

    /**
     * @notice Get the address of the ownership contract.
     * @return ownershipContract_ The address of the ownership contract.
     */
    function getOwnershipContract()
        external
        view
        returns (address ownershipContract_);

    /**
     * @notice Function to return the owner stored in ownership contract.
     * @return owner_ The address of the owner.
     */
    function getOwner() external view returns (address owner_);
}
