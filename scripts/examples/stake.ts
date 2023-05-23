/**
 * Script to stake for a candidate on the Ownership contract
 * Run: `yarn ownership::stake`
 */

import { parseUnits } from "ethers/lib/utils";
import { ethers, network } from "hardhat";
import { OWNERSHIP_ADDRESS, DIVA_TOKEN_ADDRESS } from "../../constants";

async function main() {
  // Input arguments for `stake` function
  const candidate = "0x47566C6c8f70E4F16Aa3E7D8eED4a2bDb3f4925b";
  const stakeAmount = parseUnits("20");

  // Get signers
  const [user] = await ethers.getSigners();
  console.log("User address: ", user.address);

  // Connect to DIVA token contract
  const divaToken = await ethers.getContractAt(
    "DIVAToken",
    DIVA_TOKEN_ADDRESS[network.name]
  );

  const ownershipContractAddress = OWNERSHIP_ADDRESS[network.name];
  // Connect to Ownership contract
  const ownership = await ethers.getContractAt(
    "DIVAOwnershipMain",
    ownershipContractAddress
  );

  // Get current stake
  console.log(
    "Current stake amount for candidate: ",
    await ownership["getStakedAmount(address)"](candidate)
  );

  // Approve DIVA token
  const approveTx = await divaToken
    .connect(user)
    .approve(ownershipContractAddress, stakeAmount);
  await approveTx.wait();

  // Stake
  const tx = await ownership.connect(user).stake(candidate, stakeAmount);
  await tx.wait();

  // Get new stake amount
  console.log(
    "New stake amount for candidate: ",
    await ownership["getStakedAmount(address)"](candidate)
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
