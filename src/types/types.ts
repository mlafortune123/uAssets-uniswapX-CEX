import {BigNumber} from 'ethers';

interface CreateOrderRequest {
    swapperAddress: string;
    cosignerAddress: string;
    inputToken: string;
    outputToken: string;
    inputAmount: string;
    outputAmount: string;
    chainId: number;
    reactorAddress: string;
    permit2Address: string;
}

interface ExecuteOrderRequest {
    serializedOrder: string;
    signature: string;
    fillerAddress: string;
}

export interface OrderData {
    id: string;
    chainId: number;
    swapperAddress: string;
    reactorAddress: string;
    inputToken: string;
    inputAmount: string;
    outputToken: string;
    outputAmount: string;
    deadline: number;
    nonce: BigNumber;
    permitSignature?: string;
    orderSignature?: string;
    serializedOrder: string;
    orderHash: string;
    status: 'AWAITING_SIGNATURE' | 'PENDING' | 'EXECUTED' | 'FAILED' | 'EXPIRED';
    txHash?: string;
    gasUsed?: string;
    effectiveGasPrice?: string;
    blockNumber?: number;
    createdAt: Date;
    updatedAt: Date;
    exclusiveFiller: string;  // Address of exclusive filler, or zero address if none
    exclusivityOverrideBps?: number;  // Optional override for exclusive filler fees
    cosignerAddress: string;
    cosignerSignature?: string;
}

// We often need partial order data when creating new orders
//export type CreateOrderData = Omit<OrderData, 'id' | 'createdAt' | 'updatedAt'>;

export interface OrderServiceResult {
  order: any;  // DutchOrder type from uniswapx-sdk
  orderHash: string;
  params: any;  // Order parameters
  domain: any;  // Domain data for signing
}

// Now, let's define what we need for database storage
export interface CreateOrderData extends OrderServiceResult {
  permitSignature?: string;
}

// export interface OrderService {
//     provider: any;
// }

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';