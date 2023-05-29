/**
 * Script to get relevant states of create contingent pool offers using multicall contract.
 * Run: `yarn diva::getOfferRelevantStateCreateContingentPool_multicall --network mumbai`
 */

import { ethers, network } from "hardhat";
import DIVA_ABI from "../../diamondABI/diamond.json";
import {
  generateCreateContingentPoolOfferDetails,
  generateSignatureAndTypedMessageHash,
  multicall,
} from "../../utils";
import {
  DIVA_ADDRESS,
  COLLATERAL_TOKENS,
  CREATE_POOL_TYPE,
  OfferInfo,
} from "../../constants";
import { parseUnits } from "ethers/lib/utils";
import { BigNumber } from "ethers";

async function main() {
  // INPUT: collateral token
  const collateralTokenSymbol = "WAGMI18";

  const divaAddress = DIVA_ADDRESS[network.name];
  const collateralTokenAddress =
    COLLATERAL_TOKENS[network.name][collateralTokenSymbol];

  // Connect to deployed DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Get chainId
  const chainId = (await diva.getChainId()).toNumber();

  // Define DIVA Domain struct
  const divaDomain = {
    name: "DIVA Protocol",
    version: "1",
    chainId,
    verifyingContract: divaAddress,
  };

  // Get signer of users
  const [user1, user2, oracle] = await ethers.getSigners();

  // Generate first offerCreateContingentPool with user1 (maker) taking the short side and user2 (taker) the long side
  const offerCreateContingentPool1 =
    await generateCreateContingentPoolOfferDetails({
      maker: user1.address.toString(), // maker
      taker: user2.address.toString(), // taker
      makerIsLong: false, // makerIsLong
      dataProvider: oracle.address,
      collateralToken: collateralTokenAddress,
    });

  // Generate first signature
  const [signature1] = await generateSignatureAndTypedMessageHash(
    user1,
    divaDomain,
    CREATE_POOL_TYPE,
    offerCreateContingentPool1,
    "OfferCreateContingentPool"
  );

  // Generate second offerCreateContingentPool with user1 (maker) taking the short side and user2 (taker) the long side
  const offerCreateContingentPool2 =
    await generateCreateContingentPoolOfferDetails({
      maker: user1.address.toString(), // maker
      taker: user2.address.toString(), // taker
      makerCollateralAmount: parseUnits("20").toString(),
      makerIsLong: false, // makerIsLong
      dataProvider: oracle.address,
      collateralToken: collateralTokenAddress,
    });

  // Generate second signature and typed message hash
  const [signature2] = await generateSignatureAndTypedMessageHash(
    user1,
    divaDomain,
    CREATE_POOL_TYPE,
    offerCreateContingentPool2,
    "OfferCreateContingentPool"
  );

  const offersCreateContingentPool = [
    {
      address: divaAddress,
      name: "getOfferRelevantStateCreateContingentPool",
      params: [offerCreateContingentPool1, signature1],
    },
    {
      address: divaAddress,
      name: "getOfferRelevantStateCreateContingentPool",
      params: [offerCreateContingentPool2, signature2],
    },
  ];

  const offerRelevantStatesCreateContingentPool = await multicall(
    network.name,
    DIVA_ABI,
    offersCreateContingentPool
  );
  offerRelevantStatesCreateContingentPool.forEach(
    (
      offerRelevantStateCreateContingentPool: {
        offerInfo: OfferInfo;
        actualTakerFillableAmount: BigNumber;
        isSignatureValid: boolean;
        poolExists: boolean;
      },
      index: number
    ) => {
      console.log(
        `OfferRelevantStateCreateContingentPool for #${
          index + 1
        } is: ${offerRelevantStateCreateContingentPool}`
      );
    }
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
