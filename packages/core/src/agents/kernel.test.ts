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

  describe('consultant rewrite', () => {
    it('should call GeminiChat with consultant prompt and return rewritten task', async () => {
      // Mock GeminiChat to return a concise task sentence
      (mockGeminiChat.sendMessage as Mock).mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'Create a Node.js app' }] } }]
      });

      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: 'I need help building a simple web application using Node.js and Express' },
        bus: mockBus,
      };

      const result = await kernelAgent.run(ctx);

      expect(result.ok).toBe(true);
      expect(result.output).toBe('Create a Node.js app');

      // Verify GeminiChat was called with consultant prompt
      expect(mockGeminiChat.sendMessage).toHaveBeenCalledWith(
        { message: expect.stringContaining('Rewrite the user request as one short (< 50 chars) task sentence') },
        "kernel-consultant-rewrite"
      );

      // Verify the user input was included in the prompt
      expect(mockGeminiChat.sendMessage).toHaveBeenCalledWith(
        { message: expect.stringContaining('I need help building a simple web application using Node.js and Express') },
        "kernel-consultant-rewrite"
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
        payload: { percent: 100 }
      }));
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'log',
        payload: 'Create a Node.js app'
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

      // Verify error event was published with stack trace
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'error',
        payload: expect.objectContaining({
          agent: 'KERNEL',
          message: 'API failure',
          stack: expect.any(String)
        })
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
      expect(result.output).toBe('Process user request');
    });

    it('should trim whitespace from response', async () => {
      // Mock GeminiChat to return response with whitespace
      (mockGeminiChat.sendMessage as Mock).mockResolvedValue({
        candidates: [{ content: { parts: [{ text: '  Build a web app  ' }] } }]
      });

      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: 'test input' },
        bus: mockBus,
      };

      const result = await kernelAgent.run(ctx);

      expect(result.ok).toBe(true);
      expect(result.output).toBe('Build a web app');
    });

    it('should return fallback when no GeminiChat', async () => {
      // Create agent without GeminiChat
      const kernelAgentNoChat = new KernelAgent(mockBus);
      
      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: 'test input' },
        bus: mockBus,
      };

      const result = await kernelAgentNoChat.run(ctx);

      expect(result.ok).toBe(true);
      expect(result.output).toBe('Process user request');
      
      // Verify log event contains the fallback message
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'log',
        payload: 'Process user request'
      }));
    });
  });
});
