// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

interface IPositionTokenFactory {
    /**
     * @notice Creates a clone of the permissionless position token contract.
     * @param _symbol Symbol string of the position token. Name is set equal to symbol.
     * @param _poolId The Id of the contingent pool that the position token belongs to.
     * @param _decimals Decimals of position token (same as collateral token).
     * @param _owner Owner of the position token. Should always be DIVA Protocol address.
     * @param _permissionedERC721Token Address of permissioned ERC721 token.
     * @return clone Returns the address of the clone contract.
     */
    function createPositionToken(
        string memory _symbol,
        bytes32 _poolId,
        uint8 _decimals,
        address _owner,
        address _permissionedERC721Token
    ) external returns (address clone);

    /**
     * @notice Address where the position token implementation contract is stored.
     * @dev This is needed since we are using a clone proxy.
     * @return The implementation address.
     */
    function positionTokenImplementation() external view returns (address);

    /**
     * @notice Address where the permissioned position token implementation contract
     * is stored.
     * @dev This is needed since we are using a clone proxy.
     * @return The implementation address.
     */
    function permissionedPositionTokenImplementation() external view returns (address);
}
