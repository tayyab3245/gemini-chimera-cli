/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { ChimeraEventBus } from './bus.js';
import { startEventBusGateway } from './wsGateway.js';
import type { ChimeraEvent } from './types.js';

describe('WebSocket Gateway', () => {
  let bus: ChimeraEventBus;
  let gateway: WebSocketServer;
  let port: number;

  beforeEach(async () => {
    bus = new ChimeraEventBus();
    gateway = startEventBusGateway(bus, 0); // Use random port
    
    // Wait for server to start and get the actual port
    await new Promise<void>((resolve) => {
      gateway.on('listening', () => {
        port = (gateway.options.server?.address() as any)?.port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    // Close gateway and wait for it to close
    await new Promise<void>((resolve) => {
      gateway.close(() => {
        resolve();
      });
    });
  });

  it('should broadcast log events to connected clients', async () => {
    // Create WebSocket client
    const ws = new WebSocket(`ws://localhost:${port}`);
    
    // Wait for connection
    await new Promise<void>((resolve) => {
      ws.on('open', resolve);
    });

    // Set up message listener
    const receivedMessages: string[] = [];
    ws.on('message', (data) => {
      receivedMessages.push(data.toString());
    });

    // Publish a log event
    const logEvent: ChimeraEvent = {
      ts: Date.now(),
      type: 'log',
      payload: { message: 'Test log message', level: 'info' }
    };

    bus.publish(logEvent);

    // Wait a bit for the message to be received
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify the event was received
    expect(receivedMessages).toHaveLength(1);
    
    const receivedEvent = JSON.parse(receivedMessages[0].trim());
    expect(receivedEvent).toEqual(logEvent);

    // Close client
    ws.close();
  });

  it('should broadcast progress events to connected clients', async () => {
    // Create WebSocket client
    const ws = new WebSocket(`ws://localhost:${port}`);
    
    // Wait for connection
    await new Promise<void>((resolve) => {
      ws.on('open', resolve);
    });

    // Set up message listener
    const receivedMessages: string[] = [];
    ws.on('message', (data) => {
      receivedMessages.push(data.toString());
    });

    // Publish a progress event
    const progressEvent: ChimeraEvent = {
      ts: Date.now(),
      type: 'progress',
      payload: {
        stepId: 'S1',
        stepIndex: 0,
        totalSteps: 5,
        percent: 20
      }
    };

    bus.publish(progressEvent);

    // Wait a bit for the message to be received
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify the event was received
    expect(receivedMessages).toHaveLength(1);
    
    const receivedEvent = JSON.parse(receivedMessages[0].trim());
    expect(receivedEvent).toEqual(progressEvent);

    // Close client
    ws.close();
  });

  it('should broadcast error events to connected clients', async () => {
    // Create WebSocket client
    const ws = new WebSocket(`ws://localhost:${port}`);
    
    // Wait for connection
    await new Promise<void>((resolve) => {
      ws.on('open', resolve);
    });

    // Set up message listener
    const receivedMessages: string[] = [];
    ws.on('message', (data) => {
      receivedMessages.push(data.toString());
    });

    // Publish an error event
    const errorEvent: ChimeraEvent = {
      ts: Date.now(),
      type: 'error',
      payload: {
        agent: 'DRIVE',
        stepId: 'S2',
        message: 'Drive operation failed',
        details: { code: 'DRIVE_ERROR' }
      }
    };

    bus.publish(errorEvent);

    // Wait a bit for the message to be received
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify the event was received
    expect(receivedMessages).toHaveLength(1);
    
    const receivedEvent = JSON.parse(receivedMessages[0].trim());
    expect(receivedEvent).toEqual(errorEvent);

    // Close client
    ws.close();
  });

  it('should handle multiple simultaneous clients', async () => {
    // Create two WebSocket clients
    const ws1 = new WebSocket(`ws://localhost:${port}`);
    const ws2 = new WebSocket(`ws://localhost:${port}`);
    
    // Wait for both connections
    await Promise.all([
      new Promise<void>((resolve) => ws1.on('open', resolve)),
      new Promise<void>((resolve) => ws2.on('open', resolve))
    ]);

    // Set up message listeners
    const receivedMessages1: string[] = [];
    const receivedMessages2: string[] = [];
    
    ws1.on('message', (data) => receivedMessages1.push(data.toString()));
    ws2.on('message', (data) => receivedMessages2.push(data.toString()));

    // Publish an event
    const event: ChimeraEvent = {
      ts: Date.now(),
      type: 'agent-start',
      payload: { agent: 'DRIVE', stepId: 'S1' }
    };

    bus.publish(event);

    // Wait a bit for messages to be received
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify both clients received the event
    expect(receivedMessages1).toHaveLength(1);
    expect(receivedMessages2).toHaveLength(1);
    
    const receivedEvent1 = JSON.parse(receivedMessages1[0].trim());
    const receivedEvent2 = JSON.parse(receivedMessages2[0].trim());
    
    expect(receivedEvent1).toEqual(event);
    expect(receivedEvent2).toEqual(event);

    // Close clients
    ws1.close();
    ws2.close();
  });

  it('should clean up subscriptions when client disconnects', async () => {
    // Create WebSocket client
    const ws = new WebSocket(`ws://localhost:${port}`);
    
    // Wait for connection
    await new Promise<void>((resolve) => {
      ws.on('open', resolve);
    });

    // Close the client
    ws.close();
    
    // Wait for close event
    await new Promise<void>((resolve) => {
      ws.on('close', resolve);
    });

    // Publish an event after client disconnect
    const event: ChimeraEvent = {
      ts: Date.now(),
      type: 'log',
      payload: { message: 'Should not be received' }
    };

    // This should not cause any errors even though client is disconnected
    expect(() => bus.publish(event)).not.toThrow();
  });
});
