import dotenv from 'dotenv';
dotenv.config();
import app from './app';
import { runMigrations } from './db/migrations';
import { getWebSocketService } from './services/websocketService';

const PORT = process.env.PORT;
const NODE_ENV = process.env.NODE_ENV;

// Enhanced shutdown handler with more robust error handling
function setupGracefulShutdown(server) {
    const shutdownHandler = () => {
        console.log('Shutdown signal received: closing servers');
        
        try {
            // Safely get WebSocket service
            const websocketService = getWebSocketService();
            
            // Close all active WebSocket connections
            websocketService.closeAllConnections();
        } catch (wsError) {
            console.error('Error closing WebSocket service:', wsError);
        }

        // Close HTTP server
        server.close((serverCloseError) => {
            if (serverCloseError) {
                console.error('Error closing HTTP server:', serverCloseError);
            }
            console.log('HTTP server closed');
                process.exit(0);
        });

        // Fallback timeout in case shutdown takes too long
        setTimeout(() => {
            console.error('Could not close connections in time, forcefully shutting down');
            process.exit(1);
        }, 10000); // 10 second timeout
    };

    // Listen for shutdown signals
    process.on('SIGTERM', shutdownHandler);
    process.on('SIGINT', shutdownHandler);
}

// Main server initialization
async function startServer() {
    try {
        // Run migrations
        await runMigrations();

        // Initialize server
        const server = app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Environment: ${NODE_ENV}`);
        });

        // Initialize WebSocket service
        try {
            getWebSocketService();
            console.log('WebSocket service initialized successfully');
        } catch (error) {
            console.error('Failed to initialize WebSocket service:', error);
        }

        // Setup graceful shutdown
        setupGracefulShutdown(server);  // Assuming you have a database pool to pass

        return server;
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Global unhandled rejection handler
process.on('unhandledRejection', (err: Error) => {
    console.error('Unhandled Rejection:', err.message);
    // Optionally perform cleanup or logging
    process.exit(1);
});

// Start the server
startServer();