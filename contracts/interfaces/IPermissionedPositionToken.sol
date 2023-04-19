// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

/**
 * @notice Permissioned version of the position token contract
 */
interface IPermissionedPositionToken is IERC20Upgradeable {
    /**
     * @notice Function to initialize the position token instance
     */
    function initialize(
        string memory symbol_, // name is set equal to symbol
        uint256 poolId_,
        uint8 decimals_,
        address owner_,
        address permissionedERC721Token_
    ) external;

    /**
     * @notice Function to mint ERC20 position tokens. Called during
     * `createContingentPool` and `addLiquidity`. Can only be called by the
     * owner of the position token which is the Diamond contract in the
     * context of DIVA.
     * @param _recipient The account receiving the position tokens.
     * @param _amount The number of position tokens to mint.
     */
    function mint(address _recipient, uint256 _amount) external;

    /**
     * @notice Function to burn position tokens. Called within `redeemPositionToken`
     * and `removeLiquidity`. Can only be called by the owner of the position
     * token which is the Diamond contract in the context of DIVA.
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

    /**
     * @notice Return permissioned ERC721 token address
     */
    function permissionedERC721Token() external view returns (address);
}
