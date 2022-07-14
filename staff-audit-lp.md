https://github.com/0xMacro/student.jyturley/tree/c0a482d2d1ae0b85dfffccceb8fdcaac6440d467/lp

Audited By: Alex.S



# General Comments

This is a great solution to the problem!

# Design Exercise

This is an intersting answer! The idea of having a liquidity provider lottery is not something I have come across before. An alternative would be to have a separate reward token that is accrued over time in proportion to the liquidity provided, so there is nothing to be gained by repeatedly adding and removing liquidity.

# Issues

**[Technical Mistake]** Router’s `addLiquidity` function does not account for feeOnTransfer tokens such as SPC

You calculate optimal `inSPC` and `inETH` as per the current ratio of the pool. You transfer `inSPC` and `inETH` and call `mint` Now, if tax is on for the space token the amount received on the pool contract is less than what you had calculated. The pool contract will calculate LP shares to be minted based on this lesser amount and as we take minimum you get shares as per this decreased amount, losing the equivalent portion of ETH transferred

**[Technical Mistake]** Directly comparing ETH with LP token amounts

In SpaceRouter.sol at line 66 you compare the `amountMinted` value returned by `pool.mint`, which is a quantity of LP token, with `inETH` which is a quantity of ETH. Their relative size is dependant on the LP price and not meaningful, as a result the user may not get a refund at line 67 when they are entitled to one.


**[Q-1]** Poor UX on swap

Requiring users to call different functions as the state of the system changes (in this case as space coin transfer tax is enabled or disabled) places a burden on them. Something which works for them today may not work tomorrow. You could always compare the amount actually received, even if the transfer tax is not active, which would be better than forcing the user to check the tax status before swappping.


**[Q-1]** Unnecessary arithmetic

In SpacePool.sol `swap` at line 105 you subtract `spcOut` from `_reserveSPC`, but given the `require` at line 90 `spcOut` must be zero at this point. Similarly `ethOut` must be zero at line 110. Also, at lines 118 and 119 you multiply by `FEE_PERCENT`, but this is a constant with value 1.


# Nitpicks

Unnecessary variable (and constant) - in SpaceRouter.sol `_calculateReturnWithSwapFee` the variable `hundredPercent` is not needed.  On line 270 `(hundredPercent - SWAP_FEE_PERCENT)` could be replaced with the literal 99 and on line 272 `hundredPercent` could just be 100.

# Score

| Reason | Score |
|-|-|
| Late                       | - |
| Unfinished features        | - |
| Extra features             | - |
| Vulnerability              | - |
| Unanswered design exercise | - |
| Insufficient tests         | - |
| Technical mistake          | 2 |

Total: 2

Great job!
