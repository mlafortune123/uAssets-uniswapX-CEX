// src/services/permitService.ts
import { ethers } from 'ethers';
import { TypedDataField } from '@ethersproject/abstract-signer';
import { CosignedV2DutchOrder } from '@uniswap/uniswapx-sdk';
import { z } from 'zod';
// The structure for permit data based on EIP-2612 standard
interface PermitDetails {
    token: string;
    amount: ethers.BigNumber;
    expiration: number;
    nonce: number;
}

interface PermitSingle {
    details: PermitDetails;
    spender: string;
    sigDeadline: number;
}

// Input validation schemas
const permitDetailsSchema = z.object({
    token: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
    amount: z.instanceof(ethers.BigNumber),
    expiration: z.number().positive(),
    nonce: z.number().nonnegative()
});

const permitSingleSchema = z.object({
    details: permitDetailsSchema,
    spender: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
    sigDeadline: z.number().positive()
});

export class PermitService {
    private permit2Contract: ethers.Contract;
    private provider: ethers.providers.Provider;
    private permitTypes: Record<string, TypedDataField[]>;
    // The EIP-712 type definitions for Permit2
    private PERMIT_TYPES = {
        PermitDetails: [
            { name: 'token', type: 'address' },
            { name: 'amount', type: 'uint160' },
            { name: 'expiration', type: 'uint48' },
            { name: 'nonce', type: 'uint48' }
        ],
        PermitSingle: [
            { name: 'details', type: 'PermitDetails' },
            { name: 'spender', type: 'address' },
            { name: 'sigDeadline', type: 'uint256' }
        ]
    } as const;

    constructor(permit2Address: string, provider: ethers.providers.Provider) {
        // The ABI for the core Permit2 functions we need
        const PERMIT2_ABI = [
            'function allowance(address user, address token, address spender) public view returns (uint160 amount, uint48 expiration, uint48 nonce)',
            'function approve(address token, address spender, uint160 amount, uint48 expiration)',
            'function permit(address owner, PermitSingle calldata permitSingle, bytes calldata signature)',
        ];

        this.permit2Contract = new ethers.Contract(permit2Address, PERMIT2_ABI, provider);
        this.provider = provider;
        this.permitTypes = {
            PermitDetails: [
                { name: "token", type: "address" },
                { name: "amount", type: "uint160" },
                { name: "expiration", type: "uint48" },
                { name: "nonce", type: "uint48" }
            ],
            PermitSingle: [
                { name: "details", type: "PermitDetails" },
                { name: "spender", type: "address" },
                { name: "sigDeadline", type: "uint256" }
            ]
        };
    }

    /**
     * Checks if a user has sufficient allowance in Permit2 for a specific token and amount
     */
    async checkPermit2Allowance(
        userAddress: string,
        tokenAddress: string,
        spenderAddress: string,
        requiredAmount: ethers.BigNumber
    ): Promise<boolean> {
        const { amount, expiration } = await this.permit2Contract.allowance(
            userAddress,
            tokenAddress,
            spenderAddress
        );

        // Check both amount and expiration
        const hasEnoughAllowance = ethers.BigNumber.from(amount).gte(requiredAmount);
        const notExpired = expiration > Math.floor(Date.now() / 1000);

        return hasEnoughAllowance && notExpired;
    }

    /**
     * Generates the permit data that needs to be signed by the user
     */
    async generatePermitData(params: {
        token: string;
        amount: ethers.BigNumber;
        owner: string;
        spender: string;
        deadline: number;
        order: CosignedV2DutchOrder; // Add this parameter
    }): Promise<{
        permitSingle: PermitSingle;
        domainData: ethers.TypedDataDomain;
    }> {
        // Validate input parameters
        this.validateInputParams(params);

        // Get the current nonce for this token approval
        const { nonce } = await this.permit2Contract.allowance(
            params.owner,
            params.token,
            params.spender
        );

        // Construct the permit details
        const permitSingle: PermitSingle = {
            details: {
                token: params.token,
                amount: params.amount,
                expiration: params.deadline,
                nonce: nonce
            },
            spender: params.spender,
            sigDeadline: params.deadline
        };

        // Use the order's domain data
        const { domain } = params.order.permitData();

        return { permitSingle, domainData: domain };
    }

    /**
     * Verifies that a permit signature is valid
     */
    async verifyPermitSignature(
        permitSingle: PermitSingle,
        signature: string,
        signerAddress: string
    ): Promise<boolean> {
        try {
            // Reconstruct the domain separator
            const chainId = await this.provider.getNetwork().then(n => n.chainId);
            const domain = {
                name: 'Permit2',
                chainId,
                verifyingContract: this.permit2Contract.address
            };
            // Recover the signer's address from the signature
            const recovered = ethers.utils.verifyTypedData(
                domain,
                this.permitTypes,
                permitSingle,
                signature
            );

            // Check if the recovered address matches the expected signer
            return recovered.toLowerCase() === signerAddress.toLowerCase();
        } catch (error) {
            console.error('Permit signature verification failed:', error);
            return false;
        }
    }

    /**
     * Submits a signed permit to the Permit2 contract
     */
    async submitPermit(
        owner: string,
        permitSingle: PermitSingle,
        signature: string,
        signer: ethers.Signer
    ): Promise<ethers.ContractTransaction> {
        // Create a contract instance with a signer for sending transactions
        const permit2WithSigner = this.permit2Contract.connect(signer);

        // Submit the permit to the contract
        return permit2WithSigner.permit(
            owner,
            permitSingle,
            signature
        );
    }

    /**
     * Utility function to pack permit data into the format expected by the contract
     */
    private packPermitData(permitSingle: PermitSingle): string {
        return ethers.utils.defaultAbiCoder.encode(
            [
                'tuple(tuple(address token, uint160 amount, uint48 expiration, uint48 nonce) details, address spender, uint256 sigDeadline)'
            ],
            [permitSingle]
        );
    }
    private validateInputParams(params: {
        token: string;
        amount: ethers.BigNumber;
        owner: string;
        spender: string;
        deadline: number;
    }): void {
        // Validate token addresses
        const addressRegex = /^0x[a-fA-F0-9]{40}$/;
        if (!addressRegex.test(params.token)) {
            throw new Error('Invalid token address');
        }
        if (!addressRegex.test(params.owner)) {
            throw new Error('Invalid owner address');
        }
        if (!addressRegex.test(params.spender)) {
            throw new Error('Invalid spender address');
        }

        // Validate amount (non-negative)
        if (params.amount.lt(0)) {
            throw new Error('Amount must be non-negative');
        }

        // Validate deadline (future timestamp)
        const currentTimestamp = Math.floor(Date.now() / 1000);
        if (params.deadline <= currentTimestamp) {
            throw new Error('Deadline must be in the future');
        }
    }
    private validatePermitSingle(permitSingle: PermitSingle): void {
        try {
            permitSingleSchema.parse(permitSingle);
        } catch (error) {
            throw new Error(`Invalid permit data: ${error.message}`);
        }
    }
}