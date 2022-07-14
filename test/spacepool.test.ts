import chai, { expect } from "chai";
import { ethers, network, waffle } from "hardhat";
import { BigNumber, providers, constants } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
  SpacePool,
  SpacePool__factory,
  SpaceRouter,
  SpaceRouter__factory,
  SpaceCoin,
  SpaceCoin__factory,
} from "../typechain";
import { sign } from "crypto";
import { isContext } from "vm";
import { EtherscanProvider } from "@ethersproject/providers";
import { start } from "repl";

chai.use(waffle.solidity);

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const BURN_ADDRESS = "0xBaaaaaaaAAaaAaaaaaaAaAAAaaAAaAaaAAaaAAAD";
const ONE_ETHER: BigNumber = ethers.utils.parseEther("1");
const MIN_LIQUIDITY: BigNumber = BigNumber.from(1000);
const PRECISION: BigNumber = ethers.utils.parseEther("0.001");

const timeTravel = async (seconds: number) => {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
};

const setBlockTimeTo = async (seconds: number) => {
  await network.provider.send("evm_setNextBlockTimestamp", [seconds]);
  await network.provider.send("evm_mine");
};

const mineBlock = async (): Promise<void> => {
  await network.provider.send("evm_mine");
};

const advanceBlocks = async (blocks: number): Promise<void> => {
  for (let i = 0; i < blocks; i++) {
    await mineBlock();
  }
};

const ONE = ethers.BigNumber.from(1);
const TWO = ethers.BigNumber.from(2);

export function sqrt(value: string): BigNumber {
  const x = ethers.BigNumber.from(value);
  let z = x.add(ONE).div(TWO);
  let y = x;
  while (z.sub(y).isNegative()) {
    y = z;
    z = x.div(z).add(z).div(TWO);
  }
  return y;
}

const ETH = (strETHAmt: string) => {
  return ethers.utils.parseEther(strETHAmt);
};

const expandTo18Decimals = (n: number) => {
  return BigNumber.from(n).mul(BigNumber.from(10).pow(18));
};

const ethBalanceOf = async (address: string) => {
  return await ethers.provider.getBalance(address);
};

const encodeParameters = (types: string[], values: unknown[]): string => {
  const abi = new ethers.utils.AbiCoder();
  return abi.encode(types, values);
};

const Domain = (token: SpacePool) => ({
  name: "SpacePool Liquidity Token",
  chainId: 31337,
  verifyingContract: token.address,
});

describe("SpacePool Contract", function () {
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let chris: SignerWithAddress;
  let david: SignerWithAddress;
  let spcManager: SignerWithAddress;
  let spcTreasury: SignerWithAddress;
  let icoTreasury: SignerWithAddress;

  let SpacePool: SpacePool__factory;
  let pool: SpacePool;
  let SpaceRouter: SpaceRouter__factory;
  let router: SpaceRouter;
  let SpaceCoin: SpaceCoin__factory;
  let spc: SpaceCoin;
  let signers: SignerWithAddress[];
  let nextInvestor = 10;

  async function addLiquidity(ethAmount: BigNumber, spcAmount: BigNumber, to: SignerWithAddress) {
    nextInvestor = nextInvestor % signers.length;
    const nextSigner = signers[nextInvestor++];
    await spc.connect(spcTreasury).transfer(pool.address, spcAmount);
    await pool.connect(nextSigner).mint(to.address, { value: ethAmount });
  }

  beforeEach(async () => {
    [deployer, alice, bob, chris, david, spcManager, spcTreasury, icoTreasury, ...signers] =
      await ethers.getSigners();

    SpaceCoin = await ethers.getContractFactory("SpaceCoin");
    spc = (await SpaceCoin.deploy(
      spcManager.address,
      spcTreasury.address,
      spcTreasury.address
    )) as SpaceCoin;
    await spc.deployed();

    SpacePool = await ethers.getContractFactory("SpacePool");
    pool = (await SpacePool.deploy(spc.address)) as SpacePool;
    await pool.deployed();

    SpaceRouter = await ethers.getContractFactory("SpaceRouter");
    router = (await SpaceRouter.deploy(pool.address, spc.address)) as SpaceRouter;
    await router.deployed();
  });
  it("Deploys a contract", async () => {
    expect(pool.address).to.be.ok;
    expect(router.address).to.be.ok;
  });
  describe("Liquidity Token", () => {
    beforeEach(async () => {});
    it("Has the correct name", async () => {
      expect(await pool.name()).to.equal("SpacePool Liquidity Token");
    });
    it("Has the correct symbol", async () => {
      expect(await pool.symbol()).to.equal("SPL");
    });
    it("Has 18 decimals", async () => {
      expect(await pool.decimals()).to.equal(18);
    });
    it("Starts with zero supply", async () => {
      expect(await pool.totalSupply()).to.equal(0);
    });
  });
  describe("Liquidity Pool", () => {
    beforeEach(async () => {
      //   [startReserveETH, startReserveSPC] = await pool.getReserves();
    });
    it("Able to swap tokens using pool contract", async () => {
      let ethAmount = expandTo18Decimals(100);
      let spcAmount = expandTo18Decimals(500);
      await addLiquidity(ethAmount, spcAmount, alice);
      const ethIn = expandTo18Decimals(1);
      const expectSPCOut = ETH("4.9014753936");
      expect(await spc.balanceOf(pool.address)).to.equal(spcAmount);
      expect(await ethers.provider.getBalance(pool.address)).to.equal(ethAmount);

      await signers[10].sendTransaction({ to: alice.address, value: ethIn });
      await expect(pool.swap(0, expectSPCOut, alice.address, { value: ethIn }))
        .to.emit(pool, "Swap")
        .withArgs(deployer.address, ethIn, 0, 0, expectSPCOut, alice.address);
    });
    it("Unable to send money to contract", async () => {
      await expect(alice.sendTransaction({ value: ONE_ETHER, to: pool.address })).to.be.reverted;
    });
    it("Prevents calling swap as a double swap", async () => {
      let ethAmount = expandTo18Decimals(100);
      let spcAmount = expandTo18Decimals(500);
      await addLiquidity(ethAmount, spcAmount, alice);
      const ethIn = expandTo18Decimals(1);
      const expectSPCOut = ETH("4.9014753936");
      expect(await spc.balanceOf(pool.address)).to.equal(spcAmount);
      expect(await ethers.provider.getBalance(pool.address)).to.equal(ethAmount);

      await signers[10].sendTransaction({ to: alice.address, value: ethIn });
      await expect(
        pool.swap(ETH("1"), expectSPCOut, alice.address, { value: ethIn })
      ).to.be.revertedWith("Only single-sided swaps allowed");
    });
    it("Burns liquidity and able to mint the first time", async () => {
      let ethAmount = expandTo18Decimals(2);
      let spcAmount = expandTo18Decimals(10);
      await spc.connect(spcTreasury).transfer(pool.address, spcAmount);
      let [reserveETH, reserveSPC] = await pool.getReserves();
      const expectLiquidity = sqrt(ethAmount.mul(spcAmount).toString());
      await expect(pool.connect(alice).mint(alice.address, { value: ethAmount }))
        .to.emit(pool, "Mint")
        .withArgs(alice.address, ethAmount, spcAmount)
        .to.emit(pool, "Sync")
        .withArgs(ethAmount, spcAmount);
      expect(await pool.balanceOf(alice.address)).to.equal(expectLiquidity.sub(MIN_LIQUIDITY));
    });
    it("Does not burn the subsequent mint", async () => {
      let ethAmount = expandTo18Decimals(2);
      let spcAmount = expandTo18Decimals(10);
      await spc.connect(spcTreasury).transfer(pool.address, spcAmount);
      let expectLiquidity = sqrt(ethAmount.mul(spcAmount).toString());
      await pool.connect(alice).mint(alice.address, { value: ethAmount });
      let [reserveETH, reserveSPC] = await pool.getReserves();
      expect(await pool.balanceOf(alice.address)).to.equal(expectLiquidity.sub(MIN_LIQUIDITY));
      expect(await spc.balanceOf(pool.address)).to.equal(reserveSPC);
      expect(await ethers.provider.getBalance(pool.address)).to.equal(reserveETH);
      // mint again
      await spc.connect(spcTreasury).transfer(pool.address, spcAmount);
      const poolETHAmt = await ethers.provider.getBalance(pool.address);
      const poolSPCAmt = await spc.balanceOf(pool.address);
      const tokenSupply = await pool.totalSupply();
      const diffETH = poolETHAmt.sub(reserveETH).add(ethAmount);
      const diffSPC = poolSPCAmt.sub(reserveSPC);
      let expectLiquidityNew = diffETH.mul(tokenSupply).div(reserveETH);
      const mintedAmount = await pool
        .connect(alice)
        .callStatic.mint(alice.address, { value: ethAmount });
      expect(mintedAmount).to.equal(expectLiquidityNew);
      await expect(pool.connect(alice).mint(alice.address, { value: ethAmount }))
        .to.emit(pool, "Mint")
        .withArgs(alice.address, ethAmount, spcAmount)
        .to.emit(pool, "Sync")
        .withArgs(ethAmount.mul(2), spcAmount.mul(2));
      expect(await pool.balanceOf(alice.address)).to.equal(
        expectLiquidityNew.add(expectLiquidity).sub(MIN_LIQUIDITY)
      );
      expect(await pool.balanceOf(BURN_ADDRESS)).to.equal(MIN_LIQUIDITY);
    });
    it("burn emits and takes tokens", async () => {
      const aliceETHBefore = await ethers.provider.getBalance(alice.address);
      const aliceSPCBefore = await spc.balanceOf(alice.address);
      expect(await pool.balanceOf(alice.address)).to.equal(0);
      await addLiquidity(ETH("5"), ETH("5"), alice);
      let [startReserveETH, startReserveSPC] = await pool.getReserves();
      expect(await ethers.provider.getBalance(pool.address)).to.equal(startReserveETH);
      expect(await spc.balanceOf(pool.address)).to.equal(startReserveSPC);
      const aliceLPTokensStart = await pool.balanceOf(alice.address);
      const expectETHReturned = ETH("5").sub(MIN_LIQUIDITY);
      const expectSPCReturned = ETH("5").sub(MIN_LIQUIDITY);
      const expectLiquidity = ETH("5");
      await pool.connect(alice).transfer(pool.address, expectLiquidity.sub(MIN_LIQUIDITY));
      await expect(pool.burn(alice.address))
        .to.emit(pool, "Burn")
        .withArgs(deployer.address, expectETHReturned, expectSPCReturned, alice.address);
      expect(await pool.totalSupply()).to.eq(MIN_LIQUIDITY);
      expect(await pool.balanceOf(alice.address)).to.equal(0);
      expect(await spc.balanceOf(pool.address)).to.eq(MIN_LIQUIDITY);
      expect(await ethBalanceOf(pool.address)).to.eq(MIN_LIQUIDITY);
    });
  });
  describe("Router", () => {
    let inETH: BigNumber;
    let inSPC: BigNumber;
    let expectLiquidity: BigNumber;
    beforeEach(async () => {
      inETH = ONE_ETHER;
      inSPC = ETH("5");
    });
    it("Unable to get price if pool is empty", async () => {
      await expect(router.getCurrentSPCToETHPrice()).to.be.revertedWith("Not enough liquidity");
    });
    it("Unable to send money to contract", async () => {
      await expect(alice.sendTransaction({ value: ONE_ETHER, to: router.address })).to.be.reverted;
    });
    it("Calculations include swap fee", async () => {
      inETH = ETH("110");
      inSPC = ETH("454.95905368516833485");
      const minOutSPC = ETH("40");
      await spc.connect(spcTreasury).approve(router.address, ETH("1000"));
      await router.connect(spcTreasury).addLiquidity(inETH, inSPC, minOutSPC, spcTreasury.address, {
        value: inETH,
      });
      let [reserveETH, reserveSPC] = await pool.getReserves();
      expect(reserveETH).to.equal(inETH);
      expect(reserveSPC).to.equal(inSPC);
      const price = await router.getCurrentSPCToETHPrice();
      expect(price).to.closeTo(ETH("4.0581085066070514"), PRECISION);
      expect(await spc.transferTaxActive()).to.be.false;

      // expect(await router.getCurrentSPCToETHPrice()).to.be.gt(minOutSPC);
      await expect(
        router
          .connect(spcTreasury)
          .callStatic.swapExactETHforSPC(minOutSPC, spcTreasury.address, { value: ETH("10") })
      ).to.be.revertedWith("Did not meet SPC minimum conditions");
    });
    it("Able to get current price in SPC to ETH", async () => {
      expect(await pool.balanceOf(spcTreasury.address)).to.equal(0);
      await spc.connect(spcTreasury).approve(router.address, ETH("1000"));
      await router
        .connect(spcTreasury)
        .addLiquidity(inETH, inSPC, ETH("4.0"), spcTreasury.address, {
          value: inETH,
        });
      let [reserveETH, reserveSPC] = await pool.getReserves();
      const expectPrice = ONE_ETHER.mul(99)
        .mul(reserveSPC)
        .div(reserveETH.mul(100).add(ONE_ETHER.mul(99)));
      expect(await router.getCurrentSPCToETHPrice()).to.equal(expectPrice);
    });
    it("Price increases after adding liquidity", async () => {
      await spc.connect(spcTreasury).approve(router.address, ETH("1000"));
      await router
        .connect(spcTreasury)
        .addLiquidity(inETH, inSPC, ETH("4.0"), spcTreasury.address, {
          value: inETH,
        });
      let [reserveETH, reserveSPC] = await pool.getReserves();
      expect(reserveETH).to.equal(inETH);
      expect(reserveSPC).to.equal(inSPC);
      const beforeQuote = await router.getCurrentSPCToETHPrice();
      await router.connect(spcTreasury).addLiquidity(0, inSPC, 0, spcTreasury.address, {
        value: inETH,
      });
      [reserveETH, reserveSPC] = await pool.getReserves();
      expect(reserveETH).to.equal(inETH.mul(2));
      expect(reserveSPC).to.equal(inSPC.mul(2));
      const afterQuote = await router.getCurrentSPCToETHPrice();
      expect(afterQuote).to.be.gt(beforeQuote);
    });
    it("K increases but ratio stay the same after adding liquidity", async () => {
      await spc.connect(spcTreasury).approve(router.address, ETH("1000"));
      await router
        .connect(spcTreasury)
        .addLiquidity(inETH, inSPC, ETH("4.0"), spcTreasury.address, {
          value: inETH,
        });
      let [reserveETH, reserveSPC] = await pool.getReserves();
      const startK = reserveETH.mul(reserveSPC);
      const startRatio = reserveETH.div(reserveSPC);
      expect(reserveETH).to.equal(inETH);
      expect(reserveSPC).to.equal(inSPC);
      await router.connect(spcTreasury).addLiquidity(0, inSPC, 0, spcTreasury.address, {
        value: inETH,
      });
      [reserveETH, reserveSPC] = await pool.getReserves();
      expect(reserveETH).to.equal(inETH.mul(2));
      expect(reserveSPC).to.equal(inSPC.mul(2));
      const endK = reserveETH.mul(reserveSPC);
      const endRatio = reserveETH.div(reserveSPC);
      expect(endK).to.gt(startK);
      expect(endRatio).to.equal(endRatio);
    });
    describe("Add / Remove Liquidity", () => {
      beforeEach(() => {
        inETH = ONE_ETHER;
        inSPC = ETH("5");
        expectLiquidity = sqrt(inETH.mul(inSPC).toString()).sub(MIN_LIQUIDITY);
      });
      it("Able to add liquidity", async () => {
        expect(await pool.balanceOf(spcTreasury.address)).to.equal(0);
        await spc.connect(spcTreasury).approve(router.address, ETH("1000"));
        await expect(
          router.connect(spcTreasury).addLiquidity(inETH, inSPC, ETH("4.0"), spcTreasury.address, {
            value: inETH,
          })
        )
          .to.emit(pool, "Mint")
          .withArgs(router.address, inETH, inSPC);
        expect(await pool.balanceOf(spcTreasury.address)).to.equal(expectLiquidity);
        expect(await pool.balanceOf(BURN_ADDRESS)).to.equal(MIN_LIQUIDITY);
        let [reserveETH, reserveSPC] = await pool.getReserves();
        expect(reserveETH).to.equal(inETH);
        expect(reserveSPC).to.equal(inSPC);
      });
      it("Prevents adding liquidity with too high ethMin", async () => {
        await spc.connect(spcTreasury).approve(router.address, ETH("1000"));
        await pool.connect(spcTreasury).approve(router.address, ETH("1000"));
        await router
          .connect(spcTreasury)
          .addLiquidity(inETH, inSPC, ETH("4.0"), spcTreasury.address, {
            value: inETH,
          });

        await expect(
          router
            .connect(spcTreasury)
            .addLiquidity(ETH("1000"), ETH("0.5"), 0, spcTreasury.address, { value: inETH })
        ).to.be.revertedWith("Insufficient ETH amount");
      });
      it("Prevents adding liquidity with too high spcMin", async () => {
        await spc.connect(spcTreasury).approve(router.address, ETH("1000"));
        await pool.connect(spcTreasury).approve(router.address, ETH("1000"));
        await router
          .connect(spcTreasury)
          .addLiquidity(inETH, inSPC, ETH("4.0"), spcTreasury.address, {
            value: inETH,
          });

        await expect(
          router
            .connect(spcTreasury)
            .addLiquidity(0, inSPC, ETH("1000"), spcTreasury.address, { value: inETH })
        ).to.be.revertedWith("Insufficient SPC amount");
      });
      it("Add liquidity a second time uses constant product formula", async () => {
        expect(await pool.balanceOf(spcTreasury.address)).to.equal(0);
        await spc.connect(spcTreasury).approve(router.address, ETH("1000"));
        await router
          .connect(spcTreasury)
          .addLiquidity(inETH, inSPC, ETH("4.0"), spcTreasury.address, {
            value: inETH,
          });
        expect(await pool.balanceOf(spcTreasury.address)).to.equal(expectLiquidity);
        expect(await pool.balanceOf(BURN_ADDRESS)).to.equal(MIN_LIQUIDITY);
        let [reserveETH, reserveSPC] = await pool.getReserves();
        expect(reserveETH).to.equal(inETH);
        expect(reserveSPC).to.equal(inSPC);
        const ret = await router
          .connect(spcTreasury)
          .callStatic.addLiquidity(inETH, inSPC, ETH("4.0"), spcTreasury.address, {
            value: ONE_ETHER,
          });
        expect(ret[0]).to.equal(inETH);
        expect(ret[1]).to.equal(inSPC);
        expectLiquidity = inETH.mul(await pool.totalSupply()).div(inETH);
        expect(ret[2]).to.equal(expectLiquidity);
      });
      describe("Remove Liquidity", () => {
        let startK: BigNumber;
        let startRatio: BigNumber;
        beforeEach(async () => {
          expect(await pool.balanceOf(spcTreasury.address)).to.equal(0);
          await spc.connect(spcTreasury).approve(router.address, ETH("1000"));
          await pool.connect(spcTreasury).approve(router.address, ETH("1000"));
          await router
            .connect(spcTreasury)
            .addLiquidity(inETH, inSPC, ETH("4.0"), spcTreasury.address, {
              value: inETH,
            });
          let [reserveETH, reserveSPC] = await pool.getReserves();
          startK = reserveETH.mul(reserveSPC);
          startRatio = reserveSPC.div(reserveETH);
        });
        it("Able to remove liquidity", async () => {
          let [reserveETH, reserveSPC] = await pool.getReserves();
          expect(reserveETH).to.equal(inETH);
          expect(reserveSPC).to.equal(inSPC);
          expect(await pool.totalSupply()).to.equal(expectLiquidity.add(MIN_LIQUIDITY));
          const [outETH, outSPC] = await router
            .connect(spcTreasury)
            .callStatic.removeLiquidity(expectLiquidity, ETH("0.5"), ETH("4"), spcTreasury.address);

          expect(outETH).to.be.closeTo(ETH("1"), PRECISION);
          expect(outSPC).to.be.closeTo(ETH("5"), PRECISION);
        });
        it("K gets smaller after removing liquidity", async () => {
          await expect(
            router
              .connect(spcTreasury)
              .removeLiquidity(expectLiquidity, ETH("0.5"), ETH("4"), spcTreasury.address)
          ).to.emit(pool, "Burn");
          let [reserveETH, reserveSPC] = await pool.getReserves();
          const endK = reserveETH.mul(reserveSPC);
          expect(endK).to.lt(startK);
        });
        it("Removing liquidity does change xy ratio due to total supply", async () => {
          await expect(
            router
              .connect(spcTreasury)
              .removeLiquidity(expectLiquidity, ETH("0.5"), ETH("4"), spcTreasury.address)
          ).to.emit(pool, "Burn");
          let [reserveETH, reserveSPC] = await pool.getReserves();
          expect(reserveETH).to.not.equal(0);
          expect(reserveSPC).to.not.equal(0);
          const endRatio = reserveSPC.mul(reserveETH);
          expect(endRatio).to.not.equal(startRatio);
        });
        it("Removing liquidity emits Burn", async () => {
          let [reserveETH, reserveSPC] = await pool.getReserves();
          expect(reserveETH).to.equal(inETH);
          expect(reserveSPC).to.equal(inSPC);
          expect(await pool.totalSupply()).to.equal(expectLiquidity.add(MIN_LIQUIDITY));
          await expect(
            router
              .connect(spcTreasury)
              .removeLiquidity(expectLiquidity, ETH("0.5"), ETH("4"), spcTreasury.address)
          ).to.emit(pool, "Burn");
        });
        it("Able to protect from depositing bad ratios using min values", async () => {
          // alice comes in and adds a 1:1 ratio of lots of tokens
          const beforeSPCprice = await router.getCurrentSPCToETHPrice();
          const moreInETH = ETH("500");
          const moreInSPC = ETH("500");
          await spc.connect(spcTreasury).transfer(alice.address, moreInSPC);
          expect(await spc.balanceOf(alice.address)).to.equal(moreInSPC);
          await spc.connect(alice).approve(router.address, ETH("1000"));
          await pool.connect(alice).approve(router.address, ETH("1000"));

          await expect(
            router.connect(alice).addLiquidity(moreInETH, moreInSPC, ETH("4.0"), alice.address, {
              value: moreInETH,
            })
          ).to.be.revertedWith("Insufficient ETH amount");
        });
        it("Swap refunds if too much ETH is provided", async () => {
          // alice comes in and adds a 1:1 ratio of lots of tokens
          const beforeAliceETH = await ethBalanceOf(alice.address);
          const moreInETH = ETH("500");
          const moreInSPC = ETH("500");
          await spc.connect(spcTreasury).transfer(alice.address, moreInSPC);
          expect(await spc.balanceOf(alice.address)).to.equal(moreInSPC);
          await spc.connect(alice).approve(router.address, ETH("1000"));
          await pool.connect(alice).approve(router.address, ETH("1000"));

          await router.connect(alice).addLiquidity(ETH("0"), moreInSPC, ETH("0"), alice.address, {
            value: moreInETH,
          });
          const afterAliceETH = await ethBalanceOf(alice.address);
          expect(afterAliceETH).to.be.closeTo(beforeAliceETH.sub(ETH("100")), PRECISION);
        });
        it("Prevents removing liquidity if ethMin is too high", async () => {
          await expect(
            router
              .connect(spcTreasury)
              .removeLiquidity(expectLiquidity, ETH("10"), 0, spcTreasury.address)
          ).to.be.revertedWith("ETH minimum too high");
        });
        it("Prevents removing liquidity if spcMin is too high", async () => {
          await expect(
            router
              .connect(spcTreasury)
              .removeLiquidity(expectLiquidity, 0, ETH("10"), spcTreasury.address)
          ).to.be.revertedWith("SPC minimum too high");
        });
        it("Prevents removing liquididty if no token given", async () => {
          await expect(
            router.connect(spcTreasury).removeLiquidity(0, 0, ETH("10"), spcTreasury.address)
          ).to.be.revertedWith("Need LPTokens to remove liquidity");
        });
      });
      it("Reverts if no ETH is added", async () => {
        expect(await pool.balanceOf(pool.address)).to.equal(0);
        await expect(
          router
            .connect(spcTreasury)
            .addLiquidity(ONE_ETHER, ETH("5"), ETH("4.0"), spcTreasury.address)
        ).to.be.revertedWith("Must input a positive ETH amount");
      });
    });
    describe("Swaps", () => {
      let beforeAliceSPC: BigNumber;
      let beforeAliceETH: BigNumber;
      let beforeSPCprice: BigNumber;
      beforeEach(async () => {
        beforeAliceETH = await ethBalanceOf(alice.address);
        beforeAliceSPC = await spc.balanceOf(alice.address);
        inETH = ETH("10");
        inSPC = ETH("50");
        expect(await pool.balanceOf(spcTreasury.address)).to.equal(0);
        await spc.connect(spcTreasury).approve(router.address, ETH("1000"));
        await pool.connect(spcTreasury).approve(router.address, ETH("1000"));
        await router
          .connect(spcTreasury)
          .addLiquidity(inETH, inSPC, ETH("4.0"), spcTreasury.address, {
            value: inETH,
          });
        let [reserveETH, reserveSPC] = await pool.getReserves();
        expect(reserveETH).to.equal(inETH);
        expect(reserveSPC).to.equal(inSPC);
        beforeSPCprice = await router.getCurrentSPCToETHPrice();
        await spc.connect(alice).approve(router.address, ETH("1000"));
      });
      describe("Token Tax Enabled", () => {
        beforeEach(async () => {
          await spc.connect(spcManager).enableTransferTax();
          expect(await spc.transferTaxActive()).to.be.true;
        });
        it("Able to swap ETH for SPC", async () => {
          const beforeSPCBalance = await spc.balanceOf(spcTreasury.address);
          const outSPCMin = ETH("4");
          const expectSPCOut = ETH("4.5040946315");
          const outSPC = await router
            .connect(alice)
            .callStatic.swapExactETHforSPCWithTransferTax(outSPCMin, alice.address, {
              value: ONE_ETHER,
            });

          await expect(
            router
              .connect(alice)
              .swapExactETHforSPCWithTransferTax(outSPCMin, alice.address, { value: ONE_ETHER })
          ).to.emit(pool, "Swap");
          expect(outSPC).to.be.closeTo(expectSPCOut, PRECISION);
          expect(outSPC).to.be.lt(expectSPCOut);
          expect(await spc.balanceOf(spcTreasury.address)).to.gt(beforeSPCBalance);
          expect(await spc.balanceOf(spcTreasury.address)).to.closeTo(
            beforeSPCBalance.add(expectSPCOut.div(50)), // 2% tax
            PRECISION
          );
        });
        it("Able to swap SPC for ETH", async () => {
          const swapSPCAmount = ETH("5");
          const outETHMin = ETH("0.1");
          const expectETHOut = ETH("0.9008189263");
          await spc.connect(spcManager).disableTransferTax();
          await spc.connect(spcTreasury).transfer(alice.address, ETH("5")); // give alice 5spc first
          await spc.connect(spcManager).enableTransferTax();
          const beforeSPCBalance = await spc.balanceOf(spcTreasury.address);
          const outETH = await router
            .connect(alice)
            .callStatic.swapExactSPCWithTransferTaxforETH(swapSPCAmount, outETHMin, alice.address);
          await expect(
            router
              .connect(alice)
              .swapExactSPCWithTransferTaxforETH(swapSPCAmount, outETHMin, alice.address)
          ).to.emit(pool, "Swap");
          expect(outETH).to.be.lt(expectETHOut);
          expect(await spc.balanceOf(spcTreasury.address)).to.gt(beforeSPCBalance);
          expect(await spc.balanceOf(spcTreasury.address)).to.closeTo(
            beforeSPCBalance.add(swapSPCAmount.div(50)), // 2% tax
            PRECISION
          );
        });
        it("Prevents swapping to SPC if token tax not active", async () => {
          await spc.connect(spcManager).disableTransferTax();
          expect(await spc.transferTaxActive()).to.be.false;
          const outSPCMin = ETH("4");
          await expect(
            router
              .connect(alice)
              .swapExactETHforSPCWithTransferTax(outSPCMin, alice.address, { value: ONE_ETHER })
          ).to.be.revertedWith("SpaceCoin transfer tax must be active");
        });
        it("Prevents swapping to ETH if token tax not active", async () => {
          await spc.connect(spcManager).disableTransferTax();
          expect(await spc.transferTaxActive()).to.be.false;
          await expect(
            router.connect(alice).swapExactSPCWithTransferTaxforETH(ETH("1"), 0, alice.address)
          ).to.be.revertedWith("SpaceCoin transfer tax must be active");
        });
        it("->SPC: No-token-tax swap works but yes-token-tax swap does not", async () => {
          await spc.connect(spcManager).disableTransferTax();
          const beforeSPCBalance = await spc.balanceOf(spcTreasury.address);
          const outSPCMin = ETH("4.5");
          expect(
            await router
              .connect(alice)
              .callStatic.swapExactETHforSPC(outSPCMin, alice.address, { value: ONE_ETHER })
          ).to.be.ok;
          await expect(
            router
              .connect(alice)
              .callStatic.swapExactETHforSPCWithTransferTax(outSPCMin, alice.address, {
                value: ONE_ETHER,
              })
          ).to.be.revertedWith("SpaceCoin transfer tax must be active");
        });
        it("->ETH: Yes-token-tax swap works but no-token-tax swap does not", async () => {
          await spc.connect(spcManager).disableTransferTax();
          await spc.connect(spcTreasury).transfer(alice.address, ETH("5")); // give alice 5spc first
          await spc.connect(spcManager).enableTransferTax();
          const swapSPCAmount = ETH("5");
          const outETHMin = ETH("0.1");
          expect(
            await router
              .connect(alice)
              .callStatic.swapExactSPCWithTransferTaxforETH(swapSPCAmount, outETHMin, alice.address)
          ).to.be.ok;
          await expect(
            router.connect(alice).swapExactSPCforETH(swapSPCAmount, outETHMin, alice.address)
          ).to.be.revertedWith("SpaceCoin transfer tax must not be active");
        });
      });
      it("Able to swap ETH for SPC", async () => {
        const outSPCMin = ETH("4");
        const expectSPCOut = ETH("4.5040946315");
        expect(
          await router
            .connect(alice)
            .swapExactETHforSPC(outSPCMin, alice.address, { value: ONE_ETHER })
        ).to.be.ok;
        expect(await spc.balanceOf(alice.address)).to.be.closeTo(
          beforeAliceSPC.add(expectSPCOut),
          PRECISION
        );
        expect(await ethBalanceOf(alice.address)).to.be.closeTo(
          beforeAliceETH.sub(ONE_ETHER),
          PRECISION
        );
        let [reserveETH, reserveSPC] = await pool.getReserves();
        expect(reserveETH).to.be.closeTo(inETH.add(ONE_ETHER), PRECISION);
        expect(reserveSPC).to.be.closeTo(inSPC.sub(expectSPCOut), PRECISION);
        expect(await router.getCurrentSPCToETHPrice()).to.be.lt(beforeSPCprice);
      });
      it("Swapping ETH for SPC raises K", async () => {
        let [reserveETH, reserveSPC] = await pool.getReserves();
        const startK = reserveETH.mul(reserveSPC);
        const outSPCMin = ETH("4");
        expect(
          await router
            .connect(alice)
            .swapExactETHforSPC(outSPCMin, alice.address, { value: ONE_ETHER })
        ).to.be.ok;
        [reserveETH, reserveSPC] = await pool.getReserves();
        const endK = reserveETH.mul(reserveSPC);
        expect(endK).to.be.gt(startK);
      });
      it("Prevents swapping ETH -> SPC with high min", async () => {
        const outSPCMin = ETH("4.5041");
        await expect(
          router.connect(alice).swapExactETHforSPC(outSPCMin, alice.address, { value: ONE_ETHER })
        ).to.be.revertedWith("Did not meet SPC minimum conditions");
      });
      it("Prevents swapping ETH -> SPC with with zero ETH", async () => {
        const outSPCMin = ETH("4.5041");
        await expect(
          router.connect(alice).swapExactETHforSPC(outSPCMin, alice.address, { value: 0 })
        ).to.be.revertedWith("Insufficient ETH/SPC input amount");
      });
      it("Able to swap SPC for ETH", async () => {
        await spc.connect(spcTreasury).transfer(alice.address, ETH("5")); // give alice 5spc first
        beforeAliceSPC = await spc.balanceOf(alice.address);
        const swapSPCAmount = ETH("5");
        const outETHMin = ETH("0.9");
        const expectETHOut = ETH("0.9008189263");
        expect(
          await router.connect(alice).swapExactSPCforETH(swapSPCAmount, outETHMin, alice.address)
        ).to.be.ok;
        expect(await spc.balanceOf(alice.address)).to.be.closeTo(
          beforeAliceSPC.sub(swapSPCAmount),
          PRECISION
        );
        expect(await ethBalanceOf(alice.address)).to.be.closeTo(
          beforeAliceETH.add(expectETHOut),
          PRECISION
        );
        let [reserveETH, reserveSPC] = await pool.getReserves();
        expect(reserveETH).to.be.closeTo(inETH.sub(expectETHOut), PRECISION);
        expect(reserveSPC).to.be.closeTo(inSPC.add(swapSPCAmount), PRECISION);
        expect(await router.getCurrentSPCToETHPrice()).to.be.gt(beforeSPCprice);
      });
      it("Prevents swapping SPC -> ETH with high min", async () => {
        await spc.connect(spcTreasury).transfer(alice.address, ETH("5")); // give alice 5spc first
        beforeAliceSPC = await spc.balanceOf(alice.address);
        const swapSPCAmount = ETH("5");
        const outETHMin = ETH("0.91");
        const expectETHOut = ETH("0.9008189263");
        await expect(
          router.connect(alice).swapExactSPCforETH(swapSPCAmount, outETHMin, alice.address)
        ).to.be.revertedWith("Did not meet ETH minimum conditions");
      });
      it("Prevents swapping SPC -> ETH with with zero SPC", async () => {
        const outETHMin = ETH("0.91");
        await expect(
          router.connect(alice).swapExactSPCforETH(0, outETHMin, alice.address)
        ).to.be.revertedWith("Insufficient ETH/SPC input amount");
      });
      it("Attempt to swap all ETH fails", async () => {
        let [reserveETH, reserveSPC] = await pool.getReserves();
        expect(reserveETH).to.equal(inETH);
        expect(reserveSPC).to.equal(inSPC);
        const outSPCMin = ETH("0");
        const swapETHAmount = inETH;
        let outSPC = await router
          .connect(alice)
          .callStatic.swapExactETHforSPC(outSPCMin, alice.address, { value: swapETHAmount });
        expect(reserveETH).to.equal(inETH);
        expect(
          await router
            .connect(alice)
            .swapExactETHforSPC(outSPCMin, alice.address, { value: swapETHAmount })
        ).to.be.ok;
        expect(await router.getCurrentSPCToETHPrice()).to.be.lt(beforeSPCprice);
        expect(await spc.balanceOf(alice.address)).to.closeTo(
          beforeAliceSPC.add(outSPC),
          PRECISION
        );
        expect(await ethBalanceOf(alice.address)).to.be.closeTo(
          beforeAliceETH.sub(swapETHAmount),
          PRECISION
        );
        [reserveETH, reserveSPC] = await pool.getReserves();
        expect(reserveETH).to.equal(inETH.mul(2));
        expect(reserveSPC).to.closeTo(inSPC.sub(outSPC), PRECISION);
      });
      it("Attempt to swap all SPC fails", async () => {
        await spc.connect(spcTreasury).transfer(alice.address, inSPC); // give alice 5spc first
        beforeAliceSPC = await spc.balanceOf(alice.address);
        let [reserveETH, reserveSPC] = await pool.getReserves();
        expect(reserveETH).to.equal(inETH);
        expect(reserveSPC).to.equal(inSPC);
        const outETHMin = ETH("0");
        const swapSPCAmount = inSPC;
        let outETH = await router
          .connect(alice)
          .callStatic.swapExactSPCforETH(swapSPCAmount, outETHMin, alice.address);
        expect(reserveETH).to.equal(inETH);
        expect(
          await router.connect(alice).swapExactSPCforETH(swapSPCAmount, outETHMin, alice.address)
        ).to.be.ok;
        expect(await router.getCurrentSPCToETHPrice()).to.be.gt(beforeSPCprice);
        expect(await spc.balanceOf(alice.address)).to.closeTo(
          beforeAliceSPC.sub(swapSPCAmount),
          PRECISION
        );
        expect(await ethBalanceOf(alice.address)).to.be.closeTo(
          beforeAliceETH.add(outETH),
          PRECISION
        );
        [reserveETH, reserveSPC] = await pool.getReserves();
        expect(reserveETH).to.closeTo(inETH.sub(outETH), PRECISION);
        expect(reserveSPC).to.closeTo(inSPC.mul(2), PRECISION);
      });
    });
  });
});
