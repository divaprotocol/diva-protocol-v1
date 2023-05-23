# DIVA Protocol V1 Audit

## Overview

The audit was performed by six independent teams:
* Team 1 ([ComposableSecurity](https://composable-security.com/)): 🔗
* Team 2 (SolidityLabs): 🔗 [gogo](https://twitter.com/gogotheauditor), [kodyvim](https://twitter.com/kodyvim_), [Santipu_](https://twitter.com/MrCaesarDev), [zaskoh](https://twitter.com/0xzaskoh)
* Team 3 (SolidityLabs): 🔗 [TrungOre](https://twitter.com/Trungore), [Duc](https://twitter.com/duc_hph)
* Team 4 (SolidityLabs): 🔗 said017, WangChao, kodak_rome, Emmalien
* Team 5 (SolidityLabs): 🔗 devScrooge (JMariadlcs), Cryptor, Saksham
* Team 6 ([HiAudit](https://hiaudit.io/consulting)): 🔗 ❗VERY DISAPPOINTING OUTCOME RELATIVE TO THE MONEY PAID! THEY ARE **NOT** THE #1 AUDITING FIRM IN JAPAN! Search for "HiAudit" in this summary to find out more.

The contracts in scope included:
* DIVA Protocol V1
* DIVA Development Fund
* Tellor oracle adapter
* DIVA Token distribution contract (audited by ComposableSecurity, HiAudit and an independent [solo auditor](https://github.com/ahmedovv123/audits/blob/main/audits/DivaVesting(QA).md), not by SolidityLabs teams)

## Summary

TODO: Add summary table of number of Critical, High, Medium, etc. findings.

T1 = Team 1, etc.
DP = DIVA Protocol
TA = Tellor adapter
DC = Distribution contract

## Critical
n/a

## High
|ID | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|H-01|Wrong implementation of `EVMCall` in `DIVAOwnershipSecondary`||[🔗][H-01-T2]|||||[Fixed][PR3]|Great unique finding! We'd like to highlight that if this error made it to production, the harm would be limited as Tellor reporters could have adopted the new query type. No user funds would have been at risk. Nonetheless, adhering to the proposed standard is the preferred approach.|
|H-02|Round-down calculation is used to calculate the `_collateralAmountRemovedNetMaker` which can be abused by taker to take all the removed liquidity from maker|||[🔗][H-03-T3]||||[Fixed][PR24]|Great unique finding! While it wouldn't be economically viable to execute this attack, we agree that it's better to fix these things to avoid any sort of griefing attack.|
|H-03|`_createContingentPoolLib` is suspicious of the reorg attack|||[🔗][H-04-T3]||||Fixed ([PR29] / [PR48])|Very special and unique finding which helped us to better protect protocol users in the event of chain reorgs.|

## Medium
|ID | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|M-01|Wrong protocol fee recipient when withdrawing liquidity|🔗 (5.3)|[🔗][M-01-T2]|[🔗][M-01-T3]|[🔗][M-01-T4]||🔗 (9)|[Fixed][PR11]|Good spot! We overlooked it when we updated the governance logic to introduce an activation delay. The impact would have been rather limited. No user funds would have been at risk.|
|M-02|PreviousFallbackDataProvider won't have incentive to provide accurate value|🔗 (5.2)|[🔗][M-02-T2]||[🔗][M-02-T4]||🔗 (4)|[Fixed][PR12]|Same comment as for M-01, we overlooked it when we introduced the governance delay. The impact would have been rather limited though as we don't expect the high TVL pools to get to a stage where the fallback data provider has to step in.|
|M-03|Fee-on-Transfer tokens used as collateral will make a pool undercollateralized||[🔗][M-03-T2]|[🔗][M-03-T3]||||[Fixed][PR27]|Agreed to block all fee-on-transfer tokens.|
|M-04|DoS in `_calcPayoffs` function when calculating big numbers||[🔗][M-04-T2]|||||[Fixed][PR16]|Very special finding that no one else spotted!|
|M-05|`_getActualTakerFillableAmount` will return `_takerCollateralAmount - _offerInfo.takerFilledAmount` even if the order is not fillable|||||[🔗][M-05-T5]||[Fixed][PR31]|Good finding that will help to avoid any confusion. No user funds would have been at risk though. |

**Note:** The medium finding "Potentially In-Correct calculation of actual taker fillable amount" (see finding 3 in the HiAudit report) was omitted as the HiAudit team failed to provide a more accurate formula than the existing one, which we believe to be accurate.

## Low
|ID | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|L-01|Neither the long nor the short token can be conditionally burned||[🔗][L-01-T2]|[🔗][L-01-T3]||||[Fixed][PR14]||
|L-02|Trapped ETH in the Diamond contract||[🔗][L-02-T2]|||[🔗][L-02-T5]||[Fixed][PR6]||
|L-03|Missing important data in events||[🔗][L-07-T2]|||||[Fixed][PR22]||
|L-04|Don't allow setting owner to `address(0)` in `DIVAOwnershipSecondary`||[🔗][L-08-T2]|||||Not implemented|Not addressed as setting the owner on secondary chains equal to the zero address wouldn't cause any harm.|
|L-05|`DiamondCutFacet` should close the Diamond after getting called||[🔗][L-11-T2]|||||Not implemented|We decided to remove the upgradeability feature via a separate transaction rather than embedding it into the Diamond constructor to keep the code as close as possible to the original standard. In particular, if we ever plan to have an upgradeability feature in future versions of the protocol, we can achieve that without major code changes. Users will be able to verify that contracts are not upgradeable via https://louper.dev/, for instance.|
|L-06|Transferring a zero value amount may revert when creating a pool|||[🔗][L-12-T3]||||Not implemented|Not addressed as the amount > 0 check would be done within the ERC20 token (LEND, for instance).|
|L-07|Redundant requirement when requiring the `collateralAmount > 1e6` when creating a pool|||[🔗][L-13-T3]||||[Fixed][PR46]||
|L-08|`unpauseReturnCollateral()` will extend pause delay time even when it already unpaused||||[🔗][L-15-T4]|||[Fixed][PR35]||
|L-09|Griefer can challenge final reference value and prolonged the settlement process||||[🔗][L-16-T4]|||Not implemented|Not addressed as the possibility to confirm a previously submitted value by re-submitting the same value was a conscious design choice to prevent these type of attacks.|
|L-10|Centralization risk in token supply can result in users being unable to remove DIVA owner|||||[🔗][L-17-T5]||Not implemented|This issue is not a concern because power will eventually concentrate in the hands of those who have the highest belief in the project. Since these parties are likely to also stake for themselves, they will have a vested interest in acting in the best interest of the protocol.|
|L-11|Voting for a different owner can become impossible|||||[🔗][L-18-T5]||[Fixed][PR32]|Great unique finding! The implemented solution to store the timestamp for “each stake” of each user would be an overkill. We have decided to store the staking timestamp at a user-candidate level instead of a user level as done before. This solves the problem if a user is staking for two different candidates. We acknowledge that the timestamp will be overwritten if a user stakes for the same candidate multiple times.|
|L-12|Diamond facet upgrade|||||[🔗][L-19-T5]||Not implemented|Not relevant as the protocol will be rendered immutable from the start.|
|L-13|Missing interface in IERC165|🔗 (5.4)||||||[Fixed][PR44]||
|L-14|Unverified position token|🔗 (5.5)||||||[Fixed][PR42]||
|L-15|Invalid receiver of settlement fee in liquidity removal|🔗 (5.7)||||||[Fixed][PR21]|Upon reviewing the recommendation, we discovered that our original (conscious) design choice could have led to incorrect fee allocation within the Tellor adapter under certain circumstances. To fix this issue, we applied a similar logic to the one used for tips, meaning that any accrued fees are held in a reserve and allocated to the corresponding recipient only after the final value has been confirmed. |
|L-16|Un-Satisfactory check while setting up `permissionedERC721Token`||||||🔗 (5)|Not implemented|The `permissionedERC721Token` address cannot be zero inside the `PermissionedPositionToken` contract as it's excluded in an `if` block inside the `PositionTokenFactory` contract. Despite highlighting this to HiAudit, they refused to remove this finding from the report, insisting that it aligns with best practices.|
|L-17|In-sufficient transfer check while allocating fees to `recipient`||||||🔗 (8)|Not implemented|Neither the treasury, the data provider nor the fallback provider can be the zero address (excluded inside the corresponding setter functions). Despite highlighting this to HiAudit, they refused to remove this finding from the report, insisting that it aligns with best practices.|

## Informational
|ID | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|I-01|Missing function to query for `_permissionedPositionTokenImplementation` in `PositionTokenFactory`||[🔗][I-05-T2]|||||[Fixed][PR6]||
|I-02|Consider resetting values after a new Owner has claimed the ownership in `DIVAOwnershipMain`||[🔗][I-07-T2]|||||Not implemented|Note that any non-winning candidate who has received more votes than the current owner can theoretically submit an ownership claim. That was a conscious design choice to simplify the snapshot logic. Resetting the values would allow a non-winning candidate to submit a claim and with that prevent the actual winner to submit their claim. |
|I-03|Misleading typo in comment||[🔗][I-11-T2]|||||[Fixed][PR6]||
|I-04|Violation Of Checks Effects Interation Pattern|🔗 (6.2)||||[🔗][I-12-T5]||Not implemented|We have thoroughly evaluated the current implementation and are confident that it does not introduce any vulnerabilities. It was a conscious decision to prioritize drawing the capital before benefiting the `msg.sender`. Additionally, we have implemented reentrancy guards on all state-modifying functions (except governance related functions) to provide the necessary protection against reentrancy attacks. |
|I-13|Remove `poolId` from PoolStorage|🔗 (6.1)||||||Not implemented|No longer relevant after H-03 was implemented.|
|I-14|Improve code clarity|🔗 (6.3)||||[🔗][I-14-T5]||Fixed ([PR6] / [PR31])|Majority of the recommendations has been implemented.|
|I-15|Use proper error for non-existing pool|🔗 (6.4)||||||Fixed ([PR37] / [PR38] / [PR39] / [PR40] / [PR50])||
|I-16|Add incentive for the default settlement|🔗 (6.5)||||||Not implemented|That was a conscious design choice, hence not implemented.|
|I-17|Optimize gas consumption by removing redundant checks|🔗 (6.6)||[🔗][L-14-T3]||||[Fixed][PR18]||
|I-18|Avoid zero value transfers initiated by the protocol|🔗 (6.7)||||||Not implemented|We believe that zero value transfers should be excluded on the frontend side rather than within the contract itself. Introducing the proposed check would result in additional gas costs. In particular, as we anticipate that data providers will utilize the `batchClaimFee` function, passing a collateral token with an amount of 0 by accident would cause the entire transaction to revert, leading to significant costs for the data provider.|
|I-19|Consider adding white hat hacks policy|🔗 (6.9)||||||Postponed|We will add a white hat hack policy at a later stage, post mainnet launch.|
|I-20|Consider extending the effect of the `pauseReturnCollateral` function|🔗 (6.12)||||||Not implemented|The decision to not implement the ability to pause the creation of derivative contracts was deliberate. This choice was made to prevent the owner from being pressured by a central authority to halt the entire protocol.|
|I-21|Add missing variable checks in constructor||[🔗][I-06-T2]||||🔗 (1)|[Fixed][PR31]||
|I-22|Explicit Return [ Code Readability ]||||||🔗 (2)|Not implemented||
|I-23|Unclear usage when ERC20 blacklisted user removes liquidity||||||🔗 (6)|Not implemented|A potential taker that gets blacklisted before filling a remove liquidity offer is equivalent to not having any taker at all. No user is losing any money in such a scenario. The maker can simply wait until expiry to redeem their funds. It doesn't need a taker to return the collateral. HiAudit's recommendation to implement a check to verify if a user is blacklisted is not realistic as any ERC20 token may implement a different function name. |

## Other

Issues not specifically raised by any of the auditing teams but related to other findings.

| Description        | PR | Team comment|
| :--- |:--- |:--- |
|Remove outdated comments regarding upgradeability risk and owner right restrictions in Documentation|[PR6]||

# DIVA Development Fund

## Critical
n/a

## High
|ID | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|H-01|Funds could be stuck in `DIVADevelopmentFund`|🔗 (5.1)|[🔗][H-02-T2]|||||[Fixed][PR8]|Important finding! We want to highlight that this issue would have only impacted the protocol owner in a scenario where someone made a donation via the `deposit` function with `_releasePeriodInSeconds = 0`. No DIVA Protocol user's would have been directly impacted by this issue.|

## Medium
n/a

## Low
|ID | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|L-01|Add a minimum deposit amount in `DIVADevelopmentFund`||[🔗][L-09-T2]|||||Not implemented|Not addressed as someone could create a worthless token to circumvent such restriction. |
|L-02|Missing possibility of removing deposits that are fully paid in `DIVADevelopmentFund`||[🔗][L-10-T2]|||||Not implemented|Not addressed as deleting array items via a separate function would cost gas and change the indices of deposits; the full array is never used, so we don't see any immediate benefit of deleting the items.|
|L-04|Missing important data in events||[🔗][L-07-T2]|||||[Fixed][PR22]||
|L-05|Fee-on-transfer tokens will get stuck in Development Fund|🔗 (5.6)|[🔗][L-05-T2]|||||[Fixed][PR27]||
|L-06|Missing validations while adding new deposit to address ||||||🔗 (7)|Not implemented|Despite pointing out to the HiAudit team that the zero address does not implement the `safeTransferFrom` function, they refused to remove this finding from the report, insisting that it aligns with best practices.|

## Informational
|ID | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|I-01|Add missing variable checks in constructor||[🔗][I-06-T2]||||🔗 (1)|[Fixed][PR31]|Majority of the recommendations has been implemented.|
|I-02|Improve code clarity|🔗 (6.3)||||[🔗][I-14-T5]||Fixed ([PR6] / [PR31])||
|I-03|Remove `payable` mutability from `withdraw` function|🔗 (6.10)||||||Not implemented|As pointed out by the auditing team, it's more gas efficient with the payable decorator (24 less gas); even if the owner deposited ETH by accident, he would be able to claim it again back via the `withdrawDirectDeposit` function.|


# Tellor oracle adapter

## Critical
n/a

## High
n/a

## Low
|ID | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|L-01|Missing boundries for `_maxDIVARewardUSD` in `DIVAOracleTellor`||[🔗][L-04-T2]|||||Not implemented|As the purchasing power of USD may change over time, we agreed to not implement any boundaries.|

TODO
Add more PRs (fee tokens, variable naming, etc.)

## Informational
|ID | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|I-01|Missing validation on deployment of DIVAOracleTellor||[🔗][I-01-T2]|||||[Fixed][PR79]||
|I-02|Use specific imports instead of just a global import in DIVAOracleTellor||[🔗][I-03-T2]|||||[Fixed][PR79]||
|I-03|Change immutable to constant if a fixed value is used||[🔗][I-09-T2]|||||[Fixed][PR79]||
|I-04|Add missing variable checks in constructor||[🔗][I-06-T2]||||🔗 (1)|[Fixed][PR31]||

## Other

Issues not specifically raised by any of the auditing teams but related to other findings.

| Description | PR | Team comment|
| :--- |:--- |:--- |
|Fee-on-Transfer tokens issue in `addTip` functionality in Tellor adapter|[PR82]|Related to finding M-03 finding in DIVA Protocol.|
|Update `poolId` type|[PR84]|Related to finding H-03 in DIVA Protocol.|


# Diamond Standard related findings

## Critical
n/a

Note that the following findings are the result of a slightly outdated version of the Diamond Standard that was used.

## Low
|ID | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|L-01|Wrong implementation of EIP-2535 in LibDiamond library||[🔗][L-06-T2]|||||[Fixed][PR6]||

## Informational
|ID | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|I-04|Useless require statement at _diamondCut function||[🔗][I-04-T2]|||||[Fixed][PR6]||


# DIVA Token distribution contract

## Critical
n/a

## Informational
|ID | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|I-01|Detect duplicates in claimers' addresses|🔗 (6.8)||||||[Fixed][PR9]||
|I-02|Protect withdrawing all tokens before setting up trigger|🔗 (6.13)||||||Not implemented|Not implemented as this may be useful in case something goes wrong at initialization. |

## Other

Issues not specifically raised by any of the auditing teams but related to other findings.

| Description        | PR | Team comment|
| :--- |:--- |:--- |
|Remove pause/unpause functionality from ClaimDIVALinearVesting contract|[PR13]||

# General recommendations

Low/informational:
|ID | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|L-01|Update openzeppelin NPM dependencies in package.json||[🔗][L-03-T2]|||||[Fixed][PR3]||
|I-01|Pragma version||[🔗][I-02-T2]|||||[Fixed][PR79]||
|I-23|Use the same version of Solidity in all smart contracts (latest stable)|🔗 (6.14)||||||[Pending][PR13 (DIVA Protocol), 79 (Oracles)]||"
|I-02|Missing NatSpec @inheritdoc in implementations||[🔗][I-08-T2]|||||[Not implemented][PR]||
|I-03|Missing NatSpec in diva-contracts Interfaces||[🔗][I-10-T2]|||||[Fixed][PR54]||
|I-21|Consider adding popups for front-end application to warn users|🔗 (6.11)||||||[Pending][PR]||

## Gas optimization

The following gas optimizations have been proposed for DIVA Protocol mainly but were implemented for all relevant contracts.

|ID | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|G-01|For Operations that will not overflow, you could use unchecked|||||[🔗][G-01-T5]||[Pending][PR52]||
|G-02|Don't initialize variables with default value|||||[🔗][G-02-T5]||[Pending][PR52]||
|G-03|Functions guaranteed to revert when called by normal users can be marked payable|||||[🔗][G-03-T5]||[Pending][PR52]||
|G-04|+i costs less gas than i++, especially when it's used in for-loops (--i/i-- too)|||||[🔗][G-04-T5]||[Pending][PR52]||
|G-05|Use != 0 instead of > 0 for unsigned integer comparison|||||[🔗][G-05-T5]||[Pending][PR52]||
|G-06|Internal functions only called once can be inlined|||||[🔗][G-06-T5]||[Pending][PR52]||
|G-07|Using getter functions consume more gas|||||[🔗][G-07-T5]||[Pending][PR52]||
|G-08|+= Costs More Gas|||||[🔗][G-08-T5]||[Pending][PR52]||
|G-09|Use Custom Error Strings|||||[🔗][G-09-T5]||[Pending][PR52]||
|G-10|ps Variable Can Be Inlined|||||[🔗][G-10-T5]||[Pending][PR52]||
|G-11|Use while loop instead of for loop|||||[🔗][G-11-T5]||[Pending][PR52]||
|Tellor|Minor gas optimizations|||||||[PR85]||
|Token Distributor|Use custom errors instead of require to save users gas|||||||[][PR15]||


[PR3]: https://github.com/divaprotocol/diva-protocol-v1/pull/3
[PR8]: https://github.com/divaprotocol/diva-protocol-v1/pull/8
[PR24]: https://github.com/divaprotocol/diva-protocol-v1/pull/24
[PR29]: https://github.com/divaprotocol/diva-protocol-v1/pull/29
[PR48]: https://github.com/divaprotocol/diva-protocol-v1/pull/48
[PR11]: https://github.com/divaprotocol/diva-protocol-v1/pull/11
[PR12]: https://github.com/divaprotocol/diva-protocol-v1/pull/12
[PR27]: https://github.com/divaprotocol/diva-protocol-v1/pull/27
[PR16]: https://github.com/divaprotocol/diva-protocol-v1/pull/16
[PR14]: https://github.com/divaprotocol/diva-protocol-v1/pull/14
[PR6]: https://github.com/divaprotocol/diva-protocol-v1/pull/6
[PR3]: https://github.com/divaprotocol/diva-protocol-v1/pull/3
[PR79]: https://github.com/divaprotocol/diva-protocol-v1/pull/79
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR27]: https://github.com/divaprotocol/diva-protocol-v1/pull/27
[PR6]: https://github.com/divaprotocol/diva-protocol-v1/pull/6
[PR22]: https://github.com/divaprotocol/diva-protocol-v1/pull/22
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR79]: https://github.com/divaprotocol/diva-protocol-v1/pull/79
[PR79]: https://github.com/divaprotocol/diva-protocol-v1/pull/79
[PR79]: https://github.com/divaprotocol/diva-protocol-v1/pull/79
[PR6]: https://github.com/divaprotocol/diva-protocol-v1/pull/6
[PR6]: https://github.com/divaprotocol/diva-protocol-v1/pull/6
[PR31]: https://github.com/divaprotocol/diva-protocol-v1/pull/31
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR79]: https://github.com/divaprotocol/diva-protocol-v1/pull/79
[PR54]: https://github.com/divaprotocol/diva-protocol-v1/pull/54
[PR6]: https://github.com/divaprotocol/diva-protocol-v1/pull/6
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR46]: https://github.com/divaprotocol/diva-protocol-v1/pull/46
[PR18]: https://github.com/divaprotocol/diva-protocol-v1/pull/18
[PR35]: https://github.com/divaprotocol/diva-protocol-v1/pull/35
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR32]: https://github.com/divaprotocol/diva-protocol-v1/pull/32
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR52]: https://github.com/divaprotocol/diva-protocol-v1/pull/52
[PR52]: https://github.com/divaprotocol/diva-protocol-v1/pull/52
[PR52]: https://github.com/divaprotocol/diva-protocol-v1/pull/52
[PR52]: https://github.com/divaprotocol/diva-protocol-v1/pull/52
[PR52]: https://github.com/divaprotocol/diva-protocol-v1/pull/52
[PR52]: https://github.com/divaprotocol/diva-protocol-v1/pull/52
[PR52]: https://github.com/divaprotocol/diva-protocol-v1/pull/52
[PR52]: https://github.com/divaprotocol/diva-protocol-v1/pull/52
[PR52]: https://github.com/divaprotocol/diva-protocol-v1/pull/52
[PR52]: https://github.com/divaprotocol/diva-protocol-v1/pull/52
[PR52]: https://github.com/divaprotocol/diva-protocol-v1/pull/52
[PR44]: https://github.com/divaprotocol/diva-protocol-v1/pull/44
[PR42]: https://github.com/divaprotocol/diva-protocol-v1/pull/42
[PR21]: https://github.com/divaprotocol/diva-protocol-v1/pull/21
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR6]: https://github.com/divaprotocol/diva-protocol-v1/pull/6
[PR37]: https://github.com/divaprotocol/diva-protocol-v1/pull/37
[PR38]: https://github.com/divaprotocol/diva-protocol-v1/pull/38
[PR39]: https://github.com/divaprotocol/diva-protocol-v1/pull/39
[PR40]: https://github.com/divaprotocol/diva-protocol-v1/pull/40
[PR50]: https://github.com/divaprotocol/diva-protocol-v1/pull/50
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR18]: https://github.com/divaprotocol/diva-protocol-v1/pull/18
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR13]: https://github.com/divaprotocol/diva-protocol-v1/pull/13
[PR79]: https://github.com/divaprotocol/oracles/pull/79
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR9]: https://github.com/divaprotocol/diva-protocol-v1/pull/9
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR13]: https://github.com/divaprotocol/diva-protocol-v1/pull/13
[PR82]: https://github.com/divaprotocol/diva-protocol-v1/pull/82
[PR6]: https://github.com/divaprotocol/diva-protocol-v1/pull/6
[PR]: https://github.com/divaprotocol/diva-protocol-v1/pull/
[PR15]: https://github.com/divaprotocol/diva-protocol-v1/pull/15
[PR84]: https://github.com/divaprotocol/diva-protocol-v1/pull/84
[PR85]: https://github.com/divaprotocol/diva-protocol-v1/pull/85



