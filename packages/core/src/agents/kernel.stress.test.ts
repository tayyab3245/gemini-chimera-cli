/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { KernelAgent } from './kernel.js';
import { AgentType } from '../event-bus/types.js';
import type { AgentContext } from './agent.js';
import * as mindLoader from '../utils/mindLoader.js';
import {
  createEventCapture,
  createSuccessfulGeminiChat,
  createFailingGeminiChat,
  createMalformedGeminiChat,
  createEmptyGeminiChat,
  createNullContentGeminiChat,
  createTimeoutGeminiChat,
  createIntermittentGeminiChat,
  checkEventBusCleanup,
  STRESS_TEST_CASES,
  ERROR_TEST_CASES,
  type StressTestCase
} from '../utils/testHelpers.js';

// Mock the mindLoader module
vi.mock('../utils/mindLoader.js', () => ({
  loadPrompt: vi.fn()
}));

describe('KernelAgent Stress Test Suite', () => {
  let kernelAgent: KernelAgent;
  let eventCapture: ReturnType<typeof createEventCapture>;
  let mockLoadPrompt: Mock;

  beforeEach(() => {
    eventCapture = createEventCapture();
    mockLoadPrompt = vi.mocked(mindLoader.loadPrompt);
    
    // Setup default prompt responses
    mockLoadPrompt.mockImplementation((path: string) => {
      if (path.includes('followup')) {
        return Promise.resolve('What specific task would you like help with?');
      } else {
        return Promise.resolve('Rewrite user request in ≤50 chars.');
      }
    });
  });

  describe('Confidence scoring and decision matrix', () => {
    it.each(STRESS_TEST_CASES.slice(0, 20))('should handle input: $name', async (testCase: StressTestCase) => {
      // Setup GeminiChat based on expected confidence
      const expectedResponse = testCase.expectedConfidence === 'low' 
        ? 'Could you provide more specific details about what you need?'
        : 'Clarified: ' + testCase.userInput.substring(0, 30);
      
      if (testCase.geminiSetup) {
        const mockGeminiChat = { sendMessage: vi.fn() };
        testCase.geminiSetup(mockGeminiChat.sendMessage);
        kernelAgent = new KernelAgent(eventCapture.bus, mockGeminiChat as any);
      } else {
        const mockGeminiChat = createSuccessfulGeminiChat(expectedResponse);
        kernelAgent = new KernelAgent(eventCapture.bus, mockGeminiChat);
      }

      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: testCase.userInput },
        bus: eventCapture.bus,
      };

      eventCapture.reset();
      const result = await kernelAgent.run(ctx);

      // Verify successful execution
      expect(result.ok).toBe(true);
      if (!testCase.shouldThrow) {
        expect(result.output).toBeDefined();
      }

      // Verify event types match expected pattern
      const actualEventTypes = eventCapture.getEventTypes();
      expect(actualEventTypes).toEqual(testCase.expectedEventTypes);

      // Verify confidence-specific behaviors
      if (testCase.expectedConfidence === 'low') {
        const followupEvents = eventCapture.getEventsByType('agent-followup');
        expect(followupEvents).toHaveLength(1);
        expect(followupEvents[0].payload.agent).toBe(AgentType.KERNEL);
        expect(followupEvents[0].payload.question).toBeDefined();
      }

      // Verify proper agent lifecycle
      const startEvents = eventCapture.getEventsByType('agent-start');
      const endEvents = eventCapture.getEventsByType('agent-end');
      expect(startEvents).toHaveLength(1);
      expect(endEvents).toHaveLength(1);
      expect(startEvents[0].payload.id).toBe(AgentType.KERNEL);
      expect(endEvents[0].payload.id).toBe(AgentType.KERNEL);

      // Verify progress events
      const progressEvents = eventCapture.getEventsByType('progress');
      expect(progressEvents.length).toBeGreaterThanOrEqual(3);
      expect(progressEvents[0].payload.percent).toBe(25);
      expect(progressEvents[progressEvents.length - 1].payload.percent).toBe(100);

      // Check for memory leaks
      const cleanup = checkEventBusCleanup(eventCapture.bus);
      expect(cleanup.hasListeners).toBe(false);
    });
  });

  describe('Error resilience and fault tolerance', () => {
    it.each(ERROR_TEST_CASES)('should handle error scenario: $name', async (testCase: StressTestCase) => {
      // Setup failing GeminiChat
      let mockGeminiChat: any;
      if (testCase.geminiSetup) {
        mockGeminiChat = { sendMessage: vi.fn() };
        testCase.geminiSetup(mockGeminiChat.sendMessage);
      } else {
        mockGeminiChat = createFailingGeminiChat(new Error('Generic test error'));
      }

      kernelAgent = new KernelAgent(eventCapture.bus, mockGeminiChat);

      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: testCase.userInput },
        bus: eventCapture.bus,
      };

      eventCapture.reset();
      const result = await kernelAgent.run(ctx);

      if (testCase.shouldThrow) {
        // Should return error result
        expect(result.ok).toBe(false);
        expect(result.error).toBeDefined();

        // Should publish error event
        const errorEvents = eventCapture.getEventsByType('error');
        expect(errorEvents).toHaveLength(1);
        expect(errorEvents[0].payload.agent).toBe(AgentType.KERNEL);
        expect(errorEvents[0].payload.message).toBeDefined();
      } else {
        // Should handle gracefully with fallback
        expect(result.ok).toBe(true);
        expect(result.output).toBeDefined();
      }

      // Verify event pattern matches expected
      const actualEventTypes = eventCapture.getEventTypes();
      expect(actualEventTypes).toEqual(testCase.expectedEventTypes);

      // Verify proper cleanup even after errors
      const startEvents = eventCapture.getEventsByType('agent-start');
      const endEvents = eventCapture.getEventsByType('agent-end');
      expect(startEvents).toHaveLength(1);
      expect(endEvents).toHaveLength(1);

      // Check for memory leaks after errors
      const cleanup = checkEventBusCleanup(eventCapture.bus);
      expect(cleanup.hasListeners).toBe(false);
    });
  });

  describe('Timeout and intermittent failure scenarios', () => {
    it('should handle request timeouts gracefully', async () => {
      const timeoutGeminiChat = createTimeoutGeminiChat(100); // Quick timeout for test
      kernelAgent = new KernelAgent(eventCapture.bus, timeoutGeminiChat);

      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: 'fix the authentication bug' },
        bus: eventCapture.bus,
      };

      eventCapture.reset();
      const result = await kernelAgent.run(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('timeout');

      // Should publish error event with stack trace
      const errorEvents = eventCapture.getEventsByType('error');
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].payload.stack).toBeDefined();

      // Verify proper cleanup after timeout
      const cleanup = checkEventBusCleanup(eventCapture.bus);
      expect(cleanup.hasListeners).toBe(false);
    });

    it('should handle intermittent failures correctly', async () => {
      const intermittentGeminiChat = createIntermittentGeminiChat('Task clarified successfully', 0.8);
      kernelAgent = new KernelAgent(eventCapture.bus, intermittentGeminiChat);

      const results: Array<{ ok: boolean; error?: string; output?: string }> = [];
      
      // Run multiple attempts to test intermittent behavior
      for (let i = 0; i < 10; i++) {
        const ctx: AgentContext<{ userInput: string }> = {
          input: { userInput: `test request ${i}` },
          bus: eventCapture.bus,
        };

        eventCapture.reset();
        const result = await kernelAgent.run(ctx);
        results.push(result);

        // Each attempt should properly start and end
        const startEvents = eventCapture.getEventsByType('agent-start');
        const endEvents = eventCapture.getEventsByType('agent-end');
        expect(startEvents).toHaveLength(1);
        expect(endEvents).toHaveLength(1);
      }

      // Should have some successes and some failures
      const successes = results.filter(r => r.ok);
      const failures = results.filter(r => !r.ok);
      
      expect(successes.length).toBeGreaterThan(0);
      expect(failures.length).toBeGreaterThan(0);
      expect(successes.length + failures.length).toBe(10);

      // Final cleanup check
      const cleanup = checkEventBusCleanup(eventCapture.bus);
      expect(cleanup.hasListeners).toBe(false);
    });
  });

  describe('Response format validation', () => {
    it('should handle malformed Gemini responses', async () => {
      const malformedGeminiChat = createMalformedGeminiChat();
      kernelAgent = new KernelAgent(eventCapture.bus, malformedGeminiChat);

      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: 'create a new API endpoint' },
        bus: eventCapture.bus,
      };

      eventCapture.reset();
      const result = await kernelAgent.run(ctx);

      // Should handle gracefully with fallback response
      expect(result.ok).toBe(true);
      expect(result.output).toBe('Process user request'); // Default fallback

      // Should not emit error events for malformed responses
      const errorEvents = eventCapture.getEventsByType('error');
      expect(errorEvents).toHaveLength(0);
    });

    it('should handle empty candidates array', async () => {
      const emptyGeminiChat = createEmptyGeminiChat();
      kernelAgent = new KernelAgent(eventCapture.bus, emptyGeminiChat);

      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: 'optimize database queries' },
        bus: eventCapture.bus,
      };

      eventCapture.reset();
      const result = await kernelAgent.run(ctx);

      expect(result.ok).toBe(true);
      expect(result.output).toBe('Could you provide more details?'); // Empty candidates fallback for vague input
    });

    it('should handle null content in response', async () => {
      const nullContentGeminiChat = createNullContentGeminiChat();
      kernelAgent = new KernelAgent(eventCapture.bus, nullContentGeminiChat);

      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: 'build React component' },
        bus: eventCapture.bus,
      };

      eventCapture.reset();
      const result = await kernelAgent.run(ctx);

      expect(result.ok).toBe(true);
      expect(result.output).toBe('Process user request'); // Default fallback
    });
  });

  describe('Edge case inputs and boundary conditions', () => {
    const edgeCases = [
      { name: 'extremely long input', input: 'a'.repeat(10000) },
      { name: 'input with only punctuation', input: '!@#$%^&*()_+{}[]|\\:";\'<>?,./' },
      { name: 'input with emoji', input: '🚀 fix the 🐛 in my 💻 code' },
      { name: 'input with newlines', input: 'fix\nthe\nbug\nin\nmy\ncode' },
      { name: 'input with tabs', input: 'fix\tthe\tbug\tin\tmy\tcode' },
      { name: 'input with mixed whitespace', input: ' \t fix   the  \n bug \r\n ' },
      { name: 'single character', input: 'a' },
      { name: 'numeric input', input: '12345 67890 11111' },
      { name: 'html tags', input: '<div>fix the bug</div>' },
      { name: 'json-like input', input: '{"task": "fix bug", "priority": "high"}' }
    ];

    it.each(edgeCases)('should handle edge case: $name', async ({ input }) => {
      const mockGeminiChat = createSuccessfulGeminiChat('Handled successfully');
      kernelAgent = new KernelAgent(eventCapture.bus, mockGeminiChat);

      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: input },
        bus: eventCapture.bus,
      };

      eventCapture.reset();
      const result = await kernelAgent.run(ctx);

      // Should not crash on any input
      expect(result.ok).toBe(true);
      expect(result.output).toBeDefined();

      // Should emit proper event sequence
      const eventTypes = eventCapture.getEventTypes();
      expect(eventTypes).toContain('agent-start');
      expect(eventTypes).toContain('agent-end');
      expect(eventTypes).toContain('progress');

      // Should properly clean up
      const cleanup = checkEventBusCleanup(eventCapture.bus);
      expect(cleanup.hasListeners).toBe(false);
    });
  });

  describe('No GeminiChat fallback behavior', () => {
    it('should work without GeminiChat instance', async () => {
      // Create KernelAgent without GeminiChat
      kernelAgent = new KernelAgent(eventCapture.bus);

      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: 'test fallback behavior' },
        bus: eventCapture.bus,
      };

      eventCapture.reset();
      const result = await kernelAgent.run(ctx);

      expect(result.ok).toBe(true);
      expect(result.output).toBe('Process user request');

      // Should emit proper events even in fallback mode
      const eventTypes = eventCapture.getEventTypes();
      expect(eventTypes).toEqual(['agent-start', 'progress', 'log', 'progress', 'log', 'progress', 'progress', 'log', 'agent-end']);

      // No error events should be emitted
      const errorEvents = eventCapture.getEventsByType('error');
      expect(errorEvents).toHaveLength(0);
    });
  });

  describe('Event bus hygiene and memory leak prevention', () => {
    it('should not leak event listeners across multiple runs', async () => {
      const mockGeminiChat = createSuccessfulGeminiChat('Test response');
      kernelAgent = new KernelAgent(eventCapture.bus, mockGeminiChat);

      // Run agent multiple times
      for (let i = 0; i < 5; i++) {
        const ctx: AgentContext<{ userInput: string }> = {
          input: { userInput: `test run ${i}` },
          bus: eventCapture.bus,
        };

        eventCapture.reset();
        await kernelAgent.run(ctx);

        // Check for memory leaks after each run
        const cleanup = checkEventBusCleanup(eventCapture.bus);
        expect(cleanup.hasListeners).toBe(false);
      }
    });

    it('should emit events with proper timestamps', async () => {
      const mockGeminiChat = createSuccessfulGeminiChat('Timestamped response');
      kernelAgent = new KernelAgent(eventCapture.bus, mockGeminiChat);

      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: 'test timestamps' },
        bus: eventCapture.bus,
      };

      const startTime = Date.now();
      eventCapture.reset();
      await kernelAgent.run(ctx);
      const endTime = Date.now();

      // All events should have timestamps within the execution window
      eventCapture.events.forEach(event => {
        expect(event.ts).toBeGreaterThanOrEqual(startTime);
        expect(event.ts).toBeLessThanOrEqual(endTime);
      });

      // Events should be in chronological order
      for (let i = 1; i < eventCapture.events.length; i++) {
        expect(eventCapture.events[i].ts).toBeGreaterThanOrEqual(eventCapture.events[i - 1].ts);
      }
    });

    it('should emit events with correct payload structures', async () => {
      const mockGeminiChat = createSuccessfulGeminiChat('Structured response');
      kernelAgent = new KernelAgent(eventCapture.bus, mockGeminiChat);

      const ctx: AgentContext<{ userInput: string }> = {
        input: { userInput: 'validate event payload structures' },
        bus: eventCapture.bus,
      };

      eventCapture.reset();
      await kernelAgent.run(ctx);

      // Validate agent-start event
      const startEvents = eventCapture.getEventsByType('agent-start');
      expect(startEvents[0].payload).toEqual({ id: AgentType.KERNEL });

      // Validate progress events
      const progressEvents = eventCapture.getEventsByType('progress');
      progressEvents.forEach(event => {
        expect(event.payload).toHaveProperty('percent');
        expect(typeof event.payload.percent).toBe('number');
        expect(event.payload.percent).toBeGreaterThanOrEqual(0);
        expect(event.payload.percent).toBeLessThanOrEqual(100);
      });

      // Validate log events
      const logEvents = eventCapture.getEventsByType('log');
      logEvents.forEach(event => {
        expect(typeof event.payload).toBe('string');
        expect(event.payload.length).toBeGreaterThan(0);
      });

      // Validate agent-end event
      const endEvents = eventCapture.getEventsByType('agent-end');
      expect(endEvents[0].payload).toEqual({ id: AgentType.KERNEL });
    });
  });
});
