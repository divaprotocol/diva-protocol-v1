// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

/**
 * @notice Position token contract
 * @dev The `PositionToken` contract inherits from ERC20 contract and stores
 * the Id of the pool that the position token is linked to. It implements a
 * `mint` and a `burn` function which can only be called by the `PositionToken`
 * contract owner.
 *
 * Two `PositionToken` contracts are deployed during pool creation process
 * (`createContingentPool`) with Diamond contract being set as the owner.
 * The `mint` function is used during pool creation (`createContingentPool`)
 * and addition of liquidity (`addLiquidity`). Position tokens are burnt
 * during token redemption (`redeemPositionToken`) and removal of liquidity
 * (`removeLiquidity`). The address of the position tokens is stored in the
 * pool parameters within Diamond contract and used to verify the tokens that
 * a user sends back to withdraw collateral.
 *
 * Position tokens have the same number of decimals as the underlying
 * collateral token.
 */
interface IPositionToken is IERC20Upgradeable {
    /**
     * @notice Function to initialize the position token instance
     */
    function initialize(
        string memory symbol_, // name is set equal to symbol
        uint256 poolId_,
        uint8 decimals_,
        address owner_
    ) external;

    /**
     * @notice Function to mint ERC20 position tokens.
     * @dev Called during  `createContingentPool` and `addLiquidity`.
     * Can only be called by the owner of the position token which
     * is the Diamond contract in the context of DIVA.
     * @param _recipient The account receiving the position tokens.
     * @param _amount The number of position tokens to mint.
     */
    function mint(address _recipient, uint256 _amount) external;

    /**
     * @notice Function to burn position tokens.
     * @dev Called within `redeemPositionToken` and `removeLiquidity`.
     * Can only be called by the owner of the position token which
     * is the Diamond contract in the context of DIVA.
     * @param _redeemer Address redeeming positions tokens in return for
     * collateral.
     * @param _amount The number of position tokens to burn.
     */
    function burn(address _redeemer, uint256 _amount) external;

    /**
     * @notice Returns the Id of the contingent pool that the position token is
     * linked to in the context of DIVA.
     */
    function poolId() external view returns (uint256);

    /**
     * @notice Returns the owner of the position token (Diamond contract in the
     * context of DIVA).
     */
    function owner() external view returns (address);
}