[H-01-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-h-01-wrong-implementation-of-evmcall-in-divaownershipsecondary
[H-02-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-h-02-funds-could-be-stuck-in-divadevelopmentfund
[M-01-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-m-01-wrong-protocol-fee-recipient-when-withdrawing-liquidity
[M-02-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-m-02-previousfallbackdataprovider-wont-have-incentive-to-provide-accurate-value
[M-03-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-m-03-fee-on-transfer-tokens-used-as-collateral-will-make-a-pool-undercollateralized
[M-04-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-m-04-dos-in-_calcpayoffs-function-when-calculating-big-numbers
[L-01-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-l-10-neither-the-long-nor-the-short-token-can-be-conditionally-burned
[L-02-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-l-11-trapped-eth-in-the-diamond-contract
[L-03-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-l-01-update-openzeppelin-npm-dependencies-in-packagejson
[L-04-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-l-02-missing-boundries-for-_maxdivarewardusd-in-divaoracletellor
[L-05-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-l-03-fee-on-transfer-tokens-will-get-stuck-in-development-fund
[L-06-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-l-04-wrong-implementation-of-eip-2535-in-libdiamond-library
[L-07-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-l-05-missing-important-data-in-events
[L-08-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-l-06-dont-allow-setting-owner-to-address0-in-divaownershipsecondary
[L-09-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-l-07-add-a-minimum-deposit-amount-in-divadevelopmentfund
[L-10-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-l-08-missing-possibility-of-removing-deposits-that-are-fully-paid-in-divadevelopmentfund
[L-11-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-l-09-diamondcutfacet-should-close-the-diamond-after-getting-called
[I-01-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-i-01-missing-validation-on-deployment-of-divaoracletellor
[I-02-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-i-02-pragma-version
[I-03-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-i-03-use-specific-imports-instead-of-just-a-global-import-in-divaoracletellor
[I-04-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-i-04-useless-require-statement-at-_diamondcut-function
[I-05-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-i-05-missing-function-to-query-for-_permissionedpositiontokenimplementation-in-positiontokenfactory
[I-06-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-i-06-add-missing-variable-checks-in-constructor
[I-07-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-i-07-consider-resetting-values-after-a-new-owner-has-claimed-the-ownership-in-divaownershipmain
[I-08-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-i-08-missing-natspec-inheritdoc-in-implementations
[I-09-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-i-09-change-immutable-to-constant-if-a-fixed-value-is-used
[I-10-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-i-10-missing-natspec-in-diva-contracts-interfaces
[I-11-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-i-11-misleading-typo-in-comment

[H-03-T3]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam5.md#-h-01-round-down-calculation-is-used-to-calculate-the-_collateralamountremovednetmaker-which-can-be-abused-by-taker-to-take-all-the-removed-liquidity-from-maker
[H-04-T3]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam5.md#-h-02-_createcontingentpoollib-is-suspicious-of-the-reorg-attack
[M-01-T3]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam5.md#-m-02-incorrect-treasury-is-used-for-fee-allocation-when-removing-liquidity
[M-03-T3]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam5.md#-m-01-lack-of-support-for-fee-on-transfer-tokens
[L-01-T3]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam5.md#-l-03-the-position-token-longshort-token-cant-be-minted-for-the-address0
[L-12-T3]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam5.md#-l-04-transferring-a-zero-value-amount-may-revert-when-creating-a-pool
[L-13-T3]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam5.md#-l-01-redundant-requirement-when-requiring-the-collateralamount--1e6-when-creating-a-pool
[L-14-T3]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam5.md#-l-02-redundant-check-blocktimestamp--submissionendtime

[M-01-T4]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam6.md#-m-02-receiver-of-treasury-fee-can-be-wrong-in-certain-condition-if-remove-liquidity-function-is-executed
[M-02-T4]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam6.md#-m-01-receiver-of-settlement-fee-can-be-wrong-in-certain-condition-if-fallback-data-provider-executing-setfinalreferencevalue
[L-15-T4]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam6.md#-l-01-unpausereturncollateral-will-extend-pause-delay-time-even-when-it-already-unpaused
[L-16-T4]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam6.md#-l-02-griefer-can-challenge-final-reference-value-and-prolonged-the-settlement-process

[M-05-T5]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam7.md#-m-01-_getactualtakerfillableamount-will-return-_takercollateralamount---_offerinfotakerfilledamount-even-if-the-order-is-not-fillable
[L-02-T5]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam7.md#-l-03-user-will-lose-ether-which-was-sent-to-the-diamond-contract
[L-17-T5]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam7.md#-l-02-centralization-risk-in-token-supply-can-result-in-users-being-unable-to-remove-diva-owner
[L-18-T5]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam7.md#-l-04--voting-for-a-different-owner-can-become-impossible
[L-19-T5]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam7.md#-l-01-diamond-facet-upgrade
[I-12-T5]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam7.md#-i-01-violation-of-checks-effects-interation-pattern
[G-01-T5]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam7.md#g-1-for-operations-that-will-not-overflow-you-could-use-unchecked
[G-02-T5]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam7.md#g-2-dont-initialize-variables-with-default-value
[G-03-T5]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam7.md#g-3-functions-guaranteed-to-revert-when-called-by-normal-users-can-be-marked-payable
[G-04-T5]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam7.md#g-4-i-costs-less-gas-than-i-especially-when-its-used-in-for-loops---ii---too
[G-05-T5]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam7.md#g-5-use--0-instead-of--0-for-unsigned-integer-comparison
[G-06-T5]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam7.md#g-6-internal-functions-only-called-once-can-be-inlined
[G-07-T5]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam7.md#g-7-using-getter-functions-consume-more-gas
[G-08-T5]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam7.md#g-8----costs-more-gas
[G-09-T5]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam7.md#g-9-use-custom-error-strings
[G-10-T5]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam7.md#g-10-ps-variable-can-be-inlined
[G-11-T5]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam7.md#-g-11-use-while-loop-instead-of-for-loop
[I-14-T5]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam7.md#g-1-for-operations-that-will-not-overflow-you-could-use-unchecked