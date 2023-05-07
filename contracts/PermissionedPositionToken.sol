// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IPermissionedPositionToken} from "./interfaces/IPermissionedPositionToken.sol";

contract PermissionedPositionToken is
    IPermissionedPositionToken,
    ERC20Upgradeable
{
    address private _permissionedERC721Token;
    bytes32 private _poolId;
    address private _owner;
    uint8 private _decimals;

    modifier onlyOwner() {
        require(_owner == msg.sender, "PositionToken: caller is not owner");
        _;
    }

    constructor() {
        /* @dev To prevent the implementation contract from being used, invoke the {_disableInitializers}
         * function in the constructor to automatically lock it when it is deployed.
         * For more information, refer to @openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol
         */
        _disableInitializers();
    }

    function initialize(
        string memory symbol_,
        bytes32 poolId_,
        uint8 decimals_,
        address owner_,
        address permissionedERC721Token_
    ) external override initializer {
        __ERC20_init(symbol_, symbol_);

        _owner = owner_;
        _poolId = poolId_;
        _decimals = decimals_;
        _permissionedERC721Token = permissionedERC721Token_;
    }

    function mint(address _recipient, uint256 _amount)
        external
        override
        onlyOwner
    {
        _mint(_recipient, _amount);
    }

    function burn(address _redeemer, uint256 _amount)
        external
        override
        onlyOwner
    {
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

    function permissionedERC721Token() public view override returns (address) {
        return _permissionedERC721Token;
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        super._beforeTokenTransfer(from, to, amount);

        if (to != address(0)) {
            require(
                from == address(0) || _validHolder(from),
                "PositionToken: invalid sender"
            );
            // 0 address is passed during burn and should be allowed as recipient
            require(_validHolder(to), "PositionToken: invalid recipient");
        }
    }

    function _validHolder(address _holder) private view returns (bool) {
        return IERC721(_permissionedERC721Token).balanceOf(_holder) > 0;
    }
}
