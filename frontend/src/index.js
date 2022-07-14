import { ethers, constants } from "ethers";
import SpaceRouter from "../../artifacts/contracts/SpaceRouter.sol/SpaceRouter.json";
import SpacePool from "../../artifacts/contracts/SpacePool.sol/SpacePool.json";
import SpaceCoin from "../../artifacts/contracts/SpaceCoin.sol/SpaceCoin.json";
import SpaceCoinICO from "../../artifacts/contracts/SpaceCoinICO.sol/SpaceCoinICO.json";

const provider = new ethers.providers.Web3Provider(window.ethereum);
const signer = provider.getSigner();

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

const ico = new ethers.Contract(icoAddr, SpaceCoinICO.abi, provider);
const spc = new ethers.Contract(spcAddr, SpaceCoin.abi, provider);
const pool = new ethers.Contract(poolAddr, SpacePool.abi, provider);
const router = new ethers.Contract(routerAddr, SpaceRouter.abi, provider);

const ETH = (strETHAmt) => {
  return ethers.utils.parseEther(strETHAmt);
};

async function connectToMetamask() {
  try {
    console.log("Signed in as", await signer.getAddress());
  } catch (err) {
    console.log("Not signed in");
    await provider.send("eth_requestAccounts", []);
  }
}

//
// ICO
//
ico_spc_buy.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const eth = ethers.utils.parseEther(form.eth.value);
  console.log("Buying", eth, "eth");

  await connectToMetamask();
  try {
    const signerAddress = await signer.getAddress();
    await ico.connect(signer).buyTokens(signerAddress, { value: eth });
  } catch (err) {
    console.log(err);
    alert(err);
  }
});

ico_spc_redeem.addEventListener("submit", async (e) => {
  e.preventDefault();
  await connectToMetamask();
  try {
    await ico.connect(signer).redeemTokens();
  } catch (err) {
    if (err.message.includes("Must be Open Phase")) {
      alert("Must be in Open Phase to collect");
    }
  }
});

async function updateTokensLeftToBuy() {
  const signerAddress = await signer.getAddress();
  const total = await ico.connect(signer).ICO_GOAL();
  const ethLeftToInvest = total.sub(await ico.connect(signer).weiRaised());
  const spcLeftToBuy = ethLeftToInvest.mul(5);
  const spcLeftToCollect = await ico
    .connect(signer)
    .tokensToCollect(signerAddress);
  ico_spc_left.innerText = `${ethers.utils.formatEther(spcLeftToBuy)} SPC`;
  ico_spc_collect_amount.innerText = `${ethers.utils.formatEther(
    spcLeftToCollect
  )} SPC`;
}

async function updateCurrentTokens() {
  await connectToMetamask();
  const signerAddress = await signer.getAddress();
  signer_address.innerText = signerAddress;
  const spcCount = await spc.connect(signer).balanceOf(signerAddress);
  signer_current_spc_count.innerText = ethers.utils.formatEther(spcCount);
  const lpCount = await pool.connect(signer).balanceOf(signerAddress);
  signer_current_lp_count.innerText = ethers.utils.formatEther(lpCount);

  let [reserveETH, reserveSPC] = await pool.getReserves();
  pool_current_eth_count.innerText = ethers.utils.formatEther(reserveETH);
  pool_current_spc_count.innerText = ethers.utils.formatEther(reserveSPC);
}

updateCurrentTokens();

//
// LP
//
let currentSpcToEthPrice = 5;

provider.on("block", async (n) => {
  console.log("New block", n);
  const signerAddress = await signer.getAddress();
  await updateCurrentTokens();
  await updateTokensLeftToBuy();
  try {
    const price = await router.connect(signer).getCurrentSPCToETHPrice();
    currentSpcToEthPrice = ethers.utils.formatEther(price);
    let [reserveETH, reserveSPC] = await pool.getReserves();
    console.log(`current SPC price: ${currentSpcToEthPrice}`);
    console.log(`reserveETH: ${reserveETH}`);
    console.log(`reserveSPC: ${reserveSPC}`);
    console.log(`Signer has ${await pool.balanceOf(signerAddress)} LP tokens`);
    console.log(`Signer has ${await spc.balanceOf(signerAddress)} SPC tokens`);
  } catch (err) {
    if (err.message.includes("Not enough liquidity")) {
      console.log("Not enough liquidity for price");
    } else {
      console.log(err.message);
      console.log("unable to get current SPC price");
    }
  }
});

lp_deposit.eth.addEventListener("input", (e) => {
  lp_deposit.spc.value = +e.target.value * currentSpcToEthPrice;
});

lp_deposit.spc.addEventListener("input", (e) => {
  lp_deposit.eth.value = +e.target.value / currentSpcToEthPrice;
});

