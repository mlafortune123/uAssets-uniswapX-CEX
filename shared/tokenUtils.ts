//import { ethers as hardhatEthers } from 'hardhat';
import { BigNumber, ethers } from "ethers"; //These are for Wallets, Contracts, and other methods 
import { TokenDeploymentParams } from "./types";

export async function deployMockToken(
  params: TokenDeploymentParams, 
  mintTo: string, 
  amount: BigNumber,
  hardhatEthers: any
) {
  const tokenFactory = await hardhatEthers.getContractFactory('MockERC20');
  const token = await tokenFactory.deploy(
    params.name, 
    params.symbol, 
    params.decimals
  );

  await token.mint(mintTo, amount);
  return token;
}

export async function approveToken(
  token: ethers.Contract, 
  spender: string, 
  amount: BigNumber, 
  signer: ethers.Signer
) {
  const tokenWithSigner = token.connect(signer);
  await tokenWithSigner.approve(spender, amount);
}