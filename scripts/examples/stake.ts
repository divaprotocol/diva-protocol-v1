/**
 * Script to stake for a candidate on the Ownership contract
 * Run: `yarn ownership::stake`
 */



import { parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { OWNERSHIP_ADDRESS, DIVA_TOKEN_ADDRESS } from "../../constants";

async function main() {
  // INPUTS: network name
  const network = "goerli"; // has to be one of the networks included in constants.ts
  const candidate = "0x47566C6c8f70E4F16Aa3E7D8eED4a2bDb3f4925b";
  const stakeAmount = parseUnits("20")
  const ownershipContractAddress = OWNERSHIP_ADDRESS[network];
  const divaTokenAddress = DIVA_TOKEN_ADDRESS[network];

  // Get signers
  const [user] = await ethers.getSigners();
  console.log("User address: ", user.address);

  // Connect to DIVA token contract
  const divaToken = await ethers.getContractAt("DIVAToken", divaTokenAddress);

  // Connect to Ownership contract
  const ownership = await ethers.getContractAt("DIVAOwnershipMain", ownershipContractAddress);

  // Get current stake
  console.log(
    "Current stake amount for candidate: " +
      (await ownership.getStakedAmount(candidate))
  );

  // Approve DIVA token
  await divaToken.connect(user).approve(ownershipContractAddress, stakeAmount)

  // Stake
  const tx = await ownership.stake(candidate, stakeAmount);
  const receipt = await tx.wait();

  // Get new stake amount
  console.log(
    "New stake amount for candidate: " +
      (await ownership.getStakedAmount(candidate))
  );

}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