lp_deposit.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const ethAmount = ethers.utils.parseEther(form.eth.value);
  const spcAmount = ethers.utils.parseEther(form.spc.value);
  console.log("Depositing", ethAmount, "eth and", spcAmount, "spc");

  await connectToMetamask();
  try {
    // Give permission for router to send signer's SPC tokens to pool
    await spc.connect(signer).approve(router.address, constants.MaxUint256);

    // Give permission for router to send signer's LP tokens to pool (Used in removeLiquidity())
    await pool.connect(signer).approve(router.address, constants.MaxUint256);

    const signerAddress = await signer.getAddress();
    await router
      .connect(signer)
      .addLiquidity(0, spcAmount, ETH("4.0"), signerAddress, {
        value: ethAmount,
      });
    console.log("Successfully added liquidity");
  } catch (err) {
    console.log(err.message);
  }
});

lp_withdraw.addEventListener("submit", async (e) => {
  e.preventDefault();
  console.log("Withdrawing 100% of LP");

  await connectToMetamask();
  try {
    const signerAddress = await signer.getAddress();
    const numLPTokens = await pool.balanceOf(signerAddress);
    // Requires approval, but signer already did that when depositing
    await router
      .connect(signer)
      .removeLiquidity(numLPTokens, 0, 0, signerAddress);
    console.log("successfully removed liquidity");
  } catch (err) {
    console.log(err.message);
  }
});

//
// Swap
//
let swapIn = { type: "eth", value: 0 };
let swapOut = { type: "spc", value: 0 };
switcher.addEventListener("click", () => {
  [swapIn, swapOut] = [swapOut, swapIn];
  swap_in_label.innerText = swapIn.type.toUpperCase();
  swap.amount_in.value = swapIn.value;
  outmin_in_label.innerText = swapOut.type.toUpperCase();
  swap_title.innerText = `Trade ${swapIn.type.toUpperCase()} for ${swapOut.type.toUpperCase()}`;
  updateSwapOutLabel();
});

swap.amount_in.addEventListener("input", updateSwapOutLabel);

function updateSwapOutLabel() {
  swapOut.value =
    swapIn.type === "eth"
      ? +swap.amount_in.value * currentSpcToEthPrice
      : +swap.amount_in.value / currentSpcToEthPrice;

  swap_out_label.innerText = `${swapOut.value} ${swapOut.type.toUpperCase()}`;
}

swap.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const amountIn = ethers.utils.parseEther(form.amount_in.value);
  const minAmount = form.min_amount.value;

  console.log("Swapping", amountIn, swapIn.type, "for", swapOut.type);

  await connectToMetamask();
  let tx;
  try {
    const taxActive = await spc.transferTaxActive();
    console.log(`taxActive ${taxActive}`);
    const signerAddress = await signer.getAddress();
    const outMin = ethers.utils.parseEther(minAmount);
    console.log(`outMin  : ${outMin}`);
    console.log(`amountIn: ${amountIn}`);
    if (swapIn.type === "eth") {
      if (taxActive) {
        console.log("swap ETH->SPC start with tax");
        await router
          .connect(signer)
          .swapExactETHforSPCWithTransferTax(outMin, signerAddress, {
            value: amountIn,
          });
        console.log("swap ETH->SPC with tax success");
      } else {
        console.log("swap ETH->SPC start");
        await router
          .connect(signer)
          .swapExactETHforSPC(outMin, signerAddress, { value: amountIn });
        console.log("swap ETH->SPC success");
      }
      return;
    } else {
      await spc.connect(signer).approve(router.address, amountIn);
      if (taxActive) {
        console.log("swap SPC->ETH start with tax");
        await router
          .connect(signer)
          .swapExactSPCWithTransferTaxforETH(amountIn, outMin, signerAddress);
        console.log("swap SPC->ETH with tax success");
      } else {
        console.log("swap SPC->ETH start");
        await router
          .connect(signer)
          .swapExactSPCforETH(amountIn, outMin, signerAddress);
        console.log("swap SPC->ETH success");
      }
      return;
    }
  } catch (err) {
    if (err.message.includes("insufficient allowance")) {
      alert("Insufficient allowance");
    } else if (err.message.includes("Did not meet ETH minimum conditions")) {
      alert("Did not meet ETH minimum conditions");
    } else if (err.message.includes("Did not meet SPC minimum conditions")) {
      alert("Did not meet SPC minimum conditions");
    }
    console.log(err.message);
  }
});

// returns outSPCMin
function getSlippageParamsETHtoSPC(ethIn, slippageBPS) {
  const noSlippageSPCPrice = ethIn.mul(currentSpcToEthPrice);
  console.log(`noSlippageSPCPrice: ${noSlippageSPCPrice}`);
  return noSlippageSPCPrice.mul(10000 - slippageBPS).div(10000);
}

// returns outETHMin
function getSlippageParamsSPCtoETH(spcIn, slippageBPS) {
  const ethPrice = 1 / currentSpcToEthPrice;
  const noSlippageETHPrice = ethIn.mul(ethPrice);
  console.log(`noSlippageETHPrice: ${noSlippageETHPrice}`);
  return noSlippageETHPrice.mul(10000 - slippageBPS).div(10000);
}
