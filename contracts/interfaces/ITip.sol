// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

interface ITip {
    // Thrown in `addTip` if pool doesn't exist
    error NonExistentPool();

    // Thrown in `addTip` if status of `finalReferenceValue`
    // is no longer "Open"
    error FinalValueAlreadySubmitted();

    // Thrown in `addTip` if the collateral token implements a fee
    error FeeTokensNotSupported();

    // Struct for `batchAddTip` function input
    struct ArgsBatchAddTip {
        bytes32 poolId;
        uint256 amount;
    }

    /**
     * @notice Emitted when a tip is added to a pool.
     * @param tipper Tipper address
     * @param poolId Pool Id tipped
     * @param collateralToken Collateral token address
     * @param amount Tip amount
     */
    event TipAdded(
        address indexed tipper,
        bytes32 indexed poolId,
        address indexed collateralToken,
        uint256 amount
    );

    /**
     * @notice Function to add a tip in collateral token to a specific pool.
     * @dev Requires prior approval from `msg.sender` to transfer the token.
     * Fee-on-transfer tokens are not supported.
     * @param _poolId Id of pool to tip
     * @param _amount Collateral token amount to add as a tip (expressed as
     * an integer with collateral token decimals)
     */
    function addTip(bytes32 _poolId, uint256 _amount) external;

    /**
     * @notice Batch version of `addTip`.
     * @dev Requires prior approval from `msg.sender` to transfer the tokens.
     * @param _argsBatchAddTip Struct array containing poolIds and tip amounts
     * (expressed as an integer with collateral token decimals)
     */
    function batchAddTip(ArgsBatchAddTip[] calldata _argsBatchAddTip) external;
}
