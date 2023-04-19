// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract FakePositionToken is ERC20 {
    uint256 private _poolId;
    address private _owner;

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 poolId_,
        address owner_
    ) ERC20(name_, symbol_) {
        _owner = owner_;
        _poolId = poolId_;
    }

    modifier onlyOwner() {
        require(_owner == msg.sender, "PositionToken: caller is not owner");
        _;
    }

    function mint(address recipient, uint256 amount) external onlyOwner {
        _mint(recipient, amount);
    }

    function burn(address redeemer, uint256 amount) external onlyOwner {
        _burn(redeemer, amount);
    }

    function poolId() external view returns (uint256) {
        return _poolId;
    }

    function owner() external view returns (address) {
        return _owner;
    }
}
