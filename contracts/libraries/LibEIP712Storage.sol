// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

library LibEIP712Storage {
    // The hash for eip712 storage position, which is:
    // keccak256("diamond.standard.eip712.storage")
    bytes32 constant EIP712_STORAGE_POSITION =
        0x8605704e9bc6b9116b88d76d80e5d463ac2b851042de18aae713a2e1c43f2fe5;

    struct EIP712Storage {
        // EIP712 domain separator (set in constructor in Diamond.sol)
        bytes32 EIP712_DOMAIN_SEPARATOR;
        // Chain id (set in constructor in Diamond.sol)
        uint256 CACHED_CHAIN_ID;
        // Mapping to store created poolId with typedOfferHash
        mapping(bytes32 => uint256) typedOfferHashToPoolId;
        // Mapping to store takerFilled amount with typedOfferHash
        mapping(bytes32 => uint256) typedOfferHashToTakerFilledAmount;
    }

    function _eip712Storage() internal pure returns (EIP712Storage storage es) {
        bytes32 position = EIP712_STORAGE_POSITION;
        assembly {
            es.slot := position
        }
    }
}
