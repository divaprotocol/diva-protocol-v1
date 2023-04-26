// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IPositionTokenFactory} from "./interfaces/IPositionTokenFactory.sol";
import {PositionToken} from "./PositionToken.sol";
import {PermissionedPositionToken} from "./PermissionedPositionToken.sol";
import {IPositionToken} from "./interfaces/IPositionToken.sol";
import {IPermissionedPositionToken} from "./interfaces/IPermissionedPositionToken.sol";


/**
 * @dev Factory contract to create position token clones
 */
contract PositionTokenFactory is IPositionTokenFactory {
    address private immutable _POSITION_TOKEN_IMPLEMENTATION;
    address private immutable _PERMISSIONED_POSITION_TOKEN_IMPLEMENTATION;

    constructor() payable {
        // Using payable to reduce deployment costs

        _POSITION_TOKEN_IMPLEMENTATION = address(new PositionToken());
        _PERMISSIONED_POSITION_TOKEN_IMPLEMENTATION = address(new PermissionedPositionToken());
    }

    function createPositionToken(
        string memory symbol_,
        uint256 poolId_,
        uint8 decimals_,
        address owner_,
        address permissionedERC721Token_
    ) external override returns (address) {
        
        address clone;
        
        // Initialize position token contract as implementation contract
        // doesn't have a constructor
        if (permissionedERC721Token_ == address(0)) {
            clone = Clones.clone(_POSITION_TOKEN_IMPLEMENTATION);
            IPositionToken(clone).initialize(
                symbol_,
                poolId_,
                decimals_,
                owner_
            );
        } else {
            clone = Clones.clone(_PERMISSIONED_POSITION_TOKEN_IMPLEMENTATION);
            IPermissionedPositionToken(clone).initialize(
                symbol_,
                poolId_,
                decimals_,
                owner_,
                permissionedERC721Token_
            );
        }
        
        return clone;
    }

    function positionTokenImplementation() external view override returns (address) {
        return _POSITION_TOKEN_IMPLEMENTATION;
    }

    function permissionedPositionTokenImplementation() external view override returns (address) {
        return _PERMISSIONED_POSITION_TOKEN_IMPLEMENTATION;
    }
}