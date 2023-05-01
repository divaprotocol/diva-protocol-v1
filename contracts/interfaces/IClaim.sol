// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

interface IClaim {
    // Thrown if the recipient during fee claim transfer is the zero address
    error RecipientIsZeroAddress();

    // Thrown if the transfer amount exceeds the claimable fee amount
    error AmountExceedsClaimableFee();

    // Struct for `batchClaimFee` function input
    struct ArgsBatchClaimFee {
        address collateralToken;
        address recipient;
    }

    // Struct for `batchTransferFeeClaim` function input
    struct ArgsBatchTransferFeeClaim {
        address recipient;
        address collateralToken;
        uint256 amount;
    }

    /**
     * @notice Emitted when fee claim is transferred from entitled address
     * to another address
     * @param from Address that is transferring their fee claim
     * @param to Address of the fee claim recipient
     * @param collateralToken Collateral token address
     * @param amount Fee amount
     */
    event FeeClaimTransferred(
        address indexed from,
        address indexed to,
        address indexed collateralToken,
        uint256 amount
    );

    /**
     * @notice Emitted when fee is claimed
     * @param recipient Address of the fee recipient
     * @param collateralToken Collateral token address
     * @param amount Fee amount
     */
    event FeeClaimed(
        address indexed recipient,
        address indexed collateralToken,
        uint256 amount
    );

    /**
     * @notice Function to claim allocated fees and tips
     * @dev List of collateral token addresses has to be obtained off-chain
     * (e.g., from TheGraph)
     * @param _collateralToken Collateral token address
     * @param _recipient Fee recipient address
     */
    function claimFee(address _collateralToken, address _recipient) external;

    /**
     * @notice Batch version of `claimFee`
     * @param _argsBatchClaimFee Struct array containing collateral token and
     * recipient addresses
     */
    function batchClaimFee(ArgsBatchClaimFee[] calldata _argsBatchClaimFee)
        external;

    /**
     * @notice Function to transfer fee claim from entitled address
     * to another address
     * @param _recipient Address of fee claim recipient
     * @param _collateralToken Collateral token address
     * @param _amount Amount (expressed as an integer with collateral token
     * decimals) to transfer to recipient
     */
    function transferFeeClaim(
        address _recipient,
        address _collateralToken,
        uint256 _amount
    ) external;

    /**
     * @notice Batch version of `transferFeeClaim`
     * @param _argsBatchTransferFeeClaim Struct array containing collateral tokens,
     * recipient addresses and amounts (expressed as an integer with collateral
     * token decimals)
     */
    function batchTransferFeeClaim(
        ArgsBatchTransferFeeClaim[] calldata _argsBatchTransferFeeClaim
    ) external;
}
