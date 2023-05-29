/**
 * Script to cancel an offer to remove liquidity on an existing contingent pool.
 * Run: `yarn diva::cancelOfferRemoveLiquidity --network mumbai`
 */

import { ethers, network } from "hardhat";
import { parseUnits } from "@ethersproject/units";
import DIVA_ABI from "../../diamondABI/diamond.json";
import {
  generateSignatureAndTypedMessageHash,
  getExpiryTime,
} from "../../utils";
import {
  DIVA_ADDRESS,
  REMOVE_LIQUIDITY_TYPE,
  OfferStatus,
} from "../../constants";

async function main() {
  // INPUT: id of an existing pool
  const poolId =
    "0xa5d1054bace7510c2fd62d7123163b3674e98af36a17290a0b26d8f61529ce4c";

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

  // Get pool params
  const poolParams = await diva.getPoolParameters(poolId);

  // Connect to collateral token
  const collateralToken = await ethers.getContractAt(
    "MockERC20",
    poolParams.collateralToken
  );
  const decimals = await collateralToken.decimals();

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

  // Cancel offer with maker account
  const tx = await diva
    .connect(maker)
    .cancelOfferRemoveLiquidity(offerRemoveLiquidity);
  await tx.wait();

  console.log("Offer successfully filled");

  // Get information about the state of the remove liquidity offer
  const relevantStateParams = await diva.getOfferRelevantStateRemoveLiquidity(
    offerRemoveLiquidity,
    signature
  );

  // Log relevant info
  console.log("chainId", chainId);
  console.log("DIVA address: ", diva.address);
  console.log("PoolId: ", poolId);
  console.log("offerRemoveLiquidity object: ", offerRemoveLiquidity);
  console.log("Signed offer hash: ", typedMessageHash);
  console.log("Signature: ", signature);
  console.log(
    "offerInfo.status === Cancelled: ",
    relevantStateParams.offerInfo.status === OfferStatus.Cancelled
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
