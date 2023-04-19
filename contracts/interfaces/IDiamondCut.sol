// SPDX-License-Identifier: agpl-3.0
pragma solidity 0.8.19;

interface IDiamondCut {
    enum FacetCutAction {
        Add,
        Replace,
        Remove
    }
    // Add=0, Replace=1, Remove=2

    struct FacetCut {
        address facetAddress;
        FacetCutAction action;
        bytes4[] functionSelectors;
    }

    // Duplication of event defined in `LibDiamond.sol` as events emitted out of
    // library functions are not reflected in the contract ABI. Read more about it here:
    // https://web.archive.org/web/20180922101404/https://blog.aragon.org/library-driven-development-in-solidity-2bebcaf88736/
    event DiamondCut(FacetCut[] _facetCut, address _init, bytes _calldata);

    /// @notice Add/replace/remove any number of functions and optionally
    ///         execute a function with delegatecall
    /// @param _facetCut Contains the facet addresses and function selectors
    /// @param _init The address of the contract or facet to execute _calldata
    /// @param _calldata A function call, including function selector and arguments
    ///                  _calldata is executed with delegatecall on _init
    function diamondCut(
        FacetCut[] calldata _facetCut,
        address _init,
        bytes calldata _calldata
    ) external;
}
