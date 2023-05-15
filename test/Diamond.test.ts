import { assert } from "chai";
import { ethers } from "hardhat";
import { ContractReceipt, ContractTransaction } from "ethers";

import {
  ClaimFacet,
  DiamondCutFacet,
  DiamondLoupeFacet,
  EIP712AddFacet,
  EIP712CancelFacet,
  EIP712CreateFacet,
  EIP712RemoveFacet,
  GetterFacet,
  GovernanceFacet,
  LiquidityFacet,
  PoolFacet,
  SettlementFacet,
} from "../typechain-types";

import {
  ContractSelectors,
  removeSelectors,
  findAddressPositionInFacets,
} from "../utils";
import { FacetCutAction } from "../constants";
import { deployMain } from "../scripts/deployMain";

describe("DiamondTest", async function () {
  let diamondAddress: string;
  let diamondCutFacet: DiamondCutFacet,
    diamondLoupeFacet: DiamondLoupeFacet,
    poolFacet: PoolFacet,
    liquidityFacet: LiquidityFacet,
    settlementFacet: SettlementFacet,
    getterFacet: GetterFacet,
    governanceFacet: GovernanceFacet,
    claimFacet: ClaimFacet,
    eip712CreateFacet: EIP712CreateFacet,
    eip712AddFacet: EIP712AddFacet,
    eip712CancelFacet: EIP712CancelFacet,
    eip712RemoveFacet: EIP712RemoveFacet,
    tipFacet: TipFacet;

  let tx: ContractTransaction;
  let receipt: ContractReceipt;
  let result: string[];
  const addresses: string[] = [];

  before(async function () {
    diamondAddress = (await deployMain())[0];
    diamondCutFacet = await ethers.getContractAt(
      "DiamondCutFacet",
      diamondAddress
    );
    diamondLoupeFacet = await ethers.getContractAt(
      "DiamondLoupeFacet",
      diamondAddress
    );
    poolFacet = await ethers.getContractAt("PoolFacet", diamondAddress);
    liquidityFacet = await ethers.getContractAt(
      "LiquidityFacet",
      diamondAddress
    );
    settlementFacet = await ethers.getContractAt(
      "SettlementFacet",
      diamondAddress
    );
    getterFacet = await ethers.getContractAt("GetterFacet", diamondAddress);
    governanceFacet = await ethers.getContractAt(
      "GovernanceFacet",
      diamondAddress
    );
    claimFacet = await ethers.getContractAt("ClaimFacet", diamondAddress);
    eip712CreateFacet = await ethers.getContractAt(
      "EIP712CreateFacet",
      diamondAddress
    );
    eip712AddFacet = await ethers.getContractAt(
      "EIP712AddFacet",
      diamondAddress
    );
    eip712CancelFacet = await ethers.getContractAt(
      "EIP712CancelFacet",
      diamondAddress
    );
    eip712RemoveFacet = await ethers.getContractAt(
      "EIP712RemoveFacet",
      diamondAddress
    );
    tipFacet = await ethers.getContractAt(
      "TipFacet",
      diamondAddress
    );
  });

  // ---------
  // All tests were already included in the Diamond Standard reference implementation and adjusted for the facets used in DIVA
  // ---------

  it("should have thirteen facets -- call to facetAddresses function", async () => {
    for (const address of await diamondLoupeFacet.facetAddresses()) {
      addresses.push(address);
    }

    assert.equal(addresses.length, 13); // Test facets not included
  });

  it("facets should have the right function selectors -- call to facetFunctionSelectors function", async () => {
    let selectors = new ContractSelectors(diamondCutFacet).selectors;
    result = await diamondLoupeFacet.facetFunctionSelectors(addresses[0]);
    assert.sameMembers(result, selectors);

    selectors = new ContractSelectors(diamondLoupeFacet).selectors;
    result = await diamondLoupeFacet.facetFunctionSelectors(addresses[1]);
    assert.sameMembers(result, selectors);

    selectors = new ContractSelectors(poolFacet).selectors;
    result = await diamondLoupeFacet.facetFunctionSelectors(addresses[2]);
    assert.sameMembers(result, selectors);

    selectors = new ContractSelectors(liquidityFacet).selectors;
    result = await diamondLoupeFacet.facetFunctionSelectors(addresses[3]);
    assert.sameMembers(result, selectors);

    selectors = new ContractSelectors(getterFacet).selectors;
    result = await diamondLoupeFacet.facetFunctionSelectors(addresses[4]);
    assert.sameMembers(result, selectors);

    selectors = new ContractSelectors(settlementFacet).selectors;
    result = await diamondLoupeFacet.facetFunctionSelectors(addresses[5]);
    assert.sameMembers(result, selectors);

    selectors = new ContractSelectors(governanceFacet).selectors;
    result = await diamondLoupeFacet.facetFunctionSelectors(addresses[6]);
    assert.sameMembers(result, selectors);

    selectors = new ContractSelectors(claimFacet).selectors;
    result = await diamondLoupeFacet.facetFunctionSelectors(addresses[7]);
    assert.sameMembers(result, selectors);

    selectors = new ContractSelectors(eip712CreateFacet).selectors;
    result = await diamondLoupeFacet.facetFunctionSelectors(addresses[8]);
    assert.sameMembers(result, selectors);

    selectors = new ContractSelectors(eip712AddFacet).selectors;
    result = await diamondLoupeFacet.facetFunctionSelectors(addresses[9]);
    assert.sameMembers(result, selectors);

    selectors = new ContractSelectors(eip712CancelFacet).selectors;
    result = await diamondLoupeFacet.facetFunctionSelectors(addresses[10]);
    assert.sameMembers(result, selectors);

    selectors = new ContractSelectors(eip712RemoveFacet).selectors;
    result = await diamondLoupeFacet.facetFunctionSelectors(addresses[11]);
    assert.sameMembers(result, selectors);

    selectors = new ContractSelectors(tipFacet).selectors;
    result = await diamondLoupeFacet.facetFunctionSelectors(addresses[12]);
    assert.sameMembers(result, selectors);
  });

  it("should associate selectors with facets correctly -- multiple calls to facetAddress function", async () => {
    // Function selectors example contract: https://solidity-by-example.org/function-selector/
    assert.equal(
      addresses[0], // DiamondCutFacet
      await diamondLoupeFacet.facetAddress("0x1f931c1c") // bytes4(keccak256(bytes(diamondCut((address,uint8,bytes4[])[],address,bytes))))
    );
    assert.equal(
      addresses[1], // DiamondLoupeFacet
      await diamondLoupeFacet.facetAddress("0xcdffacc6")
    );
    assert.equal(
      addresses[1], // DiamondLoupeFacet
      await diamondLoupeFacet.facetAddress("0x01ffc9a7")
    );
    assert.equal(
      addresses[2], // PoolFacet //
      await diamondLoupeFacet.facetAddress("0x995b72f8") // bytes4(keccak256(bytes(createContingentPool((string,uint96,uint256,uint256,uint256,uint256,uint256,address,address,uint256,address,address,address)))))
    );
    assert.equal(
      addresses[3], // LiquidityFacet
      await diamondLoupeFacet.facetAddress("0x35458660") // bytes4(keccak256(bytes(addLiquidity(bytes32,uint256,address,address))))
    );
    assert.equal(
      addresses[4], // GetterFacet
      await diamondLoupeFacet.facetAddress("0x8eec5d70") // bytes4(keccak256(bytes(getPoolCount())))
    );
    assert.equal(
      addresses[5], // SettlementFacet
      await diamondLoupeFacet.facetAddress("0x3c8c5fc7") // bytes4(keccak256(bytes(challengeFinalReferenceValue(bytes32,uint256))))
    );
    assert.equal(
      addresses[6], // GovernanceFacet
      await diamondLoupeFacet.facetAddress("0x7f51bb1f") // bytes4(keccak256(bytes(updateTreasury(address))))
    );
    assert.equal(
      addresses[7], // ClaimFacet
      await diamondLoupeFacet.facetAddress("0x6cac65fb") // bytes4(keccak256(bytes(claimFee(address,address))))
    );
    assert.equal(
      addresses[8], // EIP712CreateFacet
      await diamondLoupeFacet.facetAddress("0x52613920") // bytes4(keccak256(bytes(fillOfferCreateContingentPool((address,address,uint256,uint256,bool,uint256,uint256,string,uint96,uint256,uint256,uint256,uint256,address,address,uint256,address,uint256),(uint8,bytes32,bytes32),uint256))))
    );
    assert.equal(
      addresses[9], // EIP712AddFacet
      await diamondLoupeFacet.facetAddress("0x4d483bc6") // bytes4(keccak256(bytes(fillOfferAddLiquidity((address,address,uint256,uint256,bool,uint256,uint256,bytes32,uint256),(uint8,bytes32,bytes32),uint256)))))
    );
    assert.equal(
      addresses[10], // EIP712CancelFacet
      await diamondLoupeFacet.facetAddress("0xc6da33a4") // bytes4(keccak256(bytes(cancelOfferCreateContingentPool((address,address,uint256,uint256,bool,uint256,uint256,string,uint96,uint256,uint256,uint256,uint256,address,address,uint256,address,uint256)))))
    );
    assert.equal(
      addresses[11], // EIP712RemoveFacet
      await diamondLoupeFacet.facetAddress("0x33b39d6f") // bytes4(keccak256(bytes(fillOfferRemoveLiquidity((address,address,uint256,uint256,bool,uint256,uint256,bytes32,uint256),(uint8,bytes32,bytes32),uint256))))
    );
    assert.equal(
      addresses[12], // TipFacet
      await diamondLoupeFacet.facetAddress("0x8691fb58") // bytes4(keccak256(bytes(addTip(bytes32,uint256))))
    );
  });

  it("should add test1 functions", async () => {
    const Test1Facet = await ethers.getContractFactory("Test1Facet");
    const test1Facet = await Test1Facet.deploy();
    await test1Facet.deployed();
    addresses.push(test1Facet.address);
    const selectors = new ContractSelectors(test1Facet).remove([
      "supportsInterface(bytes4)",
    ]).selectors;
    tx = await diamondCutFacet.diamondCut(
      [
        {
          facetAddress: test1Facet.address,
          action: FacetCutAction.Add,
          functionSelectors: selectors,
        },
      ],
      ethers.constants.AddressZero,
      "0x"
    );
    receipt = await tx.wait();
    if (!receipt.status) {
      throw Error(`Diamond upgrade failed: ${tx.hash}`);
    }
    result = await diamondLoupeFacet.facetFunctionSelectors(test1Facet.address);
    assert.sameMembers(result, selectors);
  });

  it("should test function call", async () => {
    const test1Facet = await ethers.getContractAt("Test1Facet", diamondAddress);
    await test1Facet.test1Func10();
  });

  it("should replace supportsInterface function", async () => {
    // Replacing a function means removing a function and adding a new function from a different facet but with the same function signature as the one removed
    const test1FacetFactory = await ethers.getContractFactory("Test1Facet");
    const test1Facet = await test1FacetFactory.deploy();
    const selectors = new ContractSelectors(test1Facet).get([
      "supportsInterface(bytes4)",
    ]).selectors;
    const testFacetAddress = addresses[addresses.length - 1]; // assumed to be the last element in array as added during the text
    tx = await diamondCutFacet.diamondCut(
      [
        {
          facetAddress: testFacetAddress,
          action: FacetCutAction.Replace,
          functionSelectors: selectors,
        },
      ],
      ethers.constants.AddressZero,
      "0x"
    );
    receipt = await tx.wait();
    if (!receipt.status) {
      throw Error(`Diamond upgrade failed: ${tx.hash}`);
    }
    result = await diamondLoupeFacet.facetFunctionSelectors(testFacetAddress);
    assert.sameMembers(result, new ContractSelectors(test1Facet).selectors);
  });

  it("should add test2 functions", async () => {
    const Test2Facet = await ethers.getContractFactory("Test2Facet");
    const test2Facet = await Test2Facet.deploy();
    await test2Facet.deployed();
    addresses.push(test2Facet.address);
    const selectors = new ContractSelectors(test2Facet).selectors;
    tx = await diamondCutFacet.diamondCut(
      [
        {
          facetAddress: test2Facet.address,
          action: FacetCutAction.Add,
          functionSelectors: selectors,
        },
      ],
      ethers.constants.AddressZero,
      "0x"
    );
    receipt = await tx.wait();
    if (!receipt.status) {
      throw Error(`Diamond upgrade failed: ${tx.hash}`);
    }
    result = await diamondLoupeFacet.facetFunctionSelectors(test2Facet.address);
    assert.sameMembers(result, selectors);
  });

  it("should remove some test2 functions", async () => {
    const test2Facet = await ethers.getContractAt("Test2Facet", diamondAddress);
    const functionsToKeep = [
      "test2Func1()",
      "test2Func5()",
      "test2Func6()",
      "test2Func19()",
      "test2Func20()",
    ];
    const selectors = new ContractSelectors(test2Facet).remove(
      functionsToKeep
    ).selectors;
    tx = await diamondCutFacet.diamondCut(
      [
        {
          facetAddress: ethers.constants.AddressZero,
          action: FacetCutAction.Remove,
          functionSelectors: selectors,
        },
      ],
      ethers.constants.AddressZero,
      "0x"
    );
    receipt = await tx.wait();
    if (!receipt.status) {
      throw Error(`Diamond upgrade failed: ${tx.hash}`);
    }
    result = await diamondLoupeFacet.facetFunctionSelectors(
      addresses[addresses.length - 1]
    );
    assert.sameMembers(
      result,
      new ContractSelectors(test2Facet).get(functionsToKeep).selectors
    );
  });

  it("should remove some test1 functions", async () => {
    const test1Facet = await ethers.getContractAt("Test1Facet", diamondAddress);
    const functionsToKeep = ["test1Func2()", "test1Func11()", "test1Func12()"];
    const selectors = new ContractSelectors(test1Facet).remove(
      functionsToKeep
    ).selectors;
    tx = await diamondCutFacet.diamondCut(
      [
        {
          facetAddress: ethers.constants.AddressZero,
          action: FacetCutAction.Remove,
          functionSelectors: selectors,
        },
      ],
      ethers.constants.AddressZero,
      "0x"
    );
    receipt = await tx.wait();
    if (!receipt.status) {
      throw Error(`Diamond upgrade failed: ${tx.hash}`);
    }
    result = await diamondLoupeFacet.facetFunctionSelectors(
      addresses[addresses.length - 2]
    );
    assert.sameMembers(
      result,
      new ContractSelectors(test1Facet).get(functionsToKeep).selectors
    );
  });

  it("should remove all functions and facets except 'diamondCut' and 'facets'", async () => {
    let selectors = [];
    let facets = await diamondLoupeFacet.facets();
    for (let i = 0; i < facets.length; i++) {
      selectors.push(...facets[i].functionSelectors);
    }
    selectors = removeSelectors(selectors, [
      "facets()",
      "diamondCut(tuple(address,uint8,bytes4[])[],address,bytes)",
    ]);
    tx = await diamondCutFacet.diamondCut(
      [
        {
          facetAddress: ethers.constants.AddressZero,
          action: FacetCutAction.Remove,
          functionSelectors: selectors,
        },
      ],
      ethers.constants.AddressZero,
      "0x"
    );
    receipt = await tx.wait();
    if (!receipt.status) {
      throw Error(`Diamond upgrade failed: ${tx.hash}`);
    }
    facets = await diamondLoupeFacet.facets();
    assert.equal(facets.length, 2);
    assert.equal(facets[0][0], addresses[0]);
    assert.sameMembers(facets[0][1], ["0x1f931c1c"]);
    assert.equal(facets[1][0], addresses[1]);
    assert.sameMembers(facets[1][1], ["0x7a0ed627"]);
  });

  it("should add most functions and facets", async () => {
    // Note that all functions except for diamondCut() and facets() function (in DiamondCutFacet and DiamondLoupeFacet) were removed in the previous test block
    // That's why adding previously existing functions is possible in this test
    const diamondLoupeFacetSelectors = new ContractSelectors(
      diamondLoupeFacet
    ).remove(["supportsInterface(bytes4)"]);
    const test1FacetFactory = await ethers.getContractFactory("Test1Facet");
    const test1Facet = await test1FacetFactory.deploy();
    const test2FacetFactory = await ethers.getContractFactory("Test2Facet");
    const test2Facet = await test2FacetFactory.deploy();
    // Any number of functions from any number of facets can be added/replaced/removed in a
    // single transaction
    const cut = [
      {
        facetAddress: addresses[1], // DiamondLoupeFacet
        action: FacetCutAction.Add,
        functionSelectors: diamondLoupeFacetSelectors.remove(["facets()"])
          .selectors,
      },
      {
        facetAddress: addresses[2], // PoolFacet
        action: FacetCutAction.Add,
        functionSelectors: new ContractSelectors(poolFacet).selectors,
      },
      {
        facetAddress: addresses[3], // LiquidityFacet
        action: FacetCutAction.Add,
        functionSelectors: new ContractSelectors(liquidityFacet).selectors,
      },
      {
        facetAddress: addresses[4], // GetterFacet
        action: FacetCutAction.Add,
        functionSelectors: new ContractSelectors(getterFacet).selectors,
      },
      {
        facetAddress: addresses[5], // SettlementFacet
        action: FacetCutAction.Add,
        functionSelectors: new ContractSelectors(settlementFacet).selectors,
      },
      {
        facetAddress: addresses[6], // GovernanceFacet
        action: FacetCutAction.Add,
        functionSelectors: new ContractSelectors(governanceFacet).selectors,
      },
      {
        facetAddress: addresses[7], // ClaimFacet
        action: FacetCutAction.Add,
        functionSelectors: new ContractSelectors(claimFacet).selectors,
      },
      {
        facetAddress: addresses[8], // EIP712CreateFacet
        action: FacetCutAction.Add,
        functionSelectors: new ContractSelectors(eip712CreateFacet).selectors,
      },
      {
        facetAddress: addresses[9], // EIP712AddFacet
        action: FacetCutAction.Add,
        functionSelectors: new ContractSelectors(eip712AddFacet).selectors,
      },
      {
        facetAddress: addresses[10], // EIP712CancelFacet
        action: FacetCutAction.Add,
        functionSelectors: new ContractSelectors(eip712CancelFacet).selectors,
      },
      {
        facetAddress: addresses[11], // EIP712RemoveFacet
        action: FacetCutAction.Add,
        functionSelectors: new ContractSelectors(eip712RemoveFacet).selectors,
      },
      {
        facetAddress: addresses[12], // TipFacet
        action: FacetCutAction.Add,
        functionSelectors: new ContractSelectors(tipFacet).selectors,
      },
      {
        facetAddress: addresses[addresses.length - 2], // TestFacet1 (added during tests)
        action: FacetCutAction.Add,
        functionSelectors: new ContractSelectors(test1Facet).selectors,
      },
      {
        facetAddress: addresses[addresses.length - 1], // TestFacet2 (added during tests)
        action: FacetCutAction.Add,
        functionSelectors: new ContractSelectors(test2Facet).selectors,
      },
    ];
    tx = await diamondCutFacet.diamondCut(
      cut,
      ethers.constants.AddressZero,
      "0x"
    );
    receipt = await tx.wait();
    if (!receipt.status) {
      throw Error(`Diamond upgrade failed: ${tx.hash}`);
    }
    const facets = await diamondLoupeFacet.facets();
    const facetAddresses = await diamondLoupeFacet.facetAddresses();
    assert.equal(facetAddresses.length, 15); // 15 is including DiamondCutFacet and the two test facets
    assert.equal(facets.length, 15);
    assert.sameMembers(facetAddresses, addresses);
    assert.equal(facets[0][0], facetAddresses[0], "first facet");
    assert.equal(facets[1][0], facetAddresses[1], "second facet");
    assert.equal(facets[2][0], facetAddresses[2], "third facet");
    assert.equal(facets[3][0], facetAddresses[3], "fourth facet");
    assert.equal(facets[4][0], facetAddresses[4], "fifth facet");
    assert.equal(facets[5][0], facetAddresses[5], "sixth facet");
    assert.equal(facets[6][0], facetAddresses[6], "seventh facet");
    assert.equal(facets[7][0], facetAddresses[7], "eigth facet");
    assert.equal(facets[8][0], facetAddresses[8], "ninth facet");
    assert.equal(facets[9][0], facetAddresses[9], "tenth facet");
    assert.equal(facets[10][0], facetAddresses[10], "eleventh facet");
    assert.equal(facets[11][0], facetAddresses[11], "twelveth facet");
    assert.equal(facets[12][0], facetAddresses[12], "thirteenth facet");
    assert.equal(facets[13][0], facetAddresses[13], "fourteenth facet");
    assert.equal(facets[14][0], facetAddresses[14], "fifteenth facet");
    assert.sameMembers(
      facets[findAddressPositionInFacets(addresses[0], facets)][1],
      new ContractSelectors(diamondCutFacet).selectors
    );
    assert.sameMembers(
      facets[findAddressPositionInFacets(addresses[1], facets)][1],
      diamondLoupeFacetSelectors.selectors
    );
    assert.sameMembers(
      facets[findAddressPositionInFacets(addresses[2], facets)][1],
      new ContractSelectors(poolFacet).selectors
    );
    assert.sameMembers(
      facets[findAddressPositionInFacets(addresses[3], facets)][1],
      new ContractSelectors(liquidityFacet).selectors
    );
    assert.sameMembers(
      facets[findAddressPositionInFacets(addresses[4], facets)][1],
      new ContractSelectors(getterFacet).selectors
    );
    assert.sameMembers(
      facets[findAddressPositionInFacets(addresses[5], facets)][1],
      new ContractSelectors(settlementFacet).selectors
    );
    assert.sameMembers(
      facets[findAddressPositionInFacets(addresses[6], facets)][1],
      new ContractSelectors(governanceFacet).selectors
    );
    assert.sameMembers(
      facets[findAddressPositionInFacets(addresses[7], facets)][1],
      new ContractSelectors(claimFacet).selectors
    );
    assert.sameMembers(
      facets[findAddressPositionInFacets(addresses[8], facets)][1],
      new ContractSelectors(eip712CreateFacet).selectors
    );
    assert.sameMembers(
      facets[findAddressPositionInFacets(addresses[9], facets)][1],
      new ContractSelectors(eip712AddFacet).selectors
    );
    assert.sameMembers(
      facets[findAddressPositionInFacets(addresses[10], facets)][1],
      new ContractSelectors(eip712CancelFacet).selectors
    );
    assert.sameMembers(
      facets[findAddressPositionInFacets(addresses[11], facets)][1],
      new ContractSelectors(eip712RemoveFacet).selectors
    );
    assert.sameMembers(
      facets[findAddressPositionInFacets(addresses[12], facets)][1],
      new ContractSelectors(tipFacet).selectors
    );
    assert.sameMembers(
      facets[findAddressPositionInFacets(addresses[13], facets)][1],
      new ContractSelectors(test1Facet).selectors
    );
    assert.sameMembers(
      facets[findAddressPositionInFacets(addresses[14], facets)][1],
      new ContractSelectors(test2Facet).selectors
    );
  });
});
