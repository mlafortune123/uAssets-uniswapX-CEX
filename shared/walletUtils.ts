//import { ethers as hardhatEthers } from 'hardhat';
import { ethers } from "ethers"; //These are for Wallets, Contracts, and other methods 

export async function createAndFundWallet(
  admin: ethers.Signer, 
  ethAmount: string = '10',
  hardhatEthers: any
): Promise<ethers.Wallet> {
  const wallet = ethers.Wallet.createRandom().connect(hardhatEthers.provider);
  
  await admin.sendTransaction({
    to: wallet.address,
    value: ethers.utils.parseEther(ethAmount)
  });

  return wallet;
}