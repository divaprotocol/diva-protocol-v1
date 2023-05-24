/**
 * Script to unstake a candidate.
 * Run: `yarn ownership::unstake`
 */

import { ethers, network } from "hardhat";
import { parseUnits, formatUnits } from "ethers/lib/utils";
import { OWNERSHIP_ADDRESS } from "../../constants";
import { getCurrentTimestamp } from "../../utils";
import { Contract } from "ethers";

async function main() {
  // ************************************
  //           INPUT ARGUMENTS
  // ************************************
  
  // Candidate address to vote for
  const candidate = "0x47566C6c8f70E4F16Aa3E7D8eED4a2bDb3f4925b";

  // Stake amount (DIVA token has 18 decimals)
  const stakeAmount = parseUnits("1");

  // Unstaking user
  const [user] = await ethers.getSigners();


  // ************************************
  //              EXECUTION
  // ************************************
  
  // Connect to Ownership contract
  const ownershipContractAddress = OWNERSHIP_ADDRESS[network.name];
  const ownership = await ethers.getContractAt(
    "DIVAOwnershipMain",
    ownershipContractAddress
  );

  await _checkConditions(ownership, user.address, candidate);

  // Get stake amount for candidate before staking
  const candidateStakeAmountBefore = await ownership["getStakedAmount(address)"](candidate);

  // Stake
  const tx = await ownership.connect(user).unstake(candidate, stakeAmount);
  await tx.wait();

  // Get stake amount for candidate after staking
  const candidateStakeAmountAfter = await ownership["getStakedAmount(address)"](candidate);

  // Log relevant info
  console.log("Staking user: ", user.address);
  console.log("Candidate: ", candidate);
  console.log("Stake amount for candidate before: ", formatUnits(candidateStakeAmountBefore));
  console.log("Stake amount for candidate after: ", formatUnits(candidateStakeAmountAfter));
}

const _checkConditions = async (
  ownershipContract: Contract,
  unstakerAddress: string,
  candidateAddress: string
) => {
  // Check whether the minimum staking period has expired
  const timestampLastStakedForCandidate = 
    await ownershipContract.getTimestampLastStakedForCandidate(unstakerAddress, candidateAddress);
  const minStakePeriod = await ownershipContract.getMinStakingPeriod();
  const now = getCurrentTimestamp();
  if (now < timestampLastStakedForCandidate.add(minStakePeriod)) {
    throw new Error("Minimum staking period not expired yet.");
  }

  // The unstaking restriction during the ownership claim submission period
  // has been omitted for the sake of simplicity.
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
