import request from 'supertest';
import { ethers } from 'ethers';
import app from '../src/app'; // Your Express app
import { expect } from "chai";

describe('Order Creation Endpoint', () => {
    const testOrder = {
        inputToken: '0x...', // Valid token address
        outputToken: '0x...', // Valid token address
        inputAmount: '1000000', // 1 token
        outputAmount: '900000', // 0.9 tokens
        userAddress: '0x...' // Valid Ethereum address
    };

    it('should successfully create an order', async () => {
        const response = await request(app)
            .post('/api/orders/create')
            .send(testOrder)
            .expect(200);

        // Validate response structure
        expect(response.body).haveOwnProperty('orderId');
        expect(response.body).haveOwnProperty('serializedOrder');
        expect(response.body).haveOwnProperty('signData');

        // Validate signData structure
        const { signData } = response.body;
        expect(signData).haveOwnProperty('domain');
        expect(signData).haveOwnProperty('types');
        expect(signData).haveOwnProperty('values');

        // Validate orderId is a valid UUID
        expect(response.body.orderId).match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should handle invalid input', async () => {
        const invalidOrder = { ...testOrder, inputAmount: 'invalid' };

        const response = await request(app)
            .post('/api/orders/create')
            .send(invalidOrder)
            .expect(500);

        expect(response.body).haveOwnProperty('error');
    });
});