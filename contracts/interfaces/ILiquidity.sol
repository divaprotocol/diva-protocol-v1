// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

interface ILiquidity {
    // Struct for `batchAddLiquidity` function input
    struct ArgsBatchAddLiquidity {
        uint256 poolId;
        uint256 collateralAmountIncr;
        address longRecipient;
        address shortRecipient;
    }

    // Struct for `batchRemoveLiquidity` function input
    struct ArgsBatchRemoveLiquidity {
        uint256 poolId;
        uint256 amount;
    }

    // Duplication of event defined in `LibDIVA.sol` as events emitted out of
    // library functions are not reflected in the contract ABI. Read more about it here:
    // https://web.archive.org/web/20180922101404/https://blog.aragon.org/library-driven-development-in-solidity-2bebcaf88736/
    event LiquidityAdded(
        uint256 indexed poolId,
        address indexed longRecipient,
        address indexed shortRecipient,
        uint256 collateralAmount
    );

    // Duplication of event defined in `LibDIVA.sol` as events emitted out of
    // library functions are not reflected in the contract ABI. Read more about it here:
    // https://web.archive.org/web/20180922101404/https://blog.aragon.org/library-driven-development-in-solidity-2bebcaf88736/
    event LiquidityRemoved(
        uint256 indexed poolId,
        address indexed longTokenHolder,
        address indexed shortTokenHolder,
        uint256 collateralAmount
    );

    event FeeClaimAllocated(
        uint256 indexed poolId,
        address indexed recipient,
        uint256 amount
    );

    /**
     * @notice Function to add collateral to an existing pool. Mints new
     * long and short position tokens with supply equal to collateral
     * amount added and sends them to `_longRecipient` and `_shortRecipient`,
     * respectively.
     * @dev Requires prior ERC20 approval.
     * @param _poolId Id of the pool to add collateral to.
     * @param _collateralAmountIncr Incremental collateral amount that `msg.sender`
     * is going to add to the pool expressed as an integer with collateral token decimals.
     * @param _longRecipient: Address that shall receive the long position tokens.
     * Any burn address except for the zero address is a valid recipient to enable conditional
     * burn use cases. 
     * @param _shortRecipient: Address that shall receive the short position tokens.
     * Any burn address except for the zero address is a valid recipient to enable conditional
     * burn use cases.
     */
    function addLiquidity(
        uint256 _poolId,
        uint256 _collateralAmountIncr,
        address _longRecipient,
        address _shortRecipient
    ) external;

    /**
     * @notice Batch version of `addLiquidity`
     * @param _argsBatchAddLiquidity Struct array containing pool id,
     * collateral amount to add, long recipient and short recipient
     */
    function batchAddLiquidity(
        ArgsBatchAddLiquidity[] calldata _argsBatchAddLiquidity
    ) external;

    /**
     * @notice Function to remove collateral from an existing pool.
     * @dev Requires `msg.sender` to return an equal amount of long and short
     * position tokens which are burnt. Collateral amount returned to the user
     * is net of fees. Protocol and settlement fees for DIVA treasury and
     * data provider, respectively, are retained within the contract and can
     * be claimed via `claimFee` function.
     * @param _poolId Id of the pool that a user wants to remove collateral
     * from.
     * @param _amount Number of position tokens to return (1:1 to collateral
     * amount).
     */
    function removeLiquidity(uint256 _poolId, uint256 _amount) external;

    /**
     * @notice Batch version of `removeLiquidity`
     * @param _argsBatchRemoveLiquidity Struct array containing pool id
     * and amount
     */
    function batchRemoveLiquidity(
        ArgsBatchRemoveLiquidity[] calldata _argsBatchRemoveLiquidity
    ) external;
}
