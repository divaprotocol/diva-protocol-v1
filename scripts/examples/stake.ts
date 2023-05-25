/**
 * Script to stake for a candidate using the DIVA token.
 * Run: `yarn ownership::stake --network mumbai`
 */

import { ethers, network } from "hardhat";
import { parseUnits, formatUnits } from "ethers/lib/utils";
import { OWNERSHIP_ADDRESS, DIVA_TOKEN_ADDRESS } from "../../constants";

async function main() {
  // ************************************
  //           INPUT ARGUMENTS
  // ************************************
  
  // Candidate address to vote for
  const candidate = "0x47566C6c8f70E4F16Aa3E7D8eED4a2bDb3f4925b";

  // Stake amount (DIVA token has 18 decimals)
  const stakeAmount = parseUnits("20");

  // Staking user
  const [user] = await ethers.getSigners();


  // ************************************
  //              EXECUTION
  // ************************************

  // Connect to DIVA token contract
  const divaToken = await ethers.getContractAt(
    "DIVAToken",
    DIVA_TOKEN_ADDRESS[network.name]
  );
  
  // Connect to Ownership contract
  const ownershipContractAddress = OWNERSHIP_ADDRESS[network.name];
  const ownership = await ethers.getContractAt(
    "DIVAOwnershipMain",
    ownershipContractAddress
  );

  // Get stake amount for candidate before staking
  const candidateStakeAmountBefore = await ownership["getStakedAmount(address)"](candidate);

  // Approve DIVA token
  const approveTx = await divaToken
    .connect(user)
    .approve(ownershipContractAddress, stakeAmount);
  await approveTx.wait();

  // Stake
  const tx = await ownership.connect(user).stake(candidate, stakeAmount);
  await tx.wait();

  // Get stake amount for candidate after staking
  const candidateStakeAmountAfter = await ownership["getStakedAmount(address)"](candidate);

  // Log relevant info
  console.log("Staking user: ", user.address);
  console.log("Candidate: ", candidate);
  console.log("Stake amount for candidate before: ", formatUnits(candidateStakeAmountBefore));
  console.log("Stake amount for candidate after: ", formatUnits(candidateStakeAmountAfter));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
