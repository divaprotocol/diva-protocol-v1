import { BigNumber } from "ethers";
import { LibDIVAStorage } from "../typechain-types/contracts/facets/GetterFacet";

export type OfferCreateContingentPool = {
  maker: string; // signer of the message
  taker: string; // taker of the offer; if zero address, then everyone can be the taker
  makerCollateralAmount: string; // collateral amount to contribute to the contingent pool by the maker
  takerCollateralAmount: string; // collateral amount to contribute to the contingent pool by the taker
  makerIsLong: boolean; // false if signer keeps the short position, true if signer keeps the long position
  offerExpiry: string; // offer expiration time
  minimumTakerFillAmount: string; // minimum collateral amount that the taker has to contribute; if equal to takerCollateralAmount, then only full fill is possible
  referenceAsset: string;
  expiryTime: string;
  floor: string;
  inflection: string;
  cap: string;
  gradient: string;
  collateralToken: string;
  dataProvider: string;
  capacity: string;
  permissionedERC721Token: string;
  salt: string;
};

export type OfferCreateContingentPoolSigned = {
  offerCreateContingentPool: OfferCreateContingentPool;
  signature: Signature;
  offerHash: string;
  chainId: number;
  verifyingContract: string;
}

export type OfferAddLiquidity = {
  maker: string; // signer of the message
  taker: string; // taker of the offer; if zero address, then everyone can be the taker
  makerCollateralAmount: string; // collateral amount to contribute to the contingent pool by the maker
  takerCollateralAmount: string; // collateral amount to contribute to the contingent pool by the taker
  makerIsLong: boolean; // false if signer keeps the short position, true if signer keeps the long position
  offerExpiry: string; // offer expiration time
  minimumTakerFillAmount: string; // minimum collateral amount that the taker has to contribute; if equal to takerCollateralAmount, then only full fill is possible
  poolId: string;
  salt: string;
};

export type OfferAddLiquiditySigned = {
  offerAddLiquidity: OfferAddLiquidity;
  signature: Signature;
  offerHash: string;
  chainId: number;
  verifyingContract: string;
}

export type OfferRemoveLiquidity = {
  maker: string; // signer of the message
  taker: string; // taker of the offer; if zero address, then everyone can be the taker
  positionTokenAmount: string; // Position token amount returned by taker and maker is equal
  makerCollateralAmount: string; // Collateral amount to be returned to maker. Amount returned to taker is positionTokenAmount - makerCollateralAmount
  makerIsLong: boolean; // 1 [0] if maker returns long [short] position token
  offerExpiry: string; // Offer expiration time
  minimumTakerFillAmount: string; // Minimum position token fill amount on first fill
  poolId: string; // Id of an existing pool
  salt: string; // Arbitrary number to enforce uniqueness of the offer hash
};

export type OfferRemoveLiquiditySigned = {
  offerRemoveLiquidity: OfferRemoveLiquidity;
  signature: Signature;
  offerHash: string;
  chainId: number;
  verifyingContract: string;
}

export type Signature = {
  v: number;
  r: string;
  s: string;
};

export type DivaDomain = {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
};

export enum OfferStatus {
  Invalid,
  Cancelled,
  Filled,
  Expired,
  Fillable,
}

export interface OfferInfo {
  status: OfferStatus;
  typedOfferHash: string;
  takerFilledAmount: BigNumber;
}

export interface PoolParams {
  referenceAsset: string;
  expiryTime: string;
  floor: string;
  inflection: string;
  cap: string;
  gradient: string;
  collateralAmount: string;
  collateralToken: string;
  dataProvider: string;
  capacity: string;
  longRecipient: string;
  shortRecipient: string;
  permissionedERC721Token: string;
}

export enum FeeType {
  PROTOCOL_FEE,
  SETTLEMENT_FEE,
}

export enum SettlementPeriodType {
  SUBMISSION_PERIOD,
  CHALLENGE_PERIOD,
  REVIEW_PERIOD,
  FALLBACK_SUBMISSION_PERIOD,
}
export enum Status {
  Open,
  Submitted,
  Challenged,
  Confirmed,
}

export enum FacetCutAction {
  Add,
  Replace,
  Remove,
}

export type GovParams = {
  currentFees: LibDIVAStorage.FeesStructOutput;
  currentSettlementPeriods: LibDIVAStorage.SettlementPeriodsStructOutput;
  treasury: string;
  fallbackDataProvider: string;
  pauseReturnCollateralUntil: BigNumber;
};

export type PayoffsPerToken = {
  payoffLongNet: BigNumber;
  payoffShortNet: BigNumber;
};

export type Deposit = {
  token: string;
  amount: BigNumber;
  startTime: BigNumber;
  endTime: BigNumber;
  lastClaimedAt: BigNumber;
};

export type FallbackDataProviderInfo = {
  previousFallbackDataProvider: string;
  fallbackDataProvider: string;
  startTimeFallbackDataProvider: BigNumber;
};

export type TreasuryInfo = {
  previousTreasury: string;
  treasury: string;
  startTimeTreasury: BigNumber;
};

export type SourceOfferDetails = "JSON" | "API";

export interface Offer {
  sourceOfferDetails: SourceOfferDetails;
  offerHash: string;
  jsonFilePath: string;
}
