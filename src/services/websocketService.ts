import { Application } from 'express';
import expressWs from 'express-ws';
import * as WebSocket from 'ws';

export class WebSocketService {
    private static instance: WebSocketService;
    private wsInstance: expressWs.Instance;
    private orderConnections = new Map<string, Set<WebSocket>>();
    private connectionTimeouts = new Map<string, NodeJS.Timeout>();

    // Private constructor enforces singleton pattern
    private constructor(app: Application) {
        this.wsInstance = expressWs(app);
        this.setupWebSocketRoutes(app);
        this.startCleanupInterval();
    }

    // Static method to get or create instance
    public static initialize(app: Application): WebSocketService {
        if (!WebSocketService.instance) {
            WebSocketService.instance = new WebSocketService(app);
        }
        return WebSocketService.instance;
    }

    // Static method to get existing instance
    public static getInstance(): WebSocketService {
        if (!WebSocketService.instance) {
            throw new Error('WebSocket service must be initialized first');
        }
        return WebSocketService.instance;
    }

    private setupWebSocketRoutes(app: Application) {
        app.ws('/ws/orders/:orderId', (ws: WebSocket, req) => {
            const orderId = req.params.orderId;
            
            console.log(`New WebSocket connection for order: ${orderId}`);
            
            // Ensure the set exists with explicit typing
            if (!this.orderConnections.has(orderId)) {
                this.orderConnections.set(orderId, new Set<WebSocket>());
            }
            
            // Add the WebSocket directly to the set
            this.orderConnections.get(orderId)!.add(ws);

            console.log(`Active connections for ${orderId}: ${this.orderConnections.get(orderId)!.size}`);

            // Enhanced error handling
            ws.on('error', (error) => {
                console.error(`WebSocket connection error for order ${orderId}:`, error);
                this.removeConnection(orderId, ws);
            });

            ws.on('close', (code, reason) => {
                console.log(`WebSocket closed for order ${orderId}. 
                    Code: ${code}, 
                    Reason: ${reason?.toString()}`);
                this.removeConnection(orderId, ws);
            });
        });
    }

    private removeConnection(orderId: string, connectionEntry: { userId: string, socket: WebSocket }) {
        const connections = this.orderConnections.get(orderId);
        if (connections) {
            connections.delete(connectionEntry);
            if (connections.size === 0) {
                this.orderConnections.delete(orderId);
            }
        }
    }

    private removeInactiveConnection(orderId: string, ws: WebSocket) {
        if (ws.readyState !== WebSocket.OPEN) {
            this.removeConnection(orderId, ws);
        }
    }

    private startCleanupInterval() {
        // Periodic cleanup of stale connections
        setInterval(() => {
            this.orderConnections.forEach((connections, orderId) => {
                connections.forEach(ws => {
                    this.removeInactiveConnection(orderId, ws);
                });
            });
        }, 15 * 60 * 1000); // Every 15 minutes
    }

    public sendOrderUpdate(orderId: string, updateData: any) {
        console.log(`Attempting to send update for order ${orderId}`);
        
        // Get the set of sockets for this order
        const sockets = this.orderConnections.get(orderId);
        
        if (!sockets || sockets.size === 0) {
            console.warn(`No active WebSocket connections for order ${orderId}`);
            return;
        }

        const message = JSON.stringify(updateData);

        // Comprehensive logging of socket connections
        console.log('Sockets:', Array.from(sockets).map(s => ({
            type: typeof s,
            constructor: s?.constructor?.name,
            keys: Object.keys(s || {})
        })));

        // Iterate using careful type checking
        sockets.forEach((socket) => {
            try {
                // Detailed type and existence checking
                if (
                    socket && 
                    typeof socket === 'object' && 
                    'send' in socket && 
                    typeof socket.send === 'function' && 
                    'readyState' in socket
                ) {
                    // Check if readyState is defined and matches OPEN
                    if (socket.readyState === WebSocket.OPEN) {
                        socket.send(message, (err) => {
                            if (err) {
                                console.error(`Send error for socket:`, err);
                            }
                        });
                        console.log(`Message sent to socket for order ${orderId}`);
                    } else {
                        console.warn(`Socket not in OPEN state. Current state:`, socket.readyState);
                    }
                } else {
                    console.warn('Invalid socket object:', {
                        socketExists: !!socket,
                        type: typeof socket,
                        keys: Object.keys(socket || {})
                    });
                }
            } catch (error) {
                console.error(`Error processing socket for order ${orderId}:`, error);
            }
        });
    }

    public closeAllConnections() {
        this.orderConnections.forEach(connections => {
            connections.forEach(ws => {
                ws.close();
            });
        });
        this.orderConnections.clear();
    }
}

export const initializeWebSocketService = WebSocketService.initialize;
export const getWebSocketService = WebSocketService.getInstance;