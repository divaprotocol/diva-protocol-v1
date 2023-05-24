/**
 * Script to transfer fee claims.
 * Run: `yarn diva::transferFeeClaim`
 * 
 * Example usage:
 * 1. `yarn diva::create`: Create pool with a short expiration.
 * 2. `yarn diva::setFinalReferenceValue`: Confirm the final value on first call using `allowChallenge = false`.
 * 3. `yarn diva::getClaim`: Check the fee claims for the current and the new recipient
 *    before transferring the fee claim.
 * 4. `yarn diva::transferFeeClaim`: Transfer fee claim.
 * 5. `yarn diva::getClaim`: Check the updated fee claims for the two accounts.
 */

import { ethers, network } from "hardhat";
import { BigNumber } from "ethers";
import { formatUnits } from "@ethersproject/units";
import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS, COLLATERAL_TOKENS } from "../../constants";
import { parseUnits } from "ethers/lib/utils";

async function main() {
  // ************************************
  //           INPUT ARGUMENTS
  // ************************************

  // Collateral token
  const collateralTokenSymbol = "dUSD";

  // Get signers of current fee recipient and new fee recipient
  const [currentFeeRecipientSigner, newFeeRecipientSigner] = await ethers.getSigners();
  const newFeeRecipient = newFeeRecipientSigner.address;
  const currentFeeRecipient = currentFeeRecipientSigner.address;

  // Fee claim amount to transfer. Make sure the amount is smaller than or equal to the
  // actual claim of the current recipient.
  const transferAmountInput = "0.01";

  // ************************************
  //              EXECUTION
  // ************************************

  // Look-up collateral token address
  const collateralTokenAddress =
    COLLATERAL_TOKENS[network.name][collateralTokenSymbol];

  // Connect to collateral token
  const collateralTokenInstance = await ethers.getContractAt(
    "MockERC20",
    collateralTokenAddress
  );

  // Get collateral token decimals to perform conversion from integer to decimal.
  const decimals = await collateralTokenInstance.decimals();

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Get fee claim amount before transfer fee
  const feeCurrentFeeRecipientBefore = await diva.getClaim(
    collateralTokenAddress,
    currentFeeRecipient
  );
  const feeNewFeeRecipientBefore = await diva.getClaim(
    collateralTokenAddress,
    newFeeRecipient
  );

  // Set transfer amount
  const transferAmount = parseUnits(transferAmountInput, decimals);

  // Confirm that all conditions are met before continuing
  _checkConditions(
    newFeeRecipient,
    feeCurrentFeeRecipientBefore,
    transferAmount
  );

  // Transfer entire fee claim
  const transferFeeTx = await diva
    .connect(currentFeeRecipientSigner)
    .transferFeeClaim(
      newFeeRecipient,
      collateralTokenAddress,
      transferAmount
    );
  await transferFeeTx.wait();

  // Get fee claim amount after transfer fee
  const feeCurrentFeeRecipientAfter = await diva.getClaim(
    collateralTokenAddress,
    currentFeeRecipient
  );
  const feeNewFeeRecipientAfter = await diva.getClaim(
    collateralTokenAddress,
    newFeeRecipient
  );

  // Log relevant info
  console.log("DIVA address: ", diva.address);
  console.log("Current fee recipient address: ", currentFeeRecipient);
  console.log("New fee recipient address: ", newFeeRecipient);
  console.log("Collateral token address: ", collateralTokenAddress);
  console.log(
    "Fee current fee recipient before: " + formatUnits(feeCurrentFeeRecipientBefore, decimals)
  );
  console.log("Fee new fee recipient before: " + formatUnits(feeNewFeeRecipientBefore, decimals));
  console.log(
    "Fee current fee recipient after: " + formatUnits(feeCurrentFeeRecipientAfter, decimals)
  );
  console.log("Fee new fee recipient after: " + formatUnits(feeNewFeeRecipientAfter, decimals));
}

// Auxiliary function to perform checks required for successful execution, in line with those implemented
// inside the smart contract function. It is recommended to perform those checks in frontend applications
// to save users gas fees on reverts. Alternatively, use Tenderly to pre-simulate the tx and catch any errors
// before actually executing it.
const _checkConditions = (
  newFeeRecipient: string,
  feeCurrentFeeRecipient: BigNumber,
  transferAmount: BigNumber
) => {
  if (newFeeRecipient === ethers.constants.AddressZero) {
    throw new Error("Recipient is zero address.");
  }

  if (feeCurrentFeeRecipient.lt(transferAmount)) {
    throw new Error("Transfer amount exceeds claimable fee.");
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
