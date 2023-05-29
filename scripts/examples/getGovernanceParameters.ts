/**
 * Script to get the current governance parameters.
 * Run: `yarn diva::getGovernanceParameters --network mumbai`
 */

import { ethers, network } from "hardhat";
import { formatUnits } from "@ethersproject/units";
import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS } from "../../constants";

async function main() { 
  // Connect to deployed DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Get pool parameters
  const govParams = await diva.getGovernanceParameters();

  // Log governance parameters (formatted)
  console.log("Fees start time: ", new Date(govParams.currentFees[0] * 1000).toLocaleString());
  console.log("Protocol fee: ", formatUnits(govParams.currentFees[1].mul(100)) + "%");
  console.log("Settlement fee: ", formatUnits(govParams.currentFees[2].mul(100)) + "%");
  console.log("Settlement periods start time: ", new Date(govParams.currentSettlementPeriods[0] * 1000).toLocaleString());
  console.log("Submission period: ", govParams.currentSettlementPeriods[1] / 86400 + " days");
  console.log("Challenge period: ", govParams.currentSettlementPeriods[2] / 86400 + " days");
  console.log("Review period: ", govParams.currentSettlementPeriods[3] / 86400 + " days");
  console.log("Fallback submission period (in days): ", govParams.currentSettlementPeriods[4] / 86400 + " days");
  console.log("Treasury address: ", govParams.treasury);
  console.log("Fallback data provider address: ",govParams.fallbackDataProvider);
  console.log("Return collateral paused until: ", new Date(govParams.pauseReturnCollateralUntil * 1000).toLocaleString());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
