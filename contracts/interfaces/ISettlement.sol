// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {LibDIVAStorage} from "../libraries/LibDIVAStorage.sol";

interface ISettlement {
    // Thrown in `setFinalReferenceValue` and `challengeFinalReferenceValue`
    // if pool doesn't exist
    error NonExistentPool();
    
    // Thrown in `setFinalReferenceValue` if data provider attempts
    // to submit a value when status is submitted or confirmed
    error AlreadySubmittedOrConfirmed();

    // Thrown in `setFinalReferenceValue` if data provider attempts
    // to submit a value for a pool that didn't expire yet
    error PoolNotExpired();

    // Thrown in `setFinalReferenceValue` if `msg.sender` is not the
    // data provider for the given pool
    error NotDataProvider();

    // Thrown in `setFinalReferenceValue` if `msg.sender` is not the
    // fallback provider if called during the fallback period
    error NotFallbackDataProvider();

    // Thrown in `challengeFinalReferenceValue` if, after the end of the
    // review period, i) a data provider attempts to submit a value or
    // ii) a user attempts to submit a challenge
    error ReviewPeriodExpired();

    // Thrown in `challengeFinalReferenceValue` if a user that doesn't
    // own any position tokens attempts to submit a challenge
    error NoPositionTokens();

    // Thrown in `challengeFinalReferenceValue` if a user attempts to
    // challenge a value submission after the challenge period has expired
    error ChallengePeriodExpired();

    // Thrown in `challengeFinalReferenceValue` if user attempts to challenge
    // whe status is "Open" or "Confirmed"
    error NothingToChallenge();

    // Thrown in `redeemPositionToken` if return of collateral is paused
    error ReturnCollateralPaused();

    // Thrown in `redeemPositionToken` if token to redeem is an invalid
    // position token address
    error InvalidPositionToken();

    // Thrown in `redeemPositionToken` if a user attempts to redeem a
    // position token where the final reference value was not yet set
    error FinalReferenceValueNotSet();

    // Thrown in `redeemPositionToken` if a user attempts to redeem a
    // position token where status is "Submitted" and challenge period
    // did not expire yet
    error ChallengePeriodNotExpired();

    // Thrown in `redeemPositionToken` if a user attempts to redeem a
    // position token where status is "Challenged" and the review period
    // did not expire yet
    error ReviewPeriodNotExpired();

    // Struct for `batchSetFinalReferenceValue` function input
    struct ArgsBatchSetFinalReferenceValue {
        bytes32 poolId;
        uint256 finalReferenceValue;
        bool allowChallenge;
    }

    // Struct for `batchChallengeFinalReferenceValue` function input
    struct ArgsBatchChallengeFinalReferenceValue {
        bytes32 poolId;
        uint256 proposedFinalReferenceValue;
    }

    // Struct for `batchRedeemPositionToken` function input
    struct ArgsBatchRedeemPositionToken {
        address positionToken;
        uint256 amount;
    }

    /**
     * @notice Emitted when the status of the final reference value changes.
     * @param statusFinalReferenceValue The status of the final value:
     * 0=Open, 1=Submitted, 2=Challenged, or 3=Confirmed
     * @param by Address that triggered the underlying function.
     * @param poolId The Id of the pool in settlement.
     * @param proposedFinalReferenceValue Final reference value proposed by
     * the `msg.sender`.
     */
    event StatusChanged(
        LibDIVAStorage.Status indexed statusFinalReferenceValue,
        address indexed by,
        bytes32 indexed poolId,
        uint256 proposedFinalReferenceValue
    );

    /**
     * @notice Emitted when position tokens are redeemed.
     * @param poolId The Id of the pool that the position token belongs to.
     * @param positionToken Address of the position token to redeem.
     * @param amountPositionToken Position token amount returned by user.
     * @param collateralAmountReturned Collateral amount returned to user.
     * @param returnedTo Address that is returned collateral.
     */
    event PositionTokenRedeemed(
        bytes32 indexed poolId,
        address indexed positionToken,
        uint256 amountPositionToken,
        uint256 collateralAmountReturned,
        address indexed returnedTo
    );

    // Duplication of event defined in `LibDIVA.sol` as events emitted out of
    // library functions are not reflected in the contract ABI. Read more about it here:
    // https://web.archive.org/web/20180922101404/https://blog.aragon.org/library-driven-development-in-solidity-2bebcaf88736/
    event FeeClaimAllocated(
        bytes32 indexed poolId,
        address indexed recipient,
        uint256 amount
    );

    // Duplication of event defined in `LibDIVA.sol` as events emitted out of
    // library functions are not reflected in the contract ABI. Read more about it here:
    // https://web.archive.org/web/20180922101404/https://blog.aragon.org/library-driven-development-in-solidity-2bebcaf88736/
    event ReservedClaimAllocated(
        bytes32 indexed poolId,
        address indexed recipient,
        uint256 amount
    );

    /**
     * @notice Function to submit the final reference value for a given pool Id.
     * @param _poolId The pool Id for which the final value is submitted.
     * @param _finalReferenceValue Proposed final value by the data provider
     * expressed as an integer with 18 decimals.
     * @param _allowChallenge Flag indicating whether the challenge functionality
     * is enabled or disabled for the submitted value. If 0, then the submitted
     * final value will be directly confirmed and position token holders can start
     * redeeming their position tokens. If 1, then position token holders can
     * challenge the submitted value. This flag was introduced to account for
     * decentralized oracle solutions like Uniswap v3 or Chainlink where a
     * dispute mechanism doesn't make sense.
     */
    function setFinalReferenceValue(
        bytes32 _poolId,
        uint256 _finalReferenceValue,
        bool _allowChallenge
    ) external;

    /**
     * @notice Batch version of `setFinalReferenceValue`
     * @param _argsBatchSetFinalReferenceValue Struct array containing pool id,
     * final reference value and allowChallenge
     */
    function batchSetFinalReferenceValue(
        ArgsBatchSetFinalReferenceValue[]
            calldata _argsBatchSetFinalReferenceValue
    ) external;

    /**
     * @notice Function to challenge the final value submitted by the data
     * provider.
     * @dev Only position token holders associated with the corresponding pool
     * are allowed to challenge. Function can be triggered multiple times.
     * `_proposedFinalReferenceValue` passed in as argument is not stored
     * in pool parameters but emitted as part of the `StatusChanged` event.
     * @param _poolId Pool Id for which the submitted final value is challenged.
     * @param _proposedFinalReferenceValue The proposed final value by the
     * challenger expressed as an integer with 18 decimals.
     */
    function challengeFinalReferenceValue(
        bytes32 _poolId,
        uint256 _proposedFinalReferenceValue
    ) external;

    /**
     * @notice Batch version of `challengeFinalReferenceValue`
     * @param _argsBatchChallengeFinalReferenceValue Struct array containing pool id
     * and proposedFinalReferenceValue
     */
    function batchChallengeFinalReferenceValue(
        ArgsBatchChallengeFinalReferenceValue[]
            calldata _argsBatchChallengeFinalReferenceValue
    ) external;

    /**
     * @notice Function to redeem position tokens. Position tokens are burnt
     * during that process.
     * @dev If the submission period expired without a challenge or a review
     * period expired without another input from the data provider, the
     * previously submitted final value is confirmed inside the function at
     * first user redemption.
     * @param _positionToken address of the position token to be redeemed.
     * @param _amount number of position tokens to be redeemed..
     */
    function redeemPositionToken(address _positionToken, uint256 _amount)
        external;

    /**
     * @notice Batch version of `redeemPositionToken`
     * @param _argsBatchRedeemPositionToken Struct array containing position token
     * and amount
     */
    function batchRedeemPositionToken(
        ArgsBatchRedeemPositionToken[] calldata _argsBatchRedeemPositionToken
    ) external;
}
