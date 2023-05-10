// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    uint8 private _decimals;
    uint16 private _feePct; // 1% = 100, 0.01% = 1000

    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _totalSupply,
        address _recipient,
        uint8 decimals_,
        uint16 feePct_
    ) ERC20(_name, _symbol) {
        _mint(_recipient, _totalSupply);
        _decimals = decimals_;
        _feePct = feePct_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    // Override the OZ's internal `_transfer` function to implement a fee
    function _transfer(
        address _from,
        address _to,
        uint256 _amount
    ) internal virtual override {
        
        // Calculate fee if activated
        if (_feePct != 0) {
            uint256 _fee = _amount / uint256(_feePct);
            
            // Call the parent implementation of _transfer, subtracting the fee
            super._transfer(_from, _to, _amount - _fee);
            
            // Burn the fee by calling the parent implementation of _burn
            super._burn(_from, _fee);
        } else {
            super._transfer(_from, _to, _amount);
        }
    }

    function setFee(uint16 _newFeePct) external {
        _feePct = _newFeePct;
    }

    function getFee() external view returns (uint16) {
        return _feePct;
    }
}
