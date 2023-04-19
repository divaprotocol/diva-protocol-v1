# DIVA Protocol v1 - Documentation

This documentation outlines the functionality of DIVA Protocol v1.

## Table of contents

1. [System overview](#system-overview) \
  1.1 [Upgradeability](#upgradeability) \
  1.2 [Ownership](#ownership) \
  1.3 [Deployment](#deployment)

2. [Derivatives](#derivatives)

3. [DIVA Protocol](#diva-protocol) \
  3.1 [Key features](#key-features) \
  3.2 [Architecture](#architecture) \
  3.3 [Upgradeability](#upgradeability-1) \
  3.4 [Facet overview](#facet-overview) \
  3.5 [Function overview](#function-overview) \
  3.6 [Contingent pools](#contingent-pools) \
  3.7 [Payoffs](#payoffs) \
  3.8 [Adding liquidity](#adding-liquidity) \
  3.9 [Removing liquidity](#removing-liquidity) \
  3.10 [Oracles](#oracles) \
  3.11 [Settlement process](#settlement-process) \
  3.12 [Challenge](#challenge) \
  3.13 [Redeem position token](#redeem-position-token) \
  3.14 [Fees](#fees) \
  3.15 [EIP712 based functions](#eip712-based-functions) \
  3.16 [Structs](#structs) \
  3.17 [Governance](#governance) \
  3.18 [Getter functions](#getter-functions-1) \
  3.19 [Reentrancy protection](#reentrancy-protection) \
  3.20 [Events](#events-1) \
  3.21 [Errors](#errors-1)

4. [DIVA Ownership on main chain](#diva-ownership-on-main-chain) \
   4.1 [Function overview](#function-overview-1) \
   4.2 [State modifying functions](#state-modifying-functions) \
   4.3 [Getter functions](#getter-functions-2) \
   4.4 [Reentrancy protection](#reentrancy-protection-1) \
   4.5 [Events](#events-1) \
   4.6 [Errors](#errors-1)

5. [DIVA Ownership on secondary chains](#diva-ownership-on-secondary-chains) \
   5.1 [What is Tellor Protocol](#what-is-tellor) \
   5.2 [How Tellor protocol works](#how-tellor-protocol-works) \
   5.3 [Cross-chain communication of DIVA owner](#cross-chain-communication-of-diva-owner) \
   5.4 [Report verification](#report-verification) \
   5.5 [Monitoring](#monitoring) \
   5.6 [Attack vectors](#attack-vectors) \
   5.7 [Function overview](#function-overview-2) \
   5.8 [State modifying functions](#state-modifying-functions-1) \
   5.9 [Getter functions](#getter-functions-3) \
   5.10 [Reentrancy protection](#reentrancy-protection-2) \
   5.11 [Events](#events-1) \
   5.12 [Errors](#errors-1)

6. [DIVA Development fund](#diva-development-fund) \
   6.1 [Function overview](#function-overview-3)  \
   6.2 [Deposits](#deposits) \
   6.3 [Withdrawals](#deposits) \
   6.4 [Getter functions](#getter-functions-4) \
   6.5 [Reentrancy protection](#reentrancy-protection-3) \
   6.6 [Events](#events-1) \
   6.7 [Errors](#errors-1)

7. [Risk disclaimer](#risk-disclaimer)

# System overview

The following four components form the **DIVA Protocol system on Ethereum (main chain)**:

| Component        | Contract name |Description                                                                                                                                |
| :---------------- |:---------------- | :----------------------------------------------------------------------------------------------------------------------------------------- |
| [DIVA Protocol](#diva-protocol)         | `Diamond` & [Facet contracts](#facet-overview) | Implements the logic around creating and settling derivative products using the Diamond standard.                                               |
| [DIVA Ownership](#diva-ownership-on-main-chain)         |`DIVAOwnershipMain`| Stores the owner that the DIVA Protocol smart contract inherits and implements the [owner election mechanism](#owner-election-mechanism).                                               |
| [DIVA Development Fund](#diva-development-fund)         |`DIVADevelopmentFund`| Implements the functionality to deposit and withdraw funds used for protocol development. The unreleased DIVA Token supply will be the first asset deposited into the contract, subject to a 30-year vesting period.                                               |
| [`DIVA Token`](#diva-token)         |`DIVAToken`| ERC20 token with 18 decimals and 100 million supply which acts as a voting token within the ownership transfer logic.                                               |

The DIVA Protocol system on secondary chains is different in two ways:
1. To avoid duplicating the owner election process and the DIVA token, a cross-chain communication mechanism using the [Tellor protocol](https://tellor.io/) is utilized to share the DIVA owner information stored in `DIVAOwnershipMain` contract with the `DIVAOwnershipSecondary` contract on secondary chains. This results in a secondary chain-specific version of the Ownership contract and eliminates the need for a DIVA Token.
1. To reduce the incentive for unauthorized access to secondary chain contracts, the DIVA Development Fund is exclusively deployed on Ethereum, minimizing the risk of potential losses. For more information, please refer to the [`Ownership on secondary chains`](#diva-ownership-on-secondary-chains) section.

The DIVA Protocol system on main and secondary chains is depicted below:

![221219 DIVA Protocol System Overview-Incl  Development Fund on Sec chain drawio](https://user-images.githubusercontent.com/37043174/215358726-68017036-c001-4eef-acea-60587f6a3830.png)

## Upgradeability

Although DIVA Protocol implements an upgradeability feature, it will be disabled shortly after deployment via the `disableUpgradeability.ts` and `xdeployDisableUpgradeability.ts` scripts. All other contracts in the DIVA system are not upgradeable.

## Ownership

The DIVA Protocol and the DIVA Development Fund both implement an owner, inherited from `DIVAOwnershipMain` contract on main chain and `DIVAOwnershipSecondary` contract on secondary chains, which grants certain privileged rights. For DIVA Protocol, these include:
- Updating fees
- Updating settlement related periods
- Updating fallback data provider
- Updating treasury address where protocol fees are directed
- Pausing withdrawals for a maximum of 8 days
- Unpausing withdrawals if paused

For DIVA Development Fund, this includes:
- Withdrawing vested assets, including DIVA token issuance

Inheriting the owner from a separate contract ensures that future versions of DIVA Protocol, as well as other related contracts such as [`DIVADevelopmentFund`](#diva-development-fund), can inherit the same owner and are subject to the same [owner election mechanism](#owner-election-mechanism).

>**Note:** Updating fees, settlement related periods, fallback data provider and treasury address are subject to a delay before they are activated. Pending updates can be revoked by the owner. The other rights take immediate effect. Refer to the [governance](#governance) section for more details.

<h2 id="deployment">Deployment</h2>

### Main chain

The deployment of the DIVA Protocol system on the main chain (Ethereum) is an eight step process and is implemented in `scripts/deployMain.ts`:

1. Deploy `DIVAToken` contract.
1. Deploy `DIVAOwnershipMain` contract passing the initial owner address and the DIVA Token address as constructor arguments. The DIVA Token acts as a voting token in the [owner election mechanism](#owner-election-mechanism) thats is implemented in `DIVAOwnershipMain`.
1. Deploy `DIVADevelopmentFund` contract passing the `DIVAOwnershipMain` contract address as constructor argument to inherit the owner.
1. Deploy `DiamondCutFacet` contract which implements the `diamondCut` function which allows to add/remove/replace facet functions. No arguments required for the constructor.
1. Deploy `PositionTokenFactory` contract which is used to create position token clones for new contingent pools.
1. Deploy `Diamond` contract which implements the `delegatecall` function and which users will interact with. The constructor expects five arguments: \
   (i) `DIVAOwnershipMain` contract address to inherit the owner \
   (ii) Fallback data provider address \
   (iii) `DiamondCutFacet` address \
   (iv) Treasury address, and \
   (v) Position token factory address. \
   All other relevant protocol parameters are hard-coded inside the Diamond constructor.
1. Deploy the facet contracts individually. Facet contracts do not have constructors in a Diamond based structure.
1. Link the [facet contracts](#facet-overview) to the Diamond by calling the `diamondCut` function inside `DiamondCutFacet` contract. No initialization function is passed into `diamondCut` (second and third arguments) as state variables are initialized in the diamond constructor.

>**Note:** The initial owner should be staked shortly after the deployment process to prevent a scenario where an election cycle is triggered shortly after contract deployment. This is not a problem if the DIVA Token is not distributed beforehand.

### Secondary chain

Deploying the DIVA Protocol system on a secondary chain is similar to the [main chain](#main-chain) deployment, with a few key differences. The ownership contract `DIVAOwnershipSecondary` on the secondary chain does not implement the owner election mechanism but instead uses the Tellor protocol to sync the main chain owner. As a result, there is no need to deploy the `DIVAToken` contract. Additionally, the `DIVAOwnershipSecondary` contract requires a different set of constructor arguments: \
    i) Initial owner address, \
    ii) [Tellor oracle address](https://docs.tellor.io/tellor/the-basics/contracts-reference) for the corresponding secondary chain, \
    iii) Main chain Id (1 for Ethereum), and \
    iv) `DIVAOwnershipMain` address on main chain. \
The process for deploying to a secondary chain is outlined in the `scripts/deploySecondary.ts` file.

>**Note:** The deployment to a secondary chain is dependent on the availability of the Tellor protocol on that chain.

# Derivatives

To understand DIVA Protocol, it is crucial to understand what a derivative is. A derivative is a contract between two parties that specifies under which conditions payments will be made. Payment conditions are defined by an event and a payoff profile that links the payout to the outcome of the event. Both parties deposit a certain amount of money to participate in the contract to have the opportunity to receive the combined amount as payout. The counterparties have opposite payoff profiles, meaning that one party profits when the other party loses.

The key parts that form a derivative contract are visualized below:

<p align="center">
  <img src="https://user-images.githubusercontent.com/37043174/214244207-8168e59a-987b-441b-bd32-374048023231.png" />
</p>

Derivatives are used in the context of risk management, yield optimization, leverage and directional bets. Examples of derivatives include traditional call/put options, insurance, structured products, conditional donations, credit default swaps, sports bets, political bets, and more. 

DIVA Protocol encodes the fundamental logic of derivatives into a smart contract, enabling users to create and settle derivative products such as insurance, structured products, prediction markets, swaps, and many more, peer-to-peer, eliminating the need for a central intermediary.

# DIVA Protocol

DIVA Protocol is a decentralized infrastructure that enables users to create and settle fully customizable event-linked products, also known as "[derivatives](#derivatives)", in a permissionless manner, without involving a central intermediary. By depositing collateral, a user is issued two directionally reversed positions, referred to as long and short positions, that combined represent a claim on the deposited collateral, but when held in isolation, exposes the user to the upside (via the long position) or downside (via the short position) of the underlying metric. The payoffs of long and short positions are zero-sum, meaning that for every unit of collateral that the long position may gain, the short position will lose and vice versa. The shape of the payoff curves is governed by four parameters (floor, inflection, cap and gradient) which allows for a wide range of [payoff profiles](#payoffs) and unique derivative products. The following graphic illustrates the basic idea.

<p align="center">
<img src="https://user-images.githubusercontent.com/37043174/165339785-dd32a435-88e4-47a4-96c0-96ea5489de47.png" width="900">
</p>

The long and short positions are represented by ERC20 tokens that can be integrated into any decentralized or centralized trading infrastructure. Traders can buy and sell those position tokens on the secondary market for speculation or hedging purposes.

The payoffs of long and short position tokens are derived based on the outcome of the underlying metric (e.g., the BTC price at the end of the year) and the underlying [payoff function](#payoffs). After the outcome has been reported by an oracle following expiration, users can withdraw their respective share in the collateral by sending their long and short position tokens back to the DIVA smart contract. Position tokens are burnt in that process. The vault that holds the collateral asset during the lifetime of the position tokens is referred to as contingent pool.

## Key features

- **Permissionless**: Anyone can create and settle derivative assets on anything without the need for intermediaries.
- **Fully collateralized**: The solvency of each position token is guaranteed by the collateral locked in the DIVA smart contract, which eliminates counterparty risk, the need for margin calls, and allows for a more secure and frictionless experience.
- **Highly customizable**:
  - **Underlyings**: The underlyings are not limited to prices of traded assets such as BTC or ETH but may include any other non-traded metric with a public data feed such as the TVL locked in DeFi, Ethereum gas price, Bitcoin hash rate, the total crypto market cap, or the amount hacked in a DeFi protocol.
  - **Payoffs**: DIVA protocols offers six different classes of [payoff profiles](#payoffs) including linear, binary, convex, and concave payoff curves.
  - **Oracles**: DIVA Protocol is oracle agnostic meaning that any oracle including trusted individual accounts, multisigs, existing decentralized oracles solutions like Chainlink, Tellor or DIA or custom oracle smart contracts can be used.
  - **Collateral token**: DIVA Protocol allows to use a wide range of ERC20 token as collateral including DAI, USDC, USDT, WBTC, WETH, as well as interest/yield bearing tokens such as Compound's cDAI token or wrapped staked ETH (wstETH).
- **Fallback layers for reporting**: The protocol features an optional dispute mechanism and a fallback layer to ensure that position tokens are settled correctly.
- **Built-in compliance layer**: DIVA Protocol allows to restrict the transfer of position tokens to holders of a pre-defined NFT (such as a KYC NFT) which allows traditional financial institutions to comply with existing KYC/AML regulations.

## Architecture

DIVA Protocol is implemented following the [Diamond Standard (EIP-2535)][eip2535]. It's a battle tested smart contract design pattern that allows for a modular architecture and helps to overcome existing limitations such as the 24KB contract size limit. The `Diamond` proxy contract forms the foundation of the DIVA Protocol. The proxy uses `delegatecall` to different contracts known as "facets" which contain the logic. A user only interacts with the `Diamond` proxy contract. In a Diamond, the `Diamond` contract stores the data and facets read and write the data.

Key benefits of a Diamond based architecture:

- Solves the contract size limit of 24KB
- Multiple implementation contracts can be used
- Code can be split into manageable pieces
- Upgradeability feature which can be disabled when no longer needed
- Modular smart contract design
- Readability and flexibility
- Cleaner storage for upgradable contracts compared to existing upgrade patterns

## Upgradeability

A Diamond allows to add/replace/remove facet functions if the `diamondCut` function is implemented. The mutability of the DIVA smart contract will be deactivated shortly after contract deployment via the `disableUpgradeability.ts` and `xdeployDisableUpgradeability.ts` scripts.

## Facet overview

The following facet contracts form the DIVA Protocol Diamond:

| Facet name        | Description                                                                                                                                |
| :---------------- | :----------------------------------------------------------------------------------------------------------------------------------------- |
| PoolFacet         | Implements the function to create a contingent pool and mint the short and long position tokens.                                               |
| LiquidityFacet    | Implements functions to add and remove liquidity to/from existing pools.                                                                   |
| SettlementFacet   | Implements settlement related functions including submitting the final value, challenging a submitted value and redeeming position tokens. |
| ClaimFacet        | Implements functions to claim and transfer reporting rewards and protocol fees.                                                                                     |
| TipFacet        | Implements functions to add tips to a pool.                                                                                     |
| GovernanceFacet   | Provides an interface for the owner of the DIVA contract to change protocol parameters such as fees and settlement related periods.        |
| GetterFacet       | Implements getter functions to read contingent pool state, governance parameters, fee claims, contract owner and EIP712 offer states.      |
| EIP712CreateFacet | Implements an EIP712 based, gas efficient version of the create contingent pool function.                                                  |
| EIP712AddFacet    | Implements an EIP712 based, gas efficient version of the add liquidity function.                                                           |
| EIP712RemoveFacet    | Implements an EIP712 based, gas efficient version of the remove liquidity function.                                                           |
| EIP712CancelFacet | Implements functions to cancel create contingent pool and add liquidity offers.                                                            |

The following two facets are part of the Diamond Standard's reference implementation:
|Facet name|Description|
|:---|:---|
| DiamondCutFacet | Implements the function to add/replace/remove any number of functions used by the Diamond. |
| DiamondLoupeFacet | Implements functions to retrieve information about the facet contracts linked to the Diamond. |

## Function overview

DIVA Protocol implements the following functions:

| Function                                                                                  | Description                                                                                                                                                 |
| :---------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Core protocol functions**                                                               |                                                                                                                                                             |
| [`createContingentPool`](#createcontingentpool)                                           | Function to create a new contingent pool and mint short and long position tokens.                                                                          |
| [`addLiquidity`](#adding-liquidity)                                                       | Function to mint short and long position tokens by adding collateral to an existing contingent pool.                                                        |
| [`removeLiquidity`](#removing-liquidity)                                                  | Function to remove collateral from an existing contingent pool by burning short and long position tokens.                          |
| [`setFinalReferenceValue`](#setfinalreferencevalue)                                       | Function to submit the final value of the reference asset.                                                                                                  |
| [`challengeFinalReferenceValue`](#challengefinalreferencevalue)                           | Function to challenge the final reference value submitted by the data provider.                                                                             |
| [`redeemPositionToken`](#redeempositiontoken)                                             | Function called by position token holders to redeem their short and long position tokens in return for collateral after the final value has been confirmed. |
| **Fee related functions**                                                                 |                                                                                                                                                             |
| [`claimFee`](#claimfee)                                                                   | Function to claim reporting rewards and protocol fees.                                                                                                                                      |
| [`transferFeeClaim`](#transferfeeclaim)                                                   | Function to transfer a reward/fee claim to another recipient.                                                                                                      |
| [`addTip`](#addtip)                                                   | Function to add a tip in collateral token to a specific pool.                                                                                                      |
| **EIP712 based functions**                                                                |                                                                                                                                                             |
| [`fillOfferCreateContingentPool`](#filloffercreatecontingentpool)                         | Function to fill an EIP712 based offer to create a contingent pool.                                                                                         |
| [`fillOfferAddLiquidity`](#fillofferaddliquidity)                                         | Function to fill an EIP712 based offer to add liquidity to an existing pool.                                                                                |
| [`fillOfferRemoveLiquidity`](#fillofferremoveliquidity)                                         | Function to fill an EIP712 based offer to remove liquidity from an existing pool.                                                                                |
| [`cancelOfferCreateContingentPool`](#canceloffercreatecontingentpool)                     | Function to cancel a create contingent pool offer.                                                                                                          |
| [`cancelOfferAddLiquidity`](#cancelofferaddliquidity)                                     | Function to cancel an add liquidity offer.                                                                                                                  |
| [`cancelOfferRemoveLiquidity`](#cancelofferremoveliquidity)                                     | Function to cancel a remove liquidity offer.                                                                                                                  |
| **Batch functions**                      |                  
| [`batchCreateContingentPool`](#batchcreatecontingentpool)                                             | Batch version of `createContingentPool`. |
| [`batchAddLiquidity`](#batchaddliquidity)                                             | Batch version of `addLiquidity`. |
| [`batchRemoveLiquidity`](#batchremoveliquidity)                                             | Batch version of `removeLiquidity`. |
|[`batchSetFinalReferenceValue`](#batchsetfinalreferencevalue)|Batch version of `setFinalReferenceValue`.|
|[`batchChallengeFinalReferenceValue`](#batchchallengefinalreferencevalue)|Batch version of `challengeFinalReferenceValue`.|
|[`batchRedeemPositionToken`](#batchredeempositiontoken)|Batch version of `redeemPositionToken`.|
| [`batchClaimFee`](#batchclaimfee)                                                         | Batch version of `claimFee` function.                                                                                                                       |
| [`batchTransferFeeClaim`](#batchtransferfeeclaim)                                         | Batch version of `transferFeeClaim` function.                                                                                                               |
| [`batchAddTip`](#batchaddtip)                                         | Batch version of `addTip` function.                                                                                                               |
| [`batchFillOfferCreateContingentPool`](#batchfilloffercreatecontingentpool)                                     | Batch version of `fillOfferCreateContingentPool` offer.                                                                                                                  |
| [`batchFillOfferAddLiquidity`](#batchfillofferaddliquidity)                                     | Batch version of `fillOfferAddLiquidity` function.                                                                                                                  |
| [`batchFillOfferRemoveLiquidity`](#batchfillofferremoveliquidity)                                     | Batch version of `fillOfferRemoveLiquidity` function.                                                                                                                  |
| [`batchCancelOfferCreateContingentPool`](#batchcanceloffercreatecontingentpool)                                     | Batch version of `cancelOfferCreateContingentPool` offer.                                                                                                                  |
| [`batchCancelOfferAddLiquidity`](#batchcancelofferaddliquidity)                                     | Batch version of `cancelOfferAddLiquidity` function.                                                                                                                  |
| [`batchCancelOfferRemoveLiquidity`](#batchcancelofferremoveliquidity)                                     | Batch version of `cancelOfferRemoveLiquidity` function.                                                                                                                  |
| **Governance functions** (execution is reserved for DIVA owner only)                      |                                                                                                                                                             |
| [`updateFees`](#updatefees)                                                       | Function to update the protocol and settlement fees.                                                                                                                        |      |
| [`updateSettlementPeriods`](#updatesettlementperiods)                                             | Function to update settlement related periods.                                                                                                                   |
| [`updateFallbackDataProvider`](#updatefallbackdataprovider)                                     | Function to update the fallback data provider.                                                                                                              |
| [`updateTreasury`](#updatetreasury)                                               | Function to update the treasury address.                                                                                                               |
| [`pauseReturnCollateral`](#pausereturncollateral)                                   | Function to pause the withdrawal of collateral via `removeLiquidity` and `redeemPositionToken`.                                                             |
| [`unpauseReturnCollateral`](#unpausereturncollateral)                                   | Function to unpause withdrawals.                                                             |
| [`revokePendingFeesUpdate`](#revokependingfeesupdate)                                   | Function to revoke a pending fees update and restore the previous ones.                                                             |
| [`revokePendingSettlementPeriodsUpdate`](#revokependingsettlementperiodsupdate)                                   | Function to revoke a pending settlement periods update and restore the previous ones.                                                             |
| [`revokePendingFallbackDataProviderUpdate`](#revokependingfallbackdataproviderupdate)                                   | Function to revoke a pending fallback data provider update and restore the previous one.                                                             |
| [`revokePendingTreasuryUpdate`](#revokependingtreasuryupdate)                                   | Function to revoke a pending treasury address update and restore the previous one.                                                             |
| **Getter functions**                                                                      |                                                                                                                                                             |
| [`getLatestPoolId`](#getlatestpoolid)                                                     | Function to return the latest pool Id.                                                                                                                      |
| [`getPoolParameters`](#getpoolparameters)                                                 | Function to return the pool parameters for a given pool Id.                                                                                                 |
| [`getPoolParametersByAddress`](#getpoolparametersbyaddress)                               | Function to return the pool parameters for a given position token address.                                                                                  |
| [`getGovernanceParameters`](#getgovernanceparameters)                                     | Function to return current applicable protocol parameters. Ignores pending updates.                                                                                                              |
|[`getFees`](#getfees)|Function to return the fees applicable for a given fees index returned by `getPoolParameters`.|
|[`getSettlementPeriods`](#getsettlementperiods)|Function to return the settlement periods applicable for a given settlement periods index returned by `getPoolParameters`.|
|[`getFeesHistory`](#getfeeshistory)|Function to return the last updates of the fees, including any pending updates.|
|[`getSettlementPeriodsHistory`](#getsettlementperiodshistory)|Function to return the last updates of the settlement period, including any pending updates.|
|[`getFeesHistoryLength`](#getfeeshistorylength)|Function to return the total number of fee updates.|
|[`getSettlementPeriodsHistoryLength`](#getsettlementperiodshistorylength)|Function to return the total number of settlement period updates.|
|[`getFallbackDataProviderInfo`](#getfallbackdataproviderinfo)|Function to return the latest update of the fallback data provider, including the activation time and the previous value.|
|[`getTreasuryInfo`](#gettreasuryinfo)|Function to return the latest update of the treasury address, including the activation time and the previous value.|
| [`getClaim`](#getclaim)                                                                   | Function to get the reward/fee claim for a given recipient denominated in a given collateral token.                                                                |
| [`getTip`](#gettip)                                                                   | Function to return the amount tipped in collateral token for a given pool. Returns zero after pool moves to "Confirmed" stage as credited to the claimable amount that can be obtained via `getClaim`.                                                                |
| [`getPoolIdByTypedCreateOfferHash`](#getpoolidbytypedcreateofferhash)                                 | Function to return the pool Id associated with a given offer hash (EIP712 specific).                                                                        |
| [`getTakerFilledAmount`](#gettakerfilledamount)                                           | Function to return the taker filled amount for a given offer hash (EIP712 specific).                                                                        |
| [`getChainId`](#getchainid)                                                               | Function to get the chain Id.                                                                                                                               |
| [`getOfferRelevantStateCreateContingentPool`](#getofferrelevantstatecreatecontingentpool) | Function to get the offer hash as well as information about the fillability and validity of a create contingent pool offer.                                 |
| [`getOfferRelevantStateAddLiquidity`](#getofferrelevantstateaddliquidity)                 | Function to get the offer hash as well as information about the fillability and validity of an add liquidity offer.                                         |
| [`getOwnershipContract`](#getownershipcontract)                                                                         | Function to return the address of the ownership contract that stores the owner variable.                                                                                                |
| [`getOwner`](#owner)                                                                         | Function to return the current DIVA Protocol contract owner.                                                                                                |

See [EIP2535] for Diamond related functions.

## Contingent pools

The concept of contingent pools forms the foundation of DIVA Protocol. A contingent pool is a programmatic escrow that, upon collateral deposit, issues two types of tokenized contingent claims (long and short) that pay out based on the outcome of an external event.

Users can remove collateral from a contingent pool in two ways:

- By returning an equal amount of both long and short position tokens to the pool.
- Redeeming long/short position tokens once the payout per token has been determined.

The creation of contingent pools and the minting of position tokens can be achieved through the use of the [`createContingentPool`](#createcontingentpool) function, which is located in the `PoolFacet` contract.

### Position tokens

Position tokens are conditional claims against the assets (also referred to as collateral assets) held in a contingent pool. Two position tokens, one long and one short, are issued against each contingent pool. Holding long tokens allows the holder to benefit from the appreciation of the underlying metric, while holding short tokens allows the holder to benefit from the depreciation of the underlying metric. Example payoff profiles for long and short position tokens are illustrated below, using BTC/USD on 31 December 2023 as the underlying metric.

![image](https://user-images.githubusercontent.com/37043174/214245617-c700771a-66e2-483a-a2be-621d558e2bab.png)


Position tokens are ownable ERC20 tokens that implement a `mint` and `burn` function and store the Id of the contingent pool that they belong to (`poolId`). The DIVA smart contract (`msg.sender` during [`createContingentPool`](#createcontingentpool)) is set as the owner during their deployment and is the only account that is allowed to call the `mint` and `burn` functions. The owner cannot be modified after the position token is deployed.

The long and short position token supply is equal to the overall collateral amount deposited into the contingent pool. This implies that the maximum payout per long and short token is always equal to 1 unit of the corresponding collateral token. Further, position tokens have the same number of decimals as the underlying collateral token (e.g., 6 when USDC is used as collateral). This standardization not only simplifies the valuation and comparability of these assets as prices can be thought of as probabilities, but reduces the risk of smart contract bugs that may result from rounding errors related to conversion operations.

Position tokens are minted when a new pool is created via the [`createContingentPool`](#createcontingentpool) or when liquidity is added to an existing pool via the [`addLiquidity`](#addliquidity) function. Position tokens are burnt when users redeem their position tokens via [`redeemPositionToken`](#redeempositiontoken) or remove liquidity via [`removeLiquidity`](#removeliquidity).

### Permissioned position tokens

DIVA Protocol offers the possibility to restrict the transfer of position tokens to those who own a specific ERC721 token. This feature can be useful in situations where the issuer of the derivative product wants to limit the transferability of the position tokens to a specific group of accounts, such as in the context of KYC/AML compliance.

To activate this feature, the corresponding ERC721 token address must be specified in the pool parameters when using the [`createContingentPool`](#createcontingentpool) function. if the zero address is provided, the position tokens will be rendered permissionless.

The transfer restriction is implemented by extending the `_beforeTokenTransfer` hook from OpenZeppelin's ERC20 token implementation. Transfers will only be successful if the following conditions are met:
* For `transfer` and `transferFrom`, both the sender and receiver must own the corresponding ERC721 token.
* For `mint`, the recipient must own the corresponding ERC721 token, as the sender is the zero address. This applies to the [`createContingentPool`](#createcontingentpool) and [`addLiquidity`](#addliquidity) functions. 

The transfer will fail if any of these conditions are not met.

It's important to note that the transfer restriction does not apply to `burn` operations, such as during [`removeLiquidity`](#removeliquidity) or [`redeemPositionToken`](#redeempositiontoken), to prevent users from being locked out of their funds if they transfer out their ERC721 token or it gets burnt after receiving the position tokens. Further, it's not possible to convert permissionless position tokens into permissioned ones, or vice versa, after they have been created.

### Collateral

The collateral refers to the asset that is deposited into a contingent pool to back the value of the position tokens. In DIVA, the collateral can be any ERC20 token with `6 <= decimals <= 18`.

> **❗Important:** When tokens with a flexible supply are considered as collateral, only tokens with a constant balance mechanism such as [Compound's cToken][interest-bearing-tokens] or the wrapped version of Lido's staked ETH ([wstETH][wsteth]) should be used. Rebasable tokens that change a holder's wallet balance such as Ampleforth, Lido's (non-wrapped) staked ETH ([stETH][wsteth]) or [Aave's aTokens][interest-bearing-tokens] should not be used as collateral as changes in the holder's balance may render a pool undercollateralized or any accrued yield/interest being locked. This is because the payout amounts per short and long token are derived based on the payoff curve parameters and the final reference asset value, independent of the collateral balance.

> **⚠️Warning:** It is crucial to only engage with pools that utilize well-known and trusted ERC20 tokens as collateral. Avoid interacting with pools that use unknown ERC20 tokens, as these may pose a potential threat and could lead to financial loss.

Native ETH is not supported as collateral in v1. Use wrapped ETH (WETH) instead.

### createContingentPool

Function to create a new contingent pool and mint long and short position tokens to `longRecipient` and `shortRecipient`, respectively, upon collateral deposit by `msg.sender`. It is important to highlight that the recipients of the short and long position tokens do not have to be `msg.sender`, but can instead be any address based on the specific use case and payment agreement between the parties involved. In particular, a zero address input for either of the recipients is a valid input to enable conditional burn use cases. The function will revert if both recipients are set to the zero address, though.

This function uses [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks. Returns the `poolId` on success. Refer to [`batchCreateContingentPool`](#batchcreatecontingentpool) for the batch version of the function.

```js
function createContingentPool(
    PoolParams calldata _poolParams     // List of parameters specifying the contingent pool
)
    external
    returns (uint256);                  // Id of the newly created contingent pool
```

The `PoolParams` struct has the following fields in the following order:

| Parameter          | Type    | Category                 | Description                                                                                                                                                                                             |
| :----------------- | :------ | :----------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `referenceAsset`   | string  | Event                    | The metric or event whose outcome will determine the payout for long and short position tokens.                                                                                                         |
| `expiryTime`       | uint96  | Event                    | Expiration time of the pool expressed as a unix timestamp in seconds (UTC). The value of the reference asset observed at that point in time determines the payoffs for long and short position tokens. |
| `floor`            | uint256 | Payoff                   | Value of the reference asset at or below which the long token pays out 0 and the short token 1 (max payout), gross of fees. Input expects an integer with 18 decimals.                                                 |
| `inflection`       | uint256 | Payoff                   | Value of the reference asset at which the long token pays out `gradient` and the short token `1-gradient`, gross of fees. Input expects an integer with 18 decimals.                                                   |
| `cap`              | uint256 | Payoff                   | Value of the reference asset at or above which the long token pays out 1 (max payout) and the short token 0, gross of fees. Input expects an integer with 18 decimals.                                                 |
| `gradient`         | uint256 | Payoff                   | A value between 0 and 1 which specifies the payout per long token if the outcome is equal to `inflection`. Input expects an integer with **collateral token decimals**.                                                                                                     |
| `collateralAmount` | uint256 | Payoff                   | Collateral amount to be deposited into the pool to back the position tokens. Input expects an integer with collateral token decimals.                                                                   |
| `collateralToken`  | address | Settlement asset         | Address of the ERC20 collateral token.                                                                                                                                                                  |
| `dataProvider`     | address | Oracle                   | Ethereum account (EOA or smart contract) that is supposed to report the final reference asset value following pool expiration.                                                                                                              |
| `capacity`         | uint256 | Pool size                | Maximum collateral amount that a contingent pool can accept. Choose a large number (e.g., `2**256 - 1`) for unlimited size. Input expects an integer with collateral token decimals.                    |
| `longRecipient`    | address | Position token recipient | Address that shall receive the long position token. Zero address is a valid input to enable conditional burn use cases.                                                                                 |
| `shortRecipient`   | address | Position token recipient | Address that shall receive the short position token. Zero address is a valid input to enable conditional burn use cases.                                                                                |
|`permissionedERC721Token`|address|Permissions|Address of the ERC721 token that transfers are restricted to. Use zero address to render the position tokens permissionless.|

The function executes the following steps in the following order:

1. Check provided pool parameters for validity. Refer to the revert section below for invalid parameters.
1. Generate a new `poolId` by incrementing an integer of type `uint256` (`poolId` starts at 1).
1. Transfer the collateral token from `msg.sender` to the DIVA smart contract, with prior approval from `msg.sender`. The transfer is executed using the `safeTransferFrom` from OpenZeppelin's [SafeERC20][safeerc20] library to accommodate different implementations of the ERC20 standard. For details, see [here][safe-erc20-article-1] and [here][safe-erc20-article-2].
1. Deploy two [`PositionToken`](#position-tokens) contracts (clones), one representing shares in the long position and one shares in the short position.
1. Store the pool parameters including the addresses of the two `PositionToken` contracts in the `pools` mapping: `poolId` => [`Pool`](#pool-struct)
1. Mint long and short position tokens to `longRecipient` and `shortRecipient`, respectively, by calling the `mint` function inside the two `PositionToken` contracts. Minting is reserved to the owner of the `PositionToken` contracts which is the DIVA smart contract.
1. Emit a [`PoolIssued`](#poolissued) event on success.
1. Return the `poolId` on success.

The function performs checks on the pool parameters provided by `msg.sender` and reverts under the following conditions:

- `expiryTime` is smaller than or equal to `block.timestamp`
- `referenceAsset` is an empty string
- `floor` is greater than `inflection`
- `cap` is smaller than `inflection`
- `dataProvider` is equal to the zero address
- `gradient` is greater than 1 base unit in collateral token terms (i.e. `10**collateralTokenDecimals`)
- `collateralAmount` is smaller than `1e6`
- `collateralAmount` exceeds `capacity`
- Collateral token has more than 18 or less than 6 decimals
- Both `longRecipient` and `shortRecipient` are equal to the zero address.

> **❗Important:** `createContingentPool` does not revert if either `longRecipient` or `shortRecipient` are equal to the zero address. This is a conscious design choice to enable conditional burn use cases. Users should pay special attention when populating the function parameters for execution to avoid sending position tokens to the zero address accidentally.

**Comments**

- The long and short token supply are set equal to `collateralAmount` which implies a maximum payoff per short and long position token of 1 unit of the underlying collateral token (e.g., `1e6` in case of USDC, `1e18` in case of WETH). 
- Position tokens have the same amount of decimals as the collateral token to mitigate the risk bugs due to rounding in decimal conversions.
- Short and long tokens have different addresses.
- The `owner` of the position tokens is set equal to the DIVA smart contract address at creation and cannot be modified afterwards. Only the `owner` is authorized to execute the `mint` and `burn` functions inside the `PositionToken` contract.
- The `capacity` field allows to cap the size of a pool which can be useful for private pools or when dealing with metrics that are at risk of being manipulated.
- Final reference value cannot be negative. Metrics that can go negative (e.g., interest rates) should be transformed into something that will remain positive (e.g., current interest rate + 100) before being used as a reference asset.
- Minimum collateral balance of `1e6` was introduced to increase the precision in calculations. For USDC which has 6 decimals places, this means that the minimum collateral amount is 1 USDC.
- Position tokens are deployed using [clones](#https://blog.openzeppelin.com/workshop-recap-cheap-contract-deployment-through-clones/) which allows for very cheap deployment. The only trade-off made is that interacting with the position token is a bit more expensive (+700 gas/call) compared to a naively deployed contract as it involves one `delegatecall`. 

### Pool struct

All pool parameters are stored in the `Pool` struct which can be returned via [`getPoolParameters`](#getpoolparameters) or [`getPoolParametersByAddress`](#getpoolparametersbyaddress). To obtain the fees and settlement periods applicable for the pool, use the [`getFees`](#getfees) and [`getSettlementPeriods`](#getsettlementperiods) functions respectively, passing in `indexFees` and `indexSettlementPeriods` as arguments.

```js
struct Pool {
    uint256 floor;                       // Reference asset value at or below which the long token pays out 0 and the short token 1 (max payout), gross of fees (18 decimals)
    uint256 inflection;                  // Reference asset value at which the long token pays out `gradient` and the short token `1-gradient`, gross of fees (18 decimals)
    uint256 cap;                         // Reference asset value at or above which the long token pays out 1 (max payout) and the short token 0, gross of fees (18 decimals)
    uint256 gradient;                    // Long token payout at inflection (value between 0 and 1) (collateral token decimals)
    uint256 collateralBalance;           // Current collateral balance of pool (collateral token decimals)
    uint256 finalReferenceValue;         // Reference asset value at the time of expiration (18 decimals) - set to 0 at pool creation
    uint256 capacity;                    // Maximum collateral that the pool can accept (collateral token decimals)
    uint256 statusTimestamp;             // Timestamp of status change - set to `block.timestamp` at pool creation and updated on status changes
    address shortToken;                  // Short position token address
    uint96 payoutShort;                  // Payout amount per short position token net of fees (collateral token decimals) - set to 0 at pool creation
    address longToken;                   // Long position token address
    uint256 payoutLong;                  // Payout amount per long position token net of fees (collateral token decimals) - set to 0 at pool creation
    address collateralToken;             // Address of the ERC20 collateral token
    uint96 expiryTime;                   // Expiration time of the pool (expressed as a unix timestamp in seconds)
    address dataProvider;                // Address of data provider
    uint48 indexFees;                    // Index pointer to the applicable fees inside the Fees struct array
    uint48 indexSettlementPeriods;       // Index pointer to the applicable periods inside the SettlementPeriods struct array
    Status statusFinalReferenceValue;    // Status of final reference price (0 = Open, 1 = Submitted, 2 = Challenged, 3 = Confirmed) - set to 0 at pool creation
    string referenceAsset;               // Reference asset string
}
```

Note that type `uint48` is sufficient for `indexFees` and `indexSettlementPeriods` as it cannot realistically reach the maximum value given the 60-day activation delay.

## batchCreateContingentPool

Batch version of [`createContingentPool`](#createcontingentpool) to create multiple pools in one single transaction.

```js
function batchCreateContingentPool(PoolParams[] memory _poolsParams)
    external
    returns (uint256[] memory);             // Array of poolIds created
```

## Payoffs

The shape of the payoff curves is governed by four parameters provided by the user at [pool creation](#createcontingentpool): `floor`, `inflection`, `cap`, and `gradient`. This allows for the creation of six distinct classes of payoff profiles for both long and short tokens, as illustrated below. Note that in special cases where `floor = inflection`, `cap = inflection` or `floor = cap = inflection` and the final reference value is equal to `inflection`, the payout rule for `inflection` has precendence over the rules for `cap` and `floor` meaning that the payout of the long token will be equal to `gradient` and that of the short token `1-gradient`. A pseudo code of the payoff formula is provided in this [pdf](https://github.com/divaprotocol/diva-contracts/files/8562447/Payoff.functions.and.formulas.v3.pdf).

### Long payoffs

<p align="center">
<img src="https://user-images.githubusercontent.com/37043174/163275965-079b6a5c-9444-408b-a624-f8ef706b34b7.png" width="800">
</p>

## Short payoffs

<p align="center">
<img src="https://user-images.githubusercontent.com/37043174/164104049-21df7393-129d-42fb-8eaa-45455167c91b.png" width="800">
</p>

## Adding liquidity

At any point in time prior to expiration, users can add collateral to an existing contingent pool and receive an equivalent amount of short and long position tokens in return. That is, adding 100 USDC to an existing pool with USDC as collateral will mint 100 long and 100 short position tokens to specified long and short token recipient addresses. Existing position token holders will not be impacted in any way.

Adding liquidity is essentially the same as [creating a contingent pool](#createcontingentpool) with the only difference that the pool parameters are already set and position token contracts are already deployed. The benefits of adding liquidity to an existing pool vs. creating a new pool are gas savings and immediate access to liquidity if added to pools that already have an active and liquid market.

Liquidity is added by calling the [`addLiquidity`](#addliquidity) function (located in `LiquidityFacet`).

### addLiquidity

Function to add liquidity to an existing contingent pool and mint long and short position tokens to `longRecipient` and `shortRecipient`, respectively, upon collateral deposit by `msg.sender`. It is important to highlight that the recipients of the short and long position tokens do not have to be `msg.sender`, but can instead be any address based on the specific use case and payment agreement between the parties involved. In particular, a zero address input for either of the recipients is a valid input to enable conditional burn use cases. The function will revert if both recipients are set to the zero address, though.

This function uses [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks. Refer to [`batchAddLiquidity`](#batchaddliquidity) for the batch version of the function.

```js
function addLiquidity(
    uint256 _poolId,                // Id of the pool that a user wants to add collateral to
    uint256 _collateralAmountIncr,  // Incremental collateral amount that `msg.sender` is going to add to the pool expressed as an integer with collateral token decimals
    address _longRecipient,         // Address that shall receive the long position tokens
    address _shortRecipient         // Address that shall receive the short position tokens
)
    external;
```

The function executes the following steps in the following order:

1. Check that the pool is not expired yet and new collateral balance will not exceed the maximum pool capacity.
2. Transfer the collateral token from the `msg.sender`, with prior approval from the user, using OpenZeppelin's `safeTransferFrom` method and update `collateralBalance` in [`Pool`](#pool-struct) to reflect the new size of the pool.
3. Mint long and short position tokens to `_longRecipient` and `_shortRecipient` by calling the `mint` function inside the corresponding `PositionToken` contracts. Note that the mint operation can only be triggered by the DIVA smart contract, the owner of the `PositionToken` contracts.
4. Emit a [`LiquidityAdded`](#liquidityadded) event on success.

The function reverts under the following conditions:

- Pool is already expired (`block.timestamp >= expiryTime`)
- Pool capacity is exceeded (i.e., `collateralBalance + _collateralAmountIncr > capacity`)
- Both `_longRecipient` and `_shortRecipient` are equal to the zero address.

> **❗Important:** Similar to [`createContingentPool`](#createcontingentpool), `addLiquidity` does not revert if `_longRecipient` or `_shortRecipient` are equal to the zero address. This is a conscious design choice to enable conditional burn use cases. Users should pay special attention when populating the function parameters for execution to avoid sending position tokens to the zero address accidentally.

### batchAddLiquidity

Batch version of [`addLiquidity`](#addliquidity) function to add liquidity to multiple pools in one single transaction.

```js
function batchAddLiquidity(
    ArgsBatchAddLiquidity[] calldata _argsBatchAddLiquidity
) external;
```

where `ArgsBatchAddLiquidity` is defined as

```js
struct ArgsBatchAddLiquidity {
    uint256 poolId;                 // Id of the pool that a user wants to add collateral to
    uint256 collateralAmountIncr;   // Incremental collateral amount to be added to the pool expressed as an integer with collateral token decimals
    address longRecipient;          // Address that shall receive the long position tokens
    address shortRecipient;         // Address that shall receive the short position tokens
}
```

## Removing liquidity

At any point in time, prior to and after pool expiration but before the status of the final reference value oves to "Confirmed" stage, position token holders can withdraw collateral from the pool by returning an equal amount of long and short position tokens to the DIVA smart contract. The amount of collateral returned is equals to the amount of position tokens sent back, minus a small [fee](#fees). Long and short position tokens are burnt during that process.

The ability to remove liquidity can be useful when users do not manage to sell all of their position tokens after creating a pool or adding liquidity, or when they wish to exit a position where purchasing the opposite side (e.g., short) is easier than selling the current side held (e.g., long).

Liquidity is removed by calling the [`removeLiquidity`](#removeliquidity) function (located in `LiquidityFacet`).

### removeLiquidity

Function to remove collateral from an existing contingent pool. User has to send back short and long position tokens in equal amounts to successfully execute this function. As opposed to [`addLiquidity`](#addliquidity), no prior user approval is needed as tokens are burnt by DIVA smart contract, the owner of the position tokens, rather than transferred.

This function uses [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks. Refer to [`batchRemoveLiquidity`](#batchremoveliquidity) for the batch version of the function.

```js
function removeLiquidity(
    uint256 _poolId,                // Id of the pool that a user wants to remove collateral from
    uint256 _amount                 // Number of position tokens to return (expressed as an integer with position token decimals)
)
    external;
```

As the position token supply is equal to the collateral amount, the collateral amount returned is 1:1 to `_amount`, minus a small [fee](#fees).

The function executes the following steps in the following order:

1. Check that the withdrawal of liquidity is not [paused](#pausability).
1. Check that the status of the final reference value is not in "Confirmed" stage yet. The reason for this condition is that when the status is set to "Confirmed", the protocol and settlement fees are already fully allocated to the treasury and the data provider (see [`setFinalReferenceValue`](#setfinalreferencevalue) and [`redeemPositionToken`](#redeempositiontoken)). If users were allowed to remove liquidity when status is "Confirmed", then fees would be charged twice.
1. Check that `msg.sender` owns the provided `_amount` of both long and short position tokens. Passing `_amount = 0` is possible if both settlement and protocol fees are zero, but will not result in any state changes. If either the settlement or protocol fee are non-zero, passing `_amount = 0` will fail as the minimum fee check will not pass (see next bullet).
1. Calculate protocol fee (0.25%) and settlement fee (0.05%) based on the collateral amount to be removed.
1. Burn both short and long position tokens.
1. Allocate the protocol fee to the treasury and the settlement fee to the data provider and reduce the pool's `collateralBalance` by `protocolFee + settlementFee`. Allocated fees are retained within the DIVA contract until they are claimed by the entitled accounts via the [`claimFee`](#claimfee) function.
1. Reduce the pool's `collateralBalance` by `_amount - protocolFee - settlementFee` and transfer the corresponding amount to `msg.sender` using OpenZeppelin's `safeTransfer` method. At this stage, the pool's `collateralBalance` reduced by `_amount` in total.
1. Emit a [`LiquidityRemoved`](#liquidityremoved) event on success.

The function reverts under the following conditions:

- Function is [paused](#pausability).
- `statusFinalReferenceValue` is already "Confirmed".
- `msg.sender` doesn't own the provided amount of long and short position tokens. In particular, if a user passes in an amount that exceeds the total position token supply, it will fail as the user cannot own more tokens than the total supply.
- Protocol or settlement fee amount implied by `_amount` is 0. This is to prevent that users can remove small amounts of collateral without paying any fees (possible due to integer rounding in Solidity). The minimum `_amount` provided as input needs to result in a minimum fee amount of 1 smallest unit of the collateral token. For instance, if the protocol or settlement fee is 0.01%, then the minimum `_amount` that can be removed is 10'000 smallest units of the collateral token (c. $4 at a $40k price per WBTC which has 8 decimals). If a user has less than that minimum amount, they will either have to purchase additional short and long tokens on the market or wait until expiry to redeem their position tokens. The minimum `_amount` condition is not relevant if both protocol and settlement fee are 0%. Note that this minimum fee logic is not relevant for [`redeemPositionToken`](#redeempositiontoken) (another function that involves the withdrawal of collateral) as fees are charged in full immediately independent of the user redemption amount.

**Comments**

- Allowing users to remove liquidity after pool expiration until `statusFinalReferenceValue` switches to "Confirmed" can be useful when a user owns an equal amount of long and short tokens and wants to return collateral in one single transaction rather than two using the [`redeemPositionToken`](#redeempositiontoken) function.

## batchRemoveLiquidity

Batch version of [`removeLiquidity`](#removeliquidity) function to remove liquidity from multiples pools in one single transaction.

```js
function batchRemoveLiquidity(
    ArgsBatchRemoveLiquidity[] calldata _argsBatchRemoveLiquidity
) external;
```

where `ArgsBatchRemoveLiquidity` struct is defined as

```js
struct ArgsBatchRemoveLiquidity {
    uint256 poolId;                 // Id of the pool that a user wants to remove collateral from
    uint256 amount;                 // Number of position tokens to return (expressed as an integer with position token decimals)
}
```

## Oracles

Contingent pools require a single data input, the final value of the reference asset, following pool expiration to determine the payoffs for long and short position tokens. In DIVA Protocol, this data input is provided by an oracle/data provider, which is specified by the user at the time of creating the contingent pool. The oracle/data provider can be any Ethereum address, including an externally owned account ("EOA") or a smart contract that can retrieve the final value of the reference asset.

This design choice makes DIVA an oracle agnostic protocol, offering maximum flexibility to creators in configuring the settlement of their pools according to their individual setup. However, this also creates the risk of malicious actors creating pools that settle incorrectly. To mitigate this risk, the following mechanisms have been implemented:

- **Whitelist**: DIVA token holders will maintain a [whitelist][whitelistgithub] of trustworthy data providers and data feeds. Pool creators can use this whitelist to find reliable data providers that can report the outcome of their selected event, while traders can have confidence in the correct settlement of the position tokens they purchase. Pools with whitelisted data providers also benefit from additional settlement security, as the [fallback data provider](#fallback-data-provider) will commit themselves to step in if a whitelisted data provider fails to report a value within the pre-defined submission window. For non-whitelisted data providers, it is up to the fallback data provider's discretion to report a value or not.
- **Reporting rewards**: Data providers will receive a [settlement fee](#fees) and [tips](#tips) for reporting the outcome. This serves as a financial incentive for data providers to remain honest and report accurate data.
- **Reputation**: An off-chain reputation score will be calculated and published to help pool creators and traders to gain additional confidence in the correct settlement of the pools.

DIVA Protocol's settlement process is outlined in the next section.

## Settlement process

The goal of the settlement process is to determine the value of the reference asset prevailing at the time of expiration and with that, the payoffs for short and long position tokens. The settlement process starts right after the pool expires and ends when the status of the final reference value reaches "Confirmed" stage in which case position token holders can start redeeming their position tokens.

DIVA Protocol's settlement process was designed to accomodate different types of oracles including human oracles, multisigs, decentralized oracles such as Tellor, DIA, Band or Chainlink as well as on-chain data such as the amount unpaid in an undercollateralized loan. It implements an optional dispute mechanism that can be activated for human oracles and a fallback data provider which steps in if the original data provider fails to submit a value.

> **❗Important**: The dispute mechanism is not meant to prevent malicious reporting but to reduce the likelihood of human error such as fat finger mistakes or not accounting for stock splits. Measures to mitigate malicious behavior are presented in the [oracles](#oracles) section.

Below graph illustrates DIVA Protocol's settlement process:

![Settlement process v5-General Annotated drawio](https://user-images.githubusercontent.com/37043174/214247044-4195d828-835a-4fa4-91b2-8fd245823d44.png)


On a high level, the settlement process can be broken down into the following four paths:

| Path                | Description                                                                                                                                                                                                                                                                                                                                                                                             | Path                   |
| :------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :--------------------- |
| Direct confirmation | Final value is submitted and directly confirmed. This path offers the best user experience as users can start redeeming their position tokens directly after the value has been reported. This path is only suitable for oracles that have their own value validation mechanism outside of DIVA Protocol (such as Tellor) or oracles that cannot realistically engage in a review process (such as Uniswap v3 oracle). | **A -> B -> C**        |
| Challenge           | Final value is submitted and subject to challenge. Best suited for human oracles which can review and update a submitted value after being challenged.                                                                                                                                                                                                                                                  | **A -> B -> D -> ...** |
| Fallback 1          | Data provider fails to submit a value and fallback data provider needs to step in.                                                                                                                                                                                                                                                                                                                      | **A -> L -> M**        |
| Fallback 2          | Both data provider and fallback don't submit any value. Final value defaults to inflection with payout equal to `gradient` per long token and `1-gradient` per short token, gross of fees.                                                                                                                                                                                                                                                                                                             | **A -> L -> N**        |

The status of the final reference value `statusFinalReferenceValue` can take on the following four values during the settlement process (enum is the corresponding status code stored in pool parameters):
|Status|enum|Description|
|:---|:---|:---|
|Open|0|Status set at the time of pool creation; changes when a value is submitted|
|Submitted|1|Status set when a final value is submitted and a challenge is enabled|
|Challenged|2|Status when a submitted value is challenged by a position token holder|
|Confirmed|3|Status when the submitted final value is confirmed and payouts per long and short token have been calculated and users can start claiming their payouts.|

The following time periods apply during the settlement process:
|Period|Description|Period|
|:---|:---|:---|
|Submission period|Time window for the data provider to submit a final value for the reference asset|**7 days** following pool expiration|
|Challenge period|Time window for position token holders to submit a challenge|**3 days** starting from the time of a final value submission by the data provider|
|Review period|Time window for the data provider to react to a challenge|**5 days** starting from the time of the first challenge|
|Fallback submission period|Time window for the fallback provider to report a value|**10 days** starting from the expiration of the submission period|

The indicated timelines represent initial values and can be updated by the contract owner at a later stage with values ranging from a minimum of 3 days to a maximum of 15 days. Changes in settlement periods will impact only future pools and not oustanding ones.

The reason behind choosing fairly long settlement windows is to address the needs of the different oracle types with one single set of periods. In particular, it accounts for:
* Delays in the availability of data
* Delays in the availability of human reporters
* External timelines for the various decentralized oracle solutions

The fairly long periods only matter if the data provider activates DIVA Protocol's challenge mechanism. As most users are expected to use decentralized oracle solutions, which will deactivate DIVA's challenge mechanism, the reporting is expected to come shortly after pool expiration due to the competitive nature of the reporting process incentivized by settlement fees and tips.  

Details for each path are provided below:

**Direct confirmation**
|Path|Description|
|:---|:---|
|**A** | After pool expiration, the **data provider has 7 days to submit the final value** of the reference asset by calling the [`setFinalReferenceValue`](#setfinalreferencevalue) function. |
| **B**| The data provider indicates via the `_allowChallenge` argument in [`setFinalReferenceValue`](#setfinalreferencevalue) function **at the time of submission** whether position token holders are allowed to challenge the submitted value or not. |
| **C** | If the **data provider _disables_ the possibility to challenge**, the first submitted value is directly confirmed (status switches from "Open" to "Confirmed") and position token holders can start redeeming their position tokens by calling the [`redeemPositionToken`](#redeempositiontoken) function. |

**Challenge (optional)**
|Path|Description|
|:---|:---|
| **D** | If the **data provider _enables_ the possibility to challenge**, the status switches from "Open" to "Submitted" and position token holders have **7 days starting from the time of submission** to challenge the proposed final value by calling the [`challengeFinalReferenceValue`](#challengefinalreferencevalue) function.|
| **E** | If the **submitted value _is not_ challenged**, the initially submitted value is considered confirmed and position token holders can start redeeming their position tokens by calling the [`redeemPositionToken`](#redeempositiontoken) function. The status switches from "Submitted" to "Confirmed" at first user redemption. |
| **F** | If the **submitted value _is_ challenged**, the status switches from "Submitted" to "Challenged" and the data provider has a **5-day review period** starting from the time of the first challenge to submit another value by calling the [`setFinalReferenceValue`](#setfinalreferencevalue) function. |
| **G** | If the **data provider _doesn't submit_ any value during the review period**, the initially submitted value is considered confirmed and position token holders can start redeeming their position tokens by calling the [`redeemPositionToken`](#redeempositiontoken) function. The status switches from "Challenged" to "Confirmed" at first user redemption. This is a gasless way for a data provider to confirm the previously submitted value, but position token holders will have to wait 5 days before they can start redeeming their tokens.|
| **H** | If the **data provider _submits_ a value _equal_ to the previous one**, the previous value is considered confirmed (status switches from "Challenged" to "Confirmed") and position token holders can start redeeming their position tokens by calling the [`redeemPositionToken`](#redeempositiontoken) function. Data providers can use this option to confirm a value prior to the expiration of the review period. The acceleration of the settlement process comes with some gas costs that the data provider has to bear for calling the [`setFinalReferenceValue`](#setfinalreferencevalue) function again. Note that the value of `_allowChallenge` is irrelevant on second call in this scenario. |
| **I** | If the **data provider submits a value _different_ than the previous one**, they can indicate via the `_allowChallenge` argument in [`setFinalReferenceValue`](#setfinalreferencevalue) function whether another challenge is allowed or not. |
| **J** | If the possibility to **challenge is _disabled_**, then the new submitted value is directly confirmed (status switches from "Challenged" to "Confirmed") and position token holders can start redeeming their position tokens by calling the [`redeemPositionToken`](#redeempositiontoken) function. |
| **K** | If the possibility to **challenge is _enabled_**, then the status switches from "Challenged" to "Submitted" and position token holders have again **7 days starting from the time of submission to challenge** the new submitted value by calling the [`challengeFinalReferenceValue`](#challengefinalreferencevalue) function. |

**Fallback 1**
|Path|Description|
|:---|:---|
| **L** | If the **data provider _doesn't submit_ any value during the submission period**, the fallback data provider has 10 days to submit a value by calling the [`setFinalReferenceValue`](#setfinalreferencevalue) function. Note that there is no possibility to challenge the value submitted by the fallback provider, hence the value of `_allowChallenge` is irrelevant in that case.|
| **M** | If the **fallback data provider _submits_ a value**, the final value will be confirmed (status switches from "Open" to "Confirmed") and position token holders can start redeeming their position tokens by calling the [`redeemPositionToken`](#redeempositiontoken) function. |

**Fallback 2**
|Path|Description|
|:---|:---|
| **N** | If the **fallback data provider _doesn't submit_ any value**, any user can trigger the [`setFinalReferenceValue`](#setfinalreferencevalue) function which will set the **final value equal to inflection** and the status from "Open" to "Confirmed" (the values of the input parameters `_finalReferenceValue` and `_allowChallenge` are irrelevant in that case). Afterwards, position token holders can start redeeming their position tokens by calling the [`redeemPositionToken`](#redeempositiontoken) function.|

**Comments**

- Every time a data provider submits a value via the [`setFinalReferenceValue`](#setfinalreferencevalue) function, the storage field `finalReferenceValue` is updated accordingly.
- Values proposed during a challenge by position token holders are not stored in storage but emitted as part of the [`StatusChanged`](#statuschanged) event. Values submitted during a challenge are indexed in the DIVA subgraph.
- Any user who has a non-zero position token balance can submit a challenge for the corresponding pool.
- Data providers can wrap the [`setFinalReferenceValue`](#setfinalreferencevalue) function into a separate smart contract and hard-code the `_allowChallenge` parameter so that pool creators already know at the time of pool creation whether a submitted value can be challenged or not.
- The [fallback data provider](#fallback-data-provider) will commit themselves to submit a value if a whitelisted data provider fails to do so. For non-whitelisted data providers, it's up to the fallback data provider's discretion to submit a value. The fallback data provider is updateable by the contract owner.
- **Fast settlement**: in an ideal case, the final value is submitted and directly confirmed shortly after pool expiration. However, in situations where a challenge is enabled or the data provider fails to report a value on time, the settlement time is extended which results in bad user experience. In those cases, service providers can step in to offer faster settlement against a small fee.
- **Malicious reporting**: theoretically, a data provider can delay the settlement process indefinitely by submitting different values every time they are being challenged. In practice, an honest whitelisted data provider who cares about their reputation and future fee income should not have an incentive to engage in such a strategy. Further, a malicious data provider might not be able to sustain such a strategy for a long period of time due to increasing gas costs. In such a scenario, position token holders can try to accelerate the settlement process by not submitting any challenges and simply accept the (inaccurate) value. This only works if the malicious data provider does not own any position tokens themselves that would allow them to trigger a challenge.

### Fallback data provider

The fallback data provider steps in if a data provider failed to submit a value within the given 7-day submission window. The fallback provider will commit themselves to report a value within a 10-day window if a whitelisted data provider failed to submit a value. For non-whitelisted data providers, it's up to the fallback data provider's discretion to report a value or not.

The fallback provider is set to the contract owner at DIVA contract deployment and can be updated via the [`updateFallbackDataProvider`](#updatefallbackdataprovider) function by the contract owner at a later stage.

### Outcome reporting

The final value of the reference asset determines the payoffs per long and short position token. The final reference value is typically reported by the data provider by calling the [`setFinalReferenceValue`](#setfinalreferencevalue) function (located in `SettlementFacet`). Detailed specs for data providers are provided [here](https://github.com/divaprotocol/oracles/blob/main/README.md).

In cases where the data provider fails to report a value, the fallback data provider will step in. If the fallback data provider doesn't report any value either, anyone can trigger the [`setFinalReferenceValue`](#setfinalreferencevalue) function to set the final value equal to inflection (default).

### setFinalReferenceValue

Function to submit the final value of the reference asset. This function uses [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks. Refer to [`batchSetFinalReferenceValue`](#batchsetfinalreferencevalue) for the batch version of the function.

```js
function setFinalReferenceValue(
    uint256 _poolId,                // The pool Id for which the final value is submitted
    uint256 _finalReferenceValue,   // Proposed final value by the data provider expressed as an integer with 18 decimals
    bool _allowChallenge            // Flag indicating whether the challenge functionality should be enabled (1) or not (0)
)
    external;
```

The function executes the following steps in the following order:

1. Checks whether a final value can be submitted, which is only possible when status is "Open" or "Challenged".
1. Evaluates the current state of the settlement process based on the status of the final reference value (`statusFinalReferenceValue`), the prevailing submission windows and the current `block.timestamp`.
1. Updates `finalReferenceValue` and `statusFinalReferenceValue` in the contract's storage based on the current state of the settlement process.
1. If the final value _is_ confirmed within the function call (e.g., when challenge is disabled), [fees](#fees) and [tips](#tips) are allocated to the respective recipients, `collateralBalance` in pool parameters is reduced by the fees portion and the `payoutLong` and `payoutShort` amounts are set, net of fees.
1. If the final value _is not_ confirmed within the call (e.g., when challenge is enabled), `statusFinalReferenceValue` is set to "Submitted" and `finalReferenceValue` is set to the value passed into the function by `msg.sender`.
1. On successful execution, it emits a [`StatusChanged`](#statuschanged) event, two [`FeeClaimAllocated`](#feeclaimallocated) and one [`TipAllocated`](#tipallocated) events, if the final value is confirmed within the function call (e.g., when a challenge is disabled). If the data provider submits a value and enables the possibility to challenge, only the [`StatusChanged`](#statuschanged) event is emitted as the status switches to "Submitted" and no fees or tips are allocated in that case.

The function reverts under the following conditions:

- The status of the final value is already "Submitted" or "Confirmed".
- If the status is "Open", it reverts if:
  - Pool has not yet expired (i.e., `block.timestamp < expiryTime`).
  - `msg.sender` is not the data provider for the underlying pool when called within the 7-day submission period (i.e., `block.timestamp <= expiryTime + submissionPeriod`).
  - `msg.sender` is not the fallback data provider when called within the 10-day fallback submission period (i.e., `expiryTime + submissionPeriod < block.timestamp <= expiryTime + submissionPeriod + fallbackSubmissionPeriod`).
- If the status is "Challenged", it will revert if:
  - The 5-day review period has expired (i.e., `block.timestamp > statusTimestamp + reviewPeriod`).
  - `msg.sender` is not the data provider for the corresponding pool, if called within the review period.

### batchSetFinalReferenceValue

Batch version of [`setFinalReferenceValue`](#setfinalreferencevalue) to submit the final value for multiple pools in one single transaction. This function uses [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks.

```js
function batchSetFinalReferenceValue(
    ArgsBatchSetFinalReferenceValue[] calldata _argsBatchSetFinalReferenceValue
) external;
```

where `ArgsBatchSetFinalReferenceValue` struct is defined as

```js
struct ArgsBatchSetFinalReferenceValue {
    uint256 poolId;                 // The pool Id for which the final value is submitted
    uint256 finalReferenceValue;    // Proposed final value by the data provider expressed as an integer with 18 decimals
    bool allowChallenge;            // Flag indicating whether the challenge functionality should be enabled (1) or not (0)
}
```

## Challenge

DIVA Protocol integrates an optional challenge mechanism which can be activated by the data provider to allow position token holders to request a review of the submitted final value if deemed inaccurate. The main goal of the challenge functionality is to help fix unintentional errors made by the data provider such as fat finger mistake or incorrect accounting for stock or token split. **It is NOT meant to prevent malicious data providers from submitting wrong values**. That's the role of the [whitelist][whitelistgithub] and the [fee](#fees) incentive. 

The challenge feature is not expected to be used when using decentralized oracles like Tellor, Chainlink or UniswapV3, which cannot realistically review their submitted values.

A data provider can decide whether to enable the challenge functionality (via the `_allowChallenge` flag) every single time they are calling the [`setFinalReferenceValue`](#setfinalreferencevalue) function during the settlement process. To avoid surprises for users and therefore increase trust, data providers can wrap the `setFinalReferenceValue` function into a separate smart contract and hard-code the `_allowChallenge` value so that pool creators already know at the time of pool creation whether a submitted value can be challenged or not.

Each position token holder of the underlying pool can submit a challenge including a value that they deem correct. This value is not stored in the DIVA smart contract but emitted as part of the [`StatusChanged`](#statuschanged) event and indexed in the DIVA subgraph. Data providers should leverage this information as part of their review process.

A challenge can be submitted by position token holders by calling the [`challengeFinalReferenceValue`](#challengefinalreferencevalue) function (located in `SettlementFacet`).

### challengeFinalReferenceValue

Function to challenge the final reference value submitted by the data provider. Proposed values are emitted as part of the event and not stored inside the DIVA smart contract. This function uses [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks. Refer to [`batchChallengeFinalReferenceValue`](#batchchallengefinalreferencevalue) for the batch version of the function.

```js
function challengeFinalReferenceValue(
    uint256 _poolId,                        // Id for which the submitted final value is challenged
    uint256 _proposedFinalReferenceValue    // The proposed final value by the challenger expressed as an integer with 18 decimals
)
    external;
```

The function executes the following steps in the following order:

1. Check that `msg.sender` owns either short or long position tokens in the underlying pool.
1. If status is "Submitted" and the call is still within the 3-day challenge period (i.e., `block.timestamp <= statusTimestamp + challengePeriod`), update `statusFinalReferenceValue` to "Challenged", `statusTimestamp` to `block.timestamp` and emit a [`StatusChanged`](#statuschanged) event. `finalReferenceValue` is **not** updated.
1. If status is already "Challenged" and the call is still within the 5-day review period (i.e., `block.timestamp <= statusTimestamp + reviewPeriod`), emit a [`StatusChanged`](#statuschanged) event. It's important to highlight that neither `statusTimestamp` nor `finalReferenceValue` are updated in that case.

The function reverts under the following conditions:

- Caller owns zero short and long tokens in the underlying pool.
- If status is "Submitted" and the 3-day challenge period expired (i.e., `block.timestamp > statusTimestamp + challengePeriod` where `statusTimestamp` is the time of submission).
- If status is "Challenged" and the 5-day review period expired (i.e., `block.timestamp > statusTimestamp + reviewPeriod` where `statusTimestamp` is the time of the first challenge).
- If no value was submitted yet (status is "Open") or the final value was already confirmed (status is "Confirmed").

### batchChallengeFinalReferenceValue

Batch version of [`challengeFinalReferenceValue`](#challengefinalreferencevalue) to challenge multiple final reference values in one single transaction. This function uses [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks.

```js

function batchChallengeFinalReferenceValue(
    ArgsBatchChallengeFinalReferenceValue[] calldata _argsBatchChallengeFinalReferenceValue
) external;
```

where `ArgsBatchChallengeFinalReferenceValue` struct is defined as

```js
struct ArgsBatchChallengeFinalReferenceValue {
    uint256 poolId;                         // Id for which the submitted final value is challenged
    uint256 proposedFinalReferenceValue;    // The proposed final value by the challenger expressed as an integer with 18 decimals
}
```

## Redeem position token

Once the final value has been confirmed, position token holders can return their short and long position tokens and receive their respective share in the pool collateral in return by calling the [`redeemPositionToken`](#redeempositiontoken) function. The collateral amount returned per short and long token is derived based on the final reference value reported by the data provider and stored in `payoutShort` and `payoutLong` (net of fees) inside the pool parameters, which can be read via the [`getPoolParameters`](#getpoolparameters) function.

### redeemPositionToken

Function called by position token holders to redeem their short and long tokens in return for collateral after the final value has been confirmed. This function uses [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks. Refer to [`batchRedeemPositionToken`](#batchredeempositiontoken) for the batch version of the function.

```js
function redeemPositionToken(
    address _positionToken,     // Address of the position token to redeem
    uint256 _amount             // Amount of position tokens to redeem
)
    external;
```

The function performs the following checks before it proceeds with steps that depend on the  `statusFinalReferenceValue`:

1. Confirm that the function is not paused.
1. Confirm that the provided `_positionToken` address is valid. This is achieved by reading the `poolId` from the position token contract and comparing it with the position token address stored in `pools` mapping for the corresponding `poolId`. For position tokens that have not been generated by the DIVA smart contract, no entry in the pools mapping will exist and the check will fail.
1. Confirm that a value has already been reported, i.e `statusFinalReferenceValue` is not "Open".
1. Read the currently applicable treasury address where protocol fees will be redirected. Pending treasury address updates should be ignored.

If the `statusFinalReferenceValue` parameter is set to "Confirmed", the function executes the following steps in the following order:

1. Burn the specified `_amount` of position tokens.
1. Calculate total collateral amount to return based on the `_amount` provided.
1. Update the `collateralBalance` of the underlying pool.
1. Return the collateral to the user using the `safeTransfer` function.
1. Emit [`PositionTokenRedeemed`](#positiontokenredeemed) event on success.

If the `statusFinalReferenceValue` parameter is set to "Submitted" and the challenge period expired without a challenge, or if the parameter is set to "Challenged" and the review period expired without another input from the data provider, the first call of the `redeemPositionToken` function sets the parameter to "Confirmed" and then proceeds with the redemption process as described above.

The steps involved in confirming the final reference value follow those described in [`setFinalReferenceValue`](#setfinalreferencevalue), including the allocation of fees and tips to their respective recipients, the reduction of the `collateralBalance` in pool parameters by the fees portion, and the setting of the `payoutLong` and `payoutShort` amounts net of fees.

The function reverts under the following conditions:

- The function is [paused](#pausability).
- The provided `_positionToken` address is invalid meaning that it does not match the short and long token addresses stored in the `pools` mapping.
- The `statusFinalReferenceValue` parameter is "Open", indicating that no final value has been reported yet.
- The `_amount` exceeds user's position token balance, causing a revert inside the `burn` function.
- The `_amount` is greater than `collateralBalance`.

>**Note:** For small values of `_amount`, the position token may get burnt, but no collateral returned due to rounding. It is recommended to handle such cases on the frontend side accordingly.

### batchRedeemPositionToken

Batch version of [`redeemPositionToken`](#redeempositiontoken) to redeem multiple position tokens in one single transaction. This function uses [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks.

```js
function batchRedeemPositionToken(
    ArgsBatchRedeemPositionToken[] calldata _argsBatchRedeemPositionToken
) external;
```

where `ArgsBatchRedeemPositionToken` struct is defined as

```js
struct ArgsBatchRedeemPositionToken {
    address positionToken;      // Address of the position token to redeem
    uint256 amount;             // Amount of position tokens to redeem
}
```

## Fees

A protocol fee of 25bps (0.25%) and a settlement fee of 5bps (0.05%) (both updateable by DIVA contract owner) are charged whenever a user withdraws collateral from the pool via [`removeLiquidity`](#removeliquidity) or [`redeemPositionToken`](#redeempositiontoken). This fee is not transferred to the entitled account but rather kept as a claim within the DIVA smart contract. The entitled account can claim their fees via [`claimFee`](#claimfee) at any point in time. Fee claims can be transferred via the [`transferFeeClaim`](#transferfeeclaim).

As a security measure, a contract owner cannot set fees higher than 1.5% (15000000000000000 when represented as an integer with 18 decimals). Further, a minimum fee of 0.01% was introduced to ensure a reasonable minimum collateral amount that a user is subject to when [`removing liquidity`](#removeLiquidity). A 0% fee is possible though. The maximum and minimum values are hard-coded in the protocol and cannot be changed.

The protocol and settlement fees applicable to a pool represent the fees prevailing at the time of pool creation which can be obtained via the [`getFees`](#getfees) function by passing on the `indexFees` return by [`getPoolParameters`](#getpoolparameters). Changes in fee parameters initiated by the protocol owner will not affect oustanding pools.

### claimFee

Function to claim the fee/reward in a given `_collateralToken` for a given `_recipient` address. Emits a [`FeeClaimed`](#feeclaimed) event on success. This function does not revert if the claimable amount is zero. Further, anyone can trigger the `claimFee` function, making it possible to sponsor gas fees. To determine the claimable amount before executing the `claimFee` fuction, use the [`getClaim`](#getclaim) function.

This function uses [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks. Refer to [`batchClaimFee`](#batchclaimfee) for the batch version of the function.

```js
function claimFee(
    address _collateralToken,   // Collateral token address
    address _recipient          // Recipient address
) external;
```

### batchClaimFee

Batch version of [`claimFee`](#claimfee) to claim fees for multiple collateral tokens and recipient addresses in one single transaction.

This function uses [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks.

```js
function batchClaimFee(
    ArgsBatchClaimFee[] calldata _argsBatchClaimFee
) external;
```

where `ArgsBatchClaimFee` struct is defined as

```js
struct ArgsBatchClaimFee {
    address collateralToken;    // Collateral token address
    address recipient;          // Recipient address
}
```

### transferFeeClaim

Function to transfer a fee claim amount to a new recipient. Emits a [`FeeClaimTransferred`](#feeclaimtransferred) event on success. Reverts if `_amount` exceeds the caller's fee claim balance or `_recipient` is the zero address. Use [`getClaim`](#getclaim) to get the claimable amounts before executing this function.

This function uses [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks. Refer to [`batchTransferFeeClaim`](#batchtransferfeeclaim) for the batch version of the function.

```js
function transferFeeClaim(
    address _recipient,         // Address of fee claim recipient
    address _collateralToken,   // Collateral token address
    uint256 _amount             // Amount (expressed as an integer with collateral token decimals) to transfer to recipient
)
    external;
```

### batchTransferFeeClaim

Batch version of [`transferFeeClaim`](#transferfeeclaim) to transfer multiple fee claims to multiple recipient addresses in one single transaction.

This function uses [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks.

```js
function batchTransferFeeClaim(
    ArgsBatchTransferFeeClaim[] calldata _argsBatchTransferFeeClaim
)
    external;
```

where `ArgsBatchTransferFeeClaim` struct is defined as

```js
struct ArgsBatchTransferFeeClaim {
    address recipient;          // Address of fee claim recipient
    address collateralToken;    // Collateral token address
    uint256 amount;             // Amount (expressed as an integer with collateral token decimals) to transfer to recipient
}
```

## Tips

The tipping functionality has been introduced to encourage reporting for pools where the gas costs exceed the settlement fee for the data provider. Tipping is only possible using the pool's collateral token. After the final value has been confirmed, the tip is transferred to credited to the data provider. It is not possible to add tips after a data provider has submitted a value, regardless of whether it has been confirmed. The tip is added to the claimable fee amount and can be collected by the data provider using the [`claimFee`](#claimfee) function.

### addTip

Function to add a tip in collateral token to a specific pool. This function uses [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks. Refer to [`batchAddTip`](#batchaddtip) for the batch version of the function. Use [`getTip`](#gettip) function to get the current tip amount.

The function executes the following steps in the following order:

1. Check that `statusFinalReferenceValue` is "Open", meaning that no value has been submitted by the data provider yet.
1. Increase the tip amount for the specified pool.
1. Transfer the collateral token from `msg.sender` to the DIVA smart contract, with prior approval from `msg.sender`. The transfer is executed using the `safeTransferFrom` from OpenZeppelin's [SafeERC20][safeerc20] library to accommodate different implementations of the ERC20 standard.
1. Emit a [`TipAdded`](#tipadded) event on success.

The function reverts if a value has already been submitted by the data provider, i.e. `statusFinalReferenceValue != Open`. The tip is credited to the corresponding data provider if the final value is confirmed within the submission window. If the fallback submission period is triggered, the tip will be credited to the fallback data provider. Refer to [`redeemPositionToken`](#redeempositiontoken) and [`setFinalReferenceValue`](#setfinalreferencevalue) functions for more information.

```js
function addTip(
    uint256 _poolId,    // Id of pool to tip
    uint256 _amount     // Collateral token amount to add as a tip (expressed as an integer with collateral token decimals)
)
    external;
```

### batchAddTip

Batch version of [`addTip`](#addtip) to add tips for multiple pools in one single transaction. This function uses [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks.

```js
function batchAddTip(
    ArgsBatchAddTip[] calldata _argsBatchAddTip
)
    external;
```

where `ArgsBatchAddTip` is defined as

```js
struct ArgsBatchAddTip {
    uint256 poolId;     // Pool Id to tip
    uint256 amount;     // Tip amount to transfer to recipient (expressed as an integer with collateral token decimals) 
}
```

## EIP712 based functions

DIVA Protocol offers users a gas and capital efficient option to perform the [`createContingentPool`](#createcontingentpool), [`addLiquidity`](#addliquidity) and [`removeLiquidity`](#removeliquidity) operations by implementing [EIP712](https://eips.ethereum.org/EIPS/eip-712)-based versions of these functions. One major advantage of the EIP712 versions is that the corresponding operations are performed on-chain only if a counterparty is found, resulting in cost savings for users. Another significant benefit is that the collateral doesn't need to be deposited upfront by a single party, making it a more capital-efficient option. This functionality was inspired by the [`fillLimitOrder`](https://github.com/0xProject/protocol/blob/development/contracts/zero-ex/contracts/src/features/native_orders/NativeOrdersSettlement.sol#L126) function in the [0x Protocol](https://docs.0x.org/introduction/introduction-to-0x).

The process of creating and filling an EIP712 signed offer is outlined below:

- **📄- Specify:** A user (also referred to as "maker") creates an offer which is a json object that adheres to a standard offer message format. The offer message format describes the maker's commitment to take either the long or the short side of a derivative contract at very specific terms with another party. See [`OfferCreateContingentPool`](#offercreatecontingentpool), [`OfferAddLiquidity`](#offeraddliquidity) and [`OfferRemoveLiquidity`](#offerremoveliquidity) for the offer message formats for DIVA Protocol.
- **📝- Sign:** The offer is hashed and cryptographically signed with the maker's private key to commit to the offer they authored.
- **✈️- Share:** The offer is shared with counterparties (also referred to as "takers"). If the maker of the offer already knows their desired counterparty, they can send the offer directly via email, chat, or any other off-chain communication channel. If the maker does not know a counterparty willing to take the other side, they can share their signed offer via social media or dedicated platforms that help users to discover those offers.
- **🤝- Fill:** A taker fills the offer by submitting the offer and the amount they want to fill to the blockchain (via [`fillOfferCreateContingentPool`](#filloffercreatecontingentpool), [`fillOfferAddLiquidity`](#fillofferaddliquidity) or [`fillOfferRemoveLiquidity`](#fillofferremoveliquidity) in the case of DIVA Protocol). DIVA Protocol’s settlement logic verifies the maker’s digital signature and that all the conditions of the offer are satisfied. If so, the corresponding operation is performed on-chain. If not, the operation is reverted.

**Key benefits of using EIP712:**

- **No fulfillment risk:** The derivative assets are only created on-chain once a counterparty was found. This eliminates the need to remove liquidity via another on-chain transaction in case no counterparty can be found, avoiding any unnecessary gas and protocol fees for makers.
- **Gas efficient:** Offers are not stored on the blockchain. Offers are stored off-chain and settlement only occurs on-chain.
- **Capital efficient:** As opposed to [`createContingentPool`](#createcontingentpool) and [`addLiquidity`](#addliquidity), collateral does not have to be provided by `msg.sender` only but can be split between `maker` and `taker` according to the ratio specified in the offer details. With this, the trading step (i.e. selling of one side) is embedded into the create process with the ratios `takerCollateralAmount / (takerCollateralAmount + makerCollateralAmount)` and `makerCollateralAmount / (takerCollateralAmount + makerCollateralAmount)` representing the prices of the two side. In a similar fashion the EIP712 based version of [`removeLiquidity`](#removeliquidity) remove liquidity, and with that exit a position, without the need to own both the short and long side of the pool.

**Comments:**

- Both `maker` and `taker` need to have a sufficient asset balance as well as sufficient allowance set for DIVA Protocol to transfer the corresponding asset for the fill operation to succeed.
- DIVA Protocol only accepts EIP712 based signatures. Signatures created via `eth_sign` JSONRPC command are not supported.
- DIVA Protocol's EIP712 implementation implements replay protection in case of a fork. This is inspired by [OpenZeppelin's EIP712 implementation](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/cryptography/EIP712.sol). The [`address(this)`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/8d908fe2c20503b05f888dd9f702e3fa6fa65840/contracts/utils/cryptography/EIP712.sol#L70) check was consciously ignored as not deemed relevant.

## Structs

The following structs are used while interacting with EIP712 based function:

### OfferCreateContingentPool

The `OfferCreateContingentPool` struct has the following fields:

| Parameter                | Type    | Category          | Description                                                                                   |
| :----------------------- | :------ | :---------------- | :-------------------------------------------------------------------------------------------- |
| `maker`                  | address | Counterparty      | Signer/creator address of the offer.                                                          |
| `taker`                  | address | Counterparty      | Address that is allowed to fill the offer; if zero address, then everyone can fill the offer. |
| `makerCollateralAmount`  | uint256 | Collateral        | Collateral amount to be contributed to the contingent pool by maker.                          |
| `takerCollateralAmount`  | uint256 | Collateral        | Collateral amount to be contributed to the contingent pool by taker.                          |
| `makerIsLong`         | bool    | Side              | True (false) if maker shall receive the long (short) position token.                          |
| `offerExpiry`            | uint256 | Offer fillability | Offer expiration time.                                                                        |
| `minimumTakerFillAmount` | uint256 | Offer fillability | Minimum taker fill amount on first fill.                                                      |
| `referenceAsset`         | string  | Pool              | Parameter for `createContingentPool`.                                                         |
| `expiryTime`             | uint96  | Pool              | Parameter for `createContingentPool`.                                                         |
| `floor`                  | uint256 | Pool              | Parameter for `createContingentPool`.                                                         |
| `inflection`             | uint256 | Pool              | Parameter for `createContingentPool`.                                                         |
| `cap`                    | uint256 | Pool              | Parameter for `createContingentPool`.                                                         |
| `gradient`               | uint256 | Pool              | Parameter for `createContingentPool`.                                                         |
| `collateralToken`        | address | Pool              | Parameter for `createContingentPool`.                                                         |
| `dataProvider`           | address | Pool              | Parameter for `createContingentPool`.                                                         |
| `capacity`               | uint256 | Pool              | Parameter for `createContingentPool`.                                                         |
| `permissionedERC721Token`| address | Pool              | Parameter for `createContingentPool`.                                                         |
| `salt`                   | uint256 | Other             | Arbitrary number to enforce uniqueness of the offer hash.                                     |

### OfferAddLiquidity

The `OfferAddLiquidity` struct has the following fields:

| Parameter                | Type    | Category          | Description                                                                                   |
| :----------------------- | :------ | :---------------- | :-------------------------------------------------------------------------------------------- |
| `maker`                  | address | Counterparty      | Signer/creator address of the offer.                                                          |
| `taker`                  | address | Counterparty      | Address that is allowed to fill the offer; if zero address, then everyone can fill the offer. |
| `makerCollateralAmount`  | uint256 | Collateral        | Collateral amount to be contributed to the contingent pool by maker.                          |
| `takerCollateralAmount`  | uint256 | Collateral        | Collateral amount to be contributed to the contingent pool by taker.                          |
| `makerIsLong`         | bool    | Side              | True (false) if maker shall receive the long (short) position token.                          |
| `offerExpiry`            | uint256 | Offer fillability | Offer expiration time.                                                                        |
| `minimumTakerFillAmount` | uint256 | Offer fillability | Minimum taker fill amount on first fill.                                                      |
| `poolId`                 | uint256 | Pool              | Id of an existing pool.                                                                       |
| `salt`                   | uint256 | Other             | Arbitrary number to enforce uniqueness of the offer hash.                                     |

### OfferRemoveLiquidity

The `OfferRemoveLiquidity` struct has the following fields:

| Parameter                | Type    | Category          | Description                                                                                   |
| :----------------------- | :------ | :---------------- | :-------------------------------------------------------------------------------------------- |
| `maker`                  | address | Counterparty      | Signer/creator address of the offer.                                                          |
| `taker`                  | address | Counterparty      | Address that is allowed to fill the offer; if zero address, then everyone can fill the offer. |
| `positionTokenAmount`  | uint256 | Position token        | Position token amount to be contributed by both taker and maker.                          |
| `makerCollateralAmount`         | bool    | Collateral              | Collateral amount to be received by maker. Taker will receive `positionTokenAmount - makerCollateralAmount`. This is due to the 1:1 relationship between position token and collateral amount.                          |
| `makerIsLong`         | bool    | Side              | True (false) if maker provides the long (short) position token.                          |
| `offerExpiry`            | uint256 | Offer fillability | Offer expiration time.                                                                        |
| `minimumTakerFillAmount` | uint256 | Offer fillability | Minimum taker fill amount on first fill.                                                      |
| `poolId`                 | uint256 | Pool              | Id of an existing pool.                                                                       |
| `salt`                   | uint256 | Other             | Arbitrary number to enforce uniqueness of the offer hash.   

### Signature

The `Signature` struct has the following fields:

| Parameter | Type    | Description        |
| :-------- | :------ | :----------------- |
| `v`       | uint8   | EC Signature data. |
| `r`       | bytes32 | EC Signature data. |
| `s`       | bytes32 | EC Signature data. |

### OfferInfo

The `OfferInfo` struct has the following fields:
| Parameter | Type | Description |
| :-------- | :------ | :---------------- |
| `typedOfferHash` | bytes32 | Offer hash. |
|`status`|OfferStatus|Offer status|
|`takerFilledAmount`|uint256|Already filled taker amount.|

The `status` takes the following values under the following conditions:

- `INVALID (0)`: if `takerCollateralAmount`/`positionTokenAmount` specified in offer is zero or `makerCollateralAmount > positionTokenAmount` in remove liquidity offer
- `CANCELLED (1):` if `takerFilledAmount` is equal to `max(uint256)`
- `FILLED (2):` if `takerFilledAmount >= takerCollateralAmount`
- `EXPIRED (3):` if `offerExpiry <= block.timestamp`
- `FILLABLE (4):` if non of the above is true

### fillOfferCreateContingentPool

Function to fill an EIP712 based offer to create a contingent pool. As opposed to [`createContingentPool`](#createcontingentpool), the collateral can be contributed by both `maker` and `taker` instead of `msg.sender` only according to the ratios implied by `makerCollateralAmount` and `takerCollateralAmount` defined in the offer details. As a result, in order for the fill operation to succeed, both `maker` and `taker` need to have a sufficient collateral token balance as well as sufficient allowance set for DIVA Protocol to transfer the collateral token.

This function uses [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks. Refer to [`batchFillOfferCreateContingentPool`](#batchfilloffercreatecontingentpool) for the batch version of the function.

```js
function fillOfferCreateContingentPool(
    OfferCreateContingentPool calldata _offerCreateContingentPool,    // Struct containing the create pool offer details
    Signature calldata _signature,                                    // Offer signature
    uint256 _takerFillAmount                                          // Taker collateral amount that the user attempts to fill
) external;
```

The function executes the following steps in the following order:

1. Calculate the offer hash and look up `takerFilledAmount` and `status` for the corresponding offer.
1. Check fillability and validity of the offer. More precisely, check that
   1. signer recovered from the offer hash and the signature matches the `maker` specified in the offer,
   1. offer is fillable (refer to [OfferInfo](#offerinfo) for details), and
   1. `msg.sender` is allowed to fill the offer (i.e. `taker` specified in the offer is equal to `msg.sender` or zero address).
1. Check whether a `poolId` has already been created for the underlying offer hash.
   1. **Scenario A (`poolId = 0`):** The offer has not been filled and as a result no pool has been created yet. Proceed with creating a new contingent pool and storing the `poolId` for the corresponding offer hash. The detailed steps are outlined below.
   1. **Scenario B (`poolId > 0`):** the offer was already partially filled and a `poolId` exists. Proceed with adding liquidity to the respective pool.
1. Emit [`OfferFilled`](#offerfilled) and [`PoolIssued`](#poolissued) events on successful first fill and [`OfferFilled`](#offerfilled) and [`LiquidityAdded`](#liquidityadded) otherwise.

The detailed execution steps for scenario A are outlined below. Please refer to [`fillOfferAddLiquidity`](#fillofferaddliquidity) for the detailed steps for scenario B (starting from step 3):

1. Validate that the `_takerFillAmount` respects the offer minimum `minimumTakerFillAmount` and maximum `takerCollateralAmount`. Note that the minimum is only relevant on first fill. Afterwards, takers can fill any amount as long as the maximum is respected.
1. Update the `takerFilledAmount` for the respective offer hash.
1. Based on the submitted `_takerFillAmount`, derive the `maker`'s contribution (`_makerFillAmount`) and the total to be deposited into the pool (`_poolFillAmount = _takerFillAmount + _makerFillAmount`).
1. Perform the same steps as described in [`createContingentPool`](#createcontingentpool) with the following difference: 
   - Collateral is transferred from two parties, `maker` and `taker`, instead of `msg.sender` only (unless maker contribution is zero). This requires prior approval from both `maker` and `taker` and sufficient collateral token balance to succeed.
   - `maker` and `taker` receive only one side of the pool (e.g., `maker` receives the long and `taker` the short side or vice versa depending on the offer terms).

The function reverts under the following conditions:

- The signer recovered from the `_signature` and `_offerCreateContingentPool` does not match offer `maker`.
- The offer status is either `INVALID (0)`, `CANCELLED (1)`, `FILLED (2)` or `EXPIRED (3)` (refer to [OfferInfo](#offerinfo) for details). The offer is considered `INVALID (0)` if `takerCollateralAmount` is zero.
- `msg.sender` is not equal `taker` (only if `taker` is not equal to the zero address).
- Offer minimum `minimumTakerFillAmount` and maximum `takerCollateralAmount` are not respected. Note that `minimumTakerFillAmount` is only relevant on first fill.
- Insufficient approval or collateral token balance by `maker` and/or `taker`.
- Invalid parameters for create contingent pool. See [`createContingentPool`](#createcontingentpool) for details.

> Note that an offer with `takerCollateralAmount = 0` is considered invalid as such use case (i.e. donation from `maker` to some `taker`) can be realized by calling [`createContingentPool`](#createcontingentpool) directly and setting `longRecipient` or `shortRecipient` to the donee address.

The fillability and validity of an offer can be checked via [`getOfferRelevantStateCreateContingentPool`](#getofferrelevantstatecreatecontingentpool) prior to execution.

### fillOfferAddLiquidity

Function to fill an EIP712 based offer to add liquidity to an existing pool. As opposed to [`addLiquidity`](#addliquidity), the collateral can be contributed by both `maker` and `taker` instead of `msg.sender` only according to the ratios implied by `makerCollateralAmount` and `takerCollateralAmount` defined in the offer details. As a result, in order for the fill operation to succeed, both `maker` and `taker` need to have a sufficient collateral token balance as well as sufficient allowance set to DIVA Protocol to transfer the collateral token for the fill operation to succeed.

This function uses [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks. Refer to [`batchFillOfferAddLiquidity`](#batchfillofferaddliquidity) for the batch version of the function.

```js
function fillOfferAddLiquidity(
    OfferAddLiquidity calldata _offerAddLiquidity,    // Struct containing the add liquidity offer details
    Signature calldata _signature,                    // Offer signature
    uint256 _takerFillAmount                          // Taker collateral amount that the user attempts to fill
) external;
```

The function executes the following steps in the following order:

1. Calculate the offer hash and look up the `takerFilledAmount` and `status` for the corresponding offer.
1. Check fillability and validity of the offer. More precisely, check that
   1. signer recovered from the offer hash and the signature matches the `maker` specified in the offer,
   1. offer is fillable (refer to [OfferInfo](#offerinfo) for details), and
   1. `msg.sender` is allowed to fill the offer (i.e. `taker` specified in the offer is equal to `msg.sender` or zero address).
1. Validate that the `_takerFillAmount` respects the offer minimum `minimumTakerFillAmount` and maximum `takerCollateralAmount`. Note that the minimum is only relevant on first fill. Afterwards, takers can fill any amount as long as the maximum is respected.
1. Update the `takerFilledAmount` for the respective offer hash.
1. Based on the submitted `_takerFillAmount`, derive the `maker`'s contribution (`_makerFillAmount`) and the total to be deposited into the pool (`_poolFillAmount = _takerFillAmount + _makerFillAmount`).
1. Check that the pool is not expired yet and new collateral balance will not exceed the maximum pool capacity.
1. Transfer the corresponding collateral token amounts from `maker` and `taker` to DIVA Protocol using `safeTransferFrom` and update `collateralBalance` in [`Pool`](#pool-struct) to reflect the new size of the pool. Note that this requires prior approval from both `maker` and `taker` and sufficient collateral token balance to succeed. If `_makerFillAmount = 0`, then no transfer from `maker` is executed. 
1. Mint long or short position tokens to `maker` and the opposite side to `taker` by calling the `mint` function inside the two `PositionToken` contracts. Note that the mint operation can only be triggered by the DIVA contract, the owner of the `PositionToken` contracts.
1. Emit [`LiquidityAdded`](#liquidityadded) and [`OfferFilled`](#offerfilled) events on success.

The function reverts under the following conditions:

- The signer recovered from the `_signature` and `_offerAddLiquidity` does not match offer `maker`.
- The offer status is either `INVALID (0)`, `CANCELLED (1)`, `FILLED (2)` or `EXPIRED (3)` (refer to [OfferInfo](#offerinfo) for details). The offer is considered `INVALID (0)` if `takerCollateralAmount` is zero.
- `msg.sender` is not equal `taker` (only if `taker` is not equal to the zero address).
- Offer minimum `minimumTakerFillAmount` and maximum `takerCollateralAmount` are not respected. Note that `minimumTakerFillAmount` is only relevant on first fill.
- Insufficient approval or collateral token balance by `maker` and/or `taker`.
- Invalid `poolId` provided in the offer.
- Pool is already expired.
- Pool capacity is exceeded.

> **Note:** An offer with `takerCollateralAmount = 0` is considered invalid as such use case (i.e. donation from `maker` to some `taker`) can be realized by calling [`addLiquidity`](#addliquidity) directly and setting `longRecipient` or `shortRecipient` to the donee address.

The fillability and validity of an offer can be checked via
[`getOfferRelevantStateAddLiquidity`](#getofferrelevantstateaddliquidity) prior to execution. Refer to [`OfferAddLiquidity`](#offeraddliquidity) and [`Signature`](#signature) for the detailed fields of each struct.

### fillOfferRemoveLiquidity

Function to fill an EIP712 based offer to remove liquidity from an existing pool. As opposed to [`removeLiquidity`](#removeliquidity), the long and short position tokens are provided by two separate parties, `maker` and `taker`, instead of `msg.sender` and collateral is returned to them according to the ratios implied by `positionTokenAmount` and `makerCollateralAmount` defined in the offer details. In particular, the collateral amount returned to the `taker` is given by `positionTokenAmount - makerCollateralAmount` due to the 1:1 relationship between collateral and position token amount. 

This functionality can be used to exit a long or short position without the need to first buy the opposite side and then return collateral via [`removeLiquidity`](#removeliquidity). The difference to selling is that the counterparties are not exchanging position tokens in return for collateral tokens between each other, but instead submit an equal amount of position tokens of the opposite side to the DIVA smart contract to receive their respective share of the collateral. 

As opposed to [`fillOfferAddLiquidity`](#fillofferaddliquidity), no prior user approval is needed as tokens are burnt by the DIVA smart contract, the owner of the position tokens, rather than transferred.

This function uses [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks. Refer to [`batchFillOfferRemoveLiquidity`](#batchfillofferremoveliquidity) for the batch version of the function.

```js
function fillOfferRemoveLiquidity(
    OfferRemoveLiquidity calldata _offerRemoveLiquidity,  // Struct containing the remove liquidity offer details
    Signature calldata _signature,                        // Offer signature
    uint256 _positionTokenFillAmount                      // Position token amount that the taker attempts to return
) external;
```

The function executes the following steps in the following order:
1. Calculate the offer hash and look up the `takerFilledAmount` and `status` for the corresponding offer.
1. Check fillability and validity of the offer. More precisely, check that
   1. signer recovered from the offer hash and the signature matches the `maker` specified in the offer,
   1. offer is fillable (refer to [OfferInfo](#offerinfo) for details), and
   1. `msg.sender` is allowed to fill the offer (i.e. `taker` specified in the offer is equal to `msg.sender` or zero address).
1. Validate that the `_positionTokenFillAmount` respects the offer minimum `minimumTakerFillAmount` and maximum `positionTokenAmount`. Note that the minimum is only relevant on first fill. Afterwards, takers can fill any amount as long as the maximum is respected.
1. Update the `takerFilledAmount` for the respective offer hash.

The next steps are the same as in [`removeLiquidity`](#removeliquidity) except that the long and short position tokens are submitted by two different parties, `maker` and `taker`, and collateral is returned to them according to the split specified in the offer:
1. Check that the withdrawal of liquidity is not [paused](#pausability).
1. Check that the status of the final reference value is not in "Confirmed" stage yet.
1. Check that `maker` owns sufficient long/short and `taker` sufficient short/long position token.
1. Calculate protocol and settlement fee.
1. Burn both short and long position tokens.
1. Allocate the protocol fee to the treasury and the settlement fee to the data provider and reduce the pool's `collateralBalance` by `protocolFee + settlementFee`.
1. Reduce the pool's `collateralBalance` by `_amount - protocolFee - settlementFee`.
1. Transfer `makerCollateralAmount` to `maker` and `positionTokenAmount - makerCollateralAmount` to `taker`, net of fees and pro-rata to taker fill amount.
1. Emit [`LiquidityRemoved`](#liquidityremoved) and [`OfferFilled`](#offerfilled) events on success.

The function reverts under the following conditions:
- The signer recovered from the `_signature` and `_offerRemoveLiquidity` does not match offer `maker`.
- The offer status is either `INVALID (0)`, `CANCELLED (1)`, `FILLED (2)` or `EXPIRED (3)` (refer to [OfferInfo](#offerinfo) for details). The offer is considered `INVALID (0)` if `positionTokenAmount` is zero or `makerCollateralAmount` exceeds `positionTokenAmount`.
- `msg.sender` is not equal `taker` (only if `taker` is not equal to the zero address).
- Offer minimum `minimumTakerFillAmount` and maximum `positionTokenAmount` are not respected. Note that `minimumTakerFillAmount` is only relevant on first fill.
- Invalid `poolId` provided in the offer.

### cancelOfferCreateContingentPool

Function to cancel a create contingent pool offer. An offer is cancelled by setting the `takerFilledAmount` to `max(uint256)` for the corresponding offer hash. This function uses [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks.

```js
function cancelOfferCreateContingentPool(
    OfferCreateContingentPool calldata _offerCreateContingentPool // Struct containing the create pool offer details
) external;
```

Refer to [`OfferCreateContingentPool`](#offercreatecontingentpool) for the detailed struct fields and to [`batchCancelOfferCreateContingentPool`](#batchcanceloffercreatecontingentpool) for the batch version of the function.

The function executes the following steps in the following order:

1. Confirm that `msg.sender` is equal to offer `maker`.
1. Derive the offer hash and set takerFilledAmount to `max(uint256)` for it.

The function reverts if `msg.sender` is not equal to offer `maker`.

### cancelOfferAddLiquidity

Function to cancel an add liquidity offer. An offer is cancelled by setting the `takerFilledAmount` to `max(uint256)` for the corresponding offer hash. This function uses [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks.

```js
function cancelOfferAddLiquidity(
    OfferAddLiquidity calldata _offerAddLiquidity // Struct containing the add liquidity offer details
) external;
```

Refer to [`OfferAddLiquidity`](#offeraddliquidity) for the detailed struct fields and to [`batchCancelOfferAddLiquidity`](#batchcancelofferaddliquidity) for the batch version of the function.

The function executes the following steps in the following order:

1. Confirm that `msg.sender` is equal to offer `maker`.
1. Derive the offer hash and set takerFilledAmount to `max(uint256)` for it.

The function reverts if `msg.sender` is not equal to offer `maker`.

### cancelOfferRemoveLiquidity

Function to cancel a remove liquidity offer. An offer is cancelled by setting the `takerFilledAmount` to `max(uint256)` for the corresponding offer hash. This function uses [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks.

```js
function cancelOfferRemoveLiquidity(
    OfferRemoveLiquidity calldata _offerRemoveLiquidity // Struct containing the remove liquidity offer details
) external;
```

Refer to [`OfferRemoveLiquidity`](#offerremoveliquidity) for the detailed struct fields and to [`batchCancelOfferRemoveLiquidity`](#batchcancelofferremoveliquidity) for the batch version of the function.

The function executes the following steps in the following order:

1. Confirm that `msg.sender` is equal to offer `maker`.
1. Derive the offer hash and set takerFilledAmount to `max(uint256)` for it.

The function reverts if `msg.sender` is not equal to offer `maker`.

### batchFillOfferCreateContingentPool

Batch version of [`fillOfferCreateContingentPool`](#filloffercreatecontingentpool) to fill multiple create contingent pool offers in one single transaction. This function uses [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks.

```js
function batchFillOfferCreateContingentPool(
    ArgsBatchFillOfferCreateContingentPool[]
        calldata _argsBatchFillOfferCreateContingentPool
) external;
```

where `ArgsBatchFillOfferCreateContingentPool` struct is defined as

```js
struct ArgsBatchFillOfferCreateContingentPool {
    OfferCreateContingentPool offerCreateContingentPool;    // Struct containing the create contingent pool offer details
    Signature signature;                                    // Offer signature
    uint256 takerFillAmount;                                // Taker collateral amount that the user attempts to fill
}
```

### batchFillOfferAddLiquidity

Batch version of [`fillOfferAddLiquidity`](#fillofferaddliquidity) to fill multiple add liquidity offers in one single transaction. This function uses [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks.

```js
function batchFillOfferAddLiquidity(
    ArgsBatchFillOfferAddLiquidity[] calldata _argsBatchOfferAddLiquidity
) external;
```

where `ArgsBatchFillOfferAddLiquidity` struct is defined as

```js
struct ArgsBatchFillOfferAddLiquidity {
    OfferAddLiquidity offerAddLiquidity;        // Struct containing the add liquidity offer details
    Signature signature;                        // Offer signature
    uint256 takerFillAmount;                    // Taker collateral amount that the user attempts to fill
}
```

### batchFillOfferRemoveLiquidity

Batch version of [`fillOfferRemoveLiquidity`](#fillofferremoveliquidity) to fill multiple remove liquidity offers in one single transaction. This function uses [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks.

```js
function batchFillOfferRemoveLiquidity(
    ArgsBatchFillOfferRemoveLiquidity[] calldata _argsBatchOfferRemoveLiquidity
) external;
```

where `ArgsBatchFillOfferRemoveLiquidity` struct is defined as

```js
struct ArgsBatchFillOfferRemoveLiquidity {
    OfferRemoveLiquidity offerRemoveLiquidity;  // Struct containing the remove liquidity offer details
    Signature signature;                        // Offer signature
    uint256 positionTokenFillAmount;            // Position token amount that the taker attempts to fill
}
```

### batchCancelOfferCreateContingentPool

Batch version of [`cancelOfferCreateContingentPool`](#batchcanceloffercreatecontingentpool) to cancel multiple create contingent pool offers in one single transaction. This function uses [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks.

```js
function batchCancelOfferCreateContingentPool(
    OfferCreateContingentPool[]
        calldata _offersCreateContingentPool        // Array of structs containing the create contingent pool offer details
) external;
```

### batchCancelOfferAddLiquidity

Batch version of [`cancelOfferAddLiquidity`](#batchcancelofferaddliquidity) to cancel multiple add liquidity offers in one single transaction. This function uses [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks.

```js
function batchCancelOfferAddLiquidity(
    OfferAddLiquidity[] calldata _offersAddLiquidity    // Array of structs containing the add liquidity offer details
) external;
```

### batchCancelOfferRemoveLiquidity

Batch version of [`cancelOfferRemoveLiquidity`](#batchcancelofferremoveliquidity) to cancel multiple remove liquidity offers in one single transaction. This function uses [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks.

```js
function batchCancelOfferRemoveLiquidity(
    OfferRemoveLiquidity[] calldata _offersRemoveLiquidity    // Array of structs containing the remove liquidity offer details
) external;
```

## Governance

DIVA Protocol features a protocol owner, [elected by DIVA token holders](https://www.divaprotocol.io/posts/diva-tokenomics) and inherited from the Ownership contract, who is granted certain privileged rights. The protocol owner acts as a service provider that receives access to the fees generated by DIVA Protocol and assets deposited into the Development Fund, including unreleased DIVA token supply. In return, the protocol owner is expected to drive adoption and value creation initiatives on behalf of DIVA token holders, with the ultimate goal of transferring protocol ownership to DIVA token holders as the protocol matures. The owner essentially acts as a service provider towards the DIVA token holders.

The protocol owner has exclusive rights to execute the following functions, so-called governance functions, some of which have a delay before activation.

| Function                                                                                  | Description                                                                                                                                                 |
| :---------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Subject to a 60-day delay**                                                                      |                                                                                                                                                             |
| [`updateFees`](#updatefees)                                                       | Function to update the protocol and settlement fee.                                                                                                                         |
| [`updateSettlementPeriods`](#updatesettlementperiods)                                                       | Function to update the settlement related periods (submission, challenge, review, and fallback submission period).                                                                                                                         |
| [`updateFallbackDataProvider`](#updatefallbackdataprovider)                                                       | Function to update the fallback data provider.                                                                                                                         |
| **Subject to a 2-day delay**                                                                      |                                                                                                                                                             |
| [`updateTreasury`](#updatetreasury)                                                      | Function to update treasury address where protocol fees are directed.                                                                                                                         |
| **Without delay**                                                                      |                                                                                                                                                             |
| [`pauseReturnCollateral`](#pausereturncollateral)                                                      | Function to pause the withdrawal of collateral. A pause can be activated for a maximum of 8 days and the owner has to wait for at least 2 days before a new pause can be activated.                                                                                                                         |
| [`unpauseReturnCollateral`](#unpausereturncollateral)                                                      | Function to unpause withdrawals.                                                                                                 |
| [`revokePendingFeesUpdate`](#revokependingfeesupdate)                                                     | Function to revoke a pending fees update and restore the previous ones.                                                                                                                         |
| [`revokePendingSettlementPeriodsUpdate`](#revokependingsettlementperiodsupdate)                                                      | Function to revoke a pending settlement periods update and restore the previous ones.                                                                                                                         |
| [`revokePendingFallbackDataProviderUpdate`](#revokependingfallbackdataproviderupdate)                                                     | Function to revoke a pending fallback data provider update and restore the previous one.                                                                                                                         |
| [`revokePendingTreasuryUpdate`](#revokependingtreasuryupdate)                                                     | Function to revoke a pending treasury address update and restore the previous one.                                                                                                                         |

### GovernanceStorage

Protocol parameters are stored in the `GovernanceStorage` struct. Currently applicable parameters can be retrieved via [`getGovernanceParameters`](#getgovernanceparameters). All governance parameters are updateable by the contract owner, except for activation times.

```js
struct GovernanceStorage {        
    address previousTreasury;                // Previous treasury address
    address treasury;                        // Pending/current treasury address
    uint256 startTimeTreasury;               // Unix timestamp when the new treasury address is activated
    address previousFallbackDataProvider;    // Address of previous fallback data provider
    address fallbackDataProvider;            // Pending/current fallback data provider
    uint256 startTimeFallbackDataProvider;   // Unix timestamp when the new fallback provider is activated
    uint256 pauseReturnCollateralUntil;      // Unix timestamp until when withdrawals are paused
    Fees[] fees;                             // Array including the fee regimes set over time
    SettlementPeriods[] settlementPeriods;   // Array including the settlement period regimes set over time
}
```

where `Fees` struct is given by

```js
struct Fees {
    uint256 startTime;      // Timestamp at which the fees become applicable
    uint96 protocolFee;     // Protocol fee represented as an integer with 18 decimals (e.g., 2500000000000000 = 0.25%)
    uint96 settlementFee;   // Settlement fee represented as an integer with 18 decimals (e.g., 2500000000000000 = 0.25%)
}
```

and `SettlementPeriods` struct by

```js
struct SettlementPeriods {
    uint256 startTime;                  // Timestamp at which the periods become applicable
    uint24 submissionPeriod;            // Time period (in seconds) for the data provider to submit their final reference value
    uint24 challengePeriod;             // Time period (in seconds) for position token holders to challenge a submitted value
    uint24 reviewPeriod;                // Time period (in seconds) for the data provider to re-submit a value following a challenge
    uint24 fallbackSubmissionPeriod;    // Time period (in seconds) for fallback data provider
}
    
```

**Comments**: 
* The storage of the fee and settlement period parameters was designed such that updates of those will not affect oustanding pools. 
* `fees[0]` and `settlementPeriods[0]` represent the initial parameters set in the constructor at contract deployment. 
* `fees[len - 1]` and `settlementPeriods[len - 1]` represent the currently applicable parameters if `startTime` is in the past and pending parameters updates if `startTime` is in the future.

### Pausability

DIVA Protocol implements a pause functionality for [`redeemPositionToken`](#redeempositiontoken) and [`removeLiquidity`](#removeliquidity) as a hack mitigation mechanism. The withdrawal of liquidity can only be disabled for a maximum of 8 days. At least 2 days have to pass before the next pause can occur. This also applies when the functions are manually unpaused via [`unpauseReturnCollateral`](#unpausereturncollateral) before the 8 days period expired. This ensures that users have always at least 2 days to withdraw their collateral before the next pause can occur. The 8 and 2 day windows are hard-coded in the protocol and cannot be modified. [`pauseReturnCollateral`](#pausereturncollateral) and [`unpauseReturnCollateral`](#unpausereturncollateral) can only be triggered by the contract owner.

**It is important to highlight that in the event of a pause, the reporting of the final value will not be interrupted.**

### updateFees

Function to update the protocol and settlement fee. Activation is restricted to the contract owner and subject to a 60-day delay. On success, emits two [`FeeUpdated`](#feeupdated) events including the new fee parameters as well as their activation time. A pending update can be revoked by the contract owner using the [`revokePendingFeesUpdate`](#revokependingfeesupdate). Historical fee updates can be obtained via [`getFeesHistory`](#getfeeshistory).

Reverts if:
* `msg.sender` is not contract owner.
* one of the new fee parameters is smaller than 0.01% (100000000000000 in integer terms with 18 decimals) or greater than 1.5% (15000000000000000 in integer terms with 18 decimals) if fee > 0; 0% is possible though.
* there is already a pending fee update.

```js
function updateFees(
    uint96 _protocolFee,   // New protocol fee expressed as an integer with 18 decimals
    uint96 _settlementFee  // New settlement fee expressed as an integer with 18 decimals
)
    external;
```

To keep a fee parameter unchanged, simply pass the current value as argument. New fees will only apply for pools that are created at or after activation time.

### updateSettlementPeriods

Function to update the settlement related periods (submission, challenge, review, and fallback submission period). Activation is restricted to the contract owner and subject to a 60-day delay. On success, emits four [`SettlementPeriodUpdated`](#settlementperiodupdated) events including the new periods as well as their activation time. A pending update can be revoked by the contract owner using the [`revokePendingSettlementPeriodsUpdate`](#revokependingsettlementperiodsupdate). Historical fee updates can be obtained via [`getSettlementPeriodsHistory`](#getsettlementperiodshistory).

Reverts if:
* `msg.sender` is not contract owner.
* one of the new periods is outside of the allowed range (i.e., less than 3 days or more than 15 days).
* there is already a pending settlement period update.


```js
function updateSettlementPeriods(
    uint24 _submissionPeriod,           // New submission period in seconds
    uint24 _challengePeriod,            // New challenge period in seconds
    uint24 _reviewPeriod,               // New review period in seconds
    uint24 _fallbackSubmissionPeriod    // New fallback submission period in seconds
)
    external;
```

To keep a period unchanged, simply pass the current value as argument. New periods will only apply for pools that are created at or after activation time.

### updateFallbackDataProvider

Function to update the fallback data provider address. Activation is restricted to the contract owner and subject to a 60-day delay. On success, emits a [`FallbackDataProviderUpdated`](#fallbackdataproviderupdated) event including the new fallback data provider as well as its activation time. A pending update can be revoked by the contract owner using the [`revokePendingFallbackDataProviderUpdate`](#revokependingfallbackdataproviderupdate). The previous fallback provider as well as the current one can be obtained via [`getFallbackDataProviderInfo`](#getfallbackdataproviderinfo).

Reverts if:
* `msg.sender` is not contract owner.
* provided address equals zero address.
* there is already a pending fallback data provider update.

```js
function updateFallbackDataProvider(
    address _fallbackDataProvider   // New fallback data provider address
)
    external;
```

The fallback provider is a global protocol parameter that affects all outstanding pools after activation.

### updateTreasury

Function to update the treasury address where protocol fees are directed to. Activation is restricted to the contract owner and subject to a 2-day delay. On success, emits a [`TreasuryUpdated`](#treasuryupdated) event including the new treasury address as well as its activation time. A pending update can be revoked by the contract owner using the [`revokePendingTreasuryUpdate`](#revokependingtreasuryupdate). The previous treasury address as well as the current one can be obtained via [`getTreasuryInfo`](#gettreasuryinfo).

Reverts if:
* `msg.sender` is not contract owner.
* provided address equals zero address.
* there is already a pending treasury address update.

```js
function updateTreasury(
    address _treasury        // New treasury address
)
    external;
```

### pauseReturnCollateral

Function to pause the withdrawal of collateral via [`removeLiquidity`](#removeliquidity) and [`redeemPositionToken`](#redeempositiontoken). Note that the pause is limited to a maximum of 8 days and the owner has to wait for at least 2 days before it can be activated again, offering users a window to exit the system. It is important to highlight that the settlement process will not be interrupted by a pause ensuring that all outstanding pools can be settled correctly. It merely delays the time users can start redeeming their position tokens. The function does not implement a delay to allow the contract owner to act quickly if needed. Withdrawals can be unpaused via the [`unpauseReturnCollateral`](#unpausereturncollateral) function. 

Reverts if:
- `msg.sender` is not contract owner.
- triggered during the 2-day delay window after the end of a pause.

```js
function pauseReturnCollateral() external;
```

> **Note:** The purpose of the pause functionality is to minimize the potential harm in the event of a hack. There is no guarantee that it can prevent a hack. Please read the [risk disclaimer](#risk-disclaimer) before interacting with DIVA Protocol.

### unpauseReturnCollateral

Function to unpause the withdrawal of collateral. This is achieved by updating the `pauseReturnCollateralUntil` storage variable equal to the block's timestamp prevailing at the time of the call. The function does not implement a delay.

```js
function unpauseReturnCollateral() external;
```

### revokePendingFeesUpdate

Function to revoke a pending fees update and restore the previous ones. On success, emits two [`PendingFeeUpdateRevoked`](#pendingfeeupdaterevoked) events including the revoked and restored fee. 

Reverts if:
* `msg.sender` is not contract owner.
* New fee regime is already active (i.e. `block.timestamp >= startTime`).

```js
function revokePendingFeesUpdate() external;
```

### revokePendingSettlementPeriodsUpdate

Function to revoke a pending settlement periods update and restore the previous ones. On success, emits four [`PendingSettlementPeriodUpdateRevoked`](#pendingsettlementperiodupdaterevoked) events including the revoked and restored settlement periods. 

Reverts if:
* `msg.sender` is not contract owner.
* New settlement period regime is already active (i.e. `block.timestamp >= startTime`).

```js
function revokePendingSettlementPeriodsUpdate() external;
```

### revokePendingFallbackDataProviderUpdate

Function to revoke a pending fallback data provider update and restore the previous one. On success, emits a [`PendingFallbackDataProviderUpdateRevoked`](#pendingfallbackdataproviderupdaterevoked) event including the revoked and restored fallback data provider. 

Reverts if:
* `msg.sender` is not contract owner.
* New fallback data provider is already active (i.e. `block.timestamp >= startTime`).

```js
function revokePendingFallbackDataProviderUpdate() external;
```

### revokePendingTreasuryUpdate

Function to revoke a pending treasury address update and restore the previous one. On success, emits a [`PendingTreasuryUpdateRevoked`](#pendingtreasuryupdaterevoked) event including the revoked and restored treasury address. 

Reverts if:
* `msg.sender` is not contract owner.
* New treasury address is already active (i.e. `block.timestamp >= startTime`).

```js
function revokePendingTreasuryUpdate() external;
```

<h2 id="getter-functions-1">Getter functions</h2>
DIVA Protocol implements the following getter functions.

### getLatestPoolId

Function to return the latest pool Id.

```js
function getLatestPoolId()
    external
    view
    returns (uint256);
```

### getPoolParameters

Function to return the [pool parameters](#pool-struct) for a given `_poolId`. To obtain the fees and settlement periods applicable for the pool, use the [`getFees`](#getfees) and [`getSettlementPeriods`](#getsettlementperiods) functions respectively, passing in `indexFees` and `indexSettlementPeriods` as arguments.

```js
function getPoolParameters(
    uint256 _poolId
)
    external
    view
    returns (Pool memory)
```

Refer to [`Pool`](#pool-struct) for the output data.

### getPoolParametersByAddress

Same as [`getPoolParameters`](#getpoolparameters) but using the position token address as input instead of the `poolId`.

```js
function getPoolParametersByAddress(
    address _positionToken
)
    external
    view
    returns (Pool memory)
```

### getGovernanceParameters

Function to return the currently applicable protocol parameters stored in [GovernanceStorage](#governancestorage) struct. Ignores parameters pending activation.

```js
function getGovernanceParameters()
    external
    view
    returns (
        Fees memory currentFees,
        SettlementPeriods memory currentSettlementPeriods,
        address treasury,
        address fallbackDataProvider,
        uint256 pauseReturnCollateralUntil
    );
```

where the `Fees` struct is given by

```js
struct Fees {
    uint256 startTime;      // Timestamp at which the new set of fees becomes applicable
    uint96 protocolFee;     // Protocol fee expressed as an integer with 18 decimals
    uint96 settlementFee;   // Settlement fee expressed as an integer with 18 decimals
}
```

and the `SettlementPeriods` struct is given by

```js
struct SettlementPeriods {
    uint256 startTime;                // Timestamp at which the new set of settlement periods becomes applicable
    uint24 submissionPeriod;          // Submission period length in seconds
    uint24 challengePeriod;           // Challenge period length in seconds
    uint24 reviewPeriod;              // Review period length in seconds
    uint24 fallbackSubmissionPeriod;  // Fallback submission period length in seconds
}
```

### getFees

Function to return the protocol and settlement fees applicable for a given `_indexFees`.

```js
function getFees(uint48 _indexFees)
    external
    view
    returns (Fees memory);
```

### getSettlementPeriods

Function to return the settlement periods applicable for a given `_indexSettlementPeriods`.

```js
function getSettlementPeriods(uint48 _indexSettlementPeriods)
    external
    view
    returns (SettlementPeriods memory);
```

### getFeesHistory

Function to return the last `_nbrLastUpdates` updates of the fees, including any pending updates. `_nbrLastUpdates = 1` returns the most recent update, which may be active or still pending. If the specified number of `_nbrLastUpdates` exceeds the number of available updates, the maximum history will be returned without any error. Returns an empty array if `_nbrLastUpdates = 0`.

```js
function getFeesHistory(uint256 _nbrLastItems)
    external
    view
    returns (Fees[] memory);
```

where the `Fees` struct is given by

```js
struct Fees {
    uint256 startTime;      // Timestamp at which the new set of fees becomes applicable
    uint96 protocolFee;     // Protocol fee expressed as an integer with 18 decimals
    uint96 settlementFee;   // Settlement fee expressed as an integer with 18 decimals
}
```

### getSettlementPeriodsHistory

Function to return the last `_nbrLastUpdates` updates of the settlement periods, including any pending updates. `_nbrLastUpdates = 1` returns the most recent update, which may be active or still pending. If the specified number of `_nbrLastUpdates` exceeds the number of available updates, the maximum history will be returned without any error. Returns an empty array if `_nbrLastUpdates = 0`.

```js
function getSettlementPeriodsHistory(uint256 _nbrLastUpdates)
    external
    view
    returns (SettlementPeriods[] memory);
```

where the `SettlementPeriods` struct is given by

```js
struct SettlementPeriods {
    uint256 startTime;                // Timestamp at which the new set of settlement periods becomes applicable
    uint24 submissionPeriod;          // Submission period length in seconds
    uint24 challengePeriod;           // Challenge period length in seconds
    uint24 reviewPeriod;              // Review period length in seconds
    uint24 fallbackSubmissionPeriod;  // Fallback submission period length in seconds
}
```

### getFeesHistoryLength

Function to return the total number of fee updates. At least 1 as the initial fees are set at contract deployment.

```js
function getFeesHistoryLength() external view returns (uint256);
```

### getSettlementPeriodsHistoryLength

Function to return the total number of settlement period updates. At least 1 as the initial settlement periods are set at contract deployment.

```js
function getSettlementPeriodsHistoryLength() external view returns (uint256);
```

### getFallbackDataProviderInfo

Function to return the latest update of the fallback data provider, including the activation time and the previous value. Since the fallback data provider applies to all pools globally, only the previous data provider is stored for historical reference.

```js
function getFallbackDataProviderInfo()
    external
    view
    returns (
        address previousFallbackDataProvider,   // Previous fallback data provider address.
        address fallbackDataProvider,           // Latest update of the fallback data provider address.
        uint256 startTimeFallbackDataProvider   // Timestamp in seconds since epoch at which `fallbackDataProvider` is activated.
    );
```

### getTreasuryInfo

Function to return the latest update of the treasury address, including the activation time and the previous value. Only the previous data address is stored for historical reference.

```js
function getTreasuryInfo()
    external
    view
    returns (
        address previousTreasury,       // Previous treasury address.
        address treasury,               // Latest update of the treasury address.
        uint256 startTimeTreasury       // Timestamp in seconds since epoch at which `treasury` is activated.
    );
```

### getClaim

Function to get the fee claim for a given `_recipient` denominated in `_collateralToken` asset.

```js
function getClaim(
    address _collateralToken,       // Address of the token in which the fee is denominated
    address _recipient              // Address of the fee claim recipient
)
    external
    view
    returns (uint256);
```

### getTip

Function to return the collateral token tip amount for a given pool. Returns zero after a pool has been confirmed and tip has been credited to the `claimableFeeAmount`, which can be retrieved using the [`getClaim`](#getclaim) function.

```js
function getTip(
    uint256 _poolId     // Id of pool
)
    external
    view
    returns (uint256);
```

### getPoolIdByTypedCreateOfferHash

Function to return the pool Id associated with a given create contingent pool offer hash (EIP712 specific). Note that for an add liquidity offer, the function will return 0 as the `poolId` is part of the offer terms and not stored inside the contract.

```js
function getPoolIdByTypedCreateOfferHash(
    bytes32 _typedOfferHash
)
    external
    view
    returns (uint256);
```

### getTakerFilledAmount

Function to return the taker filled amount for a given offer hash (EIP712 specific).

```js
function getTakerFilledAmount(
    bytes32 _typedOfferHash
)
    external
    view
    returns (uint256);
```

### getChainId

Function to get the chain Id.

```js
function getChainId()
    external
    view
    returns (uint256);
```

### getOfferRelevantStateCreateContingentPool

Function to get the offer hash as well as information about the fillability and validity of a create contingent pool offer. More precisely:

- **Fillability:** Whether the offer is still fillable and how much can be actually filled by a `taker` taking into account a maker's collateral token allowance and balance. Any changes in those two variables may impact the fillability of the offer.
- **Validity:** Validity of signature and create contingent pool parameters included in the offer.

```js
function getOfferRelevantStateCreateContingentPool(
    OfferCreateContingentPool calldata _offerCreateContingentPool, // Struct containing the create pool offer details
    Signature calldata _signature                                  // Signature of signed message with `_offerCreateContingentPool` by `maker`
)
    external
    view
    returns (
        OfferInfo memory offerInfo,                 // Struct of offer info containing typedOfferHash, status and takerFilledAmount
        uint256 actualTakerFillableAmount,          // Actual fillable amount for taker taking into account the maker's collateral token allowance and balance
        bool isSignatureValid                       // Flag indicating whether the signature is valid or not
        bool isValidInputParamsCreateContingentPool // Flag indicating whether the input parameters specifying the create contingent pool are valid or not
    );
```

Refer to [OfferCreateContingentPool](#offercreatecontingentpool), [Signature](#signature), and [OfferInfo](#offerinfo) for the detailed struct fields.

### getOfferRelevantStateAddLiquidity

Function to get the offer hash as well as information about the fillability and validity of an add liquidity offer. More precisely:

- **Fillability:** Whether the offer is still fillable and how much can be actually filled by a `taker` taking into account a maker's collateral token allowance and balance. Any changes in those two variables may impact the fillability of the offer.
- **Validity:** Validity of signature and the `poolId` included in the offer.

```js
function getOfferRelevantStateAddLiquidity(
    OfferAddLiquidity calldata _offerAddLiquidity,    // Struct containing the add liquidity offer details
    Signature calldata _signature                     // Signature of signed message with `_offerAddLiquidity` by `maker`
)
    external
    view
    returns (
        OfferInfo memory offerInfo,         // Struct of offer info containing typedOfferHash, status and takerFilledAmount
        uint256 actualTakerFillableAmount,  // Actual fillable amount for taker
        bool isSignatureValid,              // Flag indicating whether the signature is valid or not
        bool poolExists                     // Flag indicating whether the specified pool exists or not
    );
```

Refer to [OfferAddLiquidity](#offeraddliquidity), [Signature](#signature), and [OfferInfo](#offerinfo) for the detailed struct fields.

Note that `getOfferRelevantStateAddLiquidity` differs from [`getOfferRelevantStateCreateContingentPool`](#getofferrelevantstatecreatecontingentpool) in the fourth output parameter (`poolExists` in former vs. `isValidInputParamsCreateContingentPool` in latter).

### getOfferRelevantStateRemoveLiquidity

Function to get the offer hash as well as information about the fillability and validity of a remove liquidity offer. More precisely:

- **Fillability:** Whether the offer is still fillable and how much can be actually filled by a `taker` taking into account a maker's position token balance. Any changes in the maker's balance may impact the fillability of the offer.
- **Validity:** Validity of signature and the `poolId` included in the offer.

```js
function getOfferRelevantStateRemoveLiquidity(
        OfferRemoveLiquidity calldata _offerRemoveLiquidity,    // Struct containing the remove liquidity offer details
        Signature calldata _signature                           // Signature of signed message with `_offerRemoveLiquidity` by `maker`
    )
        external
        view
        returns (
            OfferInfo memory offerInfo,         // Struct of offer info containing typedOfferHash, status and takerFilledAmount
            uint256 actualTakerFillableAmount,  // Actual fillable amount for taker
            bool isSignatureValid,              // Flag indicating whether the signature is valid or not
            bool poolExists                     // Flag indicating whether the specified pool exists or not
        );
```

Refer to [OfferRemoveLiquidity](#offerremoveliquidity), [Signature](#signature), and [OfferInfo](#offerinfo) for the detailed struct fields.

### getOwnershipContract

Function to return the address of the contract that stores the DIVA owner and the election logic.

```js
function getOwnershipContract()
    external
    view
    returns (address ownershipContract_);
```

### getOwner

Function to return the current DIVA Protocol contract owner stored inside the contract address returned by [getOwnershipContract](#getownershipcontract).

```js
function getOwner()
    external
    view
    returns (address);
```

## Reentrancy protection

All state-modifying functions, including their batch versions, implement [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks, with the exception of governance functions within the `GovernanceFacet` contract.

## Events

DIVA Protocol specific events are listed below.

### PoolIssued

Emitted when a contingent pool is created.

```
event PoolIssued(
    uint256 indexed poolId,         // Id of the newly created contingent pool
    address indexed longRecipient,  // Address of the long position token recipient
    address indexed shortRecipient, // Address of the short position token recipient
    uint256 collateralAmount,       // Collateral amount expressed as an integer in collateral token decimals
    address permissionedERC721Token // Address of ERC721 token that the transfer restrictions apply to
);
```

### LiquidityAdded

Emitted when additional collateral is added to an existing pool.

```
event LiquidityAdded(
    uint256 indexed poolId,         // Id of an existing contingent pool
    address indexed longRecipient,  // Address of the long position token recipient
    address indexed shortRecipient, // Address of the short position token recipient
    uint256 collateralAmount        // Collateral amount added expressed as an integer in collateral token decimals
);
```

### LiquidityRemoved

Emitted when collateral is removed from an existing pool.

```
event LiquidityRemoved(
    uint256 indexed poolId,            // Id of an existing contingent pool
    address indexed longTokenHolder,   // Account that contributed the long token
    address indexed shortTokenHolder,  // Account that contributed the short token
    uint256 collateralAmount           // Collateral amount removed expressed as an integer in collateral token decimals
);
```

### TipAllocated

Emitted when a tip has been credited to the data provider after the final value is confirmed.

```
event TipAllocated(
    uint256 indexed poolId,     // Id of the pool for which the tip has been credited
    address indexed recipient,  // Address of the tip recipient, typically the data provider
    uint256 amount              // Tip amount allocated (in collateral token)
);
```

### FeeUpdated

Emitted when a fee parameter is updated by the contract owner.

```
event FeeUpdated(
    address indexed from,   // Address that initiated the change (contract owner)
    uint96 fee,             // New fee in % expressed as an integer with 18 decimals (e.g., 2500000000000000 for 0.25%)
    uint256 startTime,      // Timestamp in seconds since epoch at which the new fee will be activated
    FeeType feeType         // Fee type (0: protocol fee, 1: settlement fee)
);
```

### SettlementPeriodUpdated

Emitted when a settlement related period is updated by the contract owner.

```
event SettlementPeriodUpdated(
    address indexed from,           // Address that initiated the change (contract owner)
    uint24 period,                  // New period length in seconds
    uint256 startTime,              // Timestamp in seconds since epoch at which the new period will be activated
    SettlementPeriodType periodType // Settlement period type (0: submission, 1: challenge, 2: review, 3: fallback submission period)
);
```

### FallbackDataProviderUpdated

Emitted when the fallback data provider is updated by the contract owner.

```
event FallbackDataProviderUpdated(
    address indexed from,                       // Address that initiated the change (contract owner)
    address indexed fallbackDataProvider,       // New fallback data provider address
    uint256 startTimeFallbackDataProvider       // Timestamp in seconds since epoch at which the new fallback provider will be activated
);
```

### TreasuryUpdated

Emitted when the treasury address is updated by the contract owner.

```
event TreasuryUpdated(
    address indexed from,       // Address that initiated the change (contract owner)
    address indexed treasury,   // New treasury address
    uint256 startTimeTreasury   // Timestamp in seconds since epoch at which the new treasury address will be activated
);
```

### ReturnCollateralPaused

Emitted when the [`pauseReturnCollateral`](#pausereturncollateral) function is called by the contract owner to pause withdrawals via [`removeLiquidity`](#removeliquidity) and [`redeemPositionToken`](#redeempositiontoken).

```
event ReturnCollateralPaused(
    address indexed from,        // Address that initiated the change (contract owner)
    uint256 pausedUntil          // Timestamp in seconds since epoch until when withdrawals are paused
);
```

### ReturnCollateralUnpaused

Emitted when the [`unpauseReturnCollateral`](#unpausereturncollateral) function is called by the contract owner to unpause withdrawals.

```
event ReturnCollateralUnpaused(
    address indexed from,        // Address that initiated the change (contract owner)
    uint256 timestamp            // Block timestamp prevailing at the time of the call
);
```

### PendingFeeUpdateRevoked

Emitted when a pending fees update is revoked.

```
event PendingFeeUpdateRevoked(
    address indexed revokedBy,  // The address that initiated the revocation.
    uint96 revokedFee,          // Pending fee that was revoked.
    uint96 restoredFee,         // Previous fee that was restored.
    FeeType feeType             // Fee type.
);
```

### PendingSettlementPeriodUpdateRevoked

Emitted when a pending settlement periods update is revoked.

```
event PendingSettlementPeriodUpdateRevoked(
    address indexed revokedBy,          // The address that initiated the revocation.
    uint24 revokedPeriod,               // Pending period length that was revoked.
    uint24 restoredPeriod,              // Previous period length that was restored.
    SettlementPeriodType periodType     // Settlement period type.
);
```

### PendingFallbackDataProviderUpdateRevoked

Emitted when a pending fallback data provider update is revoked.

```
event PendingFallbackDataProviderUpdateRevoked(
    address indexed revokedBy,                    // The address that initiated the revocation.
    address indexed revokedFallbackDataProvider,  // Pending fallback data provider that was revoked.
    address indexed restoredFallbackDataProvider  // Previous fallback data provider that was restored.
);
```

### PendingTreasuryUpdateRevoked

Emitted when a pending treasury address update is revoked.

```
event PendingTreasuryUpdateRevoked(
    address indexed revokedBy,        // The address that initiated the revocation.
    address indexed revokedTreasury,  // Pending treasury address that was revoked.
    address indexed restoredTreasury  // Previous treasury address that was restored.
);
```

### StatusChanged

Emitted when the status of the final reference value changes.

```
event StatusChanged(
    Status indexed statusFinalReferenceValue,   // New status of final reference value (0 = Open, 1 = Submitted, 2 = Challenged, 3 = Confirmed)
    address indexed by,                         // Address that triggered the status change
    uint256 indexed poolId,                     // Id of the affected pool
    uint256 proposedFinalReferenceValue         // Proposed final reference value expressed as an integer with 18 decimals
);
```

### PositionTokenRedeemed

Emitted when a user redeems their position tokens.

```
event PositionTokenRedeemed(
    uint256 indexed poolId,             // The Id of the pool that the position token belongs to
    address indexed positionToken,      // Address of the position token to redeem
    uint256 amountPositionToken,        // Position token amount returned by user
    uint256 collateralAmountReturned,   // Collateral amount returned to user
    address indexed returnedTo          // Address that is returned collateral
);
```

### FeeClaimAllocated

Emitted when the final reference value is confirmed and fees are allocated to the respective recipients.

```
event FeeClaimAllocated(
    uint256 indexed poolId,             // Id of the corresponding contingent pool
    address indexed recipient,          // Fee recipient
    uint256 amount                      // Fee amount expressed as an integer with collateral token decimals
);
```

### FeeClaimTransferred

Emitted when the fee claim is transferred from the original recipient to a new recipient.

```
event FeeClaimTransferred(
    address indexed from,               // Previous address that was entitled for the fee claim
    address indexed to,                 // New address that is entitled for the fee claim
    address indexed collateralToken,    // Asset in which fees are denominated (collateral token)
    uint256 amount                      // Transferred fee claim amount expressed as an integer with collateral token decimals
);
```

### FeeClaimed

Emitted when the fee is claimed.

```
event FeeClaimed(
    address indexed recipient,          // Address of the fee recipient
    address indexed collateralToken,    // Collateral token address
    uint256 amount                      // Fee amount claimed
);
```

### TipAdded

Emitted when a tip is added to a pool.

```
event TipAdded(
    address indexed tipper,            // Tipper address
    uint256 indexed poolId,            // Pool Id tipped
    address indexed collateralToken,   // Collateral token address
    uint256 amount                  // Tip amount
);
```

### OfferFilled

Emitted when a create contingent pool, add liquidity or remove liquidity offer is filled.

```
event OfferFilled(
    bytes32 indexed typedOfferHash,     // The typed offer hash
    address indexed maker,              // The offer maker
    address indexed taker,              // The offer taker
    uint256 takerFilledAmount           // Incremental taker filled amount
);
```

### OfferCancelled

Emitted when an offer is cancelled.

```
event OfferCancelled(
    bytes32 indexed typedOfferHash,     // The typed offer hash
    address indexed maker               // The offer maker (equal to `msg.sender`)
);
```

### DiamondCut (EIP-2535 specific)

A `DiamondCut` event is emitted when facets are added, replaced or removed. Refer to [EIP2535] for more details.

```
event DiamondCut(
    IDiamondCut.FacetCut[] _facetCut,   // Array of facet addresses and function selectors
    address _init,                      // The address of the contract or facet to execute _calldata
    bytes _calldata                     // A function call, including function selector and arguments
);
```

Note that the name of the first field (`_facetCut`) deviates from the one used in the Diamond Standard reference implementation (`_diamondCut`).

## Errors

The following errors may be emitted when interacting with DIVA Protocol specific functions.

| Error name                                 | Function                                                                                         | Description                                                                                                                                                         |
| :----------------------------------------- | :----------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `RecipientIsZeroAddress()`                 | `transferFeeClaim`                                                  | Thrown if the recipient during fee claim transfer is the zero address                                                                                               |
| `AmountExceedsClaimableFee()`              | `transferFeeClaim`                                                    | Thrown if status of `finalReferenceValue` transfer amount exceeds the claimable fee is no longer "Open"                                                                                                      |
| `FinalValueAlreadySubmitted()`              | `addTip`                                                    | Thrown if the transfer amount exceeds the claimable fee amount                                                                                                      |
| `FeeBelowMinimum()`                        | `updateFees`                                                            | Thrown if contract owner attempts to set 0 < protocol/settlement fee < 0.01% (non-zero minimum)                                                                                                    |
| `FeeAboveMaximum`                          | `updateFees`                                                            | Thrown if contract owner attempts to set protocol/settlement fee > 1.5% (maximum)                                                                                                              |
| `OutOfBounds()`                            | `updateSettlementPeriods` | Thrown if contract owner attempts to set a settlement related period to less than 3 days or more than 15 days                                                        |
| `ZeroAddress()`                            | `updateTreasury` / `updateFallbackDataProvider`                                                 | Thrown if contract owner attempts to set the treasury or fallback data provider address equal to the zero address                                                                      |
| `TooEarlyToPauseAgain()`                   | `pauseReturnCollateral`                                                                       | Thrown if contract owner attempts to pause `redeemPositionToken` and `removeLiquidity` before the two day delay period has passed                                   |
| `PendingFeesUpdate(uint256 _timestampBlock, uint256 _startTimeFees)`                   | `updateFees`                                                                       | Thrown if there is already a pending fees update                                   |
| `PendingSettlementPeriodsUpdate(uint256 _timestampBlock, uint256 _startTimeSettlementPeriods)`                   | `updateSettlementPeriods`                                                                       | Thrown if there is already a pending settlement periods update                                   |
| `PendingFallbackDataProviderUpdate(uint256 _timestampBlock, uint256 _startTimeFallbackDataProvider)`                   | `updateSettlementPeriods`                                                                       | Thrown if there is already a pending fallback data provider update                                   |
| `PendingTreasuryUpdate(uint256 _timestampBlock, uint256 _startTimeTreasury)`                   | `updateTreasury`                                                                       | Thrown if there is already a pending treasury address update                                   |
| `FeesAlreadyActive(uint256 _timestampBlock, uint256 _startTimeFees)`                   | `revokeLastFeesSet`                                                                       | Thrown if the fees update to be revoked is already active                                   |
| `SettlementPeriodsAlreadyActive(uint256 _timestampBlock, uint256 _startTimeSettlementPeriods)`                   | `revokeLastSettlementPeriodsSet`                                                                       | Thrown if the settlement periods update to be revoked is already active                                   |
| `FallbackProviderAlreadyActive(uint256 _timestampBlock, uint256 _startTimeFallbackDataProvider)`                   | `revokePendingFallbackDataProviderUpdate`                                                                       | Thrown if the fallback data provider update to be revoked is already active                                   |
| `TreasuryAlreadyActive(uint256 _timestampBlock, uint256 _startTimeTreasury)`                   | `revokePendingTreasuryUpdate`                                                                       | Thrown if the treasury address update to be revoked is already active                                   |
| `ReturnCollateralPaused()`                 | `redeemPositionToken` / `removeLiquidity`                                                                           | Thrown if return of collateral is paused                                                                                                                               |
| `FinalValueAlreadyConfirmed()`             | `removeLiquidity`                                                                               | Thrown if status of `finalReferenceValue` is already "Confirmed"                                                                                                    |
| `InsufficientShortOrLongBalance()`         | `removeLiquidity`                                                                               | Thrown if a user's short or long position token balance is smaller than the indicated amount                                                                        |
| `ZeroProtocolFee()`                        | `removeLiquidity`                                                                               | Thrown if `_amount` provided by user results in a zero protocol fee amount; user should increase `_amount` |
| `ZeroSettlementFee()`                      | `removeLiquidity`                                                                              | Thrown if `_amount` provided by user results in a zero protocol fee amount; user should increase `_amount` |
| `AlreadySubmittedOrConfirmed()`            | `setFinalReferenceValue`                                                                      | Thrown if data provider attempts to submit a value when status is submitted or confirmed                                                                            |
| `PoolNotExpired()`                         | `setFinalReferenceValue`                                                                       | Thrown if data provider attempts to submit a value for a pool that didn't expire yet                                                                                |
| `NotDataProvider()`                        | `setFinalReferenceValue`                                                                    | Thrown if `msg.sender` is not the data provider for the given pool                                                                            |
| `NotFallbackDataProvider()`                | `setFinalReferenceValue`                                                                        | Thrown if `msg.sender` is not the fallback provider if called during the fallback period                                                      |
| `ReviewPeriodExpired()`                    | `setFinalReferenceValue` / `challengeFinalReferenceValue`                                   | Thrown if, after the end of the review period, i) a data provider attempts to submit a value or ii) a user attempts to submit a challenge                           |
| `NoPositionTokens()`                       | `challengeFinalReferenceValue`                                                             | Thrown if a user that doesn't own any position tokens attempts to submit a challenge                                                                                |
| `ChallengePeriodExpired()`                 | `challengeFinalReferenceValue`                                                              | Thrown if a user attempts to challenge a value submission after the challenge period has expired                                                                    |
| `NothingToChallenge()`                     | `challengeFinalReferenceValue`                                                                  | Thrown if user attempts to challenge whe status is "Open" or "Confirmed"                                                                                            |
| `InvalidPositionToken()`                   | `redeemPositionToken`                                                                         | Thrown if token to redeem is an invalid position token address                                                                                                      |
| `FinalReferenceValueNotSet()`              | `redeemPositionToken`                                                                           | Thrown if a user attempts to redeem a position token where the final reference value was not yet set                                                                |
| `ChallengePeriodNotExpired()`              | `redeemPositionToken`                                                                        | Thrown if a user attempts to redeem a position token where status is "Submitted" and challenge period did not expire yet                                            |
| `ReviewPeriodNotExpired()`                 | `redeemPositionToken`                                                                           | Thrown if a user attempts to redeem a position token where status is "Challenged" and the review period did not expire yet                                          |
| `AmountExceedsPoolCollateralBalance()`     | `removeLiquidity` / `redeemPositionToken`                                                        | Thrown, if collateral amount to be returned to user exceeds the pool's collateral balance                         |
| `FeeAmountExceedsPoolCollateralBalance()`  | `removeLiquidity`                                                                                | Thrown if the fee amount to be allocated exceeds the pool's current collateral balance                                                                                 |
| `ZeroLongAndShortRecipients()`             | `addLiquidity`                                                                                   | Thrown if both `longRecipient` and `shortRecipient` equal to the zero address                                                       |
| `PoolExpired()`                            | `addLiquidity`                                                                                   | Thrown if the pool is already expired                                                                                           |
| `InvalidInputParamsCreateContingentPool()` | `createContingentPool`                                                                          | Thrown if the input parameters are invalid                                                                                                       |
| `PoolCapacityExceeded()`                   | `addLiquidity`                                                                                   | Thrown if adding additional collateral would result in the pool capacity being exceeded                                                                             |
| `TakerFillAmountSmallerMinimum()`          | `fillOfferCreateContingentPool` /  `fillOfferAddLiquidity` / `fillOfferRemoveLiquidity`                                       | Thrown if user tries to fill an amount smaller than the minimum provided in the offer                                                                               |
| `TakerFillAmountExceedsFillableAmount()`   | `fillOfferCreateContingentPool` / `fillOfferAddLiquidity` / `fillOfferRemoveLiquidity`                                        | Thrown if the provided `takerFillAmount` exceeds the remaining fillable amount                                                                                      |
| `MsgSenderNotMaker()`                      | `cancelOfferCreateContingentPool` / `cancelOfferAddLiquidity` / `cancelOfferRemoveLiquidity`                                    | Thrown if `msg.sender` is not equal to maker                                                                                                |
| `InvalidSignature()`                       | `fillOfferCreateContingentPool` /  `fillOfferAddLiquidity` / `fillOfferRemoveLiquidity`                                       | Thrown if the signed offer and the provided signature do not match                                                                                                  |
| `OfferInvalidCancelledFilledOrExpired()`          | `fillOfferCreateContingentPool` / `fillOfferAddLiquidity` / `fillOfferRemoveLiquidity`                                        | Thrown if offer is not fillable due to being invalid, cancelled, already filled or expired                                                                                   |
| `UnauthorizedTaker()`                      | `fillOfferCreateContingentPool` / `fillOfferAddLiquidity` / `fillOfferRemoveLiquidity`                                        | Thrown if offer is reserved for a different taker                                                                                                                   |
| `NotContractOwner(address _user, address _contractOwner)`                      | governance functions                                        | Thrown if `msg.sender` is not contract owner.                                                                                                                   |

# DIVA Ownership on main chain

The main chain DIVA Ownership contract `DIVAOwnershipMain` stores the DIVA owner as well as the owner election  mechanism, also referred to as the [decentralized protocol takeover mechanism](#owner-election-mechanism), or DPT mechanism in short. Candidates that receive more support from DIVA token holders, as measured by staked/locked DIVA tokens, than the existing protocol owner, can trigger an election process and potentially become the new protocol owner.

The owner election mechanism is implemented on the Ethereum chain and communicated to secondary chains using the [Tellor protocol](https://tellor.io/). More information about the cross-chain communication mechanism can be found in the section on [ownership on secondary chains](#diva-ownership-on-secondary-chains).        

## Owner election mechanism
At any point in time, DIVA token holders can vote to replace the current protocol owner by directing their stake towards a new candidate. If a candidate receives more support than the current owner (as measured by staked amount), a 30-day showdown period can (but does not have to) be triggered via [`triggerElectionCycle`](#triggerelectioncycle) by the corresponding candidate.

At the end of this period, a snapshot of the candidates' stakes is taken by disabling staking/unstaking for a 7-day period. During that period, the so-called ownership claim submission period, candidates that have received more support than the current owner can submit a claim on the ownership via [`submitOwnershipClaim`](#submitownershipclaim). Among those, the candidate with the highest stake automatically assumes protocol ownership and has access to all [privileged functions](#governance) after the end of the election cycle. In total, an election cycle lasts 37 days. A cooldown period of 7 days applies following the election cycle end where no new election cycle can be triggered.

If the owner manages to maintain the highest support at the end of the showdown period, the current owner remains the owner without the need to take any action. If two candidates end up having the same stake, the first one triggering the `submitOwnershipClaim` function will be considered for the ownership.

**Comments:**
* The requirement to manually trigger the election cycle serves as a confirmation of the candidate's willingness to become the new protocol owner. 
* The manual ownership claim submission process was introduced to circumvent expensive max stake calculations and storage operations inside the smart contract. It also serves as a re-confirmation of the candidate's willingness to accept ownership. 
* In theory, the second or third placed candidates could become protocol owners if the winner does not submit their ownership claim during the respective period. In practice though, we anticipate the election winner to always submit their ownership claim. 
* To reduce the likelihood of an election cycle, owner's are incentivized to stake DIVA tokens themselves.
* The ownership claim submission period is the only period where staking/unstaking is disabled.
* To protect against flash-loan attacks, a minimum staking period of 7 days applies.
* During the election cycle, some functionality reserved for the owner is disabled to prevent harmful actions. This includes updating fees, settlement periods and the fallback data provider. This also applies to the new owner in that they have to wait until the end of the election cycle in order to perform the corresponding actions.
* DIVA token holders can stake for multiple candidates.

## Function overview

The `DIVAOwnershipMain` contract implements the following functions:

| Function                                                                                  | Description                                                                                                                                                 |
| :---------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Core functions**                                                                      |                                                                                                                                                             |
| [`stake`](#stake)                                                       | Function to stake voting tokens for a contract owner candidate.                                                                                                                         |
| [`unstake`](#unstake)                                                       | Function to reduce the stake for a contract owner candidate.                                                                                                                         |
| [`triggerElectionCycle`](#triggerelectioncycle)                                                       | Function to trigger an election cycle.                                                                                                                         |
| [`submitOwnershipClaim`](#submitownershipclaim)                                                       | Function for candidates to submit their ownership claim.                                                                                                                         |
| **Getter functions**                                                                      |                                                                                                                                                             |
| [`getCurrentOwner`](#getcurrentowner)                                                                         | Function to return the current DIVA Protocol owner address.                                                                                                |
| [`getStakedAmount`](#getstakedamount)                                                                         | Function to return the amount staked by a given/all voters for a given candidate.                                                                                                |
| [`getTimestampLastStake`](#gettimestamplaststake)                                                                         | Function to get the timestamp of the last stake operation for a given user.                                                                                                |
| [`getShowdownPeriodEnd`](#getshowdownperiodend)                                                                         | Function to return the showdown period end.                                                                                                |
| [`getSubmitOwnershipClaimPeriodEnd`](#getsubmitownershipclaimperiodend)                                                                         | Function to return the ownership claim submission period end.                                                                                                |
| [`getCooldownPeriodEnd`](#getcooldownperiodend)                                                                         | Function to return the cooldown period end.                                                                                                |
| [`getDIVAToken`](#getdivatoken)                                                                         | Function to return the DIVA token address that is used for voting.                                                                                                |
| [`getShowdownPeriod`](#getshowdownperiod)                                                                         | Function to return the showdown period length in seconds (30 days).                                                                                                |
| [`getSubmitOwnershipClaimPeriod`](#getsubmitownershipclaimperiod)                                                                         | Function to return the ownership claim submission period length in seconds (7 days).                                                                                                |
| [`getCooldownPeriod`](#getcooldownperiod)                                                                         | Function to return the cooldown period length in seconds (7 days).                                                                                                |
| [`getMinStakingPeriod`](#getminstakingperiod)                                                                         | Function to return the minimum staking period (7 days).  

## State modifying functions
This section provides an overview of the functions implemented in `DIVAOwnershipMain` contract.

### stake
Function to stake DIVA tokens towards a candidate for the protocol ownership. This may include the current owner. To protect against flash-loan attacks, a minimum staking period of 7 days applies. This function uses [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks. 

The function executes the following steps in the following order:
1. Confirm that triggered outside of the ownership claim submission period.
1. Transfer the DIVA token from `msg.sender` to the DIVA contract, with prior approval from `msg.sender`. The transfer is executed using the `safeTransferFrom` from OpenZeppelin's [SafeERC20][safeerc20] library to accommodate different implementations of the ERC20 standard. For details, see [here][safe-erc20-article-1] and [here][safe-erc20-article-2].
1. Store timestamp of `msg.sender` for the minimum staking period check in [`unstake`](#unstake).
1. Increase the amount staked for the candidate by `msg.sender`. This is relevant to perform [`unstake`](#unstake).
1. Increase the amount staked for the candidate overall.
1. Emit a [`Staked`](#staked) event on success.

The function reverts under the following conditions:
* Called within the ownership claim submission period.
* Insufficient allowance set by `msg.sender` to transfer the DIVA token.


```js
function stake(
    address _candidate,   // Address of candidate to stake for
    uint256 _amount       // Incremental DIVA token amount to stake
) external;
```

### unstake

Function to reduce an existing stake for a contract owner candidate. This function uses [solidstate's `nonReentrant` modifier][solidstate-reentrancy] to protect against reentrancy attacks. 

The function executes the following steps in the following order:
1. Confirm that the 7-day minimum staking period has been respected.
1. Confirm that triggered outside of the ownership claim submission period.
1. Reduce the amount staked for the candidate by `msg.sender`. Will revert on underflow as Solidity version > 0.8.0 is used.
1. Reduce the amount staked for the candidate overall. Will revert on underflow as Solidity version > 0.8.0 is used.
1. Transfer the corresponding amount to `msg.sender` using OpenZeppelin's `safeTransfer` method.
1. Emit an [`Unstaked`](#unstaked) event on success.

The function reverts under the following conditions:
* Called before the 7 day minimum staking period expired.
* Called within the ownership claim submission period.

```js
function unstake(
    address _candidate,   // Address of candidate to reduce stake for
    uint256 _amount       // Staking amount to reduce
) external;
```

### triggerElectionCycle

Function to trigger an election cycle. Can be triggered by any account who has accumulated more stake than the current contract owner.

The function executes the following steps in the following order:
1. Confirm that not triggered within an on-going election cycle.
1. Confirm that not triggered during cooldown period (7 days following the election cycle end).
1. Confirm that `msg.sender` has strictly more support than the existing owner.
1. Set end times for election cycle related periods (showdown period and ownership claim submission period)
1. Set leading candidate to the current protocol owner. Leading candidate will be updated during [`submitOwnershipClaim`](#submitownershipclaim)
1. Emit [`ElectionCycleTriggered`](#electioncycletriggered) on success.

The function reverts under the following conditions:
* Called within an on-going election cycle.
* Called during cooldown period.
* `msg.sender`'s stake is less than or equal to that of the current owner.
* Triggered by contract owner himself (special case of the above).

```js
function triggerElectionCycle() external;
```

### submitOwnershipClaim

Function for candidates to submit their ownership claim. Note that in the event that the existing contract owner maintains the majority, it is not necessary to trigger this function as they are set as the leading candidate when [`triggerElectionCycle`](#triggerelectioncycle) is triggered.

The function executes the following steps in the following order:
1. Confirm that triggered within ownership claim submission period.
1. Confirm that `msg.sender`'s stake is strictly larger than the current leading candidate's one.
1. Set leading candidate to `msg.sender`.
1. Emit an [`OwnershipClaimSubmitted`](#ownershipclaimsubmitted) event on success.

The function reverts under the following conditions:
* Called outside of the ownership claim submission period.
* `msg.sender` has less stake than current candidate.

```js
function submitOwnershipClaim() external;
```

<h2 id="getter-functions-2">Getter functions</h2>

### getStakedAmount
Function that returns the amount staked by a given `_voter` for a given `_candidate`.

```js
function getStakedAmount(
    address _voter,
    address _candidate
)
    external
    view
    returns (uint256);
```

Overloaded version that returns the aggregate amount staked for a given `_candidate`.

```js
function getStakedAmount(
    address _candidate
)
    external
    view
    returns (uint256);
```

### getCurrentOwner
Function to return the current DIVA Protocol owner address. On main chain, equal to the existing owner during an on-going election cycle and equal to the new owner afterwards.

```js
function getCurrentOwner()
    external
    view
    returns (address owner);
```

### getShowdownPeriodEnd
Function to return the showdown period end. Set to 0 at contract deployment.

```js
function getShowdownPeriodEnd()
    external
    view
    returns (uint256);
```

### getSubmitOwnershipClaimPeriodEnd
Function to return the ownership claim submission period end. Set to 0 at contract deployment. The time of contract deployment represents the start time for the very first protocol owner.

```js
function getSubmitOwnershipClaimPeriodEnd()
    external
    view
    returns (uint256);
```

### getCooldownPeriodEnd
Function to return the cooldown period end. Set to 0 at contract deployment.

```js
function getCooldownPeriodEnd()
    external
    view
    returns (uint256);
```

### getTimestampLastStake
Function to get the timestamp of the last stake operation for a given `_user`.

```js
function getTimestampLastStake(
    address _user
) 
    external
    view
    returns (uint256);
```

### getDIVAToken
Function to return the DIVA token address that is used for voting.

```js
function getDIVAToken() 
    external
    view
    returns (address);
``` 

### getShowdownPeriod
Function to return the showdown period length in seconds (30 days).

```js
function getShowdownPeriod() external pure returns (uint256);
``` 

### getSubmitOwnershipClaimPeriod
Function to return the ownership claim submission period length in seconds (7 days).

```js
function getSubmitOwnershipClaimPeriod() external pure returns (uint256);
``` 

### getCooldownPeriod
Function to return the cooldown period length in seconds (7 days) during which no new election cycle can be triggered following the end of an election cycle.

```js
function getCooldownPeriod() external pure returns (uint256);
```

### getMinStakingPeriod
Function to return the minimum staking period (7 days).

```js
function getMinStakingPeriod() external pure returns (uint256);
```

## Reentrancy protection
To protect against reentrancy attacks, the `DIVAOwnershipMain` contract implements [OpenZeppelin's `nonReentrant` modifier](https://docs.openzeppelin.com/contracts/4.x/api/security#ReentrancyGuard) for the [`stake`](#stake) and [`unstake`](#unstake) functions.

## Events

Main ownership contract specific events are listed below.

### Staked

Emitted when a DIVA token holder stakes for a protocol owner candidate.

```
event Staked(
    address indexed candidate,  // The address of the candidate that was staked for
    uint256 amount              // The DIVA token amount staked
);
```

### Unstaked

Emitted when a user reduces his stake for a protocol owner candidate.

```
event Unstaked(
    address indexed candidate,  // The address of the candidate that stake was reduced for
    uint256 amount              // The voting token amount unstaked
);
```

### ElectionCycleTriggered

Emitted when a protocol owner candidate triggers the election cycle.

```
event ElectionCycleTriggered(
    address indexed candidate   // The address that triggered the election cycle.
    uint256 startTime           // Start time of the election cycle
);
```

### OwnershipClaimSubmitted

Emitted when a protocol owner candidate submits an ownership claim.

```
event OwnershipClaimSubmitted(
    address indexed candidate  // The address of the candidate that submitted the ownership claim
);
```                                                                        

## Errors

The following errors may be emitted when interacting with main ownership contract specific functions.

| Error name                                 | Function                                                                                         | Description                                                                                                                                                         |
| :----------------------------------------- | :----------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `WithinSubmitOwnershipClaimPeriod(uint256 _timestampBlock, uint256 _submitOwnershipClaimPeriodEnd)`                   | `stake` / `unstake`                                                                                   | Thrown if called during the ownership claim submission period                                                                             |
| `MinStakingPeriodNotExpired(uint256 _timestampBlock, uint256 _minStakingPeriodEnd)`                   | `unstake`                        | Thrown if minimum staking period has not expired yet                                                                             |
| `WithinElectionCycle(uint256 _timestampBlock, uint256 _submitOwnershipClaimPeriodEnd)`                   | `triggerElectionCycle`                        | Thrown if called during an on-going election cycle                                                                             |
| `WithinCooldownPeriod(uint256 _timestampBlock, uint256 _cooldownPeriodEnd)`                   | `triggerElectionCycle`                        | Thrown if called during the cooldown period (7 days following the election cycle end)                                                                             |
| `InsufficientStakingSupport()`                   | `triggerElectionCycle`                        | Thrown if `msg.sender` has not strictly more stake than the current owner                                                                             |
| `NotLeader()`                   | `submitOwnershipClaim`                        | Thrown if another candidate has more stake or was already triggered by another candidate that has the same stake                                                                            |
| `NotWithinSubmitOwnershipClaimPeriod()`                   | `submitOwnershipClaim`                                                                                   | Thrown if called outside of the ownership claim submission period     |

# DIVA Ownership on secondary chains

To prevent the need for replicating the owner election process and the DIVA token on secondary chains, a cross-chain communication mechanism using the [Tellor protocol](https://tellor.io/) has been implemented to share the DIVA owner information stored in `DIVAOwnershipMain` contract with the `DIVAOwnershipSecondary` contract on secondary chains. 

## What is Tellor Protocol

Tellor is a decentralized oracle protocol that allows smart contracts on EVM chains to securely and reliably access data from off-chain sources, including data from other chains. It uses a decentralized network of stakers to provide this data, and incentivizes them with the Tellor token (TRB) to maintain the integrity of the network. The owner logic for secondary chains is implemented in `DIVAOwnershipSecondary` contract.

## How Tellor protocol works

To participate in the Tellor Protocol as a reporter, users must stake TRB tokens. The amount of TRB required for one stake is equal to the minimum of $1'500 or 100 TRB. This allows a reporter to submit one value every 12 hours. If a user wishes to submit more values during the same period, they must stake additional TRB tokens in proportion to the number of values they wish to submit. For example, if a user wants to submit two values every 12 hours, they must stake twice the amount of TRB required for one stake.

Assuming that the value of TRB is at least $15 (corresponding to 100 TRB required for one stake), the reporting process is as follows:
* Reporters submit values to a specific key, also known as queryId. Only one value can be reported per queryId and block.
* If a reported value is deemed incorrect, anyone can dispute it for a maximum of 12 hours from the time of reporting. Disputers pay a dispute fee starting at 10 TRB, which doubles up to a maximum of 100 TRB with each round of dispute for a given queryId.
* Once a dispute is submitted, the potentially malicious reporter who submitted the value is placed in a locked state for the duration of the vote. For the next two days, TRB holders vote on the validity of the reported value. All TRB holders have an incentive to maintain an honest oracle and can vote on the dispute. The disputed value is removed from the key-value store and the reporting process continues uninterrupted, allowing other reporters to submit valid values. For more information on Tellor's dispute process, refer to the official [Tellor docs](https://docs.tellor.io/tellor/disputing-data/introduction). 

To ensure the reliability of reported data, Tellor recommends that only data reports that have remained undisputed for a specified duration (up to 12 hours) should be considered valid. The Tellor adapter implements the maximum duration of 12 hours and utilizes the earliest value that satisfies this criterion as the settlement value, ignoring any subsequent values that also meet the condition.

## Cross-chain communication of DIVA owner

To bridge the DIVA owner information stored in the `DIVAOwnershipMain` contract on Ethereum (main chain) to the `DIVAOwnershipSecondary` contract on a secondary chain, Tellor's [`EVMCall`](https://github.com/tellor-io/dataSpecs/blob/main/types/EVMCall.md) query type, which is specifically designed for cross-chain communication, is used.

To report the DIVA owner to a secondary chain, a Tellor reporter would perform the following steps (for code examples, refer to the [`DIVAOwnershipSecondary.test.ts`](https://github.com/divaprotocol/diva-contracts/blob/main/test/DIVAOwnershipSecondary.test.ts) script):
1. Retrieve the current owner address via [`getCurrentOwner()`](#getcurrentowner) function on the main chain ownership contract.
1. Submit the encoded owner address along with the query data and Id returned by [`getQueryDataAndId`](#getquerydataandid) by calling Tellor's [`submitValue`](https://docs.tellor.io/tellor/getting-data/tellor-playground#testing-with-tellor) function on the secondary chain.
1. Wait until the 12-hour dispute period has passed.
1. Execute the [`setOwner()`](#setowner) function on the secondary ownership contract to update the owner on the secondary chain. Note that the latest submitted value that satisfies the 12-hour undispute condition will be used, and any values older than 36 hours from the time of reporting will be considered invalid. 

It is acknowledged that a newly elected DIVA owner will need at least 12 hours to gain access on the secondary chain after an election cycle. This is not a significant issue though as the previous owner's options are limited to revoking pending updates or triggering updates that will not take effect for 60 days (2 days for treasury address updates). Even if the previous owner initiates unwanted protocol parameter changes at the beginning of an election cycle, there is still a 23-day window (60-day activation delay minus 37-day election cycle) after the election cycle for the new owner to revoke any pending updates.

Note that after gaining access on the secondary chain, the new owner will have to wait another 2 days until their treasury address update will be activated. 

## Report verification

Tellor reporters can verify the validity of a reported DIVA owner address by using an archive node to simulate the return value of [`getCurrentOwner()`](#getcurrentowner-1) on the main chain as of a block with a timestamp shortly before the time of reporting. Since transactions may take several blocks to be included, there is some flexibility in the choice of the as-of block. That is, if the [`getCurrentOwner()`](#getcurrentowner-1) return value changes during the time a transaction takes to be included in a block, Tellor reporters may still consider the reported value valid and not dispute it. This is not a concern as a new owner can submit shortly after with a new value, which may only delay the takeover of ownership on the secondary chain by a few minutes.

## Monitoring

As Tellor is a permissionless system that allows anyone to report outcomes, constant monitoring of value submissions is required. Incentives built into the Tellor system encourage Tellor watchers to dispute inaccurate reportings. The main chain owner has a natural incentive to participate as a Tellor watcher and dispute any wrong submissions. Additionally, the `EVMCall` query type is widely adopted within the Tellor network, providing additional guarantees that no incorrect values will slip through unnoticed.

## Attack vectors

The chosen cross-communication solution design poses certain risks, including unauthorized access and unfounded disputes that may delay the transfer of ownership to a new owner on secondary chains. These risks are carefully considered in the design of the DIVA Protocol, and mitigation measures are in place to minimize their impact. Despite these risks, the use of a simple, unified, and decentralized cross-chain communication solution is still preferable as it eliminates the need for chain-specific bridge solutions, which come with their own set of risks and complexities.

The risks of DIVA Protocol's cross-communication design are discussed in more detail below. 

### Unauthorized access

Constant monitoring is crucial when using the Tellor protocol for cross-chain communication. In the event that an invalid submission goes unnoticed and a bad actor takes over ownership on a secondary chain, the potential harm is limited. Functions such as [`updateFees`](#updatefees), [`updateSettlementPeriods`](#updatesettlementperiods), [`updateFallbackDataProvider`](#updatefallbackdataprovider), and [`updateTreasury`](#updatetreasury) have an activation delay and can be revoked as soon as the rightful owner regains control. The revoke functions as well as [`pauseReturnCollateral`](#pausereturncollateral) and [`unpauseReturnCollateral`](#unpausereturncollateral) do not implement a delay and changes will take immediate effect if triggered by an unauthorized account. Former will require the rightful owner to trigger the updates again after regaining control. Latter will delay the possibility to redeem by a maximum of 8 days, but will not interrupt the settlement process, ensuring that all outstanding pools will settle correctly. The pause can be immediately reversed once the rightful owner regains control.

### Blocking ownership transfer via disputes

Another attack scenario involves preventing a new owner from taking over ownership on secondary chains by disputing their valid submissions. If the new owner responds by submitting a valid submission every block (about every 15 seconds), the cost of such an attack is estimated at around $4.32 million (assuming a TRB price of $15 and a dispute fee of 100 TRB) if conducted for 12 hours. This would only be profitable if the generated protocol fee in that period exceeds that cost, which is unlikely to happen in the near-term.

## Function overview

The `DIVAOwnershipSecondary` contract implements the following functions:

| Function                                                                                  | Description                                                                                                                                                 |
| :---------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Core functions**                                                                      |                                                                                                                                                             |
| [`setOwner`](#setowner)                                                                         | Set the owner based on the address reported to Tellor protocol.                                                                                                |
| **Getter functions**                                                                      |                                                                                                                                                             |
| [`getCurrentOwner`](#getcurrentowner)                                                                         | Function to return the current DIVA Protocol owner address.                                                                                                |
| [`getOwnershipContractMainChain`](#getownershipcontractmainchain)                                                                         | Function to return the ownership contract address on the main chain.                                                                                                |
| [`getMainChainId`](#getmainchainid)                                                                         | Function to return the main chain id.                                                                                                |
| [`getQueryDataAndId`](#getquerydataandid)                                                                         | Function to return the Tellor query data and Id which are required for reporting values to Tellor protocol.                                                                                                |

## State modifying functions
This section provides an overview of the functions implemented in `DIVAOwnershipSecondary` contract.

### setOwner

Function to update the owner on the secondary chain based on the value reported to the Tellor smart contract. The reported value has to satisfy the following two conditions in order to be considered valid:
1. Reported value hasn't been disputed for at least 12 hours
1. Timestamp of reporting is not older than 36 hours

The function executes the following steps in the following order:
1. Get the Tellor query Id to look up.
1. Retrieve the latest (encoded) value that remained undisputed for at least 12 hours from the Tellor smart contract.
1. Decode value to obtain reported `_owner`.
1. Update `_owner` variable inside `DIVAOwnershipSecondary` contract.
1. Emit [`OwnerSet`](#ownerset) event on success.

The function reverts if:
- there is no value inside the Tellor smart contract that remained undisputed for more than 12 hours.
- the last reported undisputed value is older than 36 hours.

Note that the `setOwner` function can be triggered by any account.

```js
function setOwner() external;
```

<h2 id="getter-functions-3">Getter functions</h2>

### getCurrentOwner
Function to return the current DIVA Protocol owner address. On secondary chain, equal to the address reported via Tellor oracle.

```js
function getCurrentOwner()
    external
    view
    returns (address);
```

### getOwnershipContractMainChain

Function to return the ownership contract address on the main chain.

```js
function getOwnershipContractMainChain()
    external
    view
    returns (address);
```

### getMainChainId

Function to return the main chain id.

```js
function getMainChainId()
    external
    view
    returns (uint256);
```

### getQueryDataAndId

Function to return the Tellor query data and Id which are required for reporting values to Tellor protocol. The query data is an encoded string consisting of the query type string "EVMCall", the main chain Id (1 for Ethereum), the address of the ownership contract on main chain as well as the function signature of the main chain function `getCurrentOwner()` (`0xa18a186b`). The query Id is the `keccak256` hash of the query Data. Refer to the [Tellor specs](https://github.com/tellor-io/dataSpecs/blob/main/types/EVMCall.md) for details.

```js
function getQueryDataAndId()
    external
    view
    returns (bytes memory, bytes32);
```

## Reentrancy protection
No functions in the `DIVAOwnershipSecondary` contract require reentrancy protection.

## Events

Secondary ownership contract specific events are listed below.

### OwnerSet

Emitted when `owner` is set on the secondary chain.

```
event OwnerSet(
    address indexed owner                  // The owner address set on the secondary chain
);
```

## Errors

The following errors may be emitted when interacting with secondary ownership contract specific functions.

| Error name                                 | Function                                                                                         | Description                                                                                                                                                         |
| :----------------------------------------- | :----------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ValueTooOld(uint256 _timestampRetrieved, uint256 _maxAllowedTimestampRetrieved)`                   | `setOwner`                        | Thrown if Tellor reporting timestamp is older than 36 hours                                                                            |
| `NoOracleSubmission()`                   | `setOwner`                        | Thrown if there is no value inside the Tellor smart contract that remained undisputed for more than 12 hours                                                                            |

# DIVA Development Fund

The `DIVADevelopmentFund` contract was created to support the ongoing development of the DIVA Protocol project. Shortly after the deployment of the DIVA system, approximately 60% of the unissued DIVA token supply will be deposited and released gradually over a 30-year period at a rate of 2 million DIVA tokens (2% of total supply) per year, claimable by the DIVA owner.

The contract was set up to allow everyone to contribute in any ERC20 token or native assets, such as ETH on Ethereum, to support the project's development.

> **Note:** To reduce the incentive for unauthorized access to secondary chain contracts, as discussed in the [`Ownership on secondary chains`](#diva-ownership-on-secondary-chains) section, the DIVA Development Fund is exclusively deployed on Ethereum, minimizing the risk of potential losses.

## Function overview

The `DIVADevelopmentFund` contract implements the following functions:

| Function                                                                                  | Description                                                                                                                                                 |
| :---------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Core functions**                                                                      |                                                                                                                                                             |
| [`deposit` (native asset)](#native-asset)                                                                         | Function to deposit the native asset, such as ETH on Ethereum.                                                                                                |
| [`deposit` (ERC20 token)](#erc20-token)                                                                         | Function to deposit ERC20 token.                                                                                                |
| [`withdraw`](#withdraw)                                                                         | Function to withdraw a deposited token.                                                                                                |
| [`withdrawDirectDeposit`](#withdrawdirectdeposit)                                                                         | Function to withdraw a given token that has been sent to the contract directly without calling one of the `deposit` functions.                                                                                                |
| **Getter functions**                                                                      |                                                                                                                                                             |
| [`getDepositsLength`](#getdepositslength)                                                                         | Function to return the number of deposits.                                                                                                |
| [`getDivaOwnership`](#getdivaownership)                                                                         | Function to return the DIVAOwnership contract address on the corresponding chain.                                                                                                |
| [`getDepositInfo`](#getdepositinfo)                                                                         | Function to get the info for a given deposit.                                                                                                |
| [`getDepositIndices`](#getdepositindices)                                                                         | Function to get the deposit indices for a given token.                                                                                                |
| [`getUnclaimedDepositAmount`](#getunclaimeddepositamount)                                                                         | Function to get the unclaimed deposit amount for a given token.                                                                                                |

## Deposits

The contract implements two `deposit` functions, one for native assets and one for ERC20 tokens. Deposits vest linearly over a specified period and can be claimed by the DIVA owner using the [`withdraw`](#withdraw) function. Direct deposits, made by sending native assets or ERC20 tokens directly to the contract address, are not subject to vesting and can be claimed immediately using the [`withdrawDirectDeposit`](#withdrawdirectdeposit) function. A variable called `_tokenToUnclaimedDepositAmount` (readable via [`getUnclaimedDepositAmount`](#getunclaimeddepositamount)) is used to track deposits and withdrawals made through the implemented functions. The difference between the contract balance and this variable represents the amount of direct deposits that can be claimed.

The `deposit` functions execute the following steps in the following order:
1. Create a new [`Deposit` struct](#deposit-struct) entry in the `_deposits` array. Note that for [native asset deposits](#native-asset), the `token` parameter is set to `address(0)` and the `amount` to `msg.value`.
1. Update the `_tokenToDepositIndices` mapping to include the new index. The indices for a given token can be obtained via the [`getDepositIndices`](#getdepositindices) function.
1. Update the `_tokenToUnclaimedDepositAmount` variable.
1. For ERC20 tokens, transfer the token from `msg.sender` to `address(this)` via `safeTransferFrom`. Requires prior user approval.
1. Emit a [`Deposited`](#deposited) event on success.

### deposit

#### Native asset

Function to deposit native asset, such as ETH on Ethereum. The `token` parameter in [`Deposit` struct](#deposit-struct) is set to `address(0)` and the `amount` parameter to `msg.value`.

```js
function deposit(
    uint256 _releasePeriodInSeconds     // Release period of deposit in seconds
) external payable;
```

> **Note:** Direct native asset deposits are handled by the `receive()` function and require the `msg.data` to be empty.

#### ERC20 token

Function to deposit ERC20 token. Requires prior approval by `msg.sender` to transfer the token.

```js
function deposit(
    address _token,                     // Address of token to deposit
    uint256 _amount,                    // ERC20 token amount to deposit
    uint256 _releasePeriodInSeconds     // Release period of deposit in seconds
) external;
```

### Deposit struct

The `Deposit` struct is used as an element in an array to store deposits. It is defined as follows:

```
struct Deposit {
    address token;          // Address of deposited token (zero address for native asset)
    uint256 amount;         // Deposit amount
    uint256 startTime;      // Timestamp in seconds since epoch when user can start claiming the deposit
    uint256 endTime;        // Timestamp in seconds since epoch when release period ends at
    uint256 lastClaimedAt;  // Timestamp in seconds since epoch when user last claimed deposit at
}
```

## Withdrawals

Deposits that have vested can be claimed by the DIVA owner using the [`withdraw`](#withdraw) function. Direct deposits can be claimed using the [`withdrawDirectDeposit`](#withdrawdirectdeposit) function. Only the DIVA owner has access to withdraw funds.

### withdraw

Function to withdraw a deposited `_token` (zero address for native asset). The function aggregates the claimable amounts inside the specified deposits (as indicated via `_indices`) and transfers the total amount to `msg.sender` (owner) via `safeTransfer` for ERC20 tokens and via low-level `call` function for native assets. Emits a [`Withdrawn`](#withdrawn) event on success.

The function will revert with a `DifferentTokens` error if any of the specified `_indices` points to a deposit that has a different token than the provided `_token`. To avoid this, it is recommended to use the [`getDepositIndices`](#getdepositindices) function to retrieve the indices for a specific `_token` address, before calling this function.

```js
function withdraw(
    address _token,                 // Address of token to withdraw
    uint256[] calldata _indices     // Array of deposit indices to withdraw
)
    external
    payable;
```

Note that the inclusion of the `_token` address as an input for the function is not strictly required, but it serves as a reminder for the user to check that all deposit indices in the `_indices` array have the same underlying token. This helps to prevent the function from reverting.

### withdrawDirectDeposit

Function to withdraw a given `_token` that has been sent to the contract directly without calling the deposit function. Use the zero address for the native asset (e.g., ETH on Ethereum).

```js
function withdrawDirectDeposit(address _token) external payable;
```

<h2 id="getter-functions-4">Getter functions</h2>


### getDepositsLength

Function to return the number of deposits.

```js
function getDepositsLength()
    external
    view
    returns (uint256);
```

### getDivaOwnership

Function to return the DIVAOwnership contract address on the corresponding chain.

```js
function getDivaOwnership()
    external
    view
    returns (IDIVAOwnershipShared);
```

### getDepositInfo

Function to get the deposit info for a given `_index`.

```js
function getDepositInfo(uint256 _index)
        external
        view
        returns (Deposit memory);
```

where the `Deposit` struct is given by

```
struct Deposit {
    address token;          // Address of deposited token (zero address for native asset)
    uint256 amount;         // Deposit amount
    uint256 startTime;      // Timestamp in seconds since epoch when user can start claiming the deposit
    uint256 endTime;        // Timestamp in seconds since epoch when release period ends at
    uint256 lastClaimedAt;  // Timestamp in seconds since epoch when user last claimed deposit at
}
```

### getDepositIndices

Function to get the deposit indices for a given `_token`. Use the zero address for the native asset (e.g., ETH on Ethereum). `_startIndex` and `_endIndex` allow the caller to control the array range to return to avoid exceeding the gas limit. Returns an empty array if `_endIndex <= _startIndex`. Use the [`getDepositIndicesLengthForToken`](#getdepositindiceslengthfortoken) to obtain the deposit length for the given `_token`.

```js
function getDepositIndices(
    address _token
    uint256 _startIndex,
    uint256 _endIndex   
)
    external
    view
    returns (uint256[] memory);
```

### getDepositIndicesLengthForToken

Function to get the length of deposit indices for a given `_token`. Use the zero address for the native asset (e.g., ETH on Ethereum).

```js
function getDepositIndicesLengthForToken(
    address _token
)
    external
    view
    returns (uint256);
```

### getUnclaimedDepositAmount

Function to get the unclaimed deposit amount for a given `_token`. Use the zero address for the native asset (e.g., ETH on Ethereum).

```js
function getUnclaimedDepositAmount(address _token)
    external
    view
    returns (uint256);
```

## Reentrancy protection

To protect against reentrancy attacks, the `DIVADevelopmentFund` contract implements [OpenZeppelin's `nonReentrant` modifier](https://docs.openzeppelin.com/contracts/4.x/api/security#ReentrancyGuard) for all state-modifying functions, including deposit functions.

## Events

DIVA Development Fund contract specific events are listed below.

### Deposited

Emitted when a user deposits a token or a native asset via one of the two [`deposit`](#deposit) functions.

```
event Deposited(
    address indexed sender,     // Address of user who deposits token (`msg.sender`)
    uint256 depositIndex        // Index of deposit in deposits array variable
);
```

### Withdrawn

Emitted when a user withdraws a token via [`withdraw`](#withdraw) or [`withdrawDirectDeposit`](#withdrawdirectdeposit).

```
event Withdrawn(
    address indexed withdrawnBy,    // Address of user who withdraws token (current DIVA owner)
    address indexed token,          // Address of withdrawn token
    uint256 amount                  // Token amount withdrawn
);
```

## Errors

The following errors may be emitted when interacting with DIVA Development Fund contract specific functions.

| Error name                                 | Function                                                                                         | Description                                                                                                                                                         |
| :----------------------------------------- | :----------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NotDIVAOwner(address _user, address _divaOwner)`                      | `withdraw` | Thrown if `msg.sender` is not the owner of DIVA Protocol                                                                                                                   |
| `DifferentTokens()`                      | `withdraw` | Thrown if token addresses for indices passed are different                                                                                                                   |

# Risk disclaimer

The use of any DeFi protocol comes with certain risks. Be responsible when interacting with the DIVA Protocol and don't put in more funds than you are willing to lose. By interacting with DIVA Protocol you acknowledge the following risks:

- **Hack risk**: Despite following best practices in Solidity coding and conducting smart contract audits, there is still a chance that the protocol might get hacked. Only deposit amounts that you can afford to lose.
- **Oracle risk**: Data providers may intentionally or mistakenly submit an incorrect final value which may result in incorrect payoffs for short and long position tokens. To mitigate this risk, choose pools with trusted and reputable data providers (e.g., those that are on the [whitelist][whitelistgithub]). For data feeds that can be easily manipulated (e.g., the floor price of an NFT collection), choose pools that have a reasonable capacity limit in place to reduce the incentive to manipulate.
- **App risk**: Malicious actors may take over control of apps/frontends built on top of DIVA Protocol and change how values are submitted to the underlying smart contract functions. In case of doubt, don't interact with the app.
- **Upgradeability risk**: In order to be able to react to bugs, the DIVA Protocol team will retain the possibility to update the smart contract in the early phase of the protocol's lifetime. This functionality will be abolished once there is sufficient confidence that the smart contracts are stable and bug-free.


[eip2535]: https://eips.ethereum.org/EIPS/eip-2535
[safeerc20]: https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v3.4/contracts/token/ERC20/SafeERC20.sol
[safe-erc20-article-1]: https://soliditydeveloper.com/safe-erc20
[safe-erc20-article-2]: https://forum.openzeppelin.com/t/making-sure-i-understand-how-safeerc20-works/2940
[solidstate-reentrancy]: https://github.com/solidstate-network/solidstate-solidity/blob/master/contracts/utils/ReentrancyGuard.sol
[interest-bearing-tokens]: https://edge.app/blog/company-news/interest-bearing-tokens-in-edge-atokens-ctokens/#:~:text=The%20interest%2Dbearing%20tokens%20have,from%20the%20Compound%20money%20market.
[diva-subgraph]: https://thegraph.com/hosted-service/subgraph/divaprotocol/diva-ropsten
[wsteth]: https://help.lido.fi/en/articles/5231836-what-is-wrapped-steth-wsteth
[divasubgraph]: https://thegraph.com/hosted-service/subgraph/divaprotocol/diva-ropsten
[whitelistgithub]: https://github.com/divaprotocol/whitelist
