// List of all facets excluding `DiamondCutFacet` which is deployed separately as
// its address is used as input when deploying the `Diamond` contract
export const FACET_NAMES = [
  "DiamondLoupeFacet",
  "PoolFacet",
  "LiquidityFacet",
  "GetterFacet",
  "SettlementFacet",
  "GovernanceFacet",
  "ClaimFacet",
  "EIP712CreateFacet",
  "EIP712AddFacet",
  "EIP712CancelFacet",
  "EIP712RemoveFacet",
  "TipFacet",
];

// Make sure the Tellor contract addresses are defined for the corresponding
// networks in `addresses.ts` and the network names match the ones in `hardhat.config.ts`
// and the networks in `hardhat.config.ts` match the ones in xdeployer:
// https://www.npmjs.com/package/xdeployer
export const XDEPLOY_CHAINS = ["goerli", "mumbai"];

export const CREATE2_DEPLOYER_ADDRESS =
  "0x13b0D85CcB8bf860b6b79AF3029fCA081AE9beF2";
