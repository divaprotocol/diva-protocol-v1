// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {PositionToken} from "../PositionToken.sol";
import {IPositionToken} from "../interfaces/IPositionToken.sol";
import {IPositionTokenFactory} from "../interfaces/IPositionTokenFactory.sol";
import {SafeDecimalMath} from "./SafeDecimalMath.sol";
import {LibDIVAStorage} from "./LibDIVAStorage.sol";

// Thrown in `removeLiquidity` or `redeemPositionToken` if collateral amount
// to be returned to user during exceeds the pool's collateral balance
error AmountExceedsPoolCollateralBalance();

// Thrown in `removeLiquidity` if the fee amount to be allocated exceeds the
// pool's current collateral balance
error FeeAmountExceedsPoolCollateralBalance();

// Thrown in `addLiquidity` if the pool is already expired
error PoolExpired();

// Thrown in `createContingentPool` if the input parameters are invalid
error InvalidInputParamsCreateContingentPool();

// Thrown in `addLiquidity` if adding additional collateral would
// result in the pool capacity being exceeded
error PoolCapacityExceeded();

// Thrown in `removeLiquidity` if return collateral is paused
error ReturnCollateralPaused();

// Thrown in `removeLiquidity` if status of `finalReferenceValue`
// is already "Confirmed"
error FinalValueAlreadyConfirmed();

// Thrown in `removeLiquidity` if a user's short or long position
// token balance is smaller than the indicated amount
error InsufficientShortOrLongBalance();

// Thrown in `removeLiquidity` if `_amount` provided by user results
// in a zero protocol fee amount; user should increase their `_amount`
error ZeroProtocolFee();

// Thrown in `removeLiquidity` if `_amount` provided by user results
// in zero settlement fee amount; user should increase `_amount`
error ZeroSettlementFee();

