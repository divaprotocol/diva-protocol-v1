// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is Ownable, ERC20 {
    uint8 private tokenDecimals;

    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _totalSupply,
        address _recipient,
        uint8 _decimals
    ) ERC20(_name, _symbol) {
        _mint(_recipient, _totalSupply);
        tokenDecimals = _decimals;
    }

    function decimals() public view override returns (uint8) {
        return tokenDecimals;
    }
}
