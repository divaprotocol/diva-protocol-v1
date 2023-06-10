/**
 * Script to set the allowance for a given spender address.
 * Run: `yarn erc20::approve --network mumbai`
 */

import { ethers } from "hardhat";
import { parseUnits, formatUnits } from "@ethersproject/units";

async function main() {
  // ************************************
  //           INPUT ARGUMENTS
  // ************************************

  // Address of token to approve
  const tokenToApprove = "0x91F13B8da062f9a042dbD37D2e61FBfAcEB267aC";

  // Spender address
  const spenderAddress = "0x2C9c47E7d254e493f02acfB410864b9a86c28e1D";
  
  // Allowance amount.Conversion into integer happens below in the code
  // as it depends on the decimals of the token to approve.
  const allowanceString = "100000000000000000000000000";


  // ************************************
  //              EXECUTION
  // ************************************

  // Get signer of user
  const [user] = await ethers.getSigners();

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
