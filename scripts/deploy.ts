// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { constants } from "ethers";
import { SpaceCoinICO, SpaceCoin, SpacePool, SpaceRouter } from "../typechain";

async function main() {
  const accounts = await ethers.getSigners();
  for (const account of accounts) {
    console.log(`${account.address}: ${await account.getBalance()}`);
  }

  let signers: SignerWithAddress[];
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let spcTreasury: SignerWithAddress;
  let ico: SpaceCoinICO;
  let spc: SpaceCoin;
  let pool: SpacePool;
  let router: SpaceRouter;

  console.log("-------------");
  [deployer, alice, spcTreasury, ...signers] = await ethers.getSigners();

  const ICO = await ethers.getContractFactory("SpaceCoinICO");
  ico = (await ICO.deploy(
    deployer.address,
    spcTreasury.address
  )) as SpaceCoinICO;
  await ico.deployed();
  console.log("SpaceCoinICO deployed to:", ico.address);
  spc = await ethers.getContractAt("SpaceCoin", await ico.tokenContract());
  console.log("SpaceCoin deployed to:", spc.address);

  const SpacePool = await ethers.getContractFactory("SpacePool");
  pool = (await SpacePool.deploy(spc.address)) as SpacePool;
  await pool.deployed();
  console.log("SpacePool deployed to:", pool.address);

  const SpaceRouter = await ethers.getContractFactory("SpaceRouter");
  router = (await SpaceRouter.deploy(pool.address, spc.address)) as SpaceRouter;
  await router.deployed();
  console.log("SpaceRouter deployed to:", router.address);

  console.log("-------------");
  console.log(`alice: ${alice.address}`);
  console.log(`spcTreasury: ${spcTreasury.address}`);

  await pool.connect(spcTreasury).approve(router.address, constants.MaxUint256);
  await ico.connect(deployer).addToWhitelist(alice.address);
  await ico.connect(deployer).addToWhitelist(spcTreasury.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
