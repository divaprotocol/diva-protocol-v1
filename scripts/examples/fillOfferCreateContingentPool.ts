/**
 * Script to create and fill an offer to create a contingent pool.
 * Run: `yarn diva::fillOfferCreateContingentPool --network mumbai`
 */

import { ethers, network } from "hardhat";
import { BigNumber, Contract } from "ethers";
import { formatUnits, parseUnits } from "@ethersproject/units";
import DIVA_ABI from "../../diamondABI/diamond.json";
import {
  generateSignatureAndTypedMessageHash,
  getExpiryTime,
} from "../../utils";
import {
  OfferCreateContingentPool,
  Signature,
  DivaDomain,
  CREATE_POOL_TYPE,
  DIVA_ADDRESS,
  COLLATERAL_TOKENS,
  OfferStatus,
} from "../../constants";

async function main() {
  // INPUT: collateral token symbol
  const collateralTokenSymbol = "dUSD";

  // Lookup collateral token address
  const collateralTokenAddress =
    COLLATERAL_TOKENS[network.name][collateralTokenSymbol];

  // Connect to ERC20 token that will be used as collateral when creating a contingent pool
  const collateralToken = await ethers.getContractAt(
    "MockERC20",
    collateralTokenAddress
  );
  const decimals = await collateralToken.decimals();

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

  // Get signers
  const [maker, taker, oracle] = await ethers.getSigners();

  // Generate offerCreateContingentPool with user1 (maker) taking the long side and user2 (taker) the short side
  const offerCreateContingentPool = {
    maker: maker.address.toString(),
    taker: taker.address.toString(),
    makerCollateralAmount: parseUnits("90", decimals).toString(),
    takerCollateralAmount: parseUnits("10", decimals).toString(),
    makerIsLong: true,
    offerExpiry: await getExpiryTime(10000),
    minimumTakerFillAmount: parseUnits("10", decimals).toString(),
    referenceAsset: "Rain amount (ml)",
    expiryTime: await getExpiryTime(10000),
    floor: parseUnits("200").toString(),
    inflection: parseUnits("350").toString(),
    cap: parseUnits("500").toString(),
    gradient: parseUnits("0.5", decimals).toString(),
    collateralToken: collateralTokenAddress,
    dataProvider: oracle.address,
    capacity: parseUnits("1000", decimals).toString(),
    permissionedERC721Token: ethers.constants.AddressZero,
    salt: Date.now().toString(),
  };

  // Generate signature and typed message hash
  const [signature, typedMessageHash] =
    await generateSignatureAndTypedMessageHash(
      maker,
      divaDomain,
      CREATE_POOL_TYPE,
      offerCreateContingentPool,
      "OfferCreateContingentPool"
    );

  // Set takerFillAmount
  const takerFillAmount = BigNumber.from(
    offerCreateContingentPool.takerCollateralAmount
  );

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

  if (taker.address === offerCreateContingentPool.maker) {
    // Set allowance to makerCollateralAmount + takerCollateralAmount when taker = maker
    const totalCollateralFillAmount = BigNumber.from(
      offerCreateContingentPool.makerCollateralAmount
    )
      .add(offerCreateContingentPool.takerCollateralAmount)
      .mul(takerFillAmount)
      .div(offerCreateContingentPool.takerCollateralAmount);
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
    const makerFillAmount = BigNumber.from(
      offerCreateContingentPool.makerCollateralAmount
    )
      .mul(takerFillAmount)
      .div(offerCreateContingentPool.takerCollateralAmount);
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
    offerCreateContingentPool,
    CREATE_POOL_TYPE,
    signature,
    offerCreateContingentPool.taker,
    takerFillAmount
  );

  // Get taker filled amount before fill offer
  const takerFilledAmountBefore = await diva.getTakerFilledAmount(
    typedMessageHash
  );

  // Fill offer with taker account
  const tx = await diva
    .connect(taker)
    .fillOfferCreateContingentPool(
      offerCreateContingentPool,
      signature,
      takerFillAmount
    );
  const receipt = await tx.wait();

  console.log("Offer successfully filled");

  // Get newly created pool Id via the typedOfferHash emitted via the OfferFilled event
  const typedOfferHash = receipt.events.find(
    (x: any) => x.event === "OfferFilled"
  ).args.typedOfferHash;
  const poolId = await diva.getPoolIdByTypedCreateOfferHash(typedOfferHash);

  // Get maker's and taker's ERC20 token balance after fill offer
  const collateralTokenBalanceMakerAfter = await collateralToken.balanceOf(
    maker.address
  );
  const collateralTokenBalanceTakerAfter = await collateralToken.balanceOf(
    taker.address
  );

  // Get taker filled amount after fill offer
  const takerFilledAmountAfter = await diva.getTakerFilledAmount(
    typedMessageHash
  );

  // Log relevant info
  console.log("chainId", chainId);
  console.log("DIVA address: ", diva.address);
  console.log("PoolId of newly created pool: ", poolId);
  console.log("offerCreateContingentPool object: ", offerCreateContingentPool);
  console.log("Signed offer hash: ", typedMessageHash);
  console.log("Signature: ", signature);
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
    "offerCreateContingentPool.makerCollateralAmount",
    formatUnits(offerCreateContingentPool.makerCollateralAmount, decimals)
  );
  console.log(
    "offerCreateContingentPool.takerCollateralAmount",
    formatUnits(offerCreateContingentPool.takerCollateralAmount, decimals)
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
  offerCreateContingentPool: OfferCreateContingentPool,
  type: Record<string, { type: string; name: string }[]>,
  signature: Signature,
  userAddress: string,
  takerFillAmount: BigNumber
) => {
  // Get information about the state of the create contingent pool offer
  const relevantStateParams =
    await diva.getOfferRelevantStateCreateContingentPool(
      offerCreateContingentPool,
      signature
    );

  // Confirm that the offer is fillable
  // 0: INVALID, 1: CANCELLED, 2: FILLED, 3: EXPIRED, 4: FILLABLE
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

  // Confirm that the contingent pool parameters are valid
  if (!relevantStateParams.isValidInputParamsCreateContingentPool) {
    throw new Error("Invalid create contingent pool parameters.");
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
    offerCreateContingentPool,
    signature
  );
  if (recoveredAddress != offerCreateContingentPool.maker) {
    throw new Error("Invalid signature.");
  }

  // Check that taker is allowed to fill the offer (relevant if taker specified in the offer is not the zero address)
  if (
    offerCreateContingentPool.taker != ethers.constants.AddressZero &&
    userAddress != offerCreateContingentPool.taker
  ) {
    throw new Error("Offer is reserved for a different address.");
  }

  // Confirm that takerFillAmount >= minimumTakerFillAmount **on first fill**. Minimum is not relevant on second fill (i.e. when takerFilledAmount > 0)
  if (
    relevantStateParams.offerInfo.takerFilledAmount.eq(0) &&
    takerFillAmount.lt(offerCreateContingentPool.minimumTakerFillAmount)
  ) {
    throw new Error("takerFillAmount is smaller than minimumTakerFillAmount.");
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
