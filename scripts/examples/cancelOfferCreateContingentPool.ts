/**
 * Script to cancel an offer to create a contingent pool.
 * Run: `yarn diva::cancelOfferCreateContingentPool --network mumbai`
 */

import { ethers, network } from "hardhat";
import { parseUnits } from "@ethersproject/units";
import DIVA_ABI from "../../diamondABI/diamond.json";
import {
  generateSignatureAndTypedMessageHash,
  getExpiryTime,
} from "../../utils";
import {
  CREATE_POOL_TYPE,
  DIVA_ADDRESS,
  COLLATERAL_TOKENS,
  OfferStatus,
} from "../../constants";

async function main() {
  // INPUT: collateral token symbol
  const collateralTokenSymbol = "WAGMI18";

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

  // Cancel offer with maker account
  const tx = await diva
    .connect(maker)
    .cancelOfferCreateContingentPool(offerCreateContingentPool);
  await tx.wait();

  console.log("Offer successfully cancelled");

  // Get information about the state of the create contingent pool offer
  const relevantStateParams =
    await diva.getOfferRelevantStateCreateContingentPool(
      offerCreateContingentPool,
      signature
    );

  // Log relevant info
  console.log("chainId", chainId);
  console.log("DIVA address: ", diva.address);
  console.log("offerCreateContingentPool object: ", offerCreateContingentPool);
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
