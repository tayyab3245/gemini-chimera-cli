/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { KernelAgent } from './kernel.js';
import { ChimeraEventBus } from '../event-bus/bus.js';
import { AgentType } from '../event-bus/types.js';
import type { AgentContext } from './agent.js';
import type { GeminiChat } from '../core/geminiChat.js';

describe('KernelAgent', () => {
  let kernelAgent: KernelAgent;
  let mockBus: ChimeraEventBus;
  let mockGeminiChat: GeminiChat;
  let publishSpy: Mock;

  beforeEach(() => {
    mockBus = new ChimeraEventBus();
    publishSpy = vi.spyOn(mockBus, 'publish') as Mock;
    
    // Create mock GeminiChat with correct response structure
    mockGeminiChat = {
      sendMessage: vi.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'ACK' }] } }]
      })
    } as any;
    
    kernelAgent = new KernelAgent(mockBus, mockGeminiChat);
    publishSpy.mockClear();
  });

  describe('live ACK handshake', () => {
    it('should call GeminiChat and return ACK response', async () => {
      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: 'test input' },
        bus: mockBus,
      };

      const result = await kernelAgent.run(ctx);

      expect(result.ok).toBe(true);
      expect(result.output).toBe('ACK');

      // Verify GeminiChat was called with correct parameters
      expect(mockGeminiChat.sendMessage).toHaveBeenCalledWith(
        { message: "Respond with only the word 'ACK'." },
        "kernel-ack-handshake"
      );

      // Verify event publishing
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'agent-start',
        payload: { id: AgentType.KERNEL }
      }));
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'progress',
        payload: { percent: 25 }
      }));
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'progress',
        payload: { percent: 50 }
      }));
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'progress',
        payload: { percent: 75 }
      }));
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'progress',
        payload: { percent: 100 }
      }));
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'agent-end',
        payload: { id: AgentType.KERNEL }
      }));
    });

    it('should handle GeminiChat errors gracefully', async () => {
      // Mock GeminiChat to throw an error
      (mockGeminiChat.sendMessage as Mock).mockRejectedValue(new Error('API failure'));

      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: 'test input' },
        bus: mockBus,
      };

      const result = await kernelAgent.run(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('API failure');

      // Verify error event was published
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'error',
        payload: {
          agent: 'KERNEL',
          message: 'API failure'
        }
      }));

      // Should still publish agent-end
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'agent-end',
        payload: { id: AgentType.KERNEL }
      }));
    });

    it('should handle empty response from GeminiChat', async () => {
      // Mock GeminiChat to return empty response
      (mockGeminiChat.sendMessage as Mock).mockResolvedValue({
        candidates: [{ content: { parts: [{ text: '' }] } }]
      });

      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: 'test input' },
        bus: mockBus,
      };

      const result = await kernelAgent.run(ctx);

      expect(result.ok).toBe(true);
      expect(result.output).toBe('');
    });

    it('should handle malformed response from GeminiChat', async () => {
      // Mock GeminiChat to return malformed response
      (mockGeminiChat.sendMessage as Mock).mockResolvedValue({
        candidates: []
      });

      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: 'test input' },
        bus: mockBus,
      };

      const result = await kernelAgent.run(ctx);

      expect(result.ok).toBe(true);
      expect(result.output).toBe('');
    });

    it('should trim whitespace from response', async () => {
      // Mock GeminiChat to return response with whitespace
      (mockGeminiChat.sendMessage as Mock).mockResolvedValue({
        candidates: [{ content: { parts: [{ text: '  ACK  ' }] } }]
      });

      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: 'test input' },
        bus: mockBus,
      };

      const result = await kernelAgent.run(ctx);

      expect(result.ok).toBe(true);
      expect(result.output).toBe('ACK');
    });
  });
});
