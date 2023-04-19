/**
 * Script to transfer fee claims
 * Run: `yarn diva::claimFee`
 */

import { ethers } from "hardhat";

import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS, COLLATERAL_TOKENS } from "../../constants";

async function main() {
  // INPUT: network
  const network = "goerli";

  // INPUT: collateral token
  const collateralTokenSymbol = "dUSD";

  // Lookup collateral token address
  const collateralToken = COLLATERAL_TOKENS[network][collateralTokenSymbol];

  // Get signer of recipient
  const [recipient] = await ethers.getSigners();
  console.log("Recipient address: ", recipient.address);

  // Connect to collateral token
  const collateralTokenInstance = await ethers.getContractAt(
    "MockERC20",
    collateralToken
  );

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network]);
  console.log("DIVA address: ", diva.address);

  console.log(
    "Balance before: " +
      (await collateralTokenInstance.balanceOf(recipient.address))
  );

  // Get fee claim amount
  const tx = await diva.claimFee(collateralToken, recipient.address);
  await tx.wait();

  console.log(
    "Balance after: " +
      (await collateralTokenInstance.balanceOf(recipient.address))
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
