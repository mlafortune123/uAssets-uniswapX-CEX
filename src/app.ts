// src/app.ts
import express from 'express';
import cors from 'cors';
import { pool } from './db';
import orderRoutes from './routes/orderRoutes';
import expressWs from 'express-ws';
import { initializeWebSocketService } from './services/websocketService';

const app = express();

export const websocketService = initializeWebSocketService(app);
// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'healthy' });
    } catch (error) {
        res.status(500).json({ status: 'unhealthy', error: error.message });
    }
});

// Routes
app.use('/api/orders', orderRoutes);

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('API Error:', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        body: req.body
    });
    res.status(500).json({ error: err.message });
});

export default app;