// src/routes/orderRoutes.ts
import express from 'express';
import { OrderService } from '../services/orderService';
import * as OrderDb from '../db/orders';
import { BigNumber } from "ethers";
import { getWebSocketService } from '../services/websocketService';
const router = express.Router();

// Initialize our services with environment variables
const orderService = new OrderService(
    process.env.V2_DUTCH_ORDER_REACTOR,
    process.env.PERMIT2_ADDRESS
);
orderService.init()

// Step 1: Create Dutch order and return the info for swapper to sign
router.post('/create', async (req, res, next) => {
    try {
        const {
            inputToken,
            outputToken,
            inputAmount,
            outputAmount,
            userAddress,
        } = req.body;
        parseInt(inputAmount)
        parseInt(outputAmount)
        // Generate order data for signing
        //return orderId as well
        const orderData = await orderService.generateOrderData({
            inputToken,
            outputToken,
            inputAmount: BigNumber.from(inputAmount),
            outputAmount: BigNumber.from(outputAmount),
            swapper: userAddress
        });
        // if (orderData.signThis.domain && !orderData.signThis.domain.version) {
        //     orderData.signThis.domain.version = '1';
        //    }
        // Return everything needed for signing
        res.json({
            orderId: orderData.orderId,
            serializedOrder: orderData.serializedOrder,
            signData: orderData.signThis // { domain, types, values } for signing
        });
    } catch (error) {
        next(error)
    }
});
//TESTING ONLY STEP FOR SIGNING ORDER
router.post('/sign', async (req, res, next) => {
    if (process.env.NODE_ENV != 'development') {
        res.status(404).send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>Cannot POST /api/orders/sign</pre>
</body>
</html>`)
    }
    try {
        const { domain, types, values } = req.body
        const signature = await orderService.signExampleOrder(domain, types, values)
        res.json({ signature })
    }
    catch (error) {
        next(error)
    }
})
//Step 2: Take order signature and make it available to fillers
router.post('/submit', async (req, res, next) => {
    try {
        const { orderId, orderSignature } = req.body;  // Changed from orderHash to orderId

        // Retrieve order from database
        const order = await OrderDb.getOrderById(orderId);
        if (!order) {
            throw new Error('Order not found');
        }
        if (order.status !== 'AWAITING_SIGNATURE') {
            throw new Error('Order already signed');
        }
        // // Verify order signature
        // const isValidOrder = await orderService.verifyOrderSignature(
        //     order,
        //     orderSignature
        // );

        // if (!isValidOrder) {
        //     throw new Error('Invalid order signature');
        // }

        // Update order with signature
        await OrderDb.updateOrderSignature(orderId, {
            orderSignature,
            status: 'PENDING'
        });
        // Set Up Blockchain Event Listener
        await orderService.setupContractListener(
            orderId
        );
        const websocketService = getWebSocketService();
        // Notify connected clients about the order update
        websocketService.sendOrderUpdate(orderId, {
            status: 'PENDING',
            expiresAt: order.deadline
        });

        res.json({
            orderId,
            status: 'PENDING',
            websocketEndpoint: `/ws/orders/${orderId}`,
            expiresAt: order.deadline
        });
    } catch (error) {
        next(error);
    }
});

//Step 3: Allow fillers to view orders available for filling
router.get('/available', async (req, res, next) => {
    try {
        const limit = parseInt(req.query.limit as string) || 10;
        const offset = parseInt(req.query.offset as string) || 0;

        const availableOrders = await orderService.listAvailableOrders(limit, offset);

        res.json({
            orders: availableOrders,
            total: availableOrders.length,
            limit,
            offset
        });
    } catch (error) {
        next(error);
    }
});

//Optional Steps: Order status endpoint
router.get('/:orderId/status', async (req, res, next) => {
    try {
        const { orderId } = req.params;
        const order = await OrderDb.getOrderById(orderId);

        if (!order) {
            throw new Error('Order not found');
        }

        res.json({
            status: order.status,
            createdAt: order.createdAt,
            expiresAt: order.deadline,
            fillStatus: order.status,
            txHash: order.txHash
        });
    } catch (error) {
        next(error);
    }
})
router.get('/mock', async (req, res, next) => {
    console.log('mock')
    const websocketService = getWebSocketService();
    websocketService.sendOrderUpdate('3b5dc245-8eed-4ee0-8431-7972b1df1aea', {
        status: 'FILLED',
        filler: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
        transactionHash: 'cryptoooooo'
    });
    res.json({status: 'FILLED'})
});



export default router;