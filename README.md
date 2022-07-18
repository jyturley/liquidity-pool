# SpaceCoin Liquidity Pool

A Uniswap inspired constant-product formula liquidity pool that handles direct ETH and [SpaceCoin](https://github.com/jyturley/space-coin) swaps, slippage protection, and deposit/withdrawing of liquidity through minting of its own ERC20 lp tokens. [Audited](./staff-audit-lp.md) with zero vulnerabilities by `0xMacro` staff.

Contracts have been deployed and verified on the Goerli Testnet:

- [SpacePool](https://goerli.etherscan.io/address/0xbF30d10B5C1Bb880f59804Ef2DF48b8d0E9104Cd#code)
- [SpaceRouter](https://goerli.etherscan.io/address/0xDd1D7E0d2602FF4feEAF052C67f21631D402BcfB#code)
- [SpaceCoin](https://goerli.etherscan.io/address/0x9D3e43204703a0598C2bc80d77072d083c5e7BC6#code)
- [SpaceCoin ICO](https://goerli.etherscan.io/address/0xa51131B9BF3ece64155B086118308F995ca37164#code)

```
SpaceCoinICO deployed to: 0xa51131B9BF3ece64155B086118308F995ca37164
SpaceCoin deployed to: 0x9D3e43204703a0598C2bc80d77072d083c5e7BC6
SpacePool deployed to: 0xbF30d10B5C1Bb880f59804Ef2DF48b8d0E9104Cd
SpaceRouter deployed to: 0xDd1D7E0d2602FF4feEAF052C67f21631D402BcfB
```

## Notes

This repo contains five solidity files.

1. `SpaceCoin.sol` which defines the ERC20 token that will be traded along with ETH in the liquidity pool. Symbol is `SPC`.
1. `SpaceCoinICO.sol`which defines the logic for the ICO of space coin, implemented as part of a OxMacro project a few weeks back.
1. `SpaceLibrary.sol` which defines a helper library that is used throughout the next two files. It contains safe transfer methods as well as `min()` and `sqrt()`.
1. `SpacePool.sol` which defines the core liquidity pool contract for the ETH-SPC trading pair. This inherits from OZ's ERC20 library which allows the pool to mint and burn tokens for LP as necessary.
1. `SpaceRouter.sol` which defines the helper contract that is meant to work in tandem with SpacePool. It contains additional safety checks to ensure users don't provide suboptimal parameters.

### Intentional Design Choices and Tradeoffs

#### SpaceCoinICO

- The ICO is set up so that all of the raised ETH will automatically collect to the treasury address. So when the SpaceCoin organization decides to begin the liquidity pool, it can simply use the treasury EOA to manually add liquidity using `SpaceRouter.addLiquidity()`. I double checked that this is okay with staff at office hours.

#### SpacePool

- Unlike UniswapV2's `swap()` function, `SpacePool.sol`'s swap function will not allow for bidirectional swaps. SpacePool has additional checks so that it can only trade ETH->SPC or separately from SPC->ETH in a single transaction. This decision comes at some efficiency tradeoffs, but I think it is much easier to understand.
- On initial deposit, uniswap will mint 1000 tokens (defined by `MIN_LIQUDITY`) to `address(0)`. SpaceCoin does the same thing but to a different inaccessible wallet defined as `BURN_ADDRESS`.
- I implemented event `Sync` that is emitted on every `_updateReserves()` function. I think it is important aspect of the contract since an update on the internal x and y values affects the behavior of every other function in the pool.

#### SpaceRouter

- I've opted to make the storage address `SpacePool pool` and `SpaceCoin spaceCoin` both `immutable`. This comes at the cost of flexibility, but I think the trust that users will indeed be getting interacting with the correct contracts and that it will not be changed in the future. Additionally, if anything were to change, SpaceRouter will probably be upgraded before SpacePool does.

#### SpaceLibrary

- I opted to define the common functions used several times throughout different contracts in this single library for clarity and modularity. Most are variants of `transfer()`s with addtional safety checks.
- I do not claim credit for the `sqrt()` which was copied over from Uniswap V2 Core's `Math.sol`.

### Front End

- The front end has the ability to do all what is specified in the spec:
  1. Add and remove liquidity to the SpaceCoin ETH liquidity pool.
  1. Allow users to trade ETH for SPC and vice versa
  1. Configure the slippage through asking the user to specify the minimum amount of token they would like to receive after the swap. (This calculation is the final amount. After fees, after tax).
  1. See the estimated trade value.
- Many of the interactions require a new block to be mined to automatically update the displayed numbers. You can also refresh the page to induce this change. This is not a design choice, it is simply because I'm bad at front end. Sorry in advance lol.
- The estimated trade value is shown right above the `Trade` button. This may not fully reflect the actual price since it is a crude calculation of current price of spc \* input number. Since the pool uses a constant product formula, there will be no linear correlation between input and outputs.

### Running the front end

```bash
cd frontend
npm install
npm start
```

On my system, the server instance is at http://localhost:5000

### Setup using the Hardhat Localhost Network

I believe testing the contracts with a frontend will be much easier if using the hardhat localhost network. I have a script in `scripts/deploy-hardhat.ts` that automatically fully funds an ICO and approves certain addresses so that users can interact with it. This requires changing the hardcoded contract addresses in `frontend/index.js`, however.

1. On one terminal, run the hardhat node instance.

```bash
npx hardhat node
```

2. On another, run the deploy script specifically for hardhat

```bash
npx hardhat run scripts/depoloy-hardhat.ts --network localhost
```

Which will deploy all contracts, and then fund the ICO, and make some initial approvals.

3. Modify `frontend/index.js` contract address values:

```js
// Goerli Testnet
const icoAddr = "0xa51131B9BF3ece64155B086118308F995ca37164";
const spcAddr = "0x9D3e43204703a0598C2bc80d77072d083c5e7BC6";
const poolAddr = "0xbF30d10B5C1Bb880f59804Ef2DF48b8d0E9104Cd";
const routerAddr = "0xDd1D7E0d2602FF4feEAF052C67f21631D402BcfB";

// Hardhat Localhost
// const icoAddr = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
// const spcAddr = "0xa16E02E87b7454126E5E10d957A927A7F5B5d2be";
// const poolAddr = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
// const routerAddr = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
```

The commented addresses are the addresses that are generated on my system using the hardhat localhost network.
