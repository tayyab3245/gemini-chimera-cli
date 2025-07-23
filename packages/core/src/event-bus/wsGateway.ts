/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { ChimeraEventBus } from './bus.js';
import type { ChimeraEvent, ChimeraEventType } from './types.js';

/**
 * Starts a WebSocket gateway that broadcasts all ChimeraEventBus events
 * to connected clients as line-delimited JSON.
 */
export function startEventBusGateway(
  bus: ChimeraEventBus,
  port: number = 0
): WebSocketServer {
  // Create HTTP server
  const server = http.createServer();
  
  // Create WebSocket server
  const wss = new WebSocketServer({ server });
  
  // Store active clients and their unsubscribe functions
  const clients = new Map<WebSocket, (() => void)[]>();
  
  // All event types we want to subscribe to
  const eventTypes: ChimeraEventType[] = ['log', 'progress', 'agent-start', 'agent-end', 'error'];
  
  wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket client connected');
    
    // Store unsubscribe functions for this client
    const unsubscribeFunctions: (() => void)[] = [];
    
    // Subscribe to all event types for this client
    for (const eventType of eventTypes) {
      const unsubscribe = bus.subscribe(eventType, (event: ChimeraEvent) => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            // Send event as line-delimited JSON
            const message = JSON.stringify(event) + '\n';
            ws.send(message);
          } catch (error) {
            console.error('Error sending event to WebSocket client:', error);
          }
        }
      });
      unsubscribeFunctions.push(unsubscribe);
    }
    
    // Store client and its unsubscribe functions
    clients.set(ws, unsubscribeFunctions);
    
    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      
      // Clean up subscriptions for this client
      const clientUnsubscribes = clients.get(ws);
      if (clientUnsubscribes) {
        clientUnsubscribes.forEach(unsubscribe => unsubscribe());
        clients.delete(ws);
      }
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket client error:', error);
      
      // Clean up subscriptions for this client
      const clientUnsubscribes = clients.get(ws);
      if (clientUnsubscribes) {
        clientUnsubscribes.forEach(unsubscribe => unsubscribe());
        clients.delete(ws);
      }
    });
  });
  
  // Clean up all subscriptions when server closes
  wss.on('close', () => {
    console.log('WebSocket server closing, cleaning up subscriptions');
    
    // Clean up all client subscriptions
    for (const [ws, unsubscribeFunctions] of clients) {
      unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
    }
    clients.clear();
  });
  
  // Start listening
  server.listen(port, () => {
    console.log(`Event bus WebSocket gateway listening on port ${(server.address() as any)?.port || port}`);
  });
  
  return wss;
}
