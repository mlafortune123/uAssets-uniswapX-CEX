import { ethers, BigNumber } from 'ethers';
import {
    V2DutchOrderBuilder,
    CosignedV2DutchOrder,
} from '@uniswap/uniswapx-sdk';
import { OrderData } from '../types';
import * as OrderDB from '../db/orders';
import { getWebSocketService } from './websocketService';
interface DutchOrderParams {
    inputToken: string;
    outputToken: string;
    inputAmount: ethers.BigNumber;
    outputAmount: ethers.BigNumber;
    swapper: string;
    permitData?: any;
    permitSignature?: string;
}

interface OrderExecutionParams {
    orderId: string;
    fillerAddress: string;
    signature: string;
}

class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

export class OrderService {
    public chainId: number;
    private provider: ethers.providers.Provider;
    private reactorAddress: string;
    private permit2Address: string;
    private reactorContract: ethers.Contract;
    private cosignerWallet: ethers.Wallet;
    private cosignerAddress: string;
    private ORDER_TYPES: Record<string, any>;
    private FILLER_ORDER_TYPES: Record<string, any>;

    private validateAddress(address: string, paramName: string): void {
        if (!address || typeof address !== 'string') {
            throw new ValidationError(`${paramName} must be a string`);
        }//this next one is specific to testing
        // if (!address.startsWith('0x')) {
        //     throw new ValidationError(`${paramName} must start with 0x`);
        // }
        if (address.length !== 42) {
            throw new ValidationError(`${paramName} must be 42 characters long`);
        }
        if (!ethers.utils.isAddress(address)) {
            throw new ValidationError(`Invalid ${paramName}: ${address}`);
        }
    }

    private validateAmount(amount: BigNumber, paramName: string): void {
        if (!BigNumber.isBigNumber(amount)) {
            throw new ValidationError(`${paramName} must be a BigNumber`);
        }
        if (amount.lte(0)) {
            throw new ValidationError(`${paramName} must be greater than 0`);
        }
    }

    private validateOrderParams(params: DutchOrderParams): void {
        this.validateAddress(params.inputToken, 'inputToken');
        this.validateAddress(params.outputToken, 'outputToken');
        this.validateAddress(params.swapper, 'swapper');
        this.validateAmount(params.inputAmount, 'inputAmount');
        this.validateAmount(params.outputAmount, 'outputAmount');

        if (params.inputToken.toLowerCase() === params.outputToken.toLowerCase()) {
            throw new ValidationError('Input and output tokens cannot be the same');
        }
    }

    private validateOrderExecution(params: OrderExecutionParams): void {
        if (!params.orderId) {
            throw new ValidationError('Order ID is required');
        }
        this.validateAddress(params.fillerAddress, 'fillerAddress');
        if (!params.signature || params.signature.length < 2 || !params.signature.startsWith('0x')) {
            throw new ValidationError('Valid signature is required (must start with 0x and be longer than 2 characters)');
        }
    }

    private validatePagination(limit: number, offset: number): void {
        if (!Number.isInteger(limit)) {
            throw new ValidationError('Limit must be an integer');
        }
        if (!Number.isInteger(offset)) {
            throw new ValidationError('Offset must be an integer');
        }
        if (limit < 1 || limit > 100) {
            throw new ValidationError('Limit must be between 1 and 100');
        }
        if (offset < 0) {
            throw new ValidationError('Offset must be non-negative');
        }
    }

    constructor(
        reactorAddress: string,
        permit2Address: string,
    ) {
        this.validateAddress(reactorAddress, 'reactorAddress');
        this.validateAddress(permit2Address, 'permit2Address');

        this.provider = new ethers.providers.JsonRpcProvider(process.env.ARBITRUM_MAINNET_RPC_URL);
        this.reactorAddress = reactorAddress;
        this.permit2Address = permit2Address;
        this.chainId = parseInt(process.env.CHAIN_ID);

        if (!this.chainId || !Number.isInteger(this.chainId)) {
            throw new ValidationError('Invalid chain ID in environment');
        }

        const REACTOR_ABI = [
            'function execute(tuple(bytes order, bytes sig) calldata params) external payable returns (bool)',
            'function simulateExecute(tuple(bytes order, bytes sig) calldata params) external view returns (bool, bytes memory)',
            "event Fill(bytes32 indexed orderHash, address indexed filler, address indexed swapper, uint256 nonce)"
        ];

        this.reactorContract = new ethers.Contract(
            reactorAddress,
            REACTOR_ABI,
            this.provider
        );

        if (!process.env.COSIGNER_PRIVATE_KEY) {
            throw new ValidationError('Cosigner private key not found in environment');
        }

        this.cosignerWallet = new ethers.Wallet(
            process.env.COSIGNER_PRIVATE_KEY,
            this.provider
        );
    }

    async init() {
        this.cosignerAddress = await this.cosignerWallet.getAddress();
    }

    async generateOrderData(params: DutchOrderParams) {
        this.validateOrderParams(params);
        const nonce = BigNumber.from(await this.provider.getTransactionCount(params.swapper));
        const deadline = Math.floor(Date.now() / 1000) + 3600;

        const orderBuilder = new V2DutchOrderBuilder(
            this.chainId,
            this.reactorAddress,
            this.permit2Address
        )
            .deadline(deadline)
            .nonce(nonce)
            .swapper(params.swapper)
            .cosigner(this.cosignerAddress)
            .input({
                token: params.inputToken,
                startAmount: params.inputAmount,
                endAmount: params.inputAmount
            })
            .output({
                token: params.outputToken,
                startAmount: params.outputAmount,
                endAmount: params.outputAmount.mul(90).div(100),
                recipient: params.swapper
            });

        const cosignerData = {
            decayStartTime: deadline - 100,
            decayEndTime: deadline,
            exclusiveFiller: ethers.constants.AddressZero,
            exclusivityOverrideBps: BigNumber.from(0),
            inputOverride: params.inputAmount,
            outputOverrides: [params.outputAmount]
        };

        const partialOrder = orderBuilder.buildPartial();
        const cosignatureHash = partialOrder.cosignatureHash(cosignerData);
        const cosignature = await this.cosignerWallet.signMessage(cosignatureHash);

        const order = orderBuilder
            .cosignature(cosignature)
            .cosignerData(cosignerData)
            .build();

        const { domain, types, values } = order.permitData();
        // Remove this line if present
        // if (domain && !domain.version) {
        //     domain.version = '1';
        // }
        const serializedOrder = order.serialize();

        const orderId = await OrderDB.createPendingOrder({
            chainId: this.chainId,
            swapperAddress: params.swapper,
            reactorAddress: this.reactorAddress,
            inputToken: params.inputToken,
            inputAmount: params.inputAmount.toString(),
            outputToken: params.outputToken,
            outputAmount: params.outputAmount.toString(),
            serializedOrder,
            status: 'AWAITING_SIGNATURE',
            deadline,
            cosignerAddress: this.cosignerAddress,
            cosignerSignature: cosignature,
            nonce
        });

        return {
            orderId,
            signThis: { domain, types, values },
            serializedOrder
        };
    }


    async signExampleOrder(domain, types, values) {
        const wallet = new ethers.Wallet(process.env.EXAMPLE_USER_PRIVATE_KEY, this.provider)
        return await wallet._signTypedData(domain, types, values);
    }

    async verifyOrderSignature(
        orderFromDb: OrderData,
        signature: string
    ): Promise<boolean> {
        if (!orderFromDb) {
            throw new ValidationError('Order data is required');
        }
        if (!signature || !signature.startsWith('0x')) {
            throw new ValidationError('Valid signature is required (must start with 0x)');
        }

        try {
            const orderBuilder = new V2DutchOrderBuilder(orderFromDb.chainId);
        
            const order = orderBuilder
                .deadline(Math.floor(orderFromDb.deadline / 1000))
                .decayEndTime(Math.floor(orderFromDb.deadline / 1000))
                .decayStartTime(Math.floor(orderFromDb.deadline / 1000) - 100) // Adjust decay start time
                .nonce(orderFromDb.nonce)
                .input({
                    token: orderFromDb.inputToken,
                    startAmount: ethers.BigNumber.from(orderFromDb.inputAmount),
                    endAmount: ethers.BigNumber.from(orderFromDb.inputAmount)
                })
                .output({
                    token: orderFromDb.outputToken,
                    startAmount: ethers.BigNumber.from(orderFromDb.outputAmount),
                    endAmount: ethers.BigNumber.from(orderFromDb.outputAmount), // You might want to adjust this
                    recipient: orderFromDb.swapperAddress // Typically the swapper is the recipient
                })
                .build();
    
            // Recover the signer using the SDK method
            const recoveredSigner = order.getSigner(signature);
    
            // Validate the recovered signer matches the swapper address
            const isValidSignature = recoveredSigner.toLowerCase() === orderFromDb.swapperAddress.toLowerCase();
    
            if (!isValidSignature) {
                console.warn('Signature verification failed', {
                    expectedSigner: orderFromDb.swapperAddress,
                    recoveredSigner,
                    orderHash: orderFromDb.orderHash
                });
            }
    
            return isValidSignature;
        } catch (error) {
            console.error('Order signature verification failed:', {
                error: error.message,
                signer: orderFromDb.swapperAddress
            });
            return false;
        }
    }

    async listAvailableOrders(limit: number = 10, offset: number = 0): Promise<OrderData[]> {
        this.validatePagination(limit, offset);
        return await OrderDB.getPendingOrders(limit, offset);
    }

    // Blockchain Event Monitoring Function
    async setupContractListener(
        orderId: string,
    ) {
        // Set up event listener
        this.reactorContract.on('Fill', async (orderHash, filler, swapper, nonce, event) => {
            try {
                // Verify this is our specific order
                const orderDetails = await OrderDB.getOrderByHash(orderHash);
                if (!orderDetails || orderDetails.id !== orderId) return;
                const receipt = await event.getTransactionReceipt();

                // Update order status
                await OrderDB.updateOrderExecution(orderId, {
                    status: 'EXECUTED',
                    txHash: event.transactionHash,
                    gasUsed: receipt.gasUsed.toString(),
                    effectiveGasPrice: receipt.effectiveGasPrice.toString(),
                    blockNumber: receipt.blockNumber
                });

                // Notify via WebSocket
                const websocketService = getWebSocketService();
                websocketService.sendOrderUpdate(orderId, {
                    status: 'FILLED',
                    filler,
                    transactionHash: event.transactionHash
                });

            } catch (error) {
                console.error('Error processing order fill:', error);
            }
        });
    }

    // Utility to select blockchain provider
    // function getProviderForChain(chainId: number): ethers.Provider {
    //     switch (chainId) {
    //         case 1:     // Ethereum Mainnet
    //             return new ethers.JsonRpcProvider('https://mainnet.infura.io/v3/YOUR_PROJECT_ID');
    //         case 5:     // Goerli Testnet
    //             return new ethers.JsonRpcProvider('https://goerli.infura.io/v3/YOUR_PROJECT_ID');
    //         // Add more chains as needed
    //         default:
    //             throw new Error(`Unsupported chain ID: ${chainId}`);
    //     }
    // }

}