/**
 * Script to set the allowance for the 0x exchange contract
 * Run: `yarn erc20::approve`
 */

import { ethers } from "hardhat";
import { parseUnits, formatUnits } from "@ethersproject/units";

async function main() {
  // INPUT: address of token to approve
  const tokenToApprove = "0xFA158C9B780A4213f3201Ae74Cca013712c8538d";

  // Input arguments for `approve` function
  const exchangeProxyAddress = "0xb02bbd63545654d55125F98F85F4E691f1a3E207"; // same for several chains including Mainnet and Ropsten
  const allowanceString = "10000000000000000"; // conversion into BigNumber with the respective number of decimals is done below

  // Get signer of user
  const [, user] = await ethers.getSigners();

  console.log("Approved by: " + user.address);
  console.log("Approved for: " + exchangeProxyAddress);

  // Connect to token to approve
  const erc20 = await ethers.getContractAt("MockERC20", tokenToApprove);

  // Get token decimals and convert allowance amount into BigNumber
  const decimals = await erc20.decimals();
  const allowance = parseUnits(allowanceString, decimals);

  // Allowance before
  const allowanceBefore = await erc20.allowance(
    user.address,
    exchangeProxyAddress
  );
  console.log(
    "Current approved amount (integer): " + allowanceBefore.toString()
  );
  console.log(
    "Current approved amount (decimals): " +
      formatUnits(allowanceBefore, decimals)
  );

  // Balance check (can be useful information if balance < allowance)
  const balance = await erc20.balanceOf(user.address);
  console.log("balance of (integer): ", balance.toString());
  console.log("balance of (decimals): ", formatUnits(balance, decimals));

  // Set allowance for exchangeProxyAddress
  const tx = await erc20.connect(user).approve(exchangeProxyAddress, allowance);
  await tx.wait();

  // Print
  const allowanceAfter = await erc20.allowance(
    user.address,
    exchangeProxyAddress
  );
  console.log("New approved amount (integer): " + allowanceAfter.toString());
  console.log(
    "New approved amount (decimals): " + formatUnits(allowanceAfter, decimals)
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
