## **Index**

-   [**Index**](#index)
-   [**LP Audit Report**](#lp-audit-report)
-   [**Static Analysis**](#static-analysis)
-   [**[Q-1] Variable NAME and SYMBOL can be passed directly to ERC20 during construction**](#q-1-variable-name-and-symbol-can-be-passed-directly-to-ERC20-during-construction)
-   [**Summary**](#summary)

## **LP Audit Report**

The suite of contracts aims to provide the functionality to raise funds for a token and having a decentralized market to trade. Allowing users to addLiquidity, removeLiquidity and swap.

This micro audit was conducted by Harpalsinh Jadeja student of block 6 of the Macro Solidity bootcamp.

## **Static Analysis**

The execution of static analysis _slither_ identified 18 potential issues within the 4 contracts.

```
    Pragma version^0.8.9 (contracts/SpaceLibrary.sol#2) necessitates a version too recent to be trusted.
    Pragma version^0.8.9 (contracts/SpacePool.sol#2) necessitates a version too recent to be trusted.
    Pragma version^0.8.9 (contracts/SpaceRouter.sol#2) necessitates a version too recent to be trusted.
```

-   Consider deploying with 0.6.12/0.7.6/0.8.7

Rest all are related to updating Reserves after External call and Reentrancy which can be ignored since you have nonReentrant in place.

## [Q-1]: Variable NAME and SYMBOL can be passed directly to ERC20 during construction

On line 11, 14: SpacePool.sol

```
    string public constant NAME = "SpacePool Liquidity Token";
    string public constant SYMBOL = "SPL";

```

These variables are already present in the ERC20 version along with getter.
Consider passing the NAME and SYMBOL directly into ERC20 constructor.

## Summary

Great Job! There are no vulnerabilities that I could find. 👏
