/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, type Mock } from 'vitest';
import type { GeminiChat } from '../core/geminiChat.js';
import { ChimeraEventBus } from '../event-bus/bus.js';

/**
 * Create a mock GeminiChat with configurable behavior
 */
export function createMockGeminiChat(): {
  mock: GeminiChat;
  sendMessage: Mock;
} {
  const sendMessage = vi.fn();
  const mock = { sendMessage } as unknown as GeminiChat;
  return { mock, sendMessage };
}

/**
 * Mock GeminiChat that always returns successful responses
 */
export function createSuccessfulGeminiChat(responseText: string): GeminiChat {
  return {
    sendMessage: vi.fn().mockResolvedValue({
      candidates: [{ 
        content: { 
          parts: [{ text: responseText }] 
        } 
      }]
    })
  } as unknown as GeminiChat;
}

/**
 * Mock GeminiChat that always throws errors
 */
export function createFailingGeminiChat(error: Error): GeminiChat {
  return {
    sendMessage: vi.fn().mockRejectedValue(error)
  } as unknown as GeminiChat;
}

/**
 * Mock GeminiChat that returns malformed responses
 */
export function createMalformedGeminiChat(): GeminiChat {
  return {
    sendMessage: vi.fn().mockResolvedValue({
      // Missing candidates array
      invalidResponse: true
    })
  } as unknown as GeminiChat;
}

/**
 * Mock GeminiChat that returns empty candidates
 */
export function createEmptyGeminiChat(): GeminiChat {
  return {
    sendMessage: vi.fn().mockResolvedValue({
      candidates: []
    })
  } as unknown as GeminiChat;
}

/**
 * Mock GeminiChat that returns null/undefined content
 */
export function createNullContentGeminiChat(): GeminiChat {
  return {
    sendMessage: vi.fn().mockResolvedValue({
      candidates: [{ 
        content: null 
      }]
    })
  } as unknown as GeminiChat;
}

/**
 * Mock GeminiChat that times out
 */
export function createTimeoutGeminiChat(delay: number = 5000): GeminiChat {
  return {
    sendMessage: vi.fn().mockImplementation(() => 
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), delay)
      )
    )
  } as unknown as GeminiChat;
}

/**
 * Mock GeminiChat that intermittently fails
 */
export function createIntermittentGeminiChat(
  successResponse: string, 
  failureRate: number = 0.5
): GeminiChat {
  let callCount = 0;
  
  return {
    sendMessage: vi.fn().mockImplementation(() => {
      callCount++;
      // Create deterministic pattern: fail on calls 1, 4, 7, 10 (every 3rd call + 1st)
      // This ensures we get failures on roughly 40% of calls in a predictable pattern
      const shouldFail = (callCount % 3 === 1) || (callCount % 10 === 0);
      
      if (shouldFail) {
        return Promise.reject(new Error('Intermittent 503 Service Unavailable'));
      }
      return Promise.resolve({
        candidates: [{ 
          content: { 
            parts: [{ text: successResponse }] 
          } 
        }]
      });
    })
  } as unknown as GeminiChat;
}

/**
 * Create a fresh event bus and capture all published events
 */
export function createEventCapture(): {
  bus: ChimeraEventBus;
  events: Array<{ type: string; payload: any; ts: number }>;
  getEventTypes: () => string[];
  getEventsByType: (type: string) => Array<{ type: string; payload: any; ts: number }>;
  reset: () => void;
} {
  const bus = new ChimeraEventBus();
  const events: Array<{ type: string; payload: any; ts: number }> = [];
  
  // Spy on publish to capture all events
  const originalPublish = bus.publish.bind(bus);
  vi.spyOn(bus, 'publish').mockImplementation((event) => {
    events.push({ ...event });
    return originalPublish(event);
  });

  return {
    bus,
    events,
    getEventTypes: () => events.map(e => e.type),
    getEventsByType: (type: string) => events.filter(e => e.type === type),
    reset: () => { events.length = 0; }
  };
}

/**
 * Utility to check for memory leaks in event bus subscriptions
 */
export function checkEventBusCleanup(bus: ChimeraEventBus): {
  hasListeners: boolean;
  listenerCount: number;
} {
  // Access internal state to check for cleanup
  const internalBus = bus as any;
  const listeners = internalBus._listeners || internalBus.listeners || {};
  const listenerCount = Object.keys(listeners).reduce((total, key) => {
    const eventListeners = listeners[key];
    return total + (Array.isArray(eventListeners) ? eventListeners.length : 0);
  }, 0);
  
  return {
    hasListeners: listenerCount > 0,
    listenerCount
  };
}

/**
 * Test case data structures for stress testing
 */
export interface StressTestCase {
  name: string;
  userInput: string;
  expectedConfidence: 'low' | 'high';
  expectedEventTypes: string[];
  expectedOutput?: string;
  geminiSetup?: (mock: Mock) => void;
  shouldThrow?: boolean;
}

/**
 * Standard test cases for stress testing KernelAgent
 */
export const STRESS_TEST_CASES: StressTestCase[] = [
  // Short/vague inputs (should trigger follow-up)
  {
    name: 'single word - hi',
    userInput: 'hi',
    expectedConfidence: 'high', // 1 token scores 0.76, above threshold
    expectedEventTypes: ['agent-start', 'progress', 'log', 'progress', 'log', 'progress', 'progress', 'log', 'agent-end']
  },
  {
    name: 'vague help request',
    userInput: 'help me',
    expectedConfidence: 'low',
    expectedEventTypes: ['agent-start', 'progress', 'log', 'progress', 'log', 'progress', 'progress', 'log', 'agent-followup', 'agent-end']
  },
  {
    name: 'empty input',
    userInput: '',
    expectedConfidence: 'high', // 0 tokens scores 0.7, above threshold
    expectedEventTypes: ['agent-start', 'progress', 'log', 'progress', 'log', 'progress', 'progress', 'log', 'agent-end']
  },
  {
    name: 'whitespace only',
    userInput: '   \t  \n  ',
    expectedConfidence: 'high', // 0 tokens after trim scores 0.7, above threshold  
    expectedEventTypes: ['agent-start', 'progress', 'log', 'progress', 'log', 'progress', 'progress', 'log', 'agent-end']
  },
  {
    name: 'make it better',
    userInput: 'make it better',
    expectedConfidence: 'low',
    expectedEventTypes: ['agent-start', 'progress', 'log', 'progress', 'log', 'progress', 'progress', 'log', 'agent-followup', 'agent-end']
  },
  
  // Clear/specific inputs (should trigger clarification)
  {
    name: 'specific bug report',
    userInput: 'fix the login authentication bug in the user module',
    expectedConfidence: 'high',
    expectedEventTypes: ['agent-start', 'progress', 'log', 'progress', 'log', 'progress', 'progress', 'log', 'agent-end']
  },
  {
    name: 'database query request',
    userInput: 'create a database query to fetch user profiles with active subscriptions',
    expectedConfidence: 'high',
    expectedEventTypes: ['agent-start', 'progress', 'log', 'progress', 'log', 'progress', 'progress', 'log', 'agent-end']
  },
  {
    name: 'API endpoint specification',
    userInput: 'implement REST API endpoint for user registration with email validation',
    expectedConfidence: 'high',
    expectedEventTypes: ['agent-start', 'progress', 'log', 'progress', 'log', 'progress', 'progress', 'log', 'agent-end']
  },
  {
    name: 'component development',
    userInput: 'build a React component for file upload with drag and drop functionality',
    expectedConfidence: 'high',
    expectedEventTypes: ['agent-start', 'progress', 'log', 'progress', 'log', 'progress', 'progress', 'log', 'agent-end']
  },
  {
    name: 'configuration task',
    userInput: 'configure the webpack build process to support TypeScript modules',
    expectedConfidence: 'high',
    expectedEventTypes: ['agent-start', 'progress', 'log', 'progress', 'log', 'progress', 'progress', 'log', 'agent-end']
  },
  
  // Edge cases
  {
    name: 'very long input',
    userInput: 'I need help with implementing a comprehensive authentication system that includes user registration email verification password reset functionality two factor authentication integration with social media platforms like Google and Facebook plus admin dashboard for user management and detailed audit logging for security compliance and performance monitoring with real time analytics and automated backup systems',
    expectedConfidence: 'low', // Contains many vague terms that reduce confidence
    expectedEventTypes: ['agent-start', 'progress', 'log', 'progress', 'log', 'progress', 'progress', 'log', 'agent-followup', 'agent-end']
  },
  {
    name: 'gibberish input',
    userInput: 'asdf qwerty 12345 !@#$% random nonsense text here',
    expectedConfidence: 'high', // Long enough to be considered clear
    expectedEventTypes: ['agent-start', 'progress', 'log', 'progress', 'log', 'progress', 'progress', 'log', 'agent-end']
  },
  {
    name: 'special characters',
    userInput: '!@#$%^&*()_+{}[]|\\:";\'<>?,./',
    expectedConfidence: 'high', // Token count matters more than content
    expectedEventTypes: ['agent-start', 'progress', 'log', 'progress', 'log', 'progress', 'progress', 'log', 'agent-end']
  },
  {
    name: 'mixed case with numbers',
    userInput: 'FiX ThE bUg In CoMpOnEnT123 WiTh ErRoR456',
    expectedConfidence: 'high',
    expectedEventTypes: ['agent-start', 'progress', 'log', 'progress', 'log', 'progress', 'progress', 'log', 'agent-end']
  },
  {
    name: 'unicode characters',
    userInput: 'créer une función para manejar données utilisateur 用户数据处理',
    expectedConfidence: 'high',
    expectedEventTypes: ['agent-start', 'progress', 'log', 'progress', 'log', 'progress', 'progress', 'log', 'agent-end']
  },
  
  // Borderline confidence cases
  {
    name: 'borderline 4 tokens',
    userInput: 'fix my app please',
    expectedConfidence: 'high', // 4 tokens, "fix" not vague, scores ~0.94, above threshold
    expectedEventTypes: ['agent-start', 'progress', 'log', 'progress', 'log', 'progress', 'progress', 'log', 'agent-end']
  },
  {
    name: 'borderline 5 tokens specific',
    userInput: 'debug authentication error bug',
    expectedConfidence: 'high', // 4 tokens but specific terms
    expectedEventTypes: ['agent-start', 'progress', 'log', 'progress', 'log', 'progress', 'progress', 'log', 'agent-end']
  },
  {
    name: 'medium length vague',
    userInput: 'help me work on something to make it better',
    expectedConfidence: 'low', // Multiple vague phrases
    expectedEventTypes: ['agent-start', 'progress', 'log', 'progress', 'log', 'progress', 'progress', 'log', 'agent-followup', 'agent-end']
  },
  {
    name: 'medium length specific',
    userInput: 'implement user authentication with JWT tokens',
    expectedConfidence: 'high', // Specific technical terms
    expectedEventTypes: ['agent-start', 'progress', 'log', 'progress', 'log', 'progress', 'progress', 'log', 'agent-end']
  }
];

/**
 * Error scenarios for stress testing
 */
export const ERROR_TEST_CASES: StressTestCase[] = [
  {
    name: 'network timeout error',
    userInput: 'fix the bug',
    expectedConfidence: 'low',
    expectedEventTypes: ['agent-start', 'progress', 'log', 'progress', 'log', 'progress', 'error', 'agent-end'],
    shouldThrow: true,
    geminiSetup: (mock) => mock.mockRejectedValue(new Error('Request timeout'))
  },
  {
    name: '503 service unavailable',
    userInput: 'create new feature',
    expectedConfidence: 'high',
    expectedEventTypes: ['agent-start', 'progress', 'log', 'progress', 'log', 'progress', 'error', 'agent-end'],
    shouldThrow: true,
    geminiSetup: (mock) => mock.mockRejectedValue(new Error('503 Service Unavailable'))
  },
  {
    name: '429 rate limit exceeded',
    userInput: 'optimize database performance',
    expectedConfidence: 'high',
    expectedEventTypes: ['agent-start', 'progress', 'log', 'progress', 'log', 'progress', 'error', 'agent-end'],
    shouldThrow: true,
    geminiSetup: (mock) => mock.mockRejectedValue(new Error('429 Too Many Requests'))
  },
  {
    name: 'malformed JSON response',
    userInput: 'update user interface',
    expectedConfidence: 'high',
    expectedEventTypes: ['agent-start', 'progress', 'log', 'progress', 'log', 'progress', 'progress', 'log', 'agent-followup', 'agent-end'],
    geminiSetup: (mock) => mock.mockResolvedValue({ invalidResponse: true })
  },
  {
    name: 'empty candidates array',
    userInput: 'build REST API',
    expectedConfidence: 'high',
    expectedEventTypes: ['agent-start', 'progress', 'log', 'progress', 'log', 'progress', 'progress', 'log', 'agent-end'],
    geminiSetup: (mock) => mock.mockResolvedValue({ candidates: [] })
  },
  {
    name: 'null content in response',
    userInput: 'configure webpack setup',
    expectedConfidence: 'high',
    expectedEventTypes: ['agent-start', 'progress', 'log', 'progress', 'log', 'progress', 'progress', 'log', 'agent-end'],
    geminiSetup: (mock) => mock.mockResolvedValue({ candidates: [{ content: null }] })
  }
];
