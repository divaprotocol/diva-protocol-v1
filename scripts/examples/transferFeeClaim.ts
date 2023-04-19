/**
 * Script to transfer fee claims
 * Run: `yarn diva::transferFeeClaim`
 */

import { ethers } from "hardhat";
import { BigNumber } from "ethers";

import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS, COLLATERAL_TOKENS } from "../../constants";

// Auxiliary function to perform checks required for successful execution, in line with those implemented
// inside the smart contract function. It is recommended to perform those checks in frontend applications
// to save users gas fees on reverts.
const _checkConditions = (
  newFeeRecipient: string,
  feeCurrentFeeRecipient: BigNumber,
  transferAmount: BigNumber
) => {
  if (newFeeRecipient === ethers.constants.AddressZero) {
    throw new Error("Recipient is zero address");
  }

  if (feeCurrentFeeRecipient.lt(transferAmount)) {
    throw new Error("Transfer amount exceeds claimable fee");
  }
};

async function main() {
  // INPUT: network
  const network = "goerli";

  // INPUT: collateral token symbol
  const collateralTokenSymbol = "dUSD";

  // Lookup collateral token address
  const collateralTokenAddress =
    COLLATERAL_TOKENS[network][collateralTokenSymbol];

  // Get signers of current fee recipient and new fee recipient
  const [, newFeeRecipient, currentFeeRecipient] = await ethers.getSigners();

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network]);

  // Get fee claim amount before transfer fee
  const feeCurrentFeeRecipientBefore = await diva.getClaim(
    collateralTokenAddress,
    currentFeeRecipient.address
  );
  const feeNewFeeRecipientBefore = await diva.getClaim(
    collateralTokenAddress,
    newFeeRecipient.address
  );

  // Set transfer amount
  const transferAmount = feeCurrentFeeRecipientBefore.div(2);

  // Confirm that all conditions are met before continuing
  _checkConditions(
    newFeeRecipient.address,
    feeCurrentFeeRecipientBefore,
    transferAmount
  );

  // Transfer entire fee claim
  const transferFeeTx = await diva
    .connect(currentFeeRecipient)
    .transferFeeClaim(
      newFeeRecipient.address,
      collateralTokenAddress,
      transferAmount
    );
  await transferFeeTx.wait();

  // Get fee claim amount after transfer fee
  const feeCurrentFeeRecipientAfter = await diva.getClaim(
    collateralTokenAddress,
    currentFeeRecipient.address
  );
  const feeNewFeeRecipientAfter = await diva.getClaim(
    collateralTokenAddress,
    newFeeRecipient.address
  );

  // Log relevant info
  console.log("DIVA address: ", diva.address);
  console.log("Current fee recipient address: ", currentFeeRecipient.address);
  console.log("New fee recipient address: ", newFeeRecipient.address);
  console.log("Collateral token address: ", collateralTokenAddress);
  console.log(
    "Fee current fee recipient before: " + feeCurrentFeeRecipientBefore
  );
  console.log("Fee new fee recipient before: " + feeNewFeeRecipientBefore);
  console.log(
    "Fee current fee recipient after: " + feeCurrentFeeRecipientAfter
  );
  console.log("Fee new fee recipient after: " + feeNewFeeRecipientAfter);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
