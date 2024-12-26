import hre, { ethers } from 'hardhat';
import request from 'supertest';
import app from '../src/app';

describe('Order Creation Integration Test', () => {
    before(async function() {
        console.log("here???")
        // Setup test wallets and tokens using hardhat's ethers
        const [testWallet] = await ethers.getSigners();
        
        // Use hardhat's forked network to get real token addresses and whale addresses
        const UDOGE_TOKEN = process.env.UDOGE_TOKEN_ADDRESS;
        const UBTC_TOKEN = process.env.UBTC_TOKEN_ADDRESS;
        const WHALE_ADDRESS = process.env.UDOGE_WHALE;

        // Impersonate whale to transfer tokens
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [WHALE_ADDRESS]
        });
        
        const whale = await ethers.getSigner(WHALE_ADDRESS);
        const tokenContract = await ethers.getContractAt('ERC20', UDOGE_TOKEN, whale);
        
        // Transfer tokens to test wallet
        await tokenContract.transfer(testWallet.address, ethers.utils.parseUnits('1', 18));
    });

    it('should create an order', async () => {
        const [testWallet] = await ethers.getSigners();

        const orderPayload = {
            inputToken: process.env.UDOGE_TOKEN_ADDRESS,
            outputToken: process.env.UBTC_TOKEN_ADDRESS,
            inputAmount: ethers.utils.parseUnits('0.1', 18).toString(),
            outputAmount: ethers.utils.parseUnits('0.01', 18).toString(),
            userAddress: testWallet.address
        };

        const response = await request(app)
            .post('/api/orders/create')
            .send(orderPayload)
            .expect(200);

        // Validation checks
    });
});