/**
 * Script to fill an offer to add liquidity on an existing contingent pool. (get offer from json file)
 * Run: `yarn diva::fillOfferAddLiquidity_from_json --network mumbai`
 */

import fs from "fs";
import { ethers, network } from "hardhat";
import { BigNumber, Contract } from "ethers";
import { formatUnits } from "@ethersproject/units";
import { LibDIVAStorage } from "../../typechain-types/contracts/facets/GetterFacet";
import DIVA_ABI from "../../diamondABI/diamond.json";
import { getCurrentTimestamp } from "../../utils";
import {
  OfferAddLiquidity,
  Signature,
  DivaDomain,
  DIVA_ADDRESS,
  ADD_LIQUIDITY_TYPE,
  OfferStatus,
} from "../../constants";

// Auxiliary function to perform checks required for successful execution, in line with those implemented
// inside the smart contract function. It is recommended to perform those checks in frontend applications
// to save users gas fees on reverts.
const _checkConditions = async (
  diva: Contract,
  divaDomain: DivaDomain,
  offerAddLiquidity: OfferAddLiquidity,
  type: Record<string, { type: string; name: string }[]>,
  signature: Signature,
  userAddress: string,
  takerFillAmount: BigNumber,
  poolParams: LibDIVAStorage.PoolStructOutput,
  totalCollateralFillAmount: BigNumber
) => {
  // Get information about the state of the add liquidity offer
  const relevantStateParams = await diva.getOfferRelevantStateAddLiquidity(
    offerAddLiquidity,
    signature
  );

  // Confirm that the offer is fillable
  if (relevantStateParams.offerInfo.status === OfferStatus.Invalid) {
    throw new Error("Offer is invalid because takerCollateralAmount is zero.");
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
  // actualTakerFillableAmount is smaller than takerCollateralAmount - takerFilledAmount.
  if (relevantStateParams.actualTakerFillableAmount.lt(takerFillAmount)) {
    throw new Error(
      "Actually fillable amount is smaller than takerFillAmount."
    );
  }

  // Confirm that signature matches the offer
  const recoveredAddress = ethers.utils.verifyTypedData(
    divaDomain,
    type,
    offerAddLiquidity,
    signature
  );
  if (recoveredAddress != offerAddLiquidity.maker) {
    throw new Error("Invalid signature.");
  }

  // Check that taker is allowed to fill the offer (relevant if taker specified in the offer is not the zero address)
  if (
    offerAddLiquidity.taker != ethers.constants.AddressZero &&
    userAddress != offerAddLiquidity.taker
  ) {
    throw new Error("Offer is reserved for a different address.");
  }

  // Confirm that takerFillAmount >= minimumTakerFillAmount **on first fill**. Minimum is not relevant on second fill (i.e. when takerFilledAmount > 0)
  if (
    relevantStateParams.offerInfo.takerFilledAmount.eq(0) &&
    takerFillAmount.lt(offerAddLiquidity.minimumTakerFillAmount)
  ) {
    throw new Error("takerFillAmount is smaller than minimumTakerFillAmount.");
  }

  // Confirm that pool has not expired yet
  if (poolParams.expiryTime.lte(getCurrentTimestamp())) {
    throw new Error("Already expired pool.");
  }

  // Confirm that new total pool collateral does not exceed the maximum capacity of the pool
  if (
    poolParams.collateralBalance
      .add(totalCollateralFillAmount)
      .gt(poolParams.capacity)
  ) {
    throw new Error("Pool capacity exceeded.");
  }
};

async function main() {
  // INPUT: json file path for offer info
  const jsonFilePath = "./offers/addLiquidityOffer_1685370902715.json";

  // Get offer info from json file
  const offerInfo = JSON.parse(fs.readFileSync(jsonFilePath).toString());

  // Get signers
  const [maker, taker] = await ethers.getSigners();

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

  // Connect to collateral token
  const collateralToken = await ethers.getContractAt(
    "MockERC20",
    poolParams.collateralToken
  );
  const decimals = await collateralToken.decimals();

  // Get offerAddLiquidity from offer info
  const offerAddLiquidity = offerInfo as OfferAddLiquidity;

  // Set takerFillAmount
  const takerFillAmount = BigNumber.from(offerInfo.takerCollateralAmount);

  // Calc total collateral fill amount
  const totalCollateralFillAmount = BigNumber.from(
    offerInfo.makerCollateralAmount
  )
    .add(offerInfo.takerCollateralAmount)
    .mul(takerFillAmount)
    .div(offerInfo.takerCollateralAmount);

  // Get maker's and taker's collateral token balance
  const collateralTokenBalanceMakerBefore = await collateralToken.balanceOf(
    maker.address
  );
  const collateralTokenBalanceTakerBefore = await collateralToken.balanceOf(
    taker.address
  );

  // Get makers's and taker's current allowance
  let allowanceMaker = await collateralToken.allowance(
    maker.address,
    diva.address
  );
  let allowanceTaker = await collateralToken.allowance(
    taker.address,
    diva.address
  );

  if (taker.address === offerInfo.maker) {
    // Set allowance to makerCollateralAmount + takerCollateralAmount when taker = maker
    if (allowanceMaker.lt(totalCollateralFillAmount)) {
      const approveTx = await collateralToken
        .connect(maker)
        .approve(diva.address, totalCollateralFillAmount.add(1)); // added a buffer to avoid any issues during fill tx due to rounding
      await approveTx.wait();

      // Get maker's new allowance
      allowanceMaker = await collateralToken.allowance(
        maker.address,
        diva.address
      );
      allowanceTaker = allowanceMaker; // because taker = maker
    }
  } else {
    // Set maker allowance if insufficient
    const makerFillAmount = BigNumber.from(offerInfo.makerCollateralAmount)
      .mul(takerFillAmount)
      .div(offerInfo.takerCollateralAmount);
    if (allowanceMaker.lt(makerFillAmount)) {
      const approveTx = await collateralToken
        .connect(maker)
        .approve(diva.address, makerFillAmount.add(1)); // added a buffer to avoid any issues during fill tx due to rounding
      await approveTx.wait();

      // Get maker's new allowance
      allowanceMaker = await collateralToken.allowance(
        maker.address,
        diva.address
      );
    }

    // Set taker allowance if insufficient
    if (allowanceTaker.lt(takerFillAmount)) {
      const approveTx = await collateralToken
        .connect(taker)
        .approve(diva.address, takerFillAmount.add(1)); // added a buffer to avoid any issues during fill tx due to rounding
      await approveTx.wait();

      // Get taker's new allowance
      allowanceTaker = await collateralToken.allowance(
        taker.address,
        diva.address
      );
    }
  }

  // Check conditions to ensure a successful fill offer tx
  await _checkConditions(
    diva,
    divaDomain,
    offerAddLiquidity,
    ADD_LIQUIDITY_TYPE,
    offerInfo.signature,
    taker.address,
    takerFillAmount,
    poolParams,
    totalCollateralFillAmount
  );

  // Fill offer with taker account
  const tx = await diva
    .connect(taker)
    .fillOfferAddLiquidity(
      offerAddLiquidity,
      offerInfo.signature,
      takerFillAmount
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
  console.log("chainId", offerInfo.chainId);
  console.log("DIVA address: ", diva.address);
  console.log("PoolId: ", offerInfo.poolId);
  console.log("offerAddLiquidity object: ", offerAddLiquidity);
  console.log("Signed offer hash: ", offerInfo.offerHash);
  console.log("Signature: ", offerInfo.signature);
  console.log("Allowance Maker: ", formatUnits(allowanceMaker, decimals));
  console.log("Allowance Taker: ", formatUnits(allowanceTaker, decimals));
  console.log(
    "Collateral token balance Maker before: ",
    formatUnits(collateralTokenBalanceMakerBefore, decimals)
  );
  console.log(
    "Collateral token balance Taker before: ",
    formatUnits(collateralTokenBalanceTakerBefore, decimals)
  );
  console.log(
    "offerAddLiquidity.makerCollateralAmount",
    formatUnits(offerAddLiquidity.makerCollateralAmount, decimals)
  );
  console.log(
    "offerAddLiquidity.takerCollateralAmount",
    formatUnits(offerAddLiquidity.takerCollateralAmount, decimals)
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
