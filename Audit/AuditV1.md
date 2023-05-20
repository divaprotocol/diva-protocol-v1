# DIVA Protocol V1 Audit

## Overview

The audit was performed by 6 different teams:
* [ComposableSecurity](https://composable-security.com/) (Team 1)
* [SolidityLabs](https://github.com/GuardianAudits/SolidityLabAudits/tree/main/DIVA) (Team 2-5)
* [HiAudit](https://hiaudit.io/consulting) (Team 6)

The contracts in scope included:
* DIVA Protocol V1
* Tellor adapter
* DIVA Token distribution contract (only audited by ComposableSecurity and HiAudit)

## Summary

TODO: Add summary table of number of Critical, High, Medium, etc. findings.

T1 = Team 1, etc.

### Critical
n/a

### High
| | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|H-01|Wrong implementation of EVMCall in DIVAOwnershipSecondary ||[x][H-01-T2]|||||[Fixed][PR3]| If this error made it to production, the harm would be limited as Tellor reporters could have adopted the new query type. But obviously, it's better to go with the proposed standard. It's a great finding, although no user funds would have been at risk. |
|H-02|Funds could be stuck in DIVADevelopmentFund|x|[x][H-02-T2]|||||[Fixed][PR8]|Great finding! We want to highlight that this issue would have only impacted the protocol owner in a scenario where someone made a donation via the `deposit` function with `_releasePeriodInSeconds = 0`. No user funds would have been at risk.|
|H-03|Round-down calculation is used to calculate the `_collateralAmountRemovedNetMaker` which can be abused by taker to take all the removed liquidity from maker|||[x][H-03-T3]||||[Fixed][PR24]|Great finding! While it wouldn't be economically viable to execute this attack, we agree that it's better to fix these things to avoid any sort of griefing attack. |
|H-04|`_createContingentPoolLib` is suspicious of the reorg attack|||[x][H-04-T3]||||Fixed ([#29][PR29] / [#48][PR48])|Very special finding! While it involved quite a bit of work to change the `poolId` logic, it helped us to make the protocol more robust.|

### Medium
| | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|M-01|Wrong protocol fee recipient when withdrawing liquidity|x|x|x|x||x|[Fixed][PR11]|Good spot! We overlooked it when we introduced the delayed activation logic for governance functions. The impact would have been rather limited. No user funds would have been at risk.|
|M-02|PreviousFallbackDataProvider won't have incentive to provide accurate value|||||||[Fixed]||
|M-03|Fee-on-Transfer tokens used as collateral will make a pool undercollateralized|||||||||
|M-04|DoS in `_calcPayoffs` function when calculating big numbers|||||||||
|M-05|`_getActualTakerFillableAmount` Will Return `_takerCollateralAmount - _offerInfo.takerFilledAmount` even if the order is not fillable|||||||||

### Low
| | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|L-01||||||||||
|L-02||||||||||
|L-03||||||||||
|L-04||||||||||
|L-05||||||||||
|L-06||||||||||

### Informational
| | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|I-01||||||||||
|I-02||||||||||
|I-03||||||||||
|I-04||||||||||
|I-05||||||||||
|I-06||||||||||


### Gas optimization
| | Description        | T1 |T2 | T3 | T4 | T5 | T6 | Status | Team comment|
| :---| :--- |:--- | :--- |:--- |:--- |:--- |:--- |:--- |:--- |
|I-01||||||||||
|I-02||||||||||
|I-03||||||||||
|I-04||||||||||
|I-05||||||||||
|I-06||||||||||





[H-01-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-h-01-wrong-implementation-of-evmcall-in-divaownershipsecondary
[H-02-T2]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam4.md#-h-02-funds-could-be-stuck-in-divadevelopmentfund
[H-03-T3]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam5.md#-h-01-round-down-calculation-is-used-to-calculate-the-_collateralamountremovednetmaker-which-can-be-abused-by-taker-to-take-all-the-removed-liquidity-from-maker
[H-04-T3]: https://github.com/GuardianAudits/SolidityLabAudits/blob/main/DIVA/DivaAuditTeam5.md#-h-02-_createcontingentpoollib-is-suspicious-of-the-reorg-attack
[PR3]: https://github.com/divaprotocol/diva-protocol-v1/pull/3

[PR8]: https://github.com/divaprotocol/diva-protocol-v1/pull/8
[PR11]: https://github.com/divaprotocol/diva-protocol-v1/pull/11
[PR24]: https://github.com/divaprotocol/diva-protocol-v1/pull/24

[PR29]: https://github.com/divaprotocol/diva-protocol-v1/pull/29
[PR48]: https://github.com/divaprotocol/diva-protocol-v1/pull/48