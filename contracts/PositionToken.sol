// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {IPositionToken} from "./interfaces/IPositionToken.sol";

/**
 * @dev Implementation contract for position token clones
 */
contract PositionToken is IPositionToken, ERC20Upgradeable {

    bytes32 private _poolId;
    address private _owner;
    uint8 private _decimals;

    constructor() {
        /* @dev To prevent the implementation contract from being used, invoke the {_disableInitializers}
         * function in the constructor to automatically lock it when it is deployed.
         * For more information, refer to @openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol
         */
        _disableInitializers();
    }

    modifier onlyOwner() {
        require(
            _owner == msg.sender,
            "PositionToken: caller is not owner"
            );
        _;
    }

    function mint(
        address _recipient,
        uint256 _amount
        ) external override onlyOwner {
        _mint(_recipient, _amount);
    }

    function burn(
        address _redeemer,
        uint256 _amount
        ) external override onlyOwner {
        _burn(_redeemer, _amount);
    }

    function poolId() external view override returns (bytes32) {
        return _poolId;
    }

    function owner() external view override returns (address) {
        return _owner;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function initialize(
        string memory symbol_,
        bytes32 poolId_,
        uint8 decimals_,
        address owner_
    ) external override initializer {

        __ERC20_init(symbol_, symbol_);

        _owner = owner_;
        _poolId = poolId_;
        _decimals = decimals_;
    }
}
