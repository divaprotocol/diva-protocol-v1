import { Contract } from "ethers";
import { ethers } from "hardhat";

import { IDiamondLoupe } from "../typechain-types";

export class ContractSelectors {
  selectors: string[];
  contract: Contract;

  constructor(contract: Contract, selectors: string[] = []) {
    if (selectors.length) {
      this.selectors = selectors;
    } else {
      const signatures = Object.keys(contract.interface.functions);
      this.selectors = signatures.reduce((acc: string[], val) => {
        if (val !== "init(bytes)") {
          acc.push(contract.interface.getSighash(val));
        }
        return acc;
      }, []);
    }
    this.contract = contract;
  }

  // Get selectors and return new ContractSelectors.
  // functionNames argument is an array of function signatures
  public get(functionNames: string[]) {
    return new ContractSelectors(
      this.contract,
      this.selectors.filter((v) => {
        for (const functionName of functionNames) {
          if (v === this.contract.interface.getSighash(functionName)) {
            return true;
          }
        }
        return false;
      })
    );
  }

  // Remove selectors and return new ContractSelectors.
  // functionNames argument is an array of function signatures
  public remove(functionNames: string[]) {
    return new ContractSelectors(
      this.contract,
      this.selectors.filter((v) => {
        for (const functionName of functionNames) {
          if (v === this.contract.interface.getSighash(functionName)) {
            return false;
          }
        }
        return true;
      })
    );
  }
}

// remove selectors using an array of signatures
export const removeSelectors = (selectors: string[], signatures: string[]) => {
  const iface = new ethers.utils.Interface(
    signatures.map((v) => "function " + v)
  );
  const removeSelectors = signatures.map((v) => iface.getSighash(v));
  selectors = selectors.filter((v) => !removeSelectors.includes(v));
  return selectors;
};

// find a particular address position in the return value of diamondLoupeFacet.facets()
export const findAddressPositionInFacets = (
  facetAddress: string,
  facets: IDiamondLoupe.FacetStructOutput[]
): number => {
  for (let i = 0; i < facets.length; i++) {
    if (facets[i].facetAddress === facetAddress) {
      return i;
    }
  }

  return -1;
};
