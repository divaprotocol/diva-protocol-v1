const EIP712_DOMAIN_STRUCT = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];

const CREATE_POOL_OFFER_STRUCT = [
  { type: "address", name: "maker" },
  { type: "address", name: "taker" },
  { type: "uint256", name: "makerCollateralAmount" },
  { type: "uint256", name: "takerCollateralAmount" },
  { type: "bool", name: "makerIsLong" },
  { type: "uint256", name: "offerExpiry" },
  { type: "uint256", name: "minimumTakerFillAmount" },
  { type: "string", name: "referenceAsset" },
  { type: "uint96", name: "expiryTime" },
  { type: "uint256", name: "floor" },
  { type: "uint256", name: "inflection" },
  { type: "uint256", name: "cap" },
  { type: "uint256", name: "gradient" },
  { type: "address", name: "collateralToken" },
  { type: "address", name: "dataProvider" },
  { type: "uint256", name: "capacity" },
  { type: "address", name: "permissionedERC721Token" },
  { type: "uint256", name: "salt" },
];

const ADD_LIQUIDITY_OFFER_STRUCT = [
  { type: "address", name: "maker" },
  { type: "address", name: "taker" },
  { type: "uint256", name: "makerCollateralAmount" },
  { type: "uint256", name: "takerCollateralAmount" },
  { type: "bool", name: "makerIsLong" },
  { type: "uint256", name: "offerExpiry" },
  { type: "uint256", name: "minimumTakerFillAmount" },
  { type: "bytes32", name: "poolId" },
  { type: "uint256", name: "salt" },
];

const REMOVE_LIQUIDITY_OFFER_STRUCT = [
  { type: "address", name: "maker" },
  { type: "address", name: "taker" },
  { type: "uint256", name: "positionTokenAmount" },
  { type: "uint256", name: "makerCollateralAmount" },
  { type: "bool", name: "makerIsLong" },
  { type: "uint256", name: "offerExpiry" },
  { type: "uint256", name: "minimumTakerFillAmount" },
  { type: "bytes32", name: "poolId" },
  { type: "uint256", name: "salt" },
];

export const EIP712DIVA_TYPES = {
  EIP712Domain: EIP712_DOMAIN_STRUCT,
  OfferCreateContingentPool: CREATE_POOL_OFFER_STRUCT,
  OfferAddLiquidity: ADD_LIQUIDITY_OFFER_STRUCT,
  OfferRemoveLiquidity: REMOVE_LIQUIDITY_OFFER_STRUCT,
};

export const CREATE_POOL_TYPE = {
  OfferCreateContingentPool: CREATE_POOL_OFFER_STRUCT,
};

export const ADD_LIQUIDITY_TYPE = {
  OfferAddLiquidity: ADD_LIQUIDITY_OFFER_STRUCT,
};

export const REMOVE_LIQUIDITY_TYPE = {
  OfferRemoveLiquidity: REMOVE_LIQUIDITY_OFFER_STRUCT,
};
