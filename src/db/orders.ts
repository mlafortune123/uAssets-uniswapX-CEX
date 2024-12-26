// src/db/orders.ts
import { pool } from './index';
import { BigNumber } from 'ethers';
import { OrderData } from "../types";


/**
 * Creates a new pending order in the database before user signature
 */
export async function createPendingOrder(
  orderInput: {
    chainId: number,
    swapperAddress: string,
    reactorAddress: string,
    inputToken: string,
    inputAmount: string,
    outputToken: string,
    outputAmount: string,
    serializedOrder: string,
    status: 'AWAITING_SIGNATURE',
    nonce: BigNumber,
    deadline: number,
    cosignerAddress?: string,
    cosignerSignature?: string
  }
): Promise<string> {
  const query = `
      INSERT INTO orders (
          chain_id,
          swapper_address,
          reactor_address,
          input_token,
          input_amount,
          output_token,
          output_amount,
          serialized_order,
          status,
          nonce,
          deadline,
          cosigner_address,
          cosigner_signature
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id
  `;

  const values = [
    orderInput.chainId,
    orderInput.swapperAddress.toLowerCase(),
    orderInput.reactorAddress.toLowerCase(),
    orderInput.inputToken.toLowerCase(),
    orderInput.inputAmount,
    orderInput.outputToken.toLowerCase(),
    orderInput.outputAmount,
    orderInput.serializedOrder,
    orderInput.status,
    orderInput.nonce,
    orderInput.deadline,
    orderInput.cosignerAddress?.toLowerCase(),
    orderInput.cosignerSignature
  ];

  const result = await pool.query(query, values);
  return result.rows[0].id;
}
/**
 * Updates an order with user signatures after order signing
 */
export async function updateOrderSignature(
  orderId: string,  // Changed from orderHash
  data: {
    orderSignature: string;
    status: OrderData['status'];
  }
): Promise<void> {
  const query = `
      UPDATE orders
      SET order_signature = $1,
          status = $2,
          updated_at = NOW()
      WHERE id = $3
  `;

  await pool.query(query, [
    data.orderSignature,
    data.status,
    orderId
  ]);
}

/**
 * Updates an order with execution details after on-chain settlement
 */
export async function updateOrderExecution(
  orderId: string,
  execution: {
    status: OrderData['status'];
    txHash: string;
    gasUsed: string;
    effectiveGasPrice: string;
    blockNumber: number;
  }
): Promise<void> {
  const query = `
        UPDATE orders
        SET status = $1,
            tx_hash = $2,
            gas_used = $3,
            effective_gas_price = $4,
            block_number = $5,
            updated_at = NOW()
        WHERE id = $6
    `;

  await pool.query(query, [
    execution.status,
    execution.txHash,
    execution.gasUsed,
    execution.effectiveGasPrice,
    execution.blockNumber,
    orderId
  ]);
}

/**
 * Retrieves an order by its unique order hash
 */
export async function getOrderByHash(orderHash: string): Promise<OrderData | null> {
  const query = `
        SELECT *
        FROM orders
        WHERE order_hash = $1
    `;

  const result = await pool.query(query, [orderHash]);
  return result.rows[0] ? mapOrderFromDb(result.rows[0]) : null;
}

/**
 * Retrieves an order by its database ID
 */
export async function getOrderById(orderId: string): Promise<OrderData | null> {
  const query = `
        SELECT *
        FROM orders
        WHERE id = $1
    `;

  const result = await pool.query(query, [orderId]);
  return result.rows[0] ? mapOrderFromDb(result.rows[0]) : null;
}

/**
 * Gets all orders for a specific swapper address
 */
export async function getSwapperOrders(
  swapperAddress: string,
  limit: number = 10,
  offset: number = 0
): Promise<OrderData[]> {
  const query = `
        SELECT *
        FROM orders
        WHERE swapper_address = $1
        ORDER BY created_at DESC
        LIMIT $2
        OFFSET $3
    `;

  const result = await pool.query(query, [
    swapperAddress.toLowerCase(),
    limit,
    offset
  ]);

  return result.rows.map(mapOrderFromDb);
}

/**
 * Gets all orders that are ready to be executed (signed but not yet filled)
 */
export async function getPendingOrders(
  limit: number = 10,
  offset: number = 0
): Promise<OrderData[]> {
  const query = `
      SELECT *
      FROM orders
      WHERE status = 'PENDING'
      AND to_timestamp(deadline) > NOW()
      ORDER BY created_at ASC
      LIMIT $1
      OFFSET $2
  `;

  const result = await pool.query(query, [limit, offset]);
  return result.rows.map(mapOrderFromDb);
}

/**
 * Maps database column names to our TypeScript order type
 */
function mapOrderFromDb(row: any): OrderData {
  return {
    id: row.id,
    chainId: row.chain_id,
    swapperAddress: row.swapper_address,
    reactorAddress: row.reactor_address,
    inputToken: row.input_token,
    inputAmount: row.input_amount,
    outputToken: row.output_token,
    outputAmount: row.output_amount,
    deadline: row.deadline,
    nonce: row.nonce,
    permitSignature: row.permit_signature,
    orderSignature: row.order_signature,
    serializedOrder: row.serialized_order,
    orderHash: row.order_hash,
    status: row.status,
    txHash: row.tx_hash,
    gasUsed: row.gas_used,
    effectiveGasPrice: row.effective_gas_price,
    blockNumber: row.block_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    exclusiveFiller: row.exclusiveFiller,
    cosignerAddress: row.cosigner_address
  };
}