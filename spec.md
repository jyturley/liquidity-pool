# SpaceCoin Liquidity Pool Spec

Previously, you wrote an ERC-20 contract for SPC and an ICO contract to get the token off the ground.

Now, it's time to finish bootstrapping your token's ecosystem by writing a liquidity pool contract so your users can buy and sell SPC at will.

## ERC20 & ICO Updates

- ✅ Add a withdraw function to your ICO contract that allows you to move the invested funds to your liquidity contract. How exactly you do this is up to you; just make sure it's possible to deposit an even worth of each asset.

## Liquidity Pool Contract

Implement a liquidity pool for ETH-SPC. You will need to:

- Write an ERC-20 contract for your pool's LP tokens
- Write a liquidity pool contract that:
  - Mints LP tokens for liquidity deposits (ETH + SPC tokens)
  - Burns LP tokens to return liquidity to holder
  - Accepts trades with a 1% fee

## Space Router

Transferring tokens to an LP pool requires two transactions:

1. Trader grants allowance on the Router contract for Y tokens.
1. Trader executes a function on the Router which pulls the funds from the Trader and transfers them to the LP Pool.

Write a router contract to handles these transactions. Be sure it can:

- Add / remove liquidity
- Swap tokens, rejecting if the slippage is above a given amount

## Contract Imports

- For this project, the only Solidity dependency you may import is OpenZeppelin's ERC20.sol contract.

## Front End

- Extend the given frontend code (coming soon) to enable:

1. LP Management
   - Allow users to deposit ETH and SPC for LP tokens (and vice-versa)
2. Trading
   - Allow users to trade ETH for SPC (and vice-versa)
   - Configure max slippage
   - Show the estimated trade value they will be receiving
