/**
 * Script to update the protocol fee and settlement fee.
 * The execution of this function is reserved to the protocol owner only.
 * Run: `yarn diva::updateFees`
 */

import { ethers, network } from "hardhat";
import { BigNumber, Contract } from "ethers";
import { parseUnits } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { LibDIVAStorage } from "../../typechain-types/contracts/facets/GetterFacet";

import DIVA_ABI from "../../diamondABI/diamond.json";
import { DIVA_ADDRESS, FeeType } from "../../constants";
import { getCurrentTimestamp } from "../../utils";

// Auxiliary function to perform checks required for successful execution, in line with those implemented
// inside the smart contract function. It is recommended to perform those checks in frontend applications
// to save users gas fees on reverts.
const _checkConditions = async (
  diva: Contract,
  owner: SignerWithAddress,
  newProtocolFee: BigNumber,
  newSettlementFee: BigNumber,
  lastFees: LibDIVAStorage.FeesStructOutput
) => {
  // Confirm that signer of owner is correct
  if ((await diva.getOwner()) !== owner.address) {
    throw new Error("Invalid signer of owner.");
  }

  // Confirm that the new fees are valid
  _isValidFee(newProtocolFee);
  _isValidFee(newSettlementFee);

  // Confirm that there is no pending fees update. Revoke to update pending values.
  if (lastFees.startTime.gt(getCurrentTimestamp())) {
    throw new Error("There is a pending fees update.");
  }
};

const _isValidFee = (fee: BigNumber) => {
  if (fee.gt(0)) {
    // Min fee of 0.01% introduced to have a minimum non-zero fee in `removeLiquidity`
    // 0.01% = 0.0001
    if (fee.lt(parseUnits("0.0001"))) {
      throw new Error("Fee is below minimum.");
    }
    // 1.5% = 0.015
    if (fee.gt(parseUnits("0.015"))) {
      throw new Error("Fee is above maximum.");
    }
  }
};

async function main() {
  // Input arguments for `updateFees` function
  const newProtocolFee = parseUnits("0.012"); // 1.2%
  const newSettlementFee = parseUnits("0.01"); // 1%

  // Get signers
  const [owner] = await ethers.getSigners();

  // Connect to DIVA contract
  const diva = await ethers.getContractAt(DIVA_ABI, DIVA_ADDRESS[network.name]);

  // Get fees history before update
  const feesHistoryLengthBefore = await diva.getFeesHistoryLength();
  const feesHistoryBefore = await diva.getFeesHistory(feesHistoryLengthBefore);

  // Get last fees before update
  const lastFeesBefore = await diva.getFees(feesHistoryLengthBefore - 1);

  // Confirm that all conditions are met before continuing
  await _checkConditions(
    diva,
    owner,
    newProtocolFee,
    newSettlementFee,
    lastFeesBefore
  );

  // Get fees before update
  const feesBefore = (await diva.getGovernanceParameters()).currentFees;

  // Update fees
  const tx = await diva
    .connect(owner)
    .updateFees(newProtocolFee, newSettlementFee);
  const receipt = await tx.wait();

  // Get fees from events
  const protocolFeeFromEvent = receipt.events.find(
    (item: any) =>
      item.event === "FeeUpdated" && item.args.feeType === FeeType.PROTOCOL_FEE
  ).args.fee;
  const settlementFeeFromEvent = receipt.events.find(
    (item: any) =>
      item.event === "FeeUpdated" &&
      item.args.feeType === FeeType.SETTLEMENT_FEE
  ).args.fee;

  // Get fees history after update
  const feesHistoryLengthAfter = await diva.getFeesHistoryLength();
  const feesHistoryAfter = await diva.getFeesHistory(feesHistoryLengthAfter);

  // Get last fees before update
  const lastFeesAfter = await diva.getFees(feesHistoryLengthAfter - 1);

  // Get fees after update
  const feesAfter = (await diva.getGovernanceParameters()).currentFees;

  // Log relevant info
  console.log("DIVA address: ", diva.address);
  console.log("Contract owner address: ", owner.address);
  console.log("Fees before update: ", feesBefore);
  console.log("Fees after update: ", feesAfter);
  console.log("Fees history length before update: ", feesHistoryLengthBefore);
  console.log("Fees history length after update: ", feesHistoryLengthAfter);
  console.log("Fees history before update: ", feesHistoryBefore);
  console.log("Fees history after update: ", feesHistoryAfter);
  console.log("Last fees before update: ", lastFeesBefore);
  console.log("Last fees after update: ", lastFeesAfter);
  console.log("Protocol fee from event: ", protocolFeeFromEvent);
  console.log("Settlement fee from event: ", settlementFeeFromEvent);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
