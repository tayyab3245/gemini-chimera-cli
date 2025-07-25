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
import * as broker from '../context/broker.js';

// Mock the context broker
vi.mock('../context/broker.js', () => ({
  buildContextSlice: vi.fn(),
}));

describe('KernelAgent', () => {
  let kernelAgent: KernelAgent;
  let mockBus: ChimeraEventBus;
  let mockGeminiChat: GeminiChat;
  let publishSpy: Mock;
  let buildContextSliceMock: Mock;

  beforeEach(() => {
    mockBus = new ChimeraEventBus();
    publishSpy = vi.spyOn(mockBus, 'publish') as Mock;
    
    // Create mock GeminiChat
    mockGeminiChat = {
      sendMessage: vi.fn().mockResolvedValue({ text: () => 'ACK' })
    } as any;
    
    kernelAgent = new KernelAgent(mockBus, mockGeminiChat);
    buildContextSliceMock = vi.mocked(broker.buildContextSlice);
    buildContextSliceMock.mockClear();
    publishSpy.mockClear();
  });

  describe('happy path - clarification', () => {
    it('should process valid user input and return clarified requirements', async () => {
      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: 'Please create a TypeScript function that reads a JSON file and validates the data structure' },
        bus: mockBus,
      };

      const result = await kernelAgent.run(ctx);

      expect(result.ok).toBe(true);
      expect(result.output).toBeDefined();
      expect(result.output!.clarifiedUserInput).toContain('Create a TypeScript function');
      expect(result.output!.assumptions).toContain('Working with file system or code modifications');
      expect(result.output!.assumptions).toContain('Data processing or transformation required');
      expect(result.output!.constraints).toContain('TypeScript language requirement');

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

      // Verify context building
      expect(buildContextSliceMock).toHaveBeenCalledWith(AgentType.SYNTH, expect.objectContaining({
        userInput: expect.stringContaining('Create a TypeScript function'),
        assumptions: expect.arrayContaining(['Working with file system or code modifications']),
        constraints: expect.arrayContaining(['TypeScript language requirement']),
      }));
    });

    it('should extract multiple assumptions and constraints', async () => {
      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: 'Build a quick API endpoint that processes JSON data without breaking existing tests and maintains compatibility' },
        bus: mockBus,
      };

      const result = await kernelAgent.run(ctx);

      expect(result.ok).toBe(true);
      expect(result.output!.assumptions).toContain('API or web service interaction needed');
      expect(result.output!.assumptions).toContain('Data processing or transformation required');
      expect(result.output!.assumptions).toContain('Testing functionality is required');
      expect(result.output!.constraints).toContain('Quick/simple solution preferred');
      expect(result.output!.constraints).toContain('Certain approaches should be avoided');
    });
  });

  describe('follow-up question path', () => {
    it('should request clarification for short input (< 15 tokens)', async () => {
      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: 'help me code' },
        bus: mockBus,
      };

      const result = await kernelAgent.run(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Could you specify the desired output format');
      expect(result.output).toBeUndefined();

      // Should still publish agent-start and agent-end
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'agent-start',
        payload: { id: AgentType.KERNEL }
      }));
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'agent-end',
        payload: { id: AgentType.KERNEL }
      }));
    });

    it('should request clarification for input with question marks', async () => {
      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: 'What should I do to make this application work better and more efficiently?' },
        bus: mockBus,
      };

      const result = await kernelAgent.run(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Could you specify the desired output format');
    });

    it('should request clarification for input with ellipsis', async () => {
      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: 'I need to implement something... not sure what exactly' },
        bus: mockBus,
      };

      const result = await kernelAgent.run(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Could you specify the desired output format');
    });

    it('should request clarification for help requests', async () => {
      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: 'I need help with my TypeScript project and would like some guidance' },
        bus: mockBus,
      };

      const result = await kernelAgent.run(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Could you specify the desired output format');
    });
  });

  describe('error path', () => {
    it('should handle exceptions and publish error events', async () => {
      // Mock buildContextSlice to throw an error
      buildContextSliceMock.mockImplementation(() => {
        throw new Error('Context building failed');
      });

      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: 'Create a comprehensive TypeScript function that reads a JSON file validates the data structure and performs complex transformations' },
        bus: mockBus,
      };

      const result = await kernelAgent.run(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Context building failed');
      expect(result.output).toBeUndefined();

      // Verify error event was published
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'error',
        payload: {
          agent: 'KERNEL',
          message: 'Context building failed'
        }
      }));

      // Should still publish agent-end
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'agent-end',
        payload: { id: AgentType.KERNEL }
      }));
    });

    it('should handle non-Error exceptions', async () => {
      // Mock buildContextSlice to throw a non-Error object
      buildContextSliceMock.mockImplementation(() => {
        throw 'String error';
      });

      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: 'Create a comprehensive TypeScript function that reads a JSON file validates the data structure and performs complex transformations' },
        bus: mockBus,
      };

      const result = await kernelAgent.run(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Unknown error during kernel processing');

      // Verify error event was published
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'error',
        payload: {
          agent: 'KERNEL',
          message: 'Unknown error during kernel processing'
        }
      }));
    });
  });

  describe('input processing methods', () => {
    it('should clarify input by removing redundant words', async () => {
      // Reset the mock to ensure clean state
      buildContextSliceMock.mockReset();
      buildContextSliceMock.mockReturnValue(undefined);
      
      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: 'Please could you create a TypeScript function that reads a JSON file and validates the data structure correctly' },
        bus: mockBus,
      };

      const result = await kernelAgent.run(ctx);

      expect(result.ok).toBe(true);
      expect(result.output!.clarifiedUserInput).toBe('Create a TypeScript function that reads a JSON file and validates the data structure correctly.');
    });

    it('should handle empty or whitespace input gracefully', async () => {
      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: '   ' },
        bus: mockBus,
      };

      const result = await kernelAgent.run(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Could you specify the desired output format');
    });
  });
});
