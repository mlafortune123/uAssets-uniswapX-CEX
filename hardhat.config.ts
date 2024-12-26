import { HardhatUserConfig } from "hardhat/config";
import * as dotenv from "dotenv";
//import "@nomiclabs/hardhat-ethers";
import "@nomicfoundation/hardhat-toolbox"
import "ts-node/register";
import "ts-mocha";
// Load the appropriate env file based on environment
// const envFile = process.env.NODE_ENV ? `.env.${process.env.NODE_ENV}` : '.env';
// dotenv.config({ path: envFile });
dotenv.config()
//Set this to true if you want hardhat to show you the blockchain logs. Sometimes quite useful
const DEBUG_MODE = process.env.DEBUG_MODE === 'true'
const CHAIN_ID = parseInt(process.env.CHAIN_ID)
const config: HardhatUserConfig = {
  solidity: "0.8.20",
  networks: {
    hardhat: {
      chainId: CHAIN_ID,
      throwOnTransactionFailures: DEBUG_MODE,
      throwOnCallFailures: DEBUG_MODE,
      allowUnlimitedContractSize: DEBUG_MODE,
      loggingEnabled: DEBUG_MODE,
      forking: {
        url: process.env.ARBITRUM_MAINNET_RPC_URL!,
        blockNumber: 287317976,
        // enabled: true,
      },
    },
    arbitrumOne: {
      url: process.env.ARBITRUM_MAINNET_RPC_URL || "",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : undefined,
    },
  },
  mocha: {
    fullTrace: true,
    require: ['ts-node/register']
  }
};

export default config;