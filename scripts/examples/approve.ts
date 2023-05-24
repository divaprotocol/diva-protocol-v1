/**
 * Script to set the allowance for a given spender address.
 * Run: `yarn erc20::approve`
 */

import { ethers } from "hardhat";
import { parseUnits, formatUnits } from "@ethersproject/units";

async function main() {
  // ************************************
  //           INPUT ARGUMENTS
  // ************************************

  // Address of token to approve
  const tokenToApprove = "0xFA158C9B780A4213f3201Ae74Cca013712c8538d";

  // Spender address
  const spenderAddress = "0xb02bbd63545654d55125F98F85F4E691f1a3E207";
  
  // Allowance amount.Conversion into integer happens below in the code
  // as it depends on the decimals of the token to approve.
  const allowanceString = "10000000000000000";


  // ************************************
  //              EXECUTION
  // ************************************

  // Get signer of user
  const [, user] = await ethers.getSigners();

  // Connect to token to approve
  const erc20 = await ethers.getContractAt("MockERC20", tokenToApprove);

  // Get token decimals and convert allowance amount into BigNumber
  const decimals = await erc20.decimals();
  const allowance = parseUnits(allowanceString, decimals);

  // Allowance before
  const allowanceBefore = await erc20.allowance(
    user.address,
    spenderAddress
  );

  // Balance check (can be useful information if balance < allowance)
  const balance = await erc20.balanceOf(user.address);

  // Set allowance for spenderAddress
  const tx = await erc20.connect(user).approve(spenderAddress, allowance);
  await tx.wait();

  // Get the new allowance
  const allowanceAfter = await erc20.allowance(
    user.address,
    spenderAddress
  );

  // Log relevant info
  console.log("Owner: ", user.address);
  console.log("Spender: ", spenderAddress);
  console.log("Owner balance: ", formatUnits(balance, decimals));
  console.log("Approved amount before: ", formatUnits(allowanceBefore, decimals));
  console.log("Approved amount after: ", formatUnits(allowanceAfter, decimals));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
