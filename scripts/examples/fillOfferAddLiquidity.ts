/**
 * Script to retrieve a create contingent pool offer from the API service
 * and fill it. Approval for maker and taker is set inside the script for ease of use.
 * Run: `yarn diva::fillOfferAddLiquidity --network mumbai`
 * 
 * Example usage (append corresponding network):
 * 1. `yarn diva::createContingentPool`: Create a contingent pool.
 * 2. `yarn diva::postAddLiquidityOffer`: Post an add liquidity offer to the API server.
 * 3. `yarn diva::getOfferRelevantStateAddLiquidity`: Check the offer state.
 * 4. `yarn diva::fillOfferAddLiquidity`: Fill the offer.
 * 5. `yarn diva::getOfferRelevantStateAddLiquidity`: Check the offer state.
 */

import { ethers, network } from "hardhat";
import { BigNumber, Contract } from "ethers";
import { parseUnits, formatUnits } from "@ethersproject/units";
import { LibDIVAStorage } from "../../typechain-types/contracts/facets/GetterFacet";
import DIVA_ABI from "../../diamondABI/diamond.json";
import { getCurrentTimestamp } from "../../utils";
import { queryOffer } from "../../utils";
import {
  OfferAddLiquidity,
  OfferAddLiquiditySigned,
  Signature,
  DivaDomain,
  DIVA_ADDRESS,
  ADD_LIQUIDITY_TYPE,
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
    offerHash: "0x0b95c391a73b64f5903c2df62dbe41dcf74c0bfa46fcaa19612f1fc06a7113a9",
    jsonFilePath: "./offers/addLiquidityOffer_1686467035892.json",
  };

  // Set taker account
  const [, taker] = await ethers.getSigners();

  // Taker fill amount. Conversion into integer happens in the code below as it
  // depends on the collateral token decimals.
  const takerFillAmountInput = "1"; 


  // ************************************
  //              EXECUTION
  // ************************************

  // Retrieve offer information from the specified source
  const offerInfo = await queryOffer(
    offer.sourceOfferDetails,
    offer.offerHash,
    offer.jsonFilePath,
    "add"
  ) as OfferAddLiquiditySigned;

  // Get offerAddLiquidity from offer info
  const offerAddLiquidity: OfferAddLiquidity = offerInfo.offerAddLiquidity;

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
  const poolParams = await diva.getPoolParameters(offerAddLiquidity.poolId);

  // Connect to the collateral token to obtain the decimals needed to convert into
  // integer representation
  const collateralToken = await ethers.getContractAt(
    "MockERC20",
    poolParams.collateralToken
  );
  const decimals = await collateralToken.decimals();

  // Get signature from offerInfo
  const signature = offerInfo.signature;

  // Convert `takerFillAmountInput` into big integer
  const takerFillAmount = parseUnits(takerFillAmountInput, decimals);

  // Calculate makerFillAmount
  const makerFillAmount = BigNumber.from(
    offerAddLiquidity.makerCollateralAmount
  )
    .mul(takerFillAmount)
    .div(offerAddLiquidity.takerCollateralAmount);

  // Calc total collateral fill amount
  const totalCollateralFillAmount = takerFillAmount.add(makerFillAmount);

  // Get maker signer. Must be an account derived from the MNEMONIC stored in `.env`.
  const maker = await ethers.getSigner(offerAddLiquidity.maker);

  // The following code checks whether the maker and taker have sufficient allowance and
  // collateral token balance. It will set the allowance if insufficient.

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

  if (taker.address === offerAddLiquidity.maker) {
    // Set allowance to makerCollateralAmount + takerCollateralAmount when taker = maker.
    // Add some tolerance to avoid any issues during fill tx due to rounding.
    if (allowanceMaker.lt(totalCollateralFillAmount)) {
      const approveTx = await collateralToken
        .connect(maker)
        .approve(diva.address, totalCollateralFillAmount.add(1));
      await approveTx.wait();

      // Get maker's new allowance
      allowanceMaker = await collateralToken.allowance(
        maker.address,
        diva.address
      );
      allowanceTaker = allowanceMaker; // because taker = maker
    }
  } else {
    // Set maker allowance if insufficient.
    // Add some tolerance to avoid any issues during fill tx due to rounding.
    if (allowanceMaker.lt(makerFillAmount)) {
      const approveTx = await collateralToken
        .connect(maker)
        .approve(diva.address, makerFillAmount.add(1));
      await approveTx.wait();

      // Get maker's new allowance
      allowanceMaker = await collateralToken.allowance(
        maker.address,
        diva.address
      );
    }

    // Set taker allowance if insufficient.
    // Add some tolerance to avoid any issues during fill tx due to rounding.
    if (allowanceTaker.lt(takerFillAmount)) {
      const approveTx = await collateralToken
        .connect(taker)
        .approve(diva.address, takerFillAmount.add(1));
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
    signature,
    taker.address,
    takerFillAmount,
    poolParams,
    totalCollateralFillAmount
  );

  // Get taker filled amount before fill offer
  const takerFilledAmountBefore = await diva.getTakerFilledAmount(offer.offerHash);

  // Fill offer with taker account
  const tx = await diva
    .connect(taker)
    .fillOfferAddLiquidity(
      offerAddLiquidity,
      signature,
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

  // Get taker filled amount after fill offer
  const takerFilledAmountAfter = await diva.getTakerFilledAmount(offer.offerHash);

  // Log relevant info
  console.log("chainId", offerInfo.chainId);
  console.log("DIVA address: ", diva.address);
  console.log("PoolId: ", offerAddLiquidity.poolId);
  console.log("offerAddLiquidity object: ", offerAddLiquidity);
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

  // Check actual fillable amount
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

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