library LibDIVA {
    using SafeDecimalMath for uint256;
    using SafeERC20 for IERC20Metadata;

    // Argument for `createContingentPool` function
    struct PoolParams {
        string referenceAsset;
        uint96 expiryTime;
        uint256 floor;
        uint256 inflection;
        uint256 cap;
        uint256 gradient;
        uint256 collateralAmount;
        address collateralToken;
        address dataProvider;
        uint256 capacity;
        address longRecipient;
        address shortRecipient;
        address permissionedERC721Token;
    }

    // Argument for `_createContingentPoolLib` function
    struct CreatePoolParams {
        PoolParams poolParams;
        uint256 collateralAmountMsgSender;
        uint256 collateralAmountMaker;
        address maker;
    }

    // Argument for `_addLiquidityLib` to avoid stack-too-deep error
    struct AddLiquidityParams {
        uint256 poolId;
        uint256 collateralAmountMsgSender;
        uint256 collateralAmountMaker;
        address maker;
        address longRecipient;
        address shortRecipient;
    }

    // Argument for `_removeLiquidityLib` to avoid stack-too-deep error
    struct RemoveLiquidityParams {
        uint256 poolId;
        uint256 amount;
        address longTokenHolder;
        address shortTokenHolder;
    }

    /**
     * @notice Emitted when fees are allocated.
     * @dev Collateral token can be looked up via the `getPoolParameters`
     * function using the emitted `poolId`.
     * @param poolId The Id of the pool that the fee applies to.
     * @param recipient Address that is allocated the fees.
     * @param amount Fee amount allocated.
     */
    event FeeClaimAllocated(
        uint256 indexed poolId,
        address indexed recipient,
        uint256 amount
    );

    /**
     * @notice Emitted when a new pool is created.
     * @param poolId The Id of the newly created contingent pool.
     * @param longRecipient The address that received the long position tokens.
     * @param shortRecipient The address that received the short position tokens.
     * @param collateralAmount The collateral amount deposited into the pool.
     * @param permissionedERC721Token Address of ERC721 token that the transfer
     * restrictions apply to.
     */
    event PoolIssued(
        uint256 indexed poolId,
        address indexed longRecipient,
        address indexed shortRecipient,
        uint256 collateralAmount,
        address permissionedERC721Token
    );

    /**
     * @notice Emitted when new collateral is added to an existing pool.
     * @param poolId The Id of the pool that collateral was added to.
     * @param longRecipient The address that received the long position token.
     * @param shortRecipient The address that received the short position token.
     * @param collateralAmount The collateral amount added.
     */
    event LiquidityAdded(
        uint256 indexed poolId,
        address indexed longRecipient,
        address indexed shortRecipient,
        uint256 collateralAmount
    );

    /**
     * @notice Emitted when collateral is removed from an existing pool.
     * @param poolId The Id of the pool that collateral was removed from.
     * @param longTokenHolder The address of the user that contributed the long token.
     * @param shortTokenHolder The address of the user that contributed the short token.
     * @param collateralAmount The collateral amount removed from the pool.
     */
    event LiquidityRemoved(
        uint256 indexed poolId,
        address indexed longTokenHolder,
        address indexed shortTokenHolder,
        uint256 collateralAmount
    );

    /**
     * @notice Emitted when a tip has been credited to the data provider after
     * the final value is confirmed.
     * @param poolId Id of the pool for which the tip is credited
     * @param recipient Address of the tip recipient, typically the data provider
     * @param amount Tip amount allocated (in collateral token)
     */
    event TipAllocated(
        uint256 indexed poolId,
        address indexed recipient,
        uint256 amount
    );

    function _poolParameters(uint256 _poolId)
        internal
        view
        returns (LibDIVAStorage.Pool memory)
    {
        return LibDIVAStorage._poolStorage().pools[_poolId];
    }

    function _getLatestPoolId() internal view returns (uint256) {
        return LibDIVAStorage._poolStorage().poolId;
    }

    function _getClaim(address _collateralToken, address _recipient)
        internal
        view
        returns (uint256)
    {
        return
            LibDIVAStorage._feeClaimStorage().claimableFeeAmount[
                _collateralToken
            ][_recipient];
    }

    function _getTip(uint256 _poolId) internal view returns (uint256) {
        return LibDIVAStorage._feeClaimStorage().poolIdToTip[_poolId];
    }

    /**
     * @dev Internal function to transfer the collateral to the user.
     * Openzeppelin's `safeTransfer` method is used to handle different
     * implementations of the ERC20 standard.
     * @param _pool Pool struct.
     * @param _receiver Recipient address.
     * @param _amount Collateral amount to return.
     */
    function _returnCollateral(
        LibDIVAStorage.Pool storage _pool,
        address _receiver,
        uint256 _amount
    ) internal {
        IERC20Metadata collateralToken = IERC20Metadata(_pool.collateralToken);

        // That case shouldn't happen, but if it happens unexpectedly, then
        // it will throw here.
        if (_amount > _pool.collateralBalance)
            revert AmountExceedsPoolCollateralBalance();

        _pool.collateralBalance -= _amount;

        collateralToken.safeTransfer(_receiver, _amount);
    }

    /**
     * @notice Internal function to calculate the payoff per long and short token,
     * net of fees, and store it in `payoutLong` and `payoutShort` inside pool
     * parameters.
     * @dev Called inside `redeemPositionToken` and `setFinalReferenceValue`
     * functions after status of final reference value has been confirmed.
     * @param _pool Pool struct.
     * @param _fees Fees struct.
     * @param _collateralTokenDecimals Collateral token decimals. Passed as
     * argument to avoid reading from storage again.
     */
    function _setPayoutAmount(
        LibDIVAStorage.Pool storage _pool,
        LibDIVAStorage.Fees memory _fees,
        uint8 _collateralTokenDecimals
    ) internal {
        // Calculate payoff per short and long token. Output is in collateral
        // token decimals.
        (_pool.payoutShort, _pool.payoutLong) = _calcPayoffs(
            _pool.floor,
            _pool.inflection,
            _pool.cap,
            _pool.gradient,
            _pool.finalReferenceValue,
            _collateralTokenDecimals,
            _fees.protocolFee + _fees.settlementFee
        );
    }

    /**
     * @notice Internal function used within `setFinalReferenceValue` and
     * `redeemPositionToken` to calculate and allocate fee claims to recipient
     * (DIVA Treasury or data provider). Fee is applied to the overall
     * collateral remaining in the pool and allocated in full the first time
     * the respective function is triggered.
     * @dev Fees can be claimed via the `claimFee` function.
     * @param _poolId Pool Id.
     * @param _pool Pool struct.
     * @param _fee Percentage fee expressed as an integer with 18 decimals
     * @param _recipient Fee recipient address.
     * @param _collateralBalance Current pool collateral balance expressed as
     * an integer with collateral token decimals.
     * @param _collateralTokenDecimals Collateral token decimals.
     */
    function _calcAndAllocateFeeClaim(
        uint256 _poolId,
        LibDIVAStorage.Pool storage _pool,
        uint96 _fee,
        address _recipient,
        uint256 _collateralBalance,
        uint8 _collateralTokenDecimals
    ) internal {
        uint256 _feeAmount = _calcFee(
            _fee,
            _collateralBalance,
            _collateralTokenDecimals
        );

        _allocateFeeClaim(_poolId, _pool, _recipient, _feeAmount);
    }

    /**
     * @notice Internal function to allocate fees to `recipient`.
     * @dev The balance of the recipient is tracked inside the contract and
     * can be claimed via `claimFee` function.
     * @param _poolId Pool Id that the fee applies to.
     * @param _pool Pool struct.
     * @param _recipient Address of the fee recipient.
     * @param _feeAmount Total fee amount expressed as an integer with
     * collateral token decimals.
     */
    function _allocateFeeClaim(
        uint256 _poolId,
        LibDIVAStorage.Pool storage _pool,
        address _recipient,
        uint256 _feeAmount
    ) internal {
        // Get reference to the relevant storage slot
        LibDIVAStorage.FeeClaimStorage storage fs = LibDIVAStorage
            ._feeClaimStorage();

        // Check that fee amount to be allocated doesn't exceed the pool's
        // current `collateralBalance`. This check should never trigger, but
        // kept for safety.
        if (_feeAmount > _pool.collateralBalance)
            revert FeeAmountExceedsPoolCollateralBalance();

        // Reduce `collateralBalance` in pool parameters and increase fee claim
        _pool.collateralBalance -= _feeAmount;
        fs.claimableFeeAmount[_pool.collateralToken][_recipient] += _feeAmount;

        // Log poolId, recipient and fee amount
        emit FeeClaimAllocated(_poolId, _recipient, _feeAmount);
    }

    /**
     * @notice Internal function to transfer the tip to the data provider when the
     * final reference value is confirmed.
     * @dev `poolIdToTip` is set to zero and credited to the fee claim in that process.
     * @param _poolId Id of pool.
     * @param _recipient Tip recipient.
     */
    function _allocateTip(uint256 _poolId, address _recipient) internal {
        // Get references to relevant storage slots
        LibDIVAStorage.FeeClaimStorage storage fs = LibDIVAStorage
            ._feeClaimStorage();
        LibDIVAStorage.PoolStorage storage ps = LibDIVAStorage._poolStorage();

        // Initialize Pool struct
        LibDIVAStorage.Pool storage _pool = ps.pools[_poolId];

        // Get tip for pool
        uint256 _tip = fs.poolIdToTip[_poolId];

        // Credit tip to the claimable fee amount
        fs.poolIdToTip[_poolId] = 0;
        fs.claimableFeeAmount[_pool.collateralToken][_recipient] += _tip;

        // Log event
        emit TipAllocated(_poolId, _recipient, _tip);
    }

    /**
     * @notice Function to calculate the fee amount for a given collateral amount.
     * @dev Output is an integer expressed with collateral token decimals.
     * As fee parameter has 18 decimals but collateral tokens may have
     * less, scaling needs to be applied when using `SafeDecimalMath` library.
     * @param _fee Percentage fee expressed as an integer with 18 decimals
     * (e.g., 0.25% is 2500000000000000).
     * @param _collateralAmount Collateral amount that is used as the basis for
     * the fee calculation expressed as an integer with collateral token decimals.
     * @param _collateralTokenDecimals Collateral token decimals.
     * @return The fee amount expressed as an integer with collateral token decimals.
     */
    function _calcFee(
        uint96 _fee,
        uint256 _collateralAmount,
        uint8 _collateralTokenDecimals
    ) internal pure returns (uint256) {
        uint256 _SCALINGFACTOR = uint256(10**(18 - _collateralTokenDecimals));

        uint256 _feeAmount = uint256(_fee).multiplyDecimal(
            _collateralAmount * _SCALINGFACTOR
        ) / _SCALINGFACTOR;

        return _feeAmount;
    }

    /**
     * @notice Function to calculate the payoffs per long and short token,
     * net of fees.
     * @dev Scaling applied during calculations to handle different decimals.
     * @param _floor Value of underlying at or below which the short token
     * will pay out the max amount and the long token zero. Expressed as an
     * integer with 18 decimals.
     * @param _inflection Value of underlying at which the long token will
     * payout out `_gradient` and the short token `1-_gradient`. Expressed
     * as an integer with 18 decimals.
     * @param _cap Value of underlying at or above which the long token will
     * pay out the max amount and short token zero. Expressed as an integer
     * with 18 decimals.
     * @param _gradient Long token payout at inflection (0 <= _gradient <= 1).
     * Expressed as an integer with collateral token decimals.
     * @param _finalReferenceValue Final value submitted by data provider
     * expressed as an integer with 18 decimals.
     * @param _collateralTokenDecimals Collateral token decimals.
     * @param _fee Fee in percent expressed as an integer with 18 decimals.
     * @return payoffShortNet Payoff per short token (net of fees) expressed
     * as an integer with collateral token decimals.
     * @return payoffLongNet Payoff per long token (net of fees) expressed
     * as an integer with collateral token decimals.
     */
    function _calcPayoffs(
        uint256 _floor,
        uint256 _inflection,
        uint256 _cap,
        uint256 _gradient,
        uint256 _finalReferenceValue,
        uint256 _collateralTokenDecimals,
        uint96 _fee // max value: 5% <= 2^96
    ) internal pure returns (uint96 payoffShortNet, uint96 payoffLongNet) {
        uint256 _SCALINGFACTOR = uint256(10**(18 - _collateralTokenDecimals));
        uint256 _UNIT = SafeDecimalMath.UNIT;
        uint256 _payoffLong;
        uint256 _payoffShort;
        // Note: _gradient * _SCALINGFACTOR not stored in memory for calculations
        // as it would result in a stack-too-deep error

        if (_finalReferenceValue == _inflection) {
            _payoffLong = _gradient * _SCALINGFACTOR;
        } else if (_finalReferenceValue <= _floor) {
            _payoffLong = 0;
        } else if (_finalReferenceValue >= _cap) {
            _payoffLong = _UNIT;
        } else if (_finalReferenceValue < _inflection) {
            _payoffLong = (
                (_gradient * _SCALINGFACTOR).multiplyDecimal(
                    _finalReferenceValue - _floor
                )
            ).divideDecimal(_inflection - _floor);
        } else if (_finalReferenceValue > _inflection) {
            _payoffLong =
                _gradient *
                _SCALINGFACTOR +
                (
                    (_UNIT - _gradient * _SCALINGFACTOR).multiplyDecimal(
                        _finalReferenceValue - _inflection
                    )
                ).divideDecimal(_cap - _inflection);
        }

        _payoffShort = _UNIT - _payoffLong;

        payoffShortNet = uint96(
            _payoffShort.multiplyDecimal(_UNIT - _fee) / _SCALINGFACTOR
        );
        payoffLongNet = uint96(
            _payoffLong.multiplyDecimal(_UNIT - _fee) / _SCALINGFACTOR
        );

        return (payoffShortNet, payoffLongNet); // collateral token decimals
    }

    function _createContingentPoolLib(CreatePoolParams memory _createPoolParams)
        internal
        returns (uint256)
    {
        // Get reference to relevant storage slots
        LibDIVAStorage.PoolStorage storage ps = LibDIVAStorage._poolStorage();
        LibDIVAStorage.GovernanceStorage storage gs = LibDIVAStorage
            ._governanceStorage();

        // Create reference to collateral token corresponding to the provided pool Id
        IERC20Metadata collateralToken = IERC20Metadata(
            _createPoolParams.poolParams.collateralToken
        );

        uint8 _collateralTokenDecimals = collateralToken.decimals();

        // Check validity of input parameters
        if (
            !_validateInputParamsCreateContingentPool(
                _createPoolParams.poolParams,
                _collateralTokenDecimals
            )
        ) revert InvalidInputParamsCreateContingentPool();

        // Increment `poolId` every time a new pool is created. Index
        // starts at 1. No overflow risk when using compiler version >= 0.8.0.
        ++ps.poolId;

        // Cache new poolId to avoid reading from storage
        uint256 _poolId = ps.poolId;

        // Transfer approved collateral tokens from `msg.sender` to `this`.
        collateralToken.safeTransferFrom(
            msg.sender,
            address(this),
            _createPoolParams.collateralAmountMsgSender
        );

        // Transfer approved collateral tokens from maker. Applies only for `fillOfferCreateContingentPool`
        // when makerFillAmount > 0. Requires prior approval from `maker` to execute this transaction.
        if (_createPoolParams.collateralAmountMaker != 0) {
            collateralToken.safeTransferFrom(
                _createPoolParams.maker,
                address(this),
                _createPoolParams.collateralAmountMaker
            );
        }

        // Deploy two `PositionToken` contract clones, one that represents shares in the short
        // and one that represents shares in the long position.
        // Naming convention for short/long token: S13/L13 where 13 is the poolId
        // Diamond contract (address(this) due to delegatecall) is set as the
        // owner of the position tokens and is the only account that is
        // authorized to call the `mint` and `burn` function therein.
        // Note that position tokens have same number of decimals as collateral token.
        address _shortToken = IPositionTokenFactory(ps.positionTokenFactory)
            .createPositionToken(
                string(abi.encodePacked("S", Strings.toString(_poolId))), // name is equal to symbol
                _poolId,
                _collateralTokenDecimals,
                address(this),
                _createPoolParams.poolParams.permissionedERC721Token
            );

        address _longToken = IPositionTokenFactory(ps.positionTokenFactory)
            .createPositionToken(
                string(abi.encodePacked("L", Strings.toString(_poolId))), // name is equal to symbol
                _poolId,
                _collateralTokenDecimals,
                address(this),
                _createPoolParams.poolParams.permissionedERC721Token
            );

        (uint48 _indexFees, ) = _getCurrentFees(gs);
        (uint48 _indexSettlementPeriods, ) = _getCurrentSettlementPeriods(gs);

        // Store `Pool` struct in `pools` mapping for the newly generated `poolId`
        ps.pools[_poolId] = LibDIVAStorage.Pool(
            _createPoolParams.poolParams.floor,
            _createPoolParams.poolParams.inflection,
            _createPoolParams.poolParams.cap,
            _createPoolParams.poolParams.gradient,
            _createPoolParams.poolParams.collateralAmount,
            0, // finalReferenceValue
            _createPoolParams.poolParams.capacity,
            block.timestamp,
            _shortToken,
            0, // payoutShort
            _longToken,
            0, // payoutLong
            _createPoolParams.poolParams.collateralToken,
            _createPoolParams.poolParams.expiryTime,
            address(_createPoolParams.poolParams.dataProvider),
            _indexFees,
            _indexSettlementPeriods,
            LibDIVAStorage.Status.Open,
            _createPoolParams.poolParams.referenceAsset
        );

        // Number of position tokens is set equal to the total collateral to
        // standardize the max payout at 1.0. Position tokens are sent to the recipients
        // provided as part of the input parameters.
        IPositionToken(_shortToken).mint(
            _createPoolParams.poolParams.shortRecipient,
            _createPoolParams.poolParams.collateralAmount
        );
        IPositionToken(_longToken).mint(
            _createPoolParams.poolParams.longRecipient,
            _createPoolParams.poolParams.collateralAmount
        );

        // Log pool creation
        emit PoolIssued(
            _poolId,
            _createPoolParams.poolParams.longRecipient,
            _createPoolParams.poolParams.shortRecipient,
            _createPoolParams.poolParams.collateralAmount,
            _createPoolParams.poolParams.permissionedERC721Token
        );

        return _poolId;
    }

    function _validateInputParamsCreateContingentPool(
        PoolParams memory _poolParams,
        uint8 _collateralTokenDecimals
    ) internal view returns (bool) {
        // Expiry time should not be equal to or smaller than `block.timestamp`
        if (_poolParams.expiryTime <= block.timestamp) {
            return false;
        }

        // Reference asset should not be empty string
        if (bytes(_poolParams.referenceAsset).length == 0) {
            return false;
        }

        // Floor should not be greater than inflection
        if (_poolParams.floor > _poolParams.inflection) {
            return false;
        }

        // Cap should not be smaller than inflection
        if (_poolParams.cap < _poolParams.inflection) {
            return false;
        }

        // Data provider should not be zero address
        if (_poolParams.dataProvider == address(0)) {
            return false;
        }

        // Gradient should not be greater than 1 (integer in collateral token decimals)
        if (_poolParams.gradient > uint256(10**_collateralTokenDecimals)) {
            return false;
        }

        // Collateral amount should not be smaller than 1e6
        if (_poolParams.collateralAmount < 10**6) {
            return false;
        }

        // Collateral amount should not be greater than pool capacity
        if (_poolParams.collateralAmount > _poolParams.capacity) {
            return false;
        }

        // Collateral token should not have decimals larger than 18 or smaller than 6
        if ((_collateralTokenDecimals > 18) || (_collateralTokenDecimals < 6)) {
            return false;
        }

        // `longRecipient` and `shortRecipient` should not be both zero address
        if (
            _poolParams.longRecipient == address(0) &&
            _poolParams.shortRecipient == address(0)
        ) {
            return false;
        }

        return true;

        // Note: Conscious decision to allow either `longRecipient` or `shortRecipient` to
        // to be equal to the zero address to enable conditional burn use cases.
    }

    // Function to transfer collateral from msg.sender/maker to `this` and mint position token
    function _addLiquidityLib(AddLiquidityParams memory addLiquidityParams)
        internal
    {
        // Get reference to relevant storage slot
        LibDIVAStorage.PoolStorage storage ps = LibDIVAStorage._poolStorage();

        // Initialize Pool struct
        LibDIVAStorage.Pool storage _pool = ps.pools[addLiquidityParams.poolId];

        // Connect to collateral token contract of the given pool Id
        IERC20Metadata collateralToken = IERC20Metadata(_pool.collateralToken);

        // Transfer approved collateral tokens from `msg.sender` (taker in `fillOfferAddLiquidity`) to `this`.
        // Requires prior approval from `msg.sender` to execute this transaction.
        collateralToken.safeTransferFrom(
            msg.sender,
            address(this),
            addLiquidityParams.collateralAmountMsgSender
        );

        // Transfer approved collateral tokens from maker. Applies only for `fillOfferAddLiquidity`
        // when makerFillAmount > 0. Requires prior approval from `maker` to execute this transaction.
        if (addLiquidityParams.collateralAmountMaker != 0) {
            collateralToken.safeTransferFrom(
                addLiquidityParams.maker,
                address(this),
                addLiquidityParams.collateralAmountMaker
            );
        }

        uint256 _collateralAmountIncr = addLiquidityParams
            .collateralAmountMsgSender +
            addLiquidityParams.collateralAmountMaker;

        // Increase `collateralBalance`
        _pool.collateralBalance += _collateralAmountIncr;

        // Mint long and short position tokens and send to `shortRecipient` and
        // `_longRecipient`, respectively (additional supply equals `_collateralAmountIncr`)
        IPositionToken(_pool.shortToken).mint(
            addLiquidityParams.shortRecipient,
            _collateralAmountIncr
        );
        IPositionToken(_pool.longToken).mint(
            addLiquidityParams.longRecipient,
            _collateralAmountIncr
        );

        // Log addition of collateral
        emit LiquidityAdded(
            addLiquidityParams.poolId,
            addLiquidityParams.longRecipient,
            addLiquidityParams.shortRecipient,
            _collateralAmountIncr
        );
    }

    function _checkAddLiquidityAllowed(
        LibDIVAStorage.Pool storage _pool,
        uint256 _collateralAmountIncr
    ) internal view {
        // Check that pool has not expired yet
        if (block.timestamp >= _pool.expiryTime) revert PoolExpired();

        // Check that new total pool collateral does not exceed the maximum
        // capacity of the pool
        if ((_pool.collateralBalance + _collateralAmountIncr) > _pool.capacity)
            revert PoolCapacityExceeded();
    }

    function _removeLiquidityLib(
        RemoveLiquidityParams memory _removeLiquidityParams
    ) internal returns (uint256 collateralAmountRemovedNet) {
        // Get references to relevant storage slots
        LibDIVAStorage.PoolStorage storage ps = LibDIVAStorage._poolStorage();
        LibDIVAStorage.GovernanceStorage storage gs = LibDIVAStorage
            ._governanceStorage();

        // Confirm that functionality is not paused
        if (block.timestamp < gs.pauseReturnCollateralUntil)
            revert ReturnCollateralPaused();

        // Initialize Pool struct
        LibDIVAStorage.Pool storage _pool = ps.pools[
            _removeLiquidityParams.poolId
        ];

        // If status is Confirmed, users should use `redeemPositionToken` function
        // to withdraw collateral
        if (_pool.statusFinalReferenceValue == LibDIVAStorage.Status.Confirmed)
            revert FinalValueAlreadyConfirmed();

        // Create reference to short and long position tokens for the given pool
        IPositionToken shortToken = IPositionToken(_pool.shortToken);
        IPositionToken longToken = IPositionToken(_pool.longToken);

        // Check that `shortTokenHolder` and `longTokenHolder` own the corresponding
        // `_amount` of short and long position tokens. In particular, this check will
        // revert when a user tries to remove an amount that exceeds the overall position token
        // supply which is the maximum amount that a user can own.
        if (
            shortToken.balanceOf(_removeLiquidityParams.shortTokenHolder) <
            _removeLiquidityParams.amount ||
            longToken.balanceOf(_removeLiquidityParams.longTokenHolder) <
            _removeLiquidityParams.amount
        ) revert InsufficientShortOrLongBalance();

        // Get fee parameters applicable for given `_poolId`
        LibDIVAStorage.Fees memory _fees = gs.fees[_pool.indexFees];

        uint256 _protocolFee;
        uint256 _settlementFee;

        if (_fees.protocolFee > 0) {
            // Calculate protocol fees to charge (note that collateral amount
            // to return is equal to `_amount`)
            _protocolFee = _calcFee(
                _fees.protocolFee,
                _removeLiquidityParams.amount,
                IERC20Metadata(_pool.collateralToken).decimals()
            );
            // User has to increase `_amount` if fee is 0
            if (_protocolFee == 0) revert ZeroProtocolFee();
        } // else _protocolFee = 0 (default value for uint256)

        if (_fees.settlementFee > 0) {
            // Calculate settlement fees to charge
            _settlementFee = _calcFee(
                _fees.settlementFee,
                _removeLiquidityParams.amount,
                IERC20Metadata(_pool.collateralToken).decimals()
            );
            // User has to increase `_amount` if fee is 0
            if (_settlementFee == 0) revert ZeroSettlementFee();
        } // else _settlementFee = 0 (default value for uint256)

        // Burn short and long position tokens
        shortToken.burn(
            _removeLiquidityParams.shortTokenHolder,
            _removeLiquidityParams.amount
        );
        longToken.burn(
            _removeLiquidityParams.longTokenHolder,
            _removeLiquidityParams.amount
        );

        // Allocate protocol fee to DIVA treasury. Fee is held within this
        // contract and can be claimed via `claimFee` function.
        // `collateralBalance` is reduced inside `_allocateFeeClaim`.
        _allocateFeeClaim(
            _removeLiquidityParams.poolId,
            _pool,
            LibDIVAStorage._governanceStorage().treasury,
            _protocolFee
        );

        // Allocate settlement fee to data provider. Fee is held within this
        // contract and can be claimed via `claimFee` function.
        _allocateFeeClaim(
            _removeLiquidityParams.poolId,
            _pool,
            _pool.dataProvider,
            _settlementFee
        );

        // Collateral amount to return net of fees
        collateralAmountRemovedNet =
            _removeLiquidityParams.amount -
            _protocolFee -
            _settlementFee;

        // Log removal of liquidity
        emit LiquidityRemoved(
            _removeLiquidityParams.poolId,
            _removeLiquidityParams.longTokenHolder,
            _removeLiquidityParams.shortTokenHolder,
            _removeLiquidityParams.amount
        );
    }

    function _getFeesHistory(
        uint256 _nbrLastUpdates,
        LibDIVAStorage.GovernanceStorage storage _gs
    ) internal view returns (LibDIVAStorage.Fees[] memory) {
        if (_nbrLastUpdates > 0) {
            // Cache length to avoid reading from storage on every loop
            uint256 _len = _gs.fees.length;

            // Cap `_nbrLastUpdates` at max history rather than throwing an error
            _nbrLastUpdates = _nbrLastUpdates > _len ? _len : _nbrLastUpdates;

            // Define the size of the array to be returned
            LibDIVAStorage.Fees[] memory _fees = new LibDIVAStorage.Fees[](
                _nbrLastUpdates
            );

            // Iterate through the fees array starting from the latest item
            for (uint256 i = _len; i > _len - _nbrLastUpdates; ) {
                _fees[_len - i] = _gs.fees[i - 1]; // first element of _fees represents latest fees
                unchecked {
                    --i;
                }
            }
            return _fees;
        } else {
            return new LibDIVAStorage.Fees[](0);
        }
    }

    function _getSettlementPeriodsHistory(
        uint256 _nbrLastUpdates,
        LibDIVAStorage.GovernanceStorage storage _gs
    ) internal view returns (LibDIVAStorage.SettlementPeriods[] memory) {
        if (_nbrLastUpdates > 0) {
            // Cache length to avoid reading from storage on every loop
            uint256 _len = _gs.settlementPeriods.length;

            // Cap `_nbrLastUpdates` at max history rather than throwing an error
            _nbrLastUpdates = _nbrLastUpdates > _len ? _len : _nbrLastUpdates;

            // Define the size of the array to be returned
            LibDIVAStorage.SettlementPeriods[]
                memory _settlementPeriods = new LibDIVAStorage.SettlementPeriods[](
                    _nbrLastUpdates
                );

            // Iterate through the settlement periods array starting from the latest item
            for (uint256 i = _len; i > _len - _nbrLastUpdates; ) {
                _settlementPeriods[_len - i] = _gs.settlementPeriods[i - 1]; // first element of _fees represents latest fees
                unchecked {
                    --i;
                }
            }
            return _settlementPeriods;
        } else {
            return new LibDIVAStorage.SettlementPeriods[](0);
        }
    }

    function _getCurrentFees(LibDIVAStorage.GovernanceStorage storage _gs)
        internal
        view
        returns (uint48 index, LibDIVAStorage.Fees memory fees)
    {
        // Get length of `fees` array
        uint256 _len = _gs.fees.length;

        // Load latest fee regime
        LibDIVAStorage.Fees memory _fees = _gs.fees[_len - 1];

        // Return the latest array entry & index if already past activation time,
        // otherwise return the second last entry
        if (_fees.startTime > block.timestamp) {
            index = uint48(_len - 2);
        } else {
            index = uint48(_len - 1);
        }
        fees = _gs.fees[index];
    }

    function _getCurrentSettlementPeriods(
        LibDIVAStorage.GovernanceStorage storage _gs
    )
        internal
        view
        returns (
            uint48 index,
            LibDIVAStorage.SettlementPeriods memory settlementPeriods
        )
    {
        // Get length of `settlementPeriods` array
        uint256 _len = _gs.settlementPeriods.length;

        // Load latest settlement periods regime
        LibDIVAStorage.SettlementPeriods memory _settlementPeriods = _gs
            .settlementPeriods[_len - 1];

        // Return the latest array entry & index if already past activation time,
        // otherwise return the second last entry
        if (_settlementPeriods.startTime > block.timestamp) {
            index = uint48(_len - 2);
        } else {
            index = uint48(_len - 1);
        }
        settlementPeriods = _gs.settlementPeriods[index];
    }

    function _getCurrentFallbackDataProvider(
        LibDIVAStorage.GovernanceStorage storage _gs
    ) internal view returns (address) {
        // Return the new fallback data provider if `block.timestamp` is at or past
        // the activation time, else return the current fallback data provider
        return
            block.timestamp < _gs.startTimeFallbackDataProvider
                ? _gs.previousFallbackDataProvider
                : _gs.fallbackDataProvider;
    }

    function _getCurrentTreasury(LibDIVAStorage.GovernanceStorage storage _gs)
        internal
        view
        returns (address)
    {
        // Return the new treasury address if `block.timestamp` is at or past
        // the activation time, else return the current treasury address
        return
            block.timestamp < _gs.startTimeTreasury
                ? _gs.previousTreasury
                : _gs.treasury;
    }

    function _getFallbackDataProviderInfo(
        LibDIVAStorage.GovernanceStorage storage _gs
    )
        internal
        view
        returns (
            address previousFallbackDataProvider,
            address fallbackDataProvider,
            uint256 startTimeFallbackDataProvider
        )
    {
        // Return values
        previousFallbackDataProvider = _gs.previousFallbackDataProvider;
        fallbackDataProvider = _gs.fallbackDataProvider;
        startTimeFallbackDataProvider = _gs.startTimeFallbackDataProvider;
    }

    function _getTreasuryInfo(LibDIVAStorage.GovernanceStorage storage _gs)
        internal
        view
        returns (
            address previousTreasury,
            address treasury,
            uint256 startTimeTreasury
        )
    {
        // Return values
        previousTreasury = _gs.previousTreasury;
        treasury = _gs.treasury;
        startTimeTreasury = _gs.startTimeTreasury;
    }
}
