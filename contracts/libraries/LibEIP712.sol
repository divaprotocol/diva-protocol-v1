// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LibEIP712Storage} from "./LibEIP712Storage.sol";
import {LibDIVA} from "./LibDIVA.sol";
import {LibDIVAStorage} from "./LibDIVAStorage.sol";

// Thrown in `fillOfferCreateContingentPool` /  `fillOfferAddLiquidity` / `fillOfferRemoveLiquidity`
// if user tries to fill an amount smaller than the minimum provided in the offer
error TakerFillAmountSmallerMinimum();

// Thrown in `fillOfferCreateContingentPool` /  `fillOfferAddLiquidity` / `fillOfferRemoveLiquidity`
// if the provided `takerFillAmount` exceeds the remaining fillable amount
error TakerFillAmountExceedsFillableAmount();

// Thrown in `cancelOfferCreateContingentPool` / `cancelOfferAddLiquidity` / `cancelOfferRemoveLiquidity`
// if `msg.sender` is not equal to maker
error MsgSenderNotMaker();

// Thrown in `fillOfferCreateContingentPool` /  `fillOfferAddLiquidity` / `fillOfferRemoveLiquidity`
// if the signed offer and the provided signature do not match
error InvalidSignature();

// Thrown in `fillOfferCreateContingentPool` / `fillOfferAddLiquidity` / `fillOfferRemoveLiquidity`
// if offer is not fillable due to being invalid, cancelled, already filled or expired
error OfferInvalidCancelledFilledOrExpired();

// Thrown in `fillOfferCreateContingentPool` / `fillOfferAddLiquidity` / `fillOfferRemoveLiquidity`
// if offer is reserved for a different taker
error UnauthorizedTaker();

library LibEIP712 {
    using SafeERC20 for IERC20Metadata;

    // Enum for offer status
    enum OfferStatus {
        INVALID,
        CANCELLED,
        FILLED,
        EXPIRED,
        FILLABLE
    }

    // Signature structure
    struct Signature {
        uint8 v; // EC Signature data
        bytes32 r; // EC Signature data
        bytes32 s; // EC Signature data
    }

    // Argument for `fillOfferCreateContingentPool` function.
    struct OfferCreateContingentPool {
        address maker; // Signer/creator address of the offer
        address taker; // Address that is allowed to fill the offer; if zero address, then everyone can fill the offer
        uint256 makerCollateralAmount; // Collateral amount to be contributed to the contingent pool by maker
        uint256 takerCollateralAmount; // Collateral amount to be contributed to the contingent pool by taker
        bool makerIsLong; // 1 [0] if maker shall receive the long [short] position
        uint256 offerExpiry; // Offer expiration time
        uint256 minimumTakerFillAmount; // Minimum taker fill amount on first fill
        string referenceAsset; // Parameter for `createContingentPool`
        uint96 expiryTime; // Parameter for `createContingentPool`
        uint256 floor; // Parameter for `createContingentPool`
        uint256 inflection; // Parameter for `createContingentPool`
        uint256 cap; // Parameter for `createContingentPool`
        uint256 gradient; // Parameter for `createContingentPool`
        address collateralToken; // Parameter for `createContingentPool`
        address dataProvider; // Parameter for `createContingentPool`
        uint256 capacity; // Parameter for `createContingentPool`
        address permissionedERC721Token; // // Parameter for `createContingentPool`
        uint256 salt; // Arbitrary number to enforce uniqueness of the offer hash
    }

    // Argument for `fillOfferAddLiquidity` function.
    struct OfferAddLiquidity {
        address maker; // Signer/creator address of the offer
        address taker; // Address that is allowed to fill the offer; if zero address, then everyone can fill the offer
        uint256 makerCollateralAmount; // Collateral amount to be contributed to the contingent pool by maker
        uint256 takerCollateralAmount; // Collateral amount to be contributed to the contingent pool by taker
        bool makerIsLong; // 1 [0] if maker shall receive the long [short] position
        uint256 offerExpiry; // Offer expiration time
        uint256 minimumTakerFillAmount; // Minimum taker fill amount on first fill
        bytes32 poolId; // Id of an existing pool
        uint256 salt; // Arbitrary number to enforce uniqueness of the offer hash
    }

    // Argument for `fillOfferRemoveLiquidity` function
    struct OfferRemoveLiquidity {
        address maker;
        address taker;
        uint256 positionTokenAmount; // Position token amount returned by taker and maker is equal
        uint256 makerCollateralAmount; // Collateral amount to be returned to maker. Amount returned to taker is positionTokenAmount - makerCollateralAmount
        bool makerIsLong; // 1 [0] if maker returns long [short] position token
        uint256 offerExpiry; // Offer expiration time
        uint256 minimumTakerFillAmount; // Minimum position token fill amount on first fill
        bytes32 poolId; // Id of an existing pool
        uint256 salt; // Arbitrary number to enforce uniqueness of the offer hash
    }

    // Offer info structure
    struct OfferInfo {
        bytes32 typedOfferHash; // Offer hash
        OfferStatus status; // Offer status: 0: INVALID, 1: CANCELLED, 2: FILLED, 3: EXPIRED, 4: FILLABLE
        uint256 takerFilledAmount; // Already filled taker amount
    }

    // The type hash for eip712 domain is:
    // keccak256(
    //     abi.encodePacked(
    //         "EIP712Domain(",
    //         "string name,",
    //         "string version,",
    //         "uint256 chainId,",
    //         "address verifyingContract",
    //         ")"
    //     )
    // )
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH =
        0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f;

    // The type hash for create pool offer is:
    // keccak256(
    //     abi.encodePacked(
    //         "OfferCreateContingentPool(",
    //         "address maker,"
    //         "address taker,"
    //         "uint256 makerCollateralAmount,"
    //         "uint256 takerCollateralAmount,"
    //         "bool makerIsLong,"
    //         "uint256 offerExpiry,"
    //         "uint256 minimumTakerFillAmount,"
    //         "string referenceAsset,"
    //         "uint96 expiryTime,"
    //         "uint256 floor,"
    //         "uint256 inflection,"
    //         "uint256 cap,"
    //         "uint256 gradient,"
    //         "address collateralToken,"
    //         "address dataProvider,"
    //         "uint256 capacity,"
    //         "address permissionedERC721Token,"
    //         "uint256 salt)"
    //     )
    // )
    bytes32 internal constant CREATE_POOL_OFFER_TYPEHASH =
        0xc628170201b0ce3a1a2f5407dc30d69b6cc12028198419cc3aa66a1ccbdabf96;

    // The type hash for add liquidity offer is:
    // keccak256(
    //     abi.encodePacked(
    //         "OfferAddLiquidity(",
    //         "address maker,"
    //         "address taker,"
    //         "uint256 makerCollateralAmount,"
    //         "uint256 takerCollateralAmount,"
    //         "bool makerIsLong,"
    //         "uint256 offerExpiry,"
    //         "uint256 minimumTakerFillAmount,"
    //         "bytes32 poolId,"
    //         "uint256 salt)"
    //     )
    // )
    bytes32 internal constant ADD_LIQUIDITY_OFFER_TYPEHASH =
        0x18aa534f754a80ed0c17a2fc3cdb02cb2d5b8ab01f238e1cc28e91a3da224dd2;

    // The type hash for remove liquidity offer is:
    // keccak256(
    //     abi.encodePacked(
    //         "OfferRemoveLiquidity(",
    //         "address maker,"
    //         "address taker,"
    //         "uint256 positionTokenAmount,"
    //         "uint256 makerCollateralAmount,"
    //         "bool makerIsLong,"
    //         "uint256 offerExpiry,"
    //         "uint256 minimumTakerFillAmount,"
    //         "bytes32 poolId,"
    //         "uint256 salt)"
    //     )
    // )
    bytes32 internal constant REMOVE_LIQUIDITY_OFFER_TYPEHASH =
        0x0049fd2a622c7f3484cfd950f474c9ff0e7381945ea7dcfe603572a7fc388584;

    // Max int value of a uint256, used to flag cancelled offers.
    uint256 internal constant MAX_INT = ~uint256(0);

    uint256 private constant ADDRESS_MASK = (1 << 160) - 1;
    uint256 private constant UINT_96_MASK = (1 << 96) - 1;
    uint256 private constant UINT_8_MASK = (1 << 8) - 1;

    function _chainId() internal view returns (uint256 chainId) {
        chainId = block.chainid;
    }

    /**
     * Accept message hash and returns hash message in EIP712 compatible form
     * So that it can be used to recover signer from signature signed using EIP712 formatted data
     * https://eips.ethereum.org/EIPS/eip-712
     * "\\x19" makes the encoding deterministic
     * "\\x01" is the version byte to make it compatible to EIP-191
     */
    function _toTypedMessageHash(bytes32 _messageHash)
        internal
        view
        returns (bytes32 typedMessageHash)
    {
        // Get domain separator to use in assembly
        bytes32 _EIP712_DOMAIN_SEPARATOR = _getDomainSeparator();

        // Assembly for more efficient computing:
        // Inspired by https://github.com/0xProject/protocol/blob/1fa093be6490cac52dfc17c31cd9fe9ff47ccc5e/contracts/utils/contracts/src/LibEIP712.sol#L87
        // keccak256(
        //     abi.encodePacked(
        //         "\x19\x01",
        //         LibEIP712Storage._eip712Storage().EIP712_DOMAIN_SEPARATOR,
        //         _messageHash
        //     )
        // );
        assembly {
            // Load free memory pointer
            let mem := mload(0x40)

            mstore(
                mem,
                0x1901000000000000000000000000000000000000000000000000000000000000
            ) // EIP191 header
            mstore(add(mem, 0x02), _EIP712_DOMAIN_SEPARATOR) // EIP712 domain hash
            mstore(add(mem, 0x22), _messageHash) // Hash of struct

            // Compute hash
            typedMessageHash := keccak256(mem, 0x42)
        }
    }

    // Returns the domain separator for the current chain.
    function _getDomainSeparator() internal view returns (bytes32) {
        LibEIP712Storage.EIP712Storage storage es = LibEIP712Storage
            ._eip712Storage();
        if (_chainId() == es.CACHED_CHAIN_ID) {
            return es.EIP712_DOMAIN_SEPARATOR;
        } else {
            return _getDomainHash();
        }
    }

    function _getDomainHash() internal view returns (bytes32 domainHash) {
        string memory name = "DIVA Protocol";
        string memory version = "1";
        uint256 chainId = _chainId();
        address verifyingContract = address(this);

        // Assembly for more efficient computing:
        // Inspired by https://github.com/0xProject/protocol/blob/1fa093be6490cac52dfc17c31cd9fe9ff47ccc5e/contracts/utils/contracts/src/LibEIP712.sol#L61
        // keccak256(
        //     abi.encode(
        //         EIP712_DOMAIN_TYPEHASH,
        //         keccak256(bytes(name)),
        //         keccak256(bytes(version)),
        //         chainId,
        //         verifyingContract
        //     )
        // )

        assembly {
            // Calculate hashes of dynamic data
            let nameHash := keccak256(add(name, 0x20), mload(name))
            let versionHash := keccak256(add(version, 0x20), mload(version))

            // Load free memory pointer
            let mem := mload(0x40)

            // Store params in memory
            mstore(mem, EIP712_DOMAIN_TYPEHASH)
            mstore(add(mem, 0x20), nameHash)
            mstore(add(mem, 0x40), versionHash)
            mstore(add(mem, 0x60), chainId)
            mstore(add(mem, 0x80), and(ADDRESS_MASK, verifyingContract))

            // Compute hash
            domainHash := keccak256(mem, 0xA0)
        }
    }

    function _takerFilledAmount(bytes32 _typedOfferHash)
        internal
        view
        returns (uint256)
    {
        return
            LibEIP712Storage._eip712Storage().typedOfferHashToTakerFilledAmount[
                _typedOfferHash
            ];
    }

    function _min256(uint256 _a, uint256 _b)
        internal
        pure
        returns (uint256 min256)
    {
        min256 = _a < _b ? _a : _b;
    }

    /**
     * @notice Function to get info of create contingent pool offer.
     * @param _offerCreateContingentPool Struct containing the create pool offer details
     * @return offerInfo Struct of offer info
     */
    function _getOfferInfoCreateContingentPool(
        OfferCreateContingentPool calldata _offerCreateContingentPool
    ) internal view returns (OfferInfo memory offerInfo) {
        // Get typed offer hash with `_offerCreateContingentPool`
        offerInfo.typedOfferHash = _toTypedMessageHash(
            _getOfferHashCreateContingentPool(_offerCreateContingentPool)
        );

        // Get offer status and takerFilledAmount
        _populateCommonOfferInfoFields(
            offerInfo,
            _offerCreateContingentPool.takerCollateralAmount,
            _offerCreateContingentPool.offerExpiry
        );
    }

    // Return hash of create pool offer details
    function _getOfferHashCreateContingentPool(
        OfferCreateContingentPool memory _offerCreateContingentPool
    ) internal pure returns (bytes32 offerHashCreateContingentPool) {
        // Assembly for more efficient computing:
        // Inspired by https://github.com/0xProject/protocol/blob/1fa093be6490cac52dfc17c31cd9fe9ff47ccc5e/contracts/zero-ex/contracts/src/features/libs/LibNativeOrder.sol#L179
        // keccak256(
        //     abi.encode(
        //         CREATE_POOL_OFFER_TYPEHASH,
        //         _offerCreateContingentPool.maker,
        //         _offerCreateContingentPool.taker,
        //         _offerCreateContingentPool.makerCollateralAmount,
        //         _offerCreateContingentPool.takerCollateralAmount,
        //         _offerCreateContingentPool.makerIsLong,
        //         _offerCreateContingentPool.offerExpiry,
        //         _offerCreateContingentPool.minimumTakerFillAmount,
        //         keccak256(bytes(_offerCreateContingentPool.referenceAsset)),
        //         _offerCreateContingentPool.expiryTime,
        //         _offerCreateContingentPool.floor,
        //         _offerCreateContingentPool.inflection,
        //         _offerCreateContingentPool.cap,
        //         _offerCreateContingentPool.gradient,
        //         _offerCreateContingentPool.collateralToken,
        //         _offerCreateContingentPool.dataProvider,
        //         _offerCreateContingentPool.capacity,
        //         _offerCreateContingentPool.permissionedERC721Token,
        //         _offerCreateContingentPool.salt
        //     )
        // )
        assembly {
            let mem := mload(0x40)
            mstore(mem, CREATE_POOL_OFFER_TYPEHASH)
            // _offerCreateContingentPool.maker;
            mstore(
                add(mem, 0x20),
                and(ADDRESS_MASK, mload(_offerCreateContingentPool))
            )
            // _offerCreateContingentPool.taker;
            mstore(
                add(mem, 0x40),
                and(ADDRESS_MASK, mload(add(_offerCreateContingentPool, 0x20)))
            )
            // _offerCreateContingentPool.makerCollateralAmount;
            mstore(add(mem, 0x60), mload(add(_offerCreateContingentPool, 0x40)))
            // _offerCreateContingentPool.takerCollateralAmount;
            mstore(add(mem, 0x80), mload(add(_offerCreateContingentPool, 0x60)))
            // _offerCreateContingentPool.makerIsLong;
            mstore(
                add(mem, 0xA0),
                and(UINT_8_MASK, mload(add(_offerCreateContingentPool, 0x80)))
            )
            // _offerCreateContingentPool.offerExpiry;
            mstore(add(mem, 0xC0), mload(add(_offerCreateContingentPool, 0xA0)))
            // _offerCreateContingentPool.minimumTakerFillAmount;
            mstore(add(mem, 0xE0), mload(add(_offerCreateContingentPool, 0xC0)))
            // _offerCreateContingentPool.referenceAsset;
            let referenceAsset := mload(add(_offerCreateContingentPool, 0xE0))
            mstore(
                add(mem, 0x100),
                keccak256(add(referenceAsset, 0x20), mload(referenceAsset))
            )
            // _offerCreateContingentPool.expiryTime;
            mstore(
                add(mem, 0x120),
                and(UINT_96_MASK, mload(add(_offerCreateContingentPool, 0x100)))
            )
            // _offerCreateContingentPool.floor;
            mstore(
                add(mem, 0x140),
                mload(add(_offerCreateContingentPool, 0x120))
            )
            // _offerCreateContingentPool.inflection;
            mstore(
                add(mem, 0x160),
                mload(add(_offerCreateContingentPool, 0x140))
            )
            // _offerCreateContingentPool.cap;
            mstore(
                add(mem, 0x180),
                mload(add(_offerCreateContingentPool, 0x160))
            )
            // _offerCreateContingentPool.gradient;
            mstore(
                add(mem, 0x1A0),
                mload(add(_offerCreateContingentPool, 0x180))
            )
            // _offerCreateContingentPool.collateralToken;
            mstore(
                add(mem, 0x1C0),
                and(ADDRESS_MASK, mload(add(_offerCreateContingentPool, 0x1A0)))
            )
            // _offerCreateContingentPool.dataProvider;
            mstore(
                add(mem, 0x1E0),
                and(ADDRESS_MASK, mload(add(_offerCreateContingentPool, 0x1C0)))
            )
            // _offerCreateContingentPool.capacity;
            mstore(
                add(mem, 0x200),
                mload(add(_offerCreateContingentPool, 0x1E0))
            )
            // _offerCreateContingentPool.permissionedERC721Token;
            mstore(
                add(mem, 0x220),
                and(ADDRESS_MASK, mload(add(_offerCreateContingentPool, 0x200)))
            )
            // _offerCreateContingentPool.salt;
            mstore(
                add(mem, 0x240),
                mload(add(_offerCreateContingentPool, 0x220))
            )
            offerHashCreateContingentPool := keccak256(mem, 0x260)
        }
    }

    /**
     * @dev Function to get offer status and taker filled amount for offerInfo.
     * @param _offerInfo Offer info struct pre-populated with offer hash.
     * @param _takerAmount` Taker collateral amount in `fillOfferCreateContingentPool`
     * and `fillOfferAddLiquidity` and position token amount in `fillOfferRemoveLiquidity`.
     * @param _offerExpiry Offer expiry.
     */
    function _populateCommonOfferInfoFields(
        OfferInfo memory _offerInfo,
        uint256 _takerAmount,
        uint256 _offerExpiry
    ) internal view {
        // Get the already filled taker amount for the given offer hash
        _offerInfo.takerFilledAmount = _takerFilledAmount(
            _offerInfo.typedOfferHash
        );

        // Check whether offer has non-zero value for positionTokenAmount (in remove) / takerCollateralAmount
        // (in add/create). An offer with takerCollateralAmount = 0, i.e. a donation offered by maker, can be
        // implemented via `createContingentPool`/`addLiquidity` directly by setting the donee as
        // the `longRecipient` or `shortRecipient`.
        if (_takerAmount == 0) {
            _offerInfo.status = OfferStatus.INVALID;
            return;
        }

        // Check whether offer is cancelled (taker filled amount is
        // set at MAX_INT if an offer is cancelled). It is acknowledged that
        // status will show CANCELLED if takerCollateralAmount = MAX_INT and
        // takerFilledAmount = MAX_INT. This mislabelling is not an issue
        // as all status checks reference FILLABLE status.
        if (_offerInfo.takerFilledAmount == MAX_INT) {
            _offerInfo.status = OfferStatus.CANCELLED;
            return;
        }

        // Check whether offer has already been filled
        if (_offerInfo.takerFilledAmount >= _takerAmount) {
            _offerInfo.status = OfferStatus.FILLED;
            return;
        }

        // Check for expiration
        if (_offerExpiry <= block.timestamp) {
            _offerInfo.status = OfferStatus.EXPIRED;
            return;
        }

        // Set offer status to fillable if none of the above is true
        _offerInfo.status = OfferStatus.FILLABLE;
    }

    /**
     * @dev Function to calculate maker fill amount given `_takerFillAmount`
     * @param _makerCollateralAmount Maker collateral amount as specified in the offer
     * @param _takerCollateralAmount taker collateral amount as specified in the offer
     * @param _takerFillAmount Taker collateral amount that the user attempts to fill
     * @return makerFillAmount Collateral amount to be contributed by the maker
     */
    function _calcMakerFillAmountAndPoolFillAmount(
        uint256 _makerCollateralAmount,
        uint256 _takerCollateralAmount,
        uint256 _takerFillAmount
    ) internal pure returns (uint256 makerFillAmount) {
        // Calc maker fill amount. An offer with `_takerCollateralAmount = 0`
        // is considered invalid and throws before it gets here (see `_checkFillableAndSignature`)
        makerFillAmount =
            (_takerFillAmount * _makerCollateralAmount) /
            _takerCollateralAmount;
    }

    /**
     * @dev Function to validate that a given signature belongs to a given offer hash
     * @param _typedOfferHash Offer hash
     * @param _signature Offer signature
     * @param _maker Maker address as specified in the offer
     */
    function _isSignatureValid(
        bytes32 _typedOfferHash,
        Signature memory _signature,
        address _maker
    ) internal pure returns (bool isSignatureValid) {
        // Recover offerMaker address with `_typedOfferHash` and `_signature` using tryRecover function from ECDSA library
        address recoveredOfferMaker = ECDSA.recover(
            _typedOfferHash,
            _signature.v,
            _signature.r,
            _signature.s
        );

        // Check that recoveredOfferMaker is not zero address
        if (recoveredOfferMaker == address(0)) {
            isSignatureValid = false;
        }
        // Check that maker address is equal to recoveredOfferMaker
        else {
            isSignatureValid = _maker == recoveredOfferMaker;
        }
    }

    /**
     * @dev Function to calculate actual taker fillable amount taking into account
     * a makers collateral token allowance and balance. Used inside
     * `getOfferRelevantStateCreateContingentPool` and `getOfferRelevantStateAddLiquidity`.
     * @param _maker Maker address as specified in the offer
     * @param _collateralToken Collateral token address as specified in the offer
     * @param _makerCollateralAmount Collateral amount to be contributed by maker
     * as specified in the offer
     * @param _takerCollateralAmount Collateral amount to be contributed by taker
     * as specified in the offer
     * @param _offerInfo Struct containing the offer hash, status and taker filled amount
     * @return actualTakerFillableAmount Actual fillable taker amount
     */
    function _getActualTakerFillableAmount(
        address _maker,
        address _collateralToken,
        uint256 _makerCollateralAmount,
        uint256 _takerCollateralAmount,
        OfferInfo memory _offerInfo
    ) internal view returns (uint256 actualTakerFillableAmount) {
        if (_offerInfo.status != OfferStatus.FILLABLE) {
            // Not fillable. This also includes the case where `_takerCollateralAmount` = 0
            return 0;
        }

        if (_makerCollateralAmount == 0) {
            // Use case: donation request by maker
            return (_takerCollateralAmount - _offerInfo.takerFilledAmount);
        }

        // Get the fillable maker amount based on the offer quantities and
        // previously filled amount
        uint256 makerFillableAmount = ((_takerCollateralAmount -
            _offerInfo.takerFilledAmount) * _makerCollateralAmount) /
            _takerCollateralAmount;

        // Clamp it to the maker fillable amount we can spend on behalf of the
        // maker
        makerFillableAmount = _min256(
            makerFillableAmount,
            _min256(
                IERC20(_collateralToken).allowance(_maker, address(this)),
                IERC20(_collateralToken).balanceOf(_maker)
            )
        );

        // Convert to taker fillable amount.
        // Division computes `floor(a / b)`. We use the identity (a, b integer):
        // ceil(a / b) = floor((a + b - 1) / b)
        // To implement `ceil(a / b)` using safeDiv.
        actualTakerFillableAmount =
            (makerFillableAmount *
                _takerCollateralAmount +
                _makerCollateralAmount -
                1) /
            _makerCollateralAmount;
    }

    /**
     * @dev Function to validate that `msg.sender` is equal to the maker
     * specified in the offer
     * @param _offerMaker Offer maker address
     */
    function _validateMessageSenderIsOfferMaker(address _offerMaker)
        internal
        view
    {
        // Check that `msg.sender` is `_offerMaker`
        if (msg.sender != _offerMaker) revert MsgSenderNotMaker();
    }

    /**
     * @dev Function to check offer fillability and signature validity
     * @param _signature Offer signature
     * @param _offerMaker Offer maker address
     * @param _offerTaker Offer taker address
     * @param _offerInfo Struct containing the offer hash, status and taker filled amount
     */
    function _checkFillableAndSignature(
        Signature calldata _signature,
        address _offerMaker,
        address _offerTaker,
        OfferInfo memory _offerInfo
    ) internal view {
        // Check that signature is valid
        if (
            !_isSignatureValid(
                _offerInfo.typedOfferHash,
                _signature,
                _offerMaker
            )
        ) revert InvalidSignature();

        // Must be fillable.
        if (_offerInfo.status != OfferStatus.FILLABLE)
            revert OfferInvalidCancelledFilledOrExpired();

        // Check that `msg.sender` is equal to `_offerTaker` or zero address in offer
        if (msg.sender != _offerTaker && _offerTaker != address(0))
            revert UnauthorizedTaker();
    }

    /**
     * @dev Function to validate that `_takerFillAmount` is greater than the minimum
     * and the implied overall taker filled amount does not exceed taker amount.
     * Increases `takerFilledAmount` after successfully passing the checks.
     * @param _takerAmount Taker amount as specified in the offer (collateral amount
     * in `fillOfferCreateContingentPool` and `fillOfferAddLiquidity` and position token amount
     * in `fillOfferRemoveLiquidity`).
     * @param _minimumTakerFillAmount Minimum taker fill amount as specified in the offer
     * @param _takerFillAmount Taker collateral amount that the user attempts to fill
     * @param _typedOfferHash Offer hash
     */
    function _validateTakerFillAmountAndIncreaseTakerFilledAmount(
        uint256 _takerAmount,
        uint256 _minimumTakerFillAmount,
        uint256 _takerFillAmount,
        bytes32 _typedOfferHash
    ) internal {
        // Get reference to relevant storage slot
        LibEIP712Storage.EIP712Storage storage es = LibEIP712Storage
            ._eip712Storage();

        // Check that `_takerFillAmount` is not smaller than `_minimumTakerFillAmount`.
        // This check is only relevant on first fill.
        if (
            _takerFillAmount +
                es.typedOfferHashToTakerFilledAmount[_typedOfferHash] <
            _minimumTakerFillAmount
        ) revert TakerFillAmountSmallerMinimum();

        // Check that `_takerFillAmount` is not higher than remaining fillable taker amount
        if (
            _takerFillAmount >
            _takerAmount - es.typedOfferHashToTakerFilledAmount[_typedOfferHash]
        ) revert TakerFillAmountExceedsFillableAmount();

        // Increase taker filled amount and store it in a mapping under the corresponding
        // offer hash
        es.typedOfferHashToTakerFilledAmount[
            _typedOfferHash
        ] += _takerFillAmount;
    }

    /**
     * @dev Function to fill an add liquidity offer. Signature validation is done
     * in the main function (`fillAddLiquidityOffer` and `fillOfferCreateContingentPool`)
     * prior to calling this function.
     * In `fillOfferCreateContingentPool`, the original create contingent pool offer
     * is used for signature validation.
     * @param _offerAddLiquidity Struct containing the add liquidity offer details
     * @param _takerFillAmount Taker collateral amount that the taker attempts to fill
     * @param _typedOfferHash Offer hash
     */
    function _fillOfferAddLiquidityLib(
        OfferAddLiquidity memory _offerAddLiquidity,
        uint256 _takerFillAmount,
        bytes32 _typedOfferHash
    ) internal {
        // Validate taker fill amount and increase taker filled amount
        _validateTakerFillAmountAndIncreaseTakerFilledAmount(
            _offerAddLiquidity.takerCollateralAmount,
            _offerAddLiquidity.minimumTakerFillAmount,
            _takerFillAmount,
            _typedOfferHash
        );

        // Calc maker fill amount
        uint256 _makerFillAmount = _calcMakerFillAmountAndPoolFillAmount(
            _offerAddLiquidity.makerCollateralAmount,
            _offerAddLiquidity.takerCollateralAmount,
            _takerFillAmount
        );

        // Get pool params using `poolId` specified in `_offerAddLiquidity`
        LibDIVAStorage.PoolStorage storage ps = LibDIVAStorage._poolStorage();
        LibDIVAStorage.Pool storage _pool = ps.pools[_offerAddLiquidity.poolId];

        // Check whether addition of liquidity is still possible. Reverts if pool expired
        // or new collateral balance exceeds pool capacity
        LibDIVA._checkAddLiquidityAllowed(
            _pool,
            _makerFillAmount + _takerFillAmount
        );

        // Transfer approved collateral token from maker and taker and mint position tokens to them
        LibDIVA._addLiquidityLib(
            LibDIVA.AddLiquidityParams({
                poolId: _offerAddLiquidity.poolId,
                collateralAmountMsgSender: _takerFillAmount,
                collateralAmountMaker: _makerFillAmount,
                maker: _offerAddLiquidity.maker,
                longRecipient: _offerAddLiquidity.makerIsLong
                    ? _offerAddLiquidity.maker
                    : msg.sender,
                shortRecipient: _offerAddLiquidity.makerIsLong
                    ? msg.sender
                    : _offerAddLiquidity.maker
            })
        );
    }

    /**
     * @notice Function to get info of add liquidity offer.
     * @param _offerAddLiquidity Struct containing the add liquidity offer details
     * @return offerInfo Struct of offer info
     */
    function _getOfferInfoAddLiquidity(
        OfferAddLiquidity calldata _offerAddLiquidity
    ) internal view returns (OfferInfo memory offerInfo) {
        // Get typed offer hash with `_offerAddLiquidity`
        offerInfo.typedOfferHash = _toTypedMessageHash(
            _getOfferHashAddLiquidity(_offerAddLiquidity)
        );

        // Get offer status and takerFilledAmount
        _populateCommonOfferInfoFields(
            offerInfo,
            _offerAddLiquidity.takerCollateralAmount,
            _offerAddLiquidity.offerExpiry
        );
    }

    // Return hash of add liquidity offer details
    function _getOfferHashAddLiquidity(
        OfferAddLiquidity memory _offerAddLiquidity
    ) internal pure returns (bytes32 offerHashAddLiquidity) {
        // Assembly for more efficient computing:
        // Inspired by https://github.com/0xProject/protocol/blob/1fa093be6490cac52dfc17c31cd9fe9ff47ccc5e/contracts/zero-ex/contracts/src/features/libs/LibNativeOrder.sol#L179
        // keccak256(
        //     abi.encode(
        //         ADD_LIQUIDITY_OFFER_TYPEHASH,
        //         _offerAddLiquidity.maker,
        //         _offerAddLiquidity.taker,
        //         _offerAddLiquidity.makerCollateralAmount,
        //         _offerAddLiquidity.takerCollateralAmount,
        //         _offerAddLiquidity.makerIsLong,
        //         _offerAddLiquidity.offerExpiry,
        //         _offerAddLiquidity.minimumTakerFillAmount,
        //         _offerAddLiquidity.poolId,
        //         _offerAddLiquidity.salt
        //     )
        // )
        assembly {
            let mem := mload(0x40)
            mstore(mem, ADD_LIQUIDITY_OFFER_TYPEHASH)
            // _offerAddLiquidity.maker;
            mstore(add(mem, 0x20), and(ADDRESS_MASK, mload(_offerAddLiquidity)))
            // _offerAddLiquidity.taker;
            mstore(
                add(mem, 0x40),
                and(ADDRESS_MASK, mload(add(_offerAddLiquidity, 0x20)))
            )
            // _offerAddLiquidity.makerCollateralAmount;
            mstore(add(mem, 0x60), mload(add(_offerAddLiquidity, 0x40)))
            // _offerAddLiquidity.takerCollateralAmount;
            mstore(add(mem, 0x80), mload(add(_offerAddLiquidity, 0x60)))
            // _offerAddLiquidity.makerIsLong;
            mstore(
                add(mem, 0xA0),
                and(UINT_8_MASK, mload(add(_offerAddLiquidity, 0x80)))
            )
            // _offerAddLiquidity.offerExpiry;
            mstore(add(mem, 0xC0), mload(add(_offerAddLiquidity, 0xA0)))
            // _offerAddLiquidity.minimumTakerFillAmount;
            mstore(add(mem, 0xE0), mload(add(_offerAddLiquidity, 0xC0)))
            // _offerAddLiquidity.poolId;
            mstore(add(mem, 0x100), mload(add(_offerAddLiquidity, 0xE0)))
            // _offerAddLiquidity.salt;
            mstore(add(mem, 0x120), mload(add(_offerAddLiquidity, 0x100)))
            offerHashAddLiquidity := keccak256(mem, 0x140)
        }
    }

    /**
     * @dev Function to fill a remove liquidity offer. Signature validation is done
     * in the main function (`fillRemoveLiquidityOffer`) prior to calling this function.
     * @param _offerRemoveLiquidity Struct containing the remove liquidity offer details
     * @param _takerFillAmount Position token amount that the taker attempts to fill
     * @param _typedOfferHash Offer hash
     */
    function _fillOfferRemoveLiquidityLib(
        OfferRemoveLiquidity memory _offerRemoveLiquidity,
        uint256 _takerFillAmount,
        bytes32 _typedOfferHash
    ) internal {
        // Validate taker fill amount and increase taker filled amount
        _validateTakerFillAmountAndIncreaseTakerFilledAmount(
            _offerRemoveLiquidity.positionTokenAmount,
            _offerRemoveLiquidity.minimumTakerFillAmount,
            _takerFillAmount,
            _typedOfferHash
        );

        // Get pool params using `poolId` specified in `_offerRemoveLiquidity`
        LibDIVAStorage.PoolStorage storage ps = LibDIVAStorage._poolStorage();
        LibDIVAStorage.Pool storage _pool = ps.pools[
            _offerRemoveLiquidity.poolId
        ];

        // Get the total collateral amount to return to maker and taker net of fees
        uint256 _collateralAmountRemovedNet = LibDIVA._removeLiquidityLib(
            LibDIVA.RemoveLiquidityParams({
                poolId: _offerRemoveLiquidity.poolId,
                amount: _takerFillAmount,
                longTokenHolder: _offerRemoveLiquidity.makerIsLong
                    ? _offerRemoveLiquidity.maker
                    : msg.sender,
                shortTokenHolder: _offerRemoveLiquidity.makerIsLong
                    ? msg.sender
                    : _offerRemoveLiquidity.maker
            })
        );

        // It is important to calculate the taker amount first here to prevent a scenario where
        // the taker receives all the collateral by filling small amounts as the result of round-down in
        // Solidity math operations
        uint256 _collateralAmountRemovedNetTaker = (_collateralAmountRemovedNet *
                (_offerRemoveLiquidity.positionTokenAmount - _offerRemoveLiquidity.makerCollateralAmount)) /
                (_offerRemoveLiquidity.positionTokenAmount);

        // Return collateral to taker
        LibDIVA._returnCollateral(
            _pool,
            msg.sender,
            _collateralAmountRemovedNetTaker
        );

        // Return collateral to maker
        LibDIVA._returnCollateral(
            _pool,
            _offerRemoveLiquidity.maker,
            _collateralAmountRemovedNet - _collateralAmountRemovedNetTaker
        );
    }

    /**
     * @notice Function to get info of remove liquidity offer.
     * @param _offerRemoveLiquidity Struct containing the remove liquidity offer details
     * @return offerInfo Struct of offer info
     */
    function _getOfferInfoRemoveLiquidity(
        OfferRemoveLiquidity calldata _offerRemoveLiquidity
    ) internal view returns (OfferInfo memory offerInfo) {
        // Get typed offer hash with `_offerRemoveLiquidity`
        offerInfo.typedOfferHash = _toTypedMessageHash(
            _getOfferHashRemoveLiquidity(_offerRemoveLiquidity)
        );

        // Invalidate remove liquidity offers where makerCollateralAmount > positionTokenAmount
        if (
            _offerRemoveLiquidity.makerCollateralAmount >
            _offerRemoveLiquidity.positionTokenAmount
        ) {
            offerInfo.status = OfferStatus.INVALID;
            // offerInfo.takerFilledAmount = 0; Not necesssary to set explicitly as it's automatically initialized to zero
            return offerInfo;
        }

        // Get offer status and takerFilledAmount
        _populateCommonOfferInfoFields(
            offerInfo,
            _offerRemoveLiquidity.positionTokenAmount,
            _offerRemoveLiquidity.offerExpiry
        );
    }

    // Return hash of remove liquidity offer details
    function _getOfferHashRemoveLiquidity(
        OfferRemoveLiquidity memory _offerRemoveLiquidity
    ) internal pure returns (bytes32 offerHashRemoveLiquidity) {
        // Assembly for more efficient computing:
        // Inspired by https://github.com/0xProject/protocol/blob/1fa093be6490cac52dfc17c31cd9fe9ff47ccc5e/contracts/zero-ex/contracts/src/features/libs/LibNativeOrder.sol#L179
        // keccak256(
        //     abi.encode(
        //         REMOVE_LIQUIDITY_OFFER_TYPEHASH,
        //         _offerRemoveLiquidity.maker,
        //         _offerRemoveLiquidity.taker,
        //         _offerRemoveLiquidity.positionTokenAmount,
        //         _offerRemoveLiquidity.makerCollateralAmount,
        //         _offerRemoveLiquidity.makerIsLong,
        //         _offerRemoveLiquidity.offerExpiry,
        //         _offerRemoveLiquidity.minimumTakerFillAmount,
        //         _offerRemoveLiquidity.poolId,
        //         _offerRemoveLiquidity.salt
        //     )
        // )
        assembly {
            let mem := mload(0x40)
            mstore(mem, REMOVE_LIQUIDITY_OFFER_TYPEHASH)
            // _offerRemoveLiquidity.maker;
            mstore(
                add(mem, 0x20),
                and(ADDRESS_MASK, mload(_offerRemoveLiquidity))
            )
            // _offerRemoveLiquidity.taker;
            mstore(
                add(mem, 0x40),
                and(ADDRESS_MASK, mload(add(_offerRemoveLiquidity, 0x20)))
            )
            // _offerRemoveLiquidity.positionTokenAmount;
            mstore(add(mem, 0x60), mload(add(_offerRemoveLiquidity, 0x40)))
            // _offerRemoveLiquidity.makerCollateralAmount;
            mstore(add(mem, 0x80), mload(add(_offerRemoveLiquidity, 0x60)))
            // _offerRemoveLiquidity.makerIsLong;
            mstore(
                add(mem, 0xA0),
                and(UINT_8_MASK, mload(add(_offerRemoveLiquidity, 0x80)))
            )
            // _offerRemoveLiquidity.offerExpiry;
            mstore(add(mem, 0xC0), mload(add(_offerRemoveLiquidity, 0xA0)))
            // _offerRemoveLiquidity.minimumTakerFillAmount;
            mstore(add(mem, 0xE0), mload(add(_offerRemoveLiquidity, 0xC0)))
            // _offerRemoveLiquidity.poolId;
            mstore(add(mem, 0x100), mload(add(_offerRemoveLiquidity, 0xE0)))
            // _offerRemoveLiquidity.salt;
            mstore(add(mem, 0x120), mload(add(_offerRemoveLiquidity, 0x100)))
            offerHashRemoveLiquidity := keccak256(mem, 0x140)
        }
    }

    /**
     * @dev Function to receive information on the fillability of a create contingent
     * pool offer and its validity in terms of signature and input parameters
     * for `createContingentPool` function
     * @param _offerCreateContingentPool Struct containing the create contingent pool
     * offer details
     * @param _signature Offer signature
     */
    function _getOfferRelevantStateCreateContingentPool(
        OfferCreateContingentPool calldata _offerCreateContingentPool,
        Signature calldata _signature
    )
        internal
        view
        returns (
            OfferInfo memory offerInfo,
            uint256 actualTakerFillableAmount,
            bool isSignatureValid,
            bool isValidInputParamsCreateContingentPool
        )
    {
        // Get offer info
        offerInfo = _getOfferInfoCreateContingentPool(
            _offerCreateContingentPool
        );

        // Calc actual taker fillable amount
        actualTakerFillableAmount = _getActualTakerFillableAmount(
            _offerCreateContingentPool.maker,
            _offerCreateContingentPool.collateralToken,
            _offerCreateContingentPool.makerCollateralAmount,
            _offerCreateContingentPool.takerCollateralAmount,
            offerInfo
        );

        // Check if signature is valid
        isSignatureValid = _isSignatureValid(
            offerInfo.typedOfferHash,
            _signature,
            _offerCreateContingentPool.maker
        );

        // Check validity of input parameters for `createContingentPool` function
        isValidInputParamsCreateContingentPool = LibDIVA
            ._validateInputParamsCreateContingentPool(
                LibDIVA.PoolParams({
                    referenceAsset: _offerCreateContingentPool.referenceAsset,
                    expiryTime: _offerCreateContingentPool.expiryTime,
                    floor: _offerCreateContingentPool.floor,
                    inflection: _offerCreateContingentPool.inflection,
                    cap: _offerCreateContingentPool.cap,
                    gradient: _offerCreateContingentPool.gradient,
                    collateralAmount: _offerCreateContingentPool
                        .makerCollateralAmount +
                        _offerCreateContingentPool.takerCollateralAmount,
                    collateralToken: _offerCreateContingentPool.collateralToken,
                    dataProvider: _offerCreateContingentPool.dataProvider,
                    capacity: _offerCreateContingentPool.capacity,
                    longRecipient: _offerCreateContingentPool.makerIsLong
                        ? _offerCreateContingentPool.maker
                        : msg.sender,
                    shortRecipient: _offerCreateContingentPool.makerIsLong
                        ? msg.sender
                        : _offerCreateContingentPool.maker,
                    permissionedERC721Token: _offerCreateContingentPool
                        .permissionedERC721Token
                }),
                IERC20Metadata(_offerCreateContingentPool.collateralToken)
                    .decimals()
            );
    }

    /**
     * @dev Function to receive information on the fillability of an add liquidity
     * pool offer and its signature validity
     * @param _offerAddLiquidity Struct containing the add liquidity offer details
     * @param _signature Offer signature
     * @return offerInfo Struct of offer info
     * @return actualTakerFillableAmount Actual fillable amount for taker
     * @return isSignatureValid Flag indicating whether the signature is valid or not
     * @return poolExists Flag indicating whether a pool exists or not
     */
    function _getOfferRelevantStateAddLiquidity(
        OfferAddLiquidity calldata _offerAddLiquidity,
        Signature calldata _signature
    )
        internal
        view
        returns (
            OfferInfo memory offerInfo,
            uint256 actualTakerFillableAmount,
            bool isSignatureValid,
            bool poolExists
        )
    {
        // Get offer info
        offerInfo = _getOfferInfoAddLiquidity(_offerAddLiquidity);

        // Get pool params using the `poolId` specified in `_offerAddLiquidity`
        LibDIVAStorage.PoolStorage storage ps = LibDIVAStorage._poolStorage();
        LibDIVAStorage.Pool storage _pool = ps.pools[_offerAddLiquidity.poolId];

        // Using collateralToken != address(0) to determine the existence of a pool. This works
        // because this case is excluded when creating a contingent pool as the zero address
        // doesn't implement the required functions (e.g., `transferFrom`) required to create
        // a contingent pool.
        if (_pool.collateralToken != address(0)) {
            // Calc actual taker fillable amount
            actualTakerFillableAmount = _getActualTakerFillableAmount(
                _offerAddLiquidity.maker,
                _pool.collateralToken,
                _offerAddLiquidity.makerCollateralAmount,
                _offerAddLiquidity.takerCollateralAmount,
                offerInfo
            );

            poolExists = true;
        } else {
            actualTakerFillableAmount = 0;
            poolExists = false;
        }

        // Check if signature is valid
        isSignatureValid = _isSignatureValid(
            offerInfo.typedOfferHash,
            _signature,
            _offerAddLiquidity.maker
        );
    }

    /**
     * @dev Function to receive information on the fillability of a remove liquidity
     * pool offer and its signature validity
     * @param _offerRemoveLiquidity Struct containing the remove liquidity offer details
     * @param _signature Offer signature
     * @return offerInfo Struct of offer info
     * @return actualTakerFillableAmount Actual fillable position token amount for taker
     * @return isSignatureValid Flag indicating whether the signature is valid or not
     * @return poolExists Flag indicating whether a pool exists or not
     */
    function _getOfferRelevantStateRemoveLiquidity(
        OfferRemoveLiquidity calldata _offerRemoveLiquidity,
        Signature calldata _signature
    )
        internal
        view
        returns (
            OfferInfo memory offerInfo,
            uint256 actualTakerFillableAmount,
            bool isSignatureValid,
            bool poolExists
        )
    {
        // Get offer info
        offerInfo = _getOfferInfoRemoveLiquidity(_offerRemoveLiquidity);

        // Get pool params using the `poolId` specified in `_offerRemoveLiquidity`
        LibDIVAStorage.PoolStorage storage ps = LibDIVAStorage._poolStorage();
        LibDIVAStorage.Pool storage _pool = ps.pools[
            _offerRemoveLiquidity.poolId
        ];

        // Using collateralToken != address(0) to determine the existence of a pool. This works
        // because this case is excluded when creating a contingent pool as the zero address
        // doesn't implement the required functions (e.g., `transferFrom`) required to create
        // a contingent pool.
        if (_pool.collateralToken != address(0)) {
            // Calc actual taker fillable amount
            if (offerInfo.status != OfferStatus.FILLABLE) {
                actualTakerFillableAmount = 0;
            } else {
                uint256 _makerPositionTokenBalance;
                if (_offerRemoveLiquidity.makerIsLong) {
                    _makerPositionTokenBalance = IERC20(_pool.longToken)
                        .balanceOf(_offerRemoveLiquidity.maker);
                } else {
                    _makerPositionTokenBalance = IERC20(_pool.shortToken)
                        .balanceOf(_offerRemoveLiquidity.maker);
                }

                actualTakerFillableAmount = _min256(
                    _offerRemoveLiquidity.positionTokenAmount -
                        offerInfo.takerFilledAmount,
                    _makerPositionTokenBalance
                );
            }

            poolExists = true;
        } else {
            actualTakerFillableAmount = 0;
            poolExists = false;
        }

        // Check if signature is valid
        isSignatureValid = _isSignatureValid(
            offerInfo.typedOfferHash,
            _signature,
            _offerRemoveLiquidity.maker
        );
    }
}
