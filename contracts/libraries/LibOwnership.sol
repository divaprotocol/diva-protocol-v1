// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {IDIVAOwnershipShared} from "../interfaces/IDIVAOwnershipShared.sol";
import {LibDiamondStorage} from "./LibDiamondStorage.sol";

// Thrown if `msg.sender` is not contract owner
error NotContractOwner(address _user, address _contractOwner);

library LibOwnership {
    function _contractOwner() internal view returns (address contractOwner_) {
        LibDiamondStorage.DiamondStorage storage ds = LibDiamondStorage
            ._diamondStorage();
        contractOwner_ = IDIVAOwnershipShared(ds.ownershipContract)
            .getCurrentOwner();
    }

    function _ownershipContract()
        internal
        view
        returns (address ownershipContract_)
    {
        LibDiamondStorage.DiamondStorage storage ds = LibDiamondStorage
            ._diamondStorage();
        ownershipContract_ = ds.ownershipContract;
    }

    function _enforceIsContractOwner() internal view {
        address _owner = _contractOwner();
        if (msg.sender != _owner) revert NotContractOwner(msg.sender, _owner);
    }
}
