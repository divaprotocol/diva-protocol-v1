/**
 * Script to retrieve a remove liquidity offer from the API service and fill it.
 * Run: `yarn diva::fillOfferRemoveLiquidity --network mumbai`
 * 
 * Example usage (append corresponding network):
 * 1. `yarn diva::createContingentPool`: Create a contingent pool. Make sure to send position
 *    tokens to maker and taker.
 * 2. `yarn diva::postRemoveLiquidityOffer`: Post a remove liquidity offer to the API server.
 * 3. `yarn diva::getOfferRelevantStateRemoveLiquidity`: Check the offer state.
 * 4. `yarn diva::fillOfferRemoveLiquidity`: Fill the offer.
 * 5. `yarn diva::getOfferRelevantStateRemoveLiquidity`: Check the offer state.
 */

import { ethers, network } from "hardhat";
import { BigNumber, Contract } from "ethers";
import { parseUnits, formatUnits } from "@ethersproject/units";
import { LibDIVAStorage } from "../../typechain-types/contracts/facets/GetterFacet";
import DIVA_ABI from "../../diamondABI/diamond.json";
import { getCurrentTimestamp } from "../../utils";
import { queryOffer } from "../../utils";
import {
  OfferRemoveLiquidity,
  Signature,
  DivaDomain,
  DIVA_ADDRESS,
  REMOVE_LIQUIDITY_TYPE,
  Status, // Settlement status
  OfferStatus,
  Offer,
} from "../../constants";

async function main() {
  // ************************************
  //           INPUT ARGUMENTS
  // ************************************

  // sourceOfferDetails: Set the source for the offer details. If offer is filled/expired/cancelled/invalid,
  // choose "JSON" as source as it will no longer exist on the API server.
  // offerHash: Hash of offer to fill. Only required if `sourceOfferDetails` = "API" was selected.
  // jsonFilePath: Only required if `sourceOfferDetails` = "JSON" was selected
  const offer: Offer = {
    sourceOfferDetails: "API",
    offerHash: "0x47422a2c2188f129a7e6358595afd0e1dd9f9ad1805a6a8dae04c06da6db2bed",
    jsonFilePath: "./offers/removeLiquidityOffer_1686503093313.json",
  };

  // Set taker account. Make sure the taker has position tokens.
  const [, taker] = await ethers.getSigners();

  // Taker fill amount. Conversion into integer happens in the code below as it
  // depends on the collateral token decimals.
  const positionTokenFillAmountInput = "1"; 


  // ************************************
  //              EXECUTION
  // ************************************

  // Retrieve offer information from the specified source
  const offerInfo = await queryOffer(
    offer.sourceOfferDetails,
    offer.offerHash,
    offer.jsonFilePath,
    "remove"
  );

  // Connect to deployed DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Define DIVA Domain struct
  const divaDomain = {
    name: "DIVA Protocol",
    version: "1",
    chainId: offerInfo.chainId,
    verifyingContract: offerInfo.verifyingContract,
  };

  // Get pool params
  const poolParams = await diva.getPoolParameters(offerInfo.poolId);

  // Connect to the collateral token to obtain the decimals needed to convert into
  // integer representation
  const collateralToken = await ethers.getContractAt(
    "MockERC20",
    poolParams.collateralToken
  );
  const decimals = await collateralToken.decimals();

  // Get offerRemoveLiquidity from offer info
  const offerRemoveLiquidity = offerInfo as OfferRemoveLiquidity;

  // Set positionTokenFillAmount
  const positionTokenFillAmount = parseUnits(positionTokenFillAmountInput, decimals);

  // Get maker signer. Must be an account derived from the MNEMONIC stored in `.env`.
  const maker = await ethers.getSigner(offerRemoveLiquidity.maker);

  // Note that as opposed to `fillOfferCreateContingentPool` or `fillOfferAddLiquidity` no allowance
  // is required as the tokens are burnt by the owner, which is the DIVA smart contract

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
    offerInfo.signature,
    taker.address,
    positionTokenFillAmount,
    poolParams
  );

  // Get taker filled amount before fill offer
  const takerFilledAmountBefore = await diva.getTakerFilledAmount(offer.offerHash);

  // Fill offer with taker account
  const tx = await diva
    .connect(taker)
    .fillOfferRemoveLiquidity(
      offerRemoveLiquidity,
      offerInfo.signature,
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

  // Get taker filled amount after fill offer
  const takerFilledAmountAfter = await diva.getTakerFilledAmount(offer.offerHash);

  // Log relevant info
  console.log("chainId", offerInfo.chainId);
  console.log("DIVA address: ", diva.address);
  console.log("PoolId: ", offerInfo.poolId);
  console.log("offerRemoveLiquidity object: ", offerRemoveLiquidity);
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
  console.log(
    "Taker filled amount before: ",
    formatUnits(takerFilledAmountBefore, decimals)
  );
  console.log(
    "Taker filled amount after: ",
    formatUnits(takerFilledAmountAfter, decimals)
  );
}

// Auxiliary function to perform checks required for successful execution, in line with those implemented
// inside the smart contract function. It is recommended to perform those checks in frontend applications
// to save users gas fees on reverts. Alternatively, use Tenderly to pre-simulate the tx and catch any errors
// before actually executing it.
const _checkConditions = async (
  diva: Contract,
  divaDomain: DivaDomain,
  offerRemoveLiquidity: OfferRemoveLiquidity,
  type: Record<string, { type: string; name: string }[]>,
  signature: Signature,
  userAddress: string,
  positionTokenFillAmount: BigNumber,
  poolParams: LibDIVAStorage.PoolStructOutput
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

  const pauseReturnCollateralUntil = (await diva.getGovernanceParameters())
    .pauseReturnCollateralUntil;
  // Confirm that functionality is not paused
  if (pauseReturnCollateralUntil.gt(getCurrentTimestamp())) {
    throw new Error("Functionality has been paused.");
  }

  // If status is Confirmed, users should use `redeemPositionToken` function to withdraw collateral
  if (poolParams.statusFinalReferenceValue == Status.Confirmed) {
    throw new Error("Final value already confirmed.");
  }

  // Get instances of short and long token
  const shortToken = await ethers.getContractAt(
    "MockERC20",
    poolParams.shortToken
  );
  const longToken = await ethers.getContractAt(
    "MockERC20",
    poolParams.longToken
  );
  const takerShortTokenBalance = await shortToken.balanceOf(userAddress);
  const makerLongTokenBalance = await longToken.balanceOf(
    offerRemoveLiquidity.maker
  );
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

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
