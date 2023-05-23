# DIVA Protocol V1 Audit

## Overview

The audit was performed by six independent teams:
* Team 1: [ComposableSecurity](https://composable-security.com/) [🔗][ComposableSecurity]
* Team 2: [gogo](https://twitter.com/gogotheauditor), [kodyvim](https://twitter.com/kodyvim_), [Santipu_](https://twitter.com/MrCaesarDev), [zaskoh](https://twitter.com/0xzaskoh) (SolidityLabs) [🔗](https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md)
* Team 3: [TrungOre](https://twitter.com/Trungore), [Duc](https://twitter.com/duc_hph) (SolidityLabs) [🔗](https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam5.md)
* Team 4: said017, WangChao, kodak_rome, Emmalien  (SolidityLabs) [🔗](https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam6.md)
* Team 5: [devScrooge (JMariadlcs)](https://twitter.com/devScrooge), Cryptor, Saksham (SolidityLabs) [🔗](https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam7.md)
* Team 6: [HiAudit](https://hiaudit.io/consulting) [🔗][HiAudit]

The contracts in scope included:
* [DIVA Protocol V1](https://github.com/divaprotocol/diva-protocol-v1/tree/main/contracts)
* [DIVA Development Fund](https://github.com/divaprotocol/diva-protocol-v1/blob/main/contracts/DIVADevelopmentFund.sol)
* [Tellor oracle adapter](https://github.com/divaprotocol/oracles/blob/main/contracts/DIVAOracleTellor.sol)
* [DIVA Token distribution contract](https://github.com/divaprotocol/diva-token-contract/blob/main/src/ClaimDIVALinearVesting.sol)

>**Note:** The DIVA token distribution contract was not in scope for the SolidityLabs teams. It was audited by ComposableSecurity, HiAudit and an independent [solo auditor](https://github.com/ahmedovv123/audits/blob/main/audits/DivaVesting(QA).md).

>**⚠️Warning:** HiAudit claims to be the #1 auditing firm in Japan but delivered a very disappointing report considering the amount of money we paid for their services. The team charged a flat fee rather than based on performance as advertised on ther [website](https://hiaudit.io/consulting). The team appeared to lack sufficient experience and expertise in their field. Regrettably, we made a mistake in hiring them, and we strongly advise any other team against using their services. Surprisingly, they felt comfortable sharing their report publicly. Take your popcorn 🍿 and search for "HiAudit".

## Summary

The table below provides an overview of the findings grouped by contract. The numbers in parantheses indicate the resolved issues. The remaining findings were either acknowledged or declined. For details, please refer to the respective sections.

|  | Critical | High | Medium | Low | Informational |Gas optimization |
|:---------------------|-------:|---------:|----------:|--------------:|--------------------:|--------------------:|
| [DIVA Protocol](#diva-protocol)| - | 3 (3) | 6 (5) | 19 (11) | 20 (9) | 10 (5) |
| [DIVA Development Fund](#diva-development-fund) | - | 1 (1) | - | 6 (2) | 5 (3) | 1 (1) |
| [Tellor oracle adapter](#tellor-oracle-adapter) | - | - | - | 1 (1) | 6 (5) | - |
| [DIVA Token distribution contract](#diva-token-distribution-contract) | - | - | - | - | 3 (2) | - |

# DIVA Protocol

## High
|ID | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|H-01|Wrong implementation of `EVMCall` in `DIVAOwnershipSecondary`||[🔗][H-01-T2]|||||[Resolved][PR3]|Great unique finding! We'd like to highlight that if this error made it to production, the harm would be limited as Tellor reporters could have adopted the new query type. No user funds would have been at risk. Nonetheless, adhering to the proposed standard is the preferred approach.|
|H-02|Round-down calculation is used to calculate the `_collateralAmountRemovedNetMaker` which can be abused by taker to take all the removed liquidity from maker|||[🔗][H-03-T3]||||[Resolved][PR24]|Great unique finding! While it wouldn't be economically viable to execute this attack, we agree to fix it to avoid any sort of griefing attack.|
|H-03|`_createContingentPoolLib` is suspicious of the reorg attack|||[🔗][H-04-T3]||||Resolved ([#29][PR29] / [#48][PR48])|Very special and unique finding which helped us to better protect protocol users in the event of chain reorgs.|

## Medium
|ID | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|M-01|Wrong protocol fee recipient when withdrawing liquidity|[🔗][ComposableSecurity] (5.3)|[🔗][M-01-T2]|[🔗][M-01-T3]|[🔗][M-01-T4]||[🔗][HiAudit] (9)|[Resolved][PR11]|Good spot! We overlooked it when we updated the governance logic to introduce an activation delay. The impact would have been rather limited as the new treasury account would have received protocol fees two days earlier than expected. The purpose of the two-day delay for treasury updates was primarily to reduce the incentives for reporting incorrect owners on secondary chains. No user funds would have been at risk.|
|M-02|PreviousFallbackDataProvider won't have incentive to provide accurate value|[🔗][ComposableSecurity] (5.2)|[🔗][M-02-T2]||[🔗][M-02-T4]||[🔗][HiAudit] (4)|[Resolved][PR12]|Same comment as for M-01, we overlooked it when we updated the governance logic. The impact would have been rather limited. We don't anticipate high TVL pools with a reputable data provider reaching a stage where the fallback data provider has to step in. In the unlikely event that such a scenario would have occured, the previous fallback provider could be incentivized through a direct payment to report the outcome. Additionally, it is worth noting that the fallback provider won't change too frequently.|
|M-03|Fee-on-Transfer tokens used as collateral will make a pool undercollateralized||[🔗][M-03-T2]|[🔗][M-03-T3]||||[Resolved][PR27]|We agreed to block all fee-on-transfer tokens.|
|M-04|DoS in `_calcPayoffs` function when calculating big numbers||[🔗][M-04-T2]|||||[Resolved][PR16]|Very special finding that no one else spotted!|
|M-05|`_getActualTakerFillableAmount` will return `_takerCollateralAmount - _offerInfo.takerFilledAmount` even if the order is not fillable|||||[🔗][M-05-T5]||[Resolved][PR31]|Good finding that will help to avoid confusion for a certain class of offers. No user funds would have been at risk though. |
|M-06|Potentially In-Correct calculation of actual taker fillable amount||||||[🔗][HiAudit] (3)|Declined|The HiAudit team failed to provide a more accurate formula than the existing one and refused to remove the issue from the report. |

## Low
|ID | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|L-01|Neither the long nor the short token can be conditionally burned||[🔗][L-01-T2]|[🔗][L-01-T3]||||[Resolved][PR14]||
|L-02|Trapped ETH in the Diamond contract||[🔗][L-02-T2]|||[🔗][L-02-T5]||[Resolved][PR6]||
|L-03|Missing important data in events||[🔗][L-07-T2]|||||[Resolved][PR22]||
|L-04|Don't allow setting owner to `address(0)` in `DIVAOwnershipSecondary`||[🔗][L-08-T2]|||||Acknowledged|If a zero owner address was reported and remained undisputed, it would not result in any harm or negative consequences on secondary chains.|
|L-05|`DiamondCutFacet` should close the Diamond after getting called||[🔗][L-11-T2]|||||Acknowledged|We decided to remove the upgradeability feature via a separate transaction rather than embedding it into the Diamond constructor to keep the code as close as possible to the original standard. In particular, if we ever plan to have an upgradeability feature in future versions of the protocol, we can achieve that without major code changes. Users will be able to verify that contracts are not upgradeable via https://louper.dev/, for instance.|
|L-06|Transferring a zero value amount may revert when creating a pool|||[🔗][L-12-T3]||||Acknowledged|Not addressed as the amount > 0 check would be done within the corresponding ERC20 token.|
|L-07|Redundant requirement when requiring the `collateralAmount > 1e6` when creating a pool|||[🔗][L-13-T3]||||[Resolved][PR46]|Great unique finding which helped us to reduce the gas cost for creating a contingent pool.|
|L-08|`unpauseReturnCollateral()` will extend pause delay time even when it already unpaused||||[🔗][L-15-T4]|||[Resolved][PR35]|Great unique finding which helped us to improve the unpause functionality. |
|L-09|Griefer can challenge final reference value and prolonged the settlement process||||[🔗][L-16-T4]|||Acknowledged|Not addressed as the possibility to confirm a previously submitted value by re-submitting the same value was a conscious design choice to prevent these type of attacks.|
|L-10|Centralization risk in token supply can result in users being unable to remove DIVA owner|||||[🔗][L-17-T5]||Acknowledged|This issue is not a concern because power will eventually concentrate in the hands of those who have the highest belief in the project. Since these parties are likely to also stake for themselves, they will have a vested interest in acting in the best interest of the protocol.|
|L-11|Voting for a different owner can become impossible|||||[🔗][L-18-T5]||[Resolved][PR32]|Great unique finding! The implemented solution to store the timestamp for “each stake” of each user would be an overkill. We have decided to store the staking timestamp at a user-candidate level instead of a user level as done before. This solves the problem if a user is staking for two different candidates. We acknowledge that the timestamp will be overwritten if a user stakes for the same candidate multiple times.|
|L-12|Diamond facet upgrade|||||[🔗][L-19-T5]||Acknowledged|Not relevant as the protocol will be rendered immutable from the start.|
|L-13|Missing interface in IERC165|[🔗][ComposableSecurity] (5.4)||||||[Resolved][PR44]||
|L-14|Unverified position token|[🔗][ComposableSecurity] (5.5)||||||[Resolved][PR42]||
|L-15|Invalid receiver of settlement fee in liquidity removal|[🔗][ComposableSecurity] (5.7)||||||[Resolved][PR21]|Upon reviewing the recommendation, we discovered that our original (conscious) design choice could have led to incorrect settlement fee accounting within the Tellor adapter. To fix this issue, we applied a similar logic to the one used for tips, meaning that any accrued fees are held in a reserve and allocated to the corresponding recipient only after the final value has been confirmed. |
|L-16|Un-Satisfactory check while setting up `permissionedERC721Token`||||||[🔗][HiAudit] (5)|Declined|The `permissionedERC721Token` address cannot be zero inside the `PermissionedPositionToken` contract as it's excluded in an `if` block inside the `PositionTokenFactory` contract. Despite highlighting this to HiAudit, they refused to remove this finding from the report, insisting that it aligns with best practices.|
|L-17|In-sufficient transfer check while allocating fees to `recipient`||||||[🔗][HiAudit] (8)|Declined|Neither the treasury, the data provider nor the fallback provider can be the zero address (excluded inside the corresponding setter functions). Despite highlighting this to HiAudit, they refused to remove this finding from the report, insisting that it aligns with best practices.|
|L-18|Wrong implementation of EIP-2535 in LibDiamond library||[🔗][L-06-T2]|||||[Resolved][PR6]|Resulted from using a slightly outdated version of the Diamond Standard which didn't include these optimizations.|
|L-19|Update openzeppelin NPM dependencies in package.json||[🔗][L-03-T2]|||||[Resolved][PR3]||
|L-20|Un-Satisfactory check while setting up owner||||||[🔗][HiAudit] (1)|Declined|Despite pointing out to the HiAudit team that the owner of the position tokens is always the DIVA smart contract and can never be the zero address, they refused to remove this finding from the report, insisting that it aligns with best practices.|

## Informational
|ID | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|I-01|Missing function to query for `_permissionedPositionTokenImplementation` in `PositionTokenFactory`||[🔗][I-05-T2]|||||[Resolved][PR6]||
|I-02|Consider resetting values after a new Owner has claimed the ownership in `DIVAOwnershipMain`||[🔗][I-07-T2]|||||Declined|Note that any non-winning candidate who has received more votes than the current owner can theoretically submit an ownership claim. That was a conscious design choice to simplify the snapshot logic. Resetting the values would allow a non-winning candidate to submit a claim and with that prevent the actual winner to submit their claim. |
|I-03|Misleading typo in comment||[🔗][I-11-T2]|||||[Resolved][PR6]||
|I-04|Violation Of Checks Effects Interation Pattern|[🔗][ComposableSecurity] (6.2)||||[🔗][I-12-T5]||Acknowledged|We have thoroughly evaluated the current implementation and are confident that it does not introduce any vulnerabilities. It was a conscious decision to prioritize drawing the capital before benefiting the `msg.sender`. Additionally, we have implemented reentrancy guards on all state-modifying functions (except governance related functions) to provide the necessary protection against reentrancy attacks. |
|I-05|Remove `poolId` from PoolStorage|[🔗][ComposableSecurity] (6.1)||||||Resolved|Resolved via H-03.|
|I-06|Improve code clarity|[🔗][ComposableSecurity] (6.3)||||[🔗][I-14-T5]||Resolved ([PR6] / [PR31])|Majority of the suggestions has been implemented.|
|I-07|Use proper error for non-existing pool|[🔗][ComposableSecurity] (6.4)||||||Resolved ([#37][PR37] / [#38][PR38] / [#39][PR39] / [#40][PR40] / [#50][PR50])||
|I-08|Add incentive for the default settlement|[🔗][ComposableSecurity] (6.5)||||||Declined|That was a conscious design choice. Position token holders will have a natural incentive to confirm the value and do not require additional incentives.|
|I-09|Optimize gas consumption by removing redundant checks|[🔗][ComposableSecurity] (6.6)||[🔗][L-14-T3]||||[Resolved][PR18]||
|I-10|Avoid zero value transfers initiated by the protocol|[🔗][ComposableSecurity] (6.7)||||||Acknowledged|We believe that zero value transfers should be excluded on the frontend side rather than within the contract itself. Introducing the proposed check would result in additional gas costs. In particular, as we anticipate that data providers will utilize the `batchClaimFee` function, passing a collateral token with an amount of 0 by accident would cause the entire transaction to revert, leading to significant costs for the data provider.|
|I-11|Consider adding white hat hacks policy|[🔗][ComposableSecurity] (6.9)||||||Acknowledged|We will add a white hat hack policy at a later stage, post mainnet launch.|
|I-12|Consider extending the effect of the `pauseReturnCollateral` function|[🔗][ComposableSecurity] (6.12)||||||Declined|The decision to not implement the ability to pause the creation of derivative contracts was deliberate to prevent the owner from being pressured by a central authority to halt the entire protocol.|
|I-13|Add missing variable checks in constructor||[🔗][I-06-T2]||||[🔗][HiAudit] (1)|[Resolved][PR31]||
|I-14|Explicit Return [ Code Readability ]||||||[🔗][HiAudit] (2)|Acknowledged||
|I-15|Unclear usage when ERC20 blacklisted user removes liquidity||||||[🔗][HiAudit] (6)|Acknowledged|A potential taker that gets blacklisted before filling a remove liquidity offer is equivalent to not having any taker at all. No user is losing any money in such a scenario. The maker can simply wait until expiry to redeem their funds. It doesn't need a taker to return the collateral. HiAudit's recommendation to implement a check to verify if a user is blacklisted is not realistic as any ERC20 token may implement a different function name. |
|I-16|Useless require statement at `_diamondCut` function||[🔗][I-04-T2]|||||[Resolved][PR6]|Resulted from using a slightly outdated version of the Diamond Standard which didn't include these optimizations. |
|I-17|Missing NatSpec @inheritdoc in implementations||[🔗][I-08-T2]|||||Acknowledged|If a function is not documented inside the implementation contract, then it's natural to check whether it's included in the interface. We don't see any value-add of adding the @inheritdoc NatSpec. |
|I-18|Missing NatSpec in diva-contracts Interfaces||[🔗][I-10-T2]|||||[Resolved][PR54]||
|I-19|Consider adding popups for front-end application to warn users|[🔗][ComposableSecurity] (6.11)||||||Acknowledged|This finding is frontend-related and not directly relevant for the smart contract itself.|

# Gas optimization

|ID | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|G-01|For Operations that will not overflow, you could use unchecked|||||[🔗][G-01-T5]||[Resolved][PR52]||
|G-02|Don't initialize variables with default value|||||[🔗][G-02-T5]||[Resolved][PR52]||
|G-03|Functions guaranteed to revert when called by normal users can be marked payable|||||[🔗][G-03-T5]||Acknowledged|For the sake of consistency, we have made the decision to disallow the sending of ETH to the contract in any manner. Accidentally sending ETH to the contract could result in the loss of funds, which may outweigh any potential gas savings, especially, when considering that the mentioned governance functions are not anticipated to be utilized frequently. We acknowledge that our constructor is payable for gas optimization purposes, but this only affects the deployment process.|
|G-04|+i costs less gas than i++, especially when it's used in for-loops (--i/i-- too)|||||[🔗][G-04-T5]||[Resolved][PR52]||
|G-05|Use != 0 instead of > 0 for unsigned integer comparison|||||[🔗][G-05-T5]||[Resolved][PR52]||
|G-06|Internal functions only called once can be inlined|||||[🔗][G-06-T5]||Acknowledged|We have chosen to leave it as is to prioritize code readability.|
|G-07|Using getter functions consume more gas|||||[🔗][G-07-T5]||Acknowledged|We decided to leave it as is to avoid major code changes and the risk of introducing new bugs.|
|G-08|+= Costs More Gas|||||[🔗][G-08-T5]||Declined| We somehow couldn't make the proposed syntax work as Remix flagged it as unsupported syntax.|
|G-09|ps Variable Can Be Inlined|||||[🔗][G-10-T5]||[Resolved][PR52]|Very good one which helped to save some gas and a few lines of code.|
|G-10|Use while loop instead of for loop|||||[🔗][G-11-T5]||Acknowledged|We decided to leave it as is to avoid major code changes and the risk of introducing new bugs.|

## Other

Issues not specifically raised by any of the auditing teams but related to other findings.

|ID| Description        | PR | Team comment|
| :---| :--- |:--- |:--- |
|O-01|Remove outdated comments regarding upgradeability risk and owner right restrictions in Documentation|[PR6]||


# DIVA Development Fund

## High
|ID | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|H-01|Funds could be stuck in `DIVADevelopmentFund`|[🔗][ComposableSecurity] (5.1)|[🔗][H-02-T2]|||||[Resolved][PR8]||

## Low
|ID | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|L-01|Add a minimum deposit amount in `DIVADevelopmentFund`||[🔗][L-09-T2]|||||Declined|Not addressed as someone could create a worthless token to circumvent such restriction. |
|L-02|Missing possibility of removing deposits that are fully paid in `DIVADevelopmentFund`||[🔗][L-10-T2]|||||Declined|Not addressed as deleting array items would change the indices of deposits which is not desired. Also, the full array is never used, so we don't see any immediate benefit of deleting the items.|
|L-04|Missing important data in events||[🔗][L-07-T2]|||||[Resolved][PR22]||
|L-05|Fee-on-transfer tokens will get stuck in Development Fund|[🔗][ComposableSecurity] (5.6)|[🔗][L-05-T2]|||||[Resolved][PR27]||
|L-06|Missing validations while adding new deposit to address ||||||[🔗][HiAudit] (7)|Declined|Despite pointing out to the HiAudit team that the zero address does not implement the `safeTransferFrom` function, they refused to remove this finding from the report, insisting that it aligns with best practices.|

## Informational
|ID | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|I-01|Add missing variable checks in constructor||[🔗][I-06-T2]|||||[Resolved][PR31]||
|I-02|Improve code clarity|[🔗][ComposableSecurity] (6.3)||||||Resolved ([#6][PR6] / [#31][PR31])|Majority of the suggestions has been implemented.|
|I-03|Remove `payable` mutability from `withdraw` function|[🔗][ComposableSecurity] (6.10)||||||Acknowledged|We decided to leave it as is as the owner has the possibility to withdraw any directly deposited ETH.|
|I-04|Missing NatSpec @inheritdoc in implementations||[🔗][I-08-T2]|||||Acknowledged|If a function is not documented inside the implementation contract, then it's natural to check whether it's included in the interface. We don't see any value-add of adding the @inheritdoc NatSpec. |
|I-05|Missing NatSpec in diva-contracts Interfaces||[🔗][I-10-T2]|||||[Resolved][PR54]||

# Gas optimization

|ID | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|G-01|Use custom error strings|||||[🔗][G-09-T5]||[Resolved][PR52]||

# Tellor oracle adapter

## Low
|ID | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|L-01|Missing boundries for `_maxDIVARewardUSD` in `DIVAOracleTellor`||[🔗][L-04-T2]|||||Acknowledged|As the purchasing power of USD may change over time, we agreed to not implement any boundaries.|
|L-02|Update openzeppelin NPM dependencies in package.json||[🔗][L-03-T2]|||||[Resolved][PR79-TA]||

## Informational
|ID | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|I-01|Missing validation on deployment of DIVAOracleTellor||[🔗][I-01-T2]|||||[Resolved][PR79-TA]||
|I-02|Use specific imports instead of just a global import in DIVAOracleTellor||[🔗][I-03-T2]|||||[Resolved][PR79-TA]||
|I-03|Change immutable to constant if a fixed value is used||[🔗][I-09-T2]|||||[Resolved][PR79-TA]||
|I-04|Add missing variable checks in constructor||[🔗][I-06-T2]|||||[Resolved][PR79-TA]||
|I-05|Pragma version|[🔗][ComposableSecurity] (6.14)|[🔗][I-02-T2]|||||[Resolved][PR79-TA]|Decided to use Solidity version 0.8.19 for all contracts.|
|I-06|Missing NatSpec @inheritdoc in implementations||[🔗][I-08-T2]|||||Acknowledged|If a function is not documented inside the implementation contract, then it's natural to check whether it's included in the interface. We don't see any value-add in adding the @inheritdoc NatSpec. |

## Other

Issues not specifically raised by any of the auditing teams but related to other findings.

|| Description | PR | Team comment|
| :---| :--- |:--- |:--- |
|O-01|Remove support for fee-on-transfer tokens in `addTip` function|[#82][PR82-TA]|Related to finding M-03 finding in [DIVA Protocol](#diva-protocol).|
|O-02|Update `poolId` type|[#84][PR84-TA]|Necessary adjustment resulting from the new poolId logic implemented to protect against reorg attacks (see H-03 in [DIVA Protocol](#diva-protocol)).|
|O-03|Minor gas optimizations|[#85][PR85-TA]|Related to the gas optimizations proposed for [DIVA Protocol](#diva-protocol).|

# DIVA Token distribution contract

## Informational
|ID | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|I-01|Detect duplicates in claimers' addresses|[🔗][ComposableSecurity] (6.8)||||||[Resolved][PR9-DC]||
|I-02|Protect withdrawing all tokens before setting up trigger|[🔗][ComposableSecurity] (6.13)||||||Acknowledged|Not addressed as this may be useful in case something goes wrong at initialization. |
|I-03|Pragma version|[🔗][ComposableSecurity] (6.14)||||||[Resolved][PR13-DC]||

## Other

Issues not specifically raised by any of the auditing teams but related to other findings.

|ID| Description        | PR | Team comment|
| :---| :--- |:--- |:--- |
|O-01|Remove pause/unpause functionality from ClaimDIVALinearVesting contract|[#13][PR13-DC]|We decided to remove the possibility to pause the contract to mitigate the risk of users having their tokens locked. Somewhat related to the centralization risk highlighted in [DIVA Protocol](#diva-protocol) (L-10).|
|O-02|Use custom errors instead of require to save users gas|[#15][PR15-DC]|This issue is related to the gas optimization proposed for [DIVA Development Fund](#diva-development-fund).|


<!-- DIVA Protocol and DIVA Development Fund -->
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
[PR27]: https://github.com/divaprotocol/diva-protocol-v1/pull/27
[PR6]: https://github.com/divaprotocol/diva-protocol-v1/pull/6
[PR22]: https://github.com/divaprotocol/diva-protocol-v1/pull/22
[PR6]: https://github.com/divaprotocol/diva-protocol-v1/pull/6
[PR6]: https://github.com/divaprotocol/diva-protocol-v1/pull/6
[PR31]: https://github.com/divaprotocol/diva-protocol-v1/pull/31
[PR54]: https://github.com/divaprotocol/diva-protocol-v1/pull/54
[PR6]: https://github.com/divaprotocol/diva-protocol-v1/pull/6
[PR46]: https://github.com/divaprotocol/diva-protocol-v1/pull/46
[PR18]: https://github.com/divaprotocol/diva-protocol-v1/pull/18
[PR35]: https://github.com/divaprotocol/diva-protocol-v1/pull/35
[PR32]: https://github.com/divaprotocol/diva-protocol-v1/pull/32
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
[PR6]: https://github.com/divaprotocol/diva-protocol-v1/pull/6
[PR37]: https://github.com/divaprotocol/diva-protocol-v1/pull/37
[PR38]: https://github.com/divaprotocol/diva-protocol-v1/pull/38
[PR39]: https://github.com/divaprotocol/diva-protocol-v1/pull/39
[PR40]: https://github.com/divaprotocol/diva-protocol-v1/pull/40
[PR50]: https://github.com/divaprotocol/diva-protocol-v1/pull/50
[PR18]: https://github.com/divaprotocol/diva-protocol-v1/pull/18
[PR13]: https://github.com/divaprotocol/diva-protocol-v1/pull/13
[PR6]: https://github.com/divaprotocol/diva-protocol-v1/pull/6
[PR15]: https://github.com/divaprotocol/diva-protocol-v1/pull/15



<!-- Tellor adapter -->
[PR79-TA]: https://github.com/divaprotocol/oracles/pull/79
[PR82-TA]: https://github.com/divaprotocol/oracles/pull/82
[PR84-TA]: https://github.com/divaprotocol/oracles/pull/84
[PR85-TA]: https://github.com/divaprotocol/oracles/pull/85

<!-- DIVA Token distribution contract -->
[PR9-DC]: https://github.com/divaprotocol/diva-token-contract/pull/9
[PR13-DC]: https://github.com/divaprotocol/diva-token-contract/pull/13
[PR15-DC]: https://github.com/divaprotocol/diva-token-contract/pull/15

<!-- Team 2 -->
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

<!-- Team 3 -->
[H-03-T3]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam5.md#-h-01-round-down-calculation-is-used-to-calculate-the-_collateralamountremovednetmaker-which-can-be-abused-by-taker-to-take-all-the-removed-liquidity-from-maker
[H-04-T3]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam5.md#-h-02-_createcontingentpoollib-is-suspicious-of-the-reorg-attack
[M-01-T3]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam5.md#-m-02-incorrect-treasury-is-used-for-fee-allocation-when-removing-liquidity
[M-03-T3]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam5.md#-m-01-lack-of-support-for-fee-on-transfer-tokens
[L-01-T3]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam5.md#-l-03-the-position-token-longshort-token-cant-be-minted-for-the-address0
[L-12-T3]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam5.md#-l-04-transferring-a-zero-value-amount-may-revert-when-creating-a-pool
[L-13-T3]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam5.md#-l-01-redundant-requirement-when-requiring-the-collateralamount--1e6-when-creating-a-pool
[L-14-T3]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam5.md#-l-02-redundant-check-blocktimestamp--submissionendtime

<!-- Team 4 -->
[M-01-T4]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam6.md#-m-02-receiver-of-treasury-fee-can-be-wrong-in-certain-condition-if-remove-liquidity-function-is-executed
[M-02-T4]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam6.md#-m-01-receiver-of-settlement-fee-can-be-wrong-in-certain-condition-if-fallback-data-provider-executing-setfinalreferencevalue
[L-15-T4]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam6.md#-l-01-unpausereturncollateral-will-extend-pause-delay-time-even-when-it-already-unpaused
[L-16-T4]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam6.md#-l-02-griefer-can-challenge-final-reference-value-and-prolonged-the-settlement-process

<!-- Team 5 -->
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

[ComposableSecurity]: https://drive.google.com/file/d/1ScOni4xLaB2XPv7_7mYgcCLwrhGA5q3t/view?usp=sharing
[HiAudit]: https://drive.google.com/file/d/1_4ulGrrKutDWP-1nCdLuaHttXoiNVwHq/view?usp=sharing