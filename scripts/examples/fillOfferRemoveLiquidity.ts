/**
 * Script to fill an offer to remove liquidity on an existing contingent pool.
 * Run: `yarn diva::fillOfferRemoveLiquidity --network mumbai`
 */

import { ethers, network } from "hardhat";
import { BigNumber, Contract } from "ethers";
import { formatUnits, parseUnits } from "@ethersproject/units";
import { LibDIVAStorage } from "../../typechain-types/contracts/facets/GetterFacet";
import DIVA_ABI from "../../diamondABI/diamond.json";
import {
  generateSignatureAndTypedMessageHash,
  getCurrentTimestamp,
  getExpiryTime,
} from "../../utils";
import {
  Signature,
  DivaDomain,
  DIVA_ADDRESS,
  OfferRemoveLiquidity,
  REMOVE_LIQUIDITY_TYPE,
  Status,
  OfferStatus,
} from "../../constants";

// Auxiliary function to perform checks required for successful execution, in line with those implemented
// inside the smart contract function. It is recommended to perform those checks in frontend applications
// to save users gas fees on reverts.
const _checkConditions = async (
  diva: Contract,
  divaDomain: DivaDomain,
  offerRemoveLiquidity: OfferRemoveLiquidity,
  type: Record<string, { type: string; name: string }[]>,
  signature: Signature,
  userAddress: string,
  positionTokenFillAmount: BigNumber,
  poolParams: LibDIVAStorage.PoolStructOutput,
  pauseReturnCollateralUntil: BigNumber,
  takerShortTokenBalance: BigNumber,
  makerLongTokenBalance: BigNumber
) => {
  // Get information about the state of the remove liquidity offer
  const relevantStateParams = await diva.getOfferRelevantStateRemoveLiquidity(
    offerRemoveLiquidity,
    signature
  );

  // Confirm that the offer is fillable
  // 0: INVALID, 1: CANCELLED, 2: FILLED, 3: EXPIRED, 4: FILLABLE
  if (relevantStateParams.offerInfo.status === OfferStatus.Invalid) {
    throw new Error(
      "Offer is invalid because positionTokenAmount is zero or positionTokenAmount is smaller than makerCollateralAmount."
    );
  }

  if (relevantStateParams.offerInfo.status === OfferStatus.Cancelled) {
    throw new Error("Offer was cancelled.");
  }

  if (relevantStateParams.offerInfo.status === OfferStatus.Filled) {
    throw new Error("Offer is already filled.");
  }

  if (relevantStateParams.offerInfo.status === OfferStatus.Expired) {
    throw new Error("Offer is already expired.");
  }

  // Confirm that the pool exists
  if (!relevantStateParams.poolExists) {
    throw new Error("Pool does not exist.");
  }

  // Check actual fillable amount. The checks above provide more information on why
  // actualTakerFillableAmount is smaller than positionTokenAmount - takerFilledAmount.
  if (
    relevantStateParams.actualTakerFillableAmount.lt(positionTokenFillAmount)
  ) {
    throw new Error(
      "Actually fillable amount is smaller than positionTokenFillAmount."
    );
  }

  // Confirm that signature matches the offer
  const recoveredAddress = ethers.utils.verifyTypedData(
    divaDomain,
    type,
    offerRemoveLiquidity,
    signature
  );
  if (recoveredAddress != offerRemoveLiquidity.maker) {
    throw new Error("Invalid signature.");
  }

  // Check that taker is allowed to fill the offer (relevant if taker specified in the offer is not the zero address)
  if (
    offerRemoveLiquidity.taker != ethers.constants.AddressZero &&
    userAddress != offerRemoveLiquidity.taker
  ) {
    throw new Error("Offer is reserved for a different address.");
  }

  // Confirm that positionTokenFillAmount >= minimumTakerFillAmount **on first fill**. Minimum is not relevant on second fill (i.e. when takerFilledAmount > 0)
  if (
    relevantStateParams.offerInfo.takerFilledAmount.eq(0) &&
    positionTokenFillAmount.lt(offerRemoveLiquidity.minimumTakerFillAmount)
  ) {
    throw new Error(
      "positionTokenFillAmount is smaller than minimumTakerFillAmount."
    );
  }

  // Confirm that functionality is not paused
  if (pauseReturnCollateralUntil.gt(getCurrentTimestamp())) {
    throw new Error("Functionality has been paused.");
  }

  // If status is Confirmed, users should use `redeemPositionToken` function to withdraw collateral
  if (poolParams.statusFinalReferenceValue == Status.Confirmed) {
    throw new Error("Final value already confirmed.");
  }

  // Check that `shortTokenHolder` and `longTokenHolder` own the corresponding
  // `_amount` of short and long position tokens. In particular, this check will
  // revert when a user tries to remove an amount that exceeds the overall position token
  // supply which is the maximum amount that a user can own.
  if (
    takerShortTokenBalance.lt(positionTokenFillAmount) ||
    makerLongTokenBalance.lt(positionTokenFillAmount)
  ) {
    throw new Error("Insufficient short or long token balance.");
  }
};

async function main() {
  // INPUT: id of an existing pool
  const poolId =
    "0x50ab7cb4329fb32c30579a9727f07692dbc41a9c9376e8b0da347c1b78b8af42";

  // Get signers
  const [maker, taker] = await ethers.getSigners();

  // Connect to deployed DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Get chainId
  const chainId = (await diva.getChainId()).toNumber();

  // Define DIVA Domain struct
  const divaDomain = {
    name: "DIVA Protocol",
    version: "1",
    chainId,
    verifyingContract: DIVA_ADDRESS[network.name],
  };

  const pauseReturnCollateralUntil = (await diva.getGovernanceParameters())
    .pauseReturnCollateralUntil;

  // Get pool params
  const poolParams = await diva.getPoolParameters(poolId);

  // Connect to collateral token
  const collateralToken = await ethers.getContractAt(
    "MockERC20",
    poolParams.collateralToken
  );
  const decimals = await collateralToken.decimals();

  // Get instances of short and long token
  const shortToken = await ethers.getContractAt(
    "MockERC20",
    poolParams.shortToken
  );
  const longToken = await ethers.getContractAt(
    "MockERC20",
    poolParams.longToken
  );

  const takerShortTokenBalance = await shortToken.balanceOf(taker.address);
  const makerLongTokenBalance = await longToken.balanceOf(maker.address);

  // Generate offerRemoveLiquidity with user1 (maker) taking the long side and user2 (taker) the short side
  const offerRemoveLiquidity = {
    maker: maker.address.toString(),
    taker: taker.address.toString(),
    positionTokenAmount: parseUnits("10", decimals).toString(),
    makerCollateralAmount: parseUnits("2", decimals).toString(),
    makerIsLong: true,
    offerExpiry: await getExpiryTime(10000),
    minimumTakerFillAmount: parseUnits("6", decimals).toString(),
    poolId,
    salt: Date.now().toString(),
  };

  // Generate signature and typed message hash
  const [signature, typedMessageHash] =
    await generateSignatureAndTypedMessageHash(
      maker,
      divaDomain,
      REMOVE_LIQUIDITY_TYPE,
      offerRemoveLiquidity,
      "OfferRemoveLiquidity"
    );

  // Set positionTokenFillAmount
  const positionTokenFillAmount = BigNumber.from(
    offerRemoveLiquidity.positionTokenAmount
  );

  // Get maker's and taker's collateral token balance
  const collateralTokenBalanceMakerBefore = await collateralToken.balanceOf(
    maker.address
  );
  const collateralTokenBalanceTakerBefore = await collateralToken.balanceOf(
    taker.address
  );

  // Check conditions to ensure a successful fill offer tx
  await _checkConditions(
    diva,
    divaDomain,
    offerRemoveLiquidity,
    REMOVE_LIQUIDITY_TYPE,
    signature,
    offerRemoveLiquidity.taker,
    positionTokenFillAmount,
    poolParams,
    pauseReturnCollateralUntil,
    takerShortTokenBalance,
    makerLongTokenBalance
  );

  // Fill offer with taker account
  const tx = await diva
    .connect(taker)
    .fillOfferRemoveLiquidity(
      offerRemoveLiquidity,
      signature,
      positionTokenFillAmount
    );
  await tx.wait();

  console.log("Offer successfully filled");

  // Get maker's and taker's ERC20 token balance after fill offer
  const collateralTokenBalanceMakerAfter = await collateralToken.balanceOf(
    maker.address
  );
  const collateralTokenBalanceTakerAfter = await collateralToken.balanceOf(
    taker.address
  );

  // Log relevant info
  console.log("chainId", chainId);
  console.log("DIVA address: ", diva.address);
  console.log("PoolId: ", poolId);
  console.log("offerRemoveLiquidity object: ", offerRemoveLiquidity);
  console.log("Signed offer hash: ", typedMessageHash);
  console.log("Signature: ", signature);
  console.log(
    "Collateral token balance Maker before: ",
    formatUnits(collateralTokenBalanceMakerBefore, decimals)
  );
  console.log(
    "Collateral token balance Taker before: ",
    formatUnits(collateralTokenBalanceTakerBefore, decimals)
  );
  console.log(
    "offerRemoveLiquidity.positionTokenAmount",
    formatUnits(offerRemoveLiquidity.positionTokenAmount, decimals)
  );
  console.log(
    "offerRemoveLiquidity.makerCollateralAmount",
    formatUnits(offerRemoveLiquidity.makerCollateralAmount, decimals)
  );
  console.log(
    "Collateral token balance Maker after: ",
    formatUnits(collateralTokenBalanceMakerAfter, decimals)
  );
  console.log(
    "Collateral token balance Taker after: ",
    formatUnits(collateralTokenBalanceTakerAfter, decimals)
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
