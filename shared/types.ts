import { BigNumber } from "ethers";

export interface TokenDeploymentParams {
  name: string;
  symbol: string;
  decimals: number;
}

export interface TradeParameters {
  chainId: number;
  permit2Address: string;
  reactorAddress: string;
  inputTokenParams: TokenDeploymentParams;
  outputTokenParams: TokenDeploymentParams;
  inputAmount: BigNumber;
  outputAmount: BigNumber;
}

export interface FillEvent {
    filler: string;
    swapper: string;
    nonce: number;
    orderHash: string;
  }
  