// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

library LibDIVAStorage {
    // The hash for pool storage position, which is:
    // keccak256("diamond.standard.pool.storage")
    bytes32 constant POOL_STORAGE_POSITION =
        0x57b54c9a1067e6ab879c66c176c4e86e41fe1dcf5187b31dc2b93365087c7afb;

    // The hash for governance storage position, which is:
    // keccak256("diamond.standard.governance.storage")
    bytes32 constant GOVERNANCE_STORAGE_POSITION =
        0x898b136e888260ec0628fb6c3ad8f54cb15908878595b2abfc8c9ecda73a4daf;

    // The hash for fee claim storage position, which is:
    // keccak256("diamond.standard.fee.claim.storage")
    bytes32 constant FEE_CLAIM_STORAGE_POSITION =
        0x16b3e63c02e4dfaf74f59b1b7e9e81770bf30c0ed3fd4434b199357859900313;

    // Settlement status
    enum Status {
        Open,
        Submitted,
        Challenged,
        Confirmed
    }

    // Collection of pool related parameters; order was optimized to reduce storage costs
    struct Pool {
        uint256 floor; // Reference asset value at or below which the long token pays out 0 and the short token 1 (max payout), gross of fees (18 decimals)
        uint256 inflection; // Reference asset value at which the long token pays out `gradient` and the short token `1-gradient`, gross of fees (18 decimals)
        uint256 cap; // Reference asset value at or above which the long token pays out 1 (max payout) and the short token 0, gross of fees (18 decimals)
        uint256 gradient; // Long token payout at inflection (value between 0 and 1) (collateral token decimals)
        uint256 collateralBalance; // Current collateral balance of pool (collateral token decimals)
        uint256 finalReferenceValue; // Reference asset value at the time of expiration (18 decimals) - set to 0 at pool creation
        uint256 capacity; // Maximum collateral that the pool can accept (collateral token decimals)
        uint256 statusTimestamp; // Timestamp of status change - set to `block.timestamp` at pool creation and updated on status changes
        address shortToken; // Short position token address
        uint96 payoutShort; // Payout amount per short position token net of fees (collateral token decimals) - set to 0 at pool creation
        address longToken; // Long position token address
        uint96 payoutLong; // Payout amount per long position token net of fees (collateral token decimals) - set to 0 at pool creation
        address collateralToken; // Address of the ERC20 collateral token
        uint96 expiryTime; // Expiration time of the pool (expressed as a unix timestamp in seconds)
        address dataProvider; // Address of data provider
        uint48 indexFees; // Index pointer to the applicable fees inside the Fees struct array
        uint48 indexSettlementPeriods; // Index pointer to the applicable periods inside the SettlementPeriods struct array
        Status statusFinalReferenceValue; // Status of final reference price (0 = Open, 1 = Submitted, 2 = Challenged, 3 = Confirmed) - set to 0 at pool creation
        string referenceAsset; // Reference asset string
    }

    // Collection of settlement related periods
    struct SettlementPeriods {
        uint256 startTime; // Timestamp at which the new set of settlement periods becomes applicable
        uint24 submissionPeriod; // Submission period length in seconds; max value: 15 days <= 2^24
        uint24 challengePeriod; // Challenge period length in seconds; max value: 15 days <= 2^24
        uint24 reviewPeriod; // Review period length in seconds; max value: 15 days <= 2^24
        uint24 fallbackSubmissionPeriod; // Fallback submission period length in seconds; max value: 15 days <= 2^24
    }

    // Collection of fee related parameters
    struct Fees {
        uint256 startTime; // timestamp at which the new set of fees becomes applicable
        uint96 protocolFee; // max value: 15000000000000000 = 1.5% <= 2^56
        uint96 settlementFee; // max value: 15000000000000000 = 1.5% <= 2^56
    }

    // Collection of governance related parameters
    struct GovernanceStorage {
        address previousTreasury; // Previous treasury address
        address treasury; // Pending/current treasury address
        uint256 startTimeTreasury; // Unix timestamp when the new treasury address is activated
        address previousFallbackDataProvider; // Previous fallback data provider address
        address fallbackDataProvider; // Pending/current fallback data provider
        uint256 startTimeFallbackDataProvider; // Unix timestamp when the new fallback provider is activated
        uint256 pauseReturnCollateralUntil; // Unix timestamp until when withdrawals are paused
        Fees[] fees; // Array including the fee regimes set over time
        SettlementPeriods[] settlementPeriods; // Array including the settlement period regimes set over time
    }

    struct FeeClaimStorage {
        mapping(address => mapping(address => uint256)) claimableFeeAmount; // collateralTokenAddress -> RecipientAddress -> amount
        mapping(bytes32 => uint256) poolIdToReservedClaim; // poolId -> reserve amount // @todo updated here
    }

    struct PoolStorage {
        uint256 nonce; // IMPORTANT: hash calc in `LibDIVA._createContingentPool` assumes this variable at slot 0 inside this struct @todo added new
        bytes32 poolId; // @todo type updated; updated docs & tests
        mapping(bytes32 => Pool) pools;
        address positionTokenFactory;
    }

    function _poolStorage() internal pure returns (PoolStorage storage ps) {
        bytes32 position = POOL_STORAGE_POSITION;
        assembly {
            ps.slot := position
        }
    }

    function _governanceStorage()
        internal
        pure
        returns (GovernanceStorage storage gs)
    {
        bytes32 position = GOVERNANCE_STORAGE_POSITION;
        assembly {
            gs.slot := position
        }
    }

    function _feeClaimStorage()
        internal
        pure
        returns (FeeClaimStorage storage fs)
    {
        bytes32 position = FEE_CLAIM_STORAGE_POSITION;
        assembly {
            fs.slot := position
        }
    }
}
