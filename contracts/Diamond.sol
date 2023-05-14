// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

/**
 * @author DIVA protocol team.
 * @title A protocol to create and settle derivative assets.
 * @dev DIVA protocol is implemented using the Diamond Standard
 * (EIP-2535: https://eips.ethereum.org/EIPS/eip-2535).
 * Contract issues directionally reversed long and short positions
 * (represented as ERC20 tokens) upon collateral deposit. Combined those
 * assets represent a claim on the collateral held in the contract. If held
 * in isolation, they expose the user to the up- or downside of the reference
 * asset. Contract holds all the collateral backing all position tokens in
 * existence.
 * Users can withdraw collateral by i) submitting both short and long tokens
 * in equal proportions or by redeeming them separately after the final
 * reference asset value and hence the payout for long and short position
 * tokens has been determined.
 * Contract is the owner of all position tokens and hence the only account
 * authorized to execute the `mint` and `burn` functions inside
 * `PositionToken` contract.
 */

import {LibDiamond} from "./libraries/LibDiamond.sol";
import {LibDiamondStorage} from "./libraries/LibDiamondStorage.sol";
import {LibDIVAStorage} from "./libraries/LibDIVAStorage.sol";
import {LibEIP712} from "./libraries/LibEIP712.sol";
import {LibEIP712Storage} from "./libraries/LibEIP712Storage.sol";
import {IDiamondCut} from "./interfaces/IDiamondCut.sol";
import {IDiamondLoupe} from "./interfaces/IDiamondLoupe.sol";
import {IERC165} from "./interfaces/IERC165.sol";


// Thrown if no function exists for function called
error FunctionNotFound(bytes4 _functionSelector);
// Thrown if zero address is provided as ownershipContract
error ZeroOwnershipContractAddress();
// Thrown if zero address is provided as fallback data provider
error ZeroFallbackDataProviderAddress();
// Thrown if zero address is provided as the DiamondCutFacet
error ZeroDiamondCutFacetAddress();
// Thrown if zero address is provided as treasury
error ZeroTreasuryAddress();
// Thrown if zero address is provided as position token factory contract
error ZeroPositionTokenFactoryAddress();

contract Diamond {
    /**
     * @dev Deploy DiamondCutFacet before deploying the diamond
     */
    constructor(
        address _ownershipContract,
        address _fallbackDataProvider,
        address _diamondCutFacet,
        address _treasury,
        address _positionTokenFactory
    ) payable {
        if (_ownershipContract == address(0)) revert ZeroOwnershipContractAddress();
        if (_fallbackDataProvider == address(0)) revert ZeroFallbackDataProviderAddress();
        if (_diamondCutFacet == address(0)) revert ZeroDiamondCutFacetAddress();
        if (_treasury == address(0)) revert ZeroTreasuryAddress();
        if (_positionTokenFactory == address(0)) revert ZeroPositionTokenFactoryAddress();

        // Add the diamondCut external function from the diamondCutFacet
        IDiamondCut.FacetCut[] memory cut = new IDiamondCut.FacetCut[](1);
        bytes4[] memory functionSelectors = new bytes4[](1);
        functionSelectors[0] = IDiamondCut.diamondCut.selector;
        cut[0] = IDiamondCut.FacetCut({
            facetAddress: _diamondCutFacet,
            action: IDiamondCut.FacetCutAction.Add,
            functionSelectors: functionSelectors
        });
        LibDiamond._diamondCut(cut, address(0), "");

        // ************************************************************************
        // Initialization of DIVA protocol variables (updateable by contract owner)
        // ************************************************************************
        LibDiamondStorage.DiamondStorage storage ds = LibDiamondStorage
            ._diamondStorage();
        LibDIVAStorage.GovernanceStorage storage gs = LibDIVAStorage
            ._governanceStorage();
        LibDIVAStorage.PoolStorage storage ps = LibDIVAStorage
            ._poolStorage();
        LibEIP712Storage.EIP712Storage storage es = LibEIP712Storage
            ._eip712Storage();        

        // Initialize fee parameters. Ensure that values are 0 or within the
        // bandwidths specified in `_isValidFee`.
        gs.fees.push(LibDIVAStorage.Fees({
            startTime: block.timestamp,
            protocolFee: 2500000000000000,  // 0.25%
            settlementFee: 500000000000000  // 0.05%
        }));

        // Initialize settlement period parameters. Ensure that values are between
        // 3 and 15 days (as specified in `_isValidPeriod`).
        gs.settlementPeriods.push(LibDIVAStorage.SettlementPeriods({
            startTime: block.timestamp,
            submissionPeriod: 7 days,
            challengePeriod: 3 days,
            reviewPeriod: 5 days,
            fallbackSubmissionPeriod: 10 days
        }));

        // Initialize treasury and fallback data provider address.
        // `previousFallbackDataProvider` and `previousTreasury` are initialized to
        // zero address at contract deployment.
        gs.startTimeTreasury = block.timestamp;
        gs.treasury = _treasury;
        gs.startTimeFallbackDataProvider = block.timestamp;
        gs.fallbackDataProvider = _fallbackDataProvider;        

        // Store positionTokenFactory address
        ps.positionTokenFactory = _positionTokenFactory;

        // Initialize EIP712 domain separator and store chain id to protect against replay attacks
        // in case of a fork. This approach is inspired by openzeppelin's EIP712 implementation:
        // https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/cryptography/EIP712.sol
        // Note that the address(this) check was consciously removed as not deemed relevant for our case.
        es.EIP712_DOMAIN_SEPARATOR = LibEIP712._getDomainHash();
        es.CACHED_CHAIN_ID = LibEIP712._chainId();

        // Set owner contract address
        ds.ownershipContract = _ownershipContract;

        // Adding ERC165 data
        ds.supportedInterfaces[type(IDiamondLoupe).interfaceId] = true;
        ds.supportedInterfaces[type(IERC165).interfaceId] = true;
    }

    // Find facet for function that is called and execute the
    // function if a facet is found and return any value.
    fallback() external payable {
        LibDiamondStorage.DiamondStorage storage ds = LibDiamondStorage._diamondStorage();

        address facet = ds.selectorToFacetAndPosition[msg.sig].facetAddress;
        if (facet == address(0)) revert FunctionNotFound(msg.sig);

        assembly {
            // copy incoming call data
            calldatacopy(0, 0, calldatasize())

            // forward call to logic contract (facet)
            let result := delegatecall(gas(), facet, 0, calldatasize(), 0, 0)

            // retrieve return data
            returndatacopy(0, 0, returndatasize())

            // forward return data back to caller
            switch result
            case 0 {
                revert(0, returndatasize())
            }
            default {
                return(0, returndatasize())
            }
        }
    }
}
