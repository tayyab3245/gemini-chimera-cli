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
import * as mindLoader from '../utils/mindLoader.js';

// Mock the mindLoader module
vi.mock('../utils/mindLoader.js', () => ({
  loadPrompt: vi.fn()
}));

describe('KernelAgent', () => {
  let kernelAgent: KernelAgent;
  let mockBus: ChimeraEventBus;
  let mockGeminiChat: GeminiChat;
  let publishSpy: Mock;
  let mockLoadPrompt: Mock;

  beforeEach(() => {
    mockBus = new ChimeraEventBus();
    publishSpy = vi.spyOn(mockBus, 'publish') as Mock;
    mockLoadPrompt = vi.mocked(mindLoader.loadPrompt);
    
    // Default mock for mindLoader - return a simple prompt
    mockLoadPrompt.mockResolvedValue('You are an AI consultant helping to clarify user requests.');
    
    // Create mock GeminiChat with correct response structure
    mockGeminiChat = {
      sendMessage: vi.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'ACK' }] } }]
      })
    } as any;
    
    kernelAgent = new KernelAgent(mockBus, mockGeminiChat);
    publishSpy.mockClear();
    mockLoadPrompt.mockClear();
  });

  describe('AI-as-Consultant behavior', () => {
    it('should return clarified task sentence when request is clear', async () => {
      // Mock GeminiChat to return a clarified task sentence
      (mockGeminiChat.sendMessage as Mock).mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'Fix authentication login bug' }] } }]
      });

      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: 'I need help with the login bug in my authentication system' },
        bus: mockBus,
      };

      const result = await kernelAgent.run(ctx);

      expect(result.ok).toBe(true);
      expect(result.output).toBe('Fix authentication login bug');

      // Verify GeminiChat was called with consultant prompt
      expect(mockGeminiChat.sendMessage).toHaveBeenCalledWith(
        { message: expect.stringContaining('You are an AI consultant helping to clarify user requests') },
        "kernel-consultant-analysis"
      );

      // Verify the user input was included in the prompt
      expect(mockGeminiChat.sendMessage).toHaveBeenCalledWith(
        { message: expect.stringContaining('I need help with the login bug in my authentication system') },
        "kernel-consultant-analysis"
      );

      // Verify event publishing for clarified task
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'agent-start',
        payload: { id: AgentType.KERNEL }
      }));
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'log',
        payload: 'Clarified task: Fix authentication login bug'
      }));
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'agent-end',
        payload: { id: AgentType.KERNEL }
      }));

      // Should NOT publish agent-followup event
      expect(publishSpy).not.toHaveBeenCalledWith(expect.objectContaining({
        type: 'agent-followup'
      }));
    });

    it('should publish agent-followup event when response is a question', async () => {
      // Mock GeminiChat to return a follow-up question
      (mockGeminiChat.sendMessage as Mock).mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'What specific coding issue needs fixing?' }] } }]
      });

      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: 'I need help with my code' },
        bus: mockBus,
      };

      const result = await kernelAgent.run(ctx);

      expect(result.ok).toBe(true);
      expect(result.output).toBe('What specific coding issue needs fixing?');

      // Verify agent-followup event was published
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'agent-followup',
        payload: { 
          agent: AgentType.KERNEL, 
          question: 'What specific coding issue needs fixing?' 
        }
      }));

      // Verify log event for follow-up
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'log',
        payload: 'Follow-up question: What specific coding issue needs fixing?'
      }));

      // Should still publish agent-end
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

  describe('Mind loader integration', () => {
    it('should use loaded prompt when mind file is present', async () => {
      // Mock successful prompt loading
      mockLoadPrompt.mockResolvedValue('Custom AI consultant prompt from mind directory');
      
      // Mock GeminiChat to return a clarified task
      (mockGeminiChat.sendMessage as Mock).mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'Build web app' }] } }]
      });

      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: 'I want to create a website' },
        bus: mockBus,
      };

      const result = await kernelAgent.run(ctx);

      expect(result.ok).toBe(true);
      expect(result.output).toBe('Build web app');

      // Verify mindLoader was called with correct path
      expect(mockLoadPrompt).toHaveBeenCalledWith('packages/core/src/mind/kernel.consult.prompt.ts');

      // Verify GeminiChat was called with the loaded prompt
      expect(mockGeminiChat.sendMessage).toHaveBeenCalledWith(
        { message: expect.stringContaining('Custom AI consultant prompt from mind directory') },
        "kernel-consultant-analysis"
      );
    });

    it('should use fallback prompt when mind file is missing', async () => {
      // Mock failed prompt loading (file not found)
      mockLoadPrompt.mockResolvedValue(null);
      
      // Mock GeminiChat to return a clarified task
      (mockGeminiChat.sendMessage as Mock).mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'Create app' }] } }]
      });

      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: 'I want to build something' },
        bus: mockBus,
      };

      const result = await kernelAgent.run(ctx);

      expect(result.ok).toBe(true);
      expect(result.output).toBe('Create app');

      // Verify mindLoader was called
      expect(mockLoadPrompt).toHaveBeenCalledWith('packages/core/src/mind/kernel.consult.prompt.ts');

      // Verify GeminiChat was called with the fallback prompt
      expect(mockGeminiChat.sendMessage).toHaveBeenCalledWith(
        { message: expect.stringContaining('Rewrite user request in ≤50 chars.') },
        "kernel-consultant-analysis"
      );
    });

    it('should handle mind loader errors gracefully', async () => {
      // Mock prompt loading to return null (error handled gracefully by mindLoader)
      mockLoadPrompt.mockResolvedValue(null);
      
      // Mock GeminiChat to return a clarified task
      (mockGeminiChat.sendMessage as Mock).mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'Handle error' }] } }]
      });

      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: 'test error handling' },
        bus: mockBus,
      };

      const result = await kernelAgent.run(ctx);

      expect(result.ok).toBe(true);
      expect(result.output).toBe('Handle error');

      // Verify mindLoader was called
      expect(mockLoadPrompt).toHaveBeenCalledWith('packages/core/src/mind/kernel.consult.prompt.ts');

      // Verify GeminiChat was called with the fallback prompt
      expect(mockGeminiChat.sendMessage).toHaveBeenCalledWith(
        { message: expect.stringContaining('Rewrite user request in ≤50 chars.') },
        "kernel-consultant-analysis"
      );
    });
  });
});
