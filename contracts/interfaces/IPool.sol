// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {LibDIVA} from "../libraries/LibDIVA.sol";

interface IPool {
    // Duplication of event defined in `LibDIVA.sol` as events emitted out of
    // library functions are not reflected in the contract ABI. Read more about it here:
    // https://web.archive.org/web/20180922101404/https://blog.aragon.org/library-driven-development-in-solidity-2bebcaf88736/
    event PoolIssued(
        uint256 indexed poolId,
        address indexed longRecipient,
        address indexed shortRecipient,
        uint256 collateralAmount,
        address permissionedERC721Token
    );

    /**
     * @notice Function to issue long and short position tokens to
     * `longRecipient` and `shortRecipient` upon collateral deposit by `msg.sender`. 
     * Provided collateral is kept inside the contract until position tokens are 
     * redeemed by calling `redeemPositionToken` or `removeLiquidity`.
     * @dev Position token supply equals `collateralAmount` (minimum 1e6).
     * Position tokens have the same number of decimals as the collateral token.
     * Only ERC20 tokens with 6 <= decimals <= 18 are accepted as collateral.
     * Tokens with flexible supply like Ampleforth should not be used. When
     * interest/yield bearing tokens are considered, only use tokens with a
     * constant balance mechanism such as Compound's cToken or the wrapped
     * version of Lido's staked ETH (wstETH).
     * ETH is not supported as collateral in v1. It has to be wrapped into WETH
       before deposit.
     * @param _poolParams Struct containing the pool specification:
     * - referenceAsset: The metric or event whose outcome will determine the
         payout for long and short position tokens.
     * - expiryTime: Expiration time of the pool expressed as a unix
         timestamp in seconds (UTC). The value of the reference asset observed
         at that point in time determines the payoffs for long and short position
         tokens.
     * - floor: Value of the reference asset at or below which the long token
         pays out 0 and the short token 1 (max payout), gross of fees.
         Input expects an integer with 18 decimals.
     * - inflection: Value of the reference asset at which the long token pays
         out `gradient` and the short token `1-gradient`, gross of fees. Input
         expects an integer with 18 decimals.
     * - cap: Value of the reference asset at or above which the long token pays
         out 1 (max payout) and the short token 0, gross of fees. Input expects
         an integer with 18 decimals.
     * - gradient: A value between 0 and 1 which specifies the payout per long
         token if the outcome is equal to `inflection`. Input expects an integer
         with collateral token decimals.
     * - collateralAmount: Collateral amount to be deposited into the pool to back
         the position tokens. Input expects an integer with collateral token decimals.
     * - collateralToken: Address of the ERC20 collateral token.
     * - dataProvider: Ethereum account (EOA or smart contract) that is supposed to
         report the final reference asset value following pool expiration.
     * - capacity: TMaximum collateral amount that a contingent pool can accept.
         Choose a large number (e.g., `2**256 - 1`) for unlimited size. Input expects
         an integer with collateral token decimals.
     * - longRecipient: Address that shall receive the long position token.
         Any burn address except for the zero address is a valid recipient to enable conditional
         burn use cases.
     * - shortRecipient: Address that shall receive the short position token.
         Any burn address except for the zero address is a valid recipient to enable conditional
         burn use cases.
     * - permissionedERC721Token: Address of the ERC721 token that transfers are restricted to.
         Use zero address to render the position tokens permissionless.
     * @return poolId
     */
    function createContingentPool(LibDIVA.PoolParams memory _poolParams)
        external
        returns (uint256);

    /**
     * @notice Batch version of `createContingentPool`
     * @param _poolsParams Array of PoolParams struct
     */
    function batchCreateContingentPool(LibDIVA.PoolParams[] memory _poolsParams)
        external
        returns (uint256[] memory);
}
