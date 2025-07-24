/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { SynthAgent } from './synth.js';
import { ChimeraEventBus } from '../event-bus/bus.js';
import { AgentType } from '../event-bus/types.js';
import type { AgentContext } from './agent.js';

describe('SynthAgent', () => {
  let synthAgent: SynthAgent;
  let mockBus: ChimeraEventBus;
  let publishSpy: Mock;

  beforeEach(() => {
    mockBus = new ChimeraEventBus();
    publishSpy = vi.spyOn(mockBus, 'publish') as Mock;
    synthAgent = new SynthAgent(mockBus);
  });

  describe('happy path - plan generation', () => {
    it('should generate a plan with 1-5 steps and proper structure', async () => {
      const ctx: AgentContext<{ clarifiedUserInput: string; assumptions: string[]; constraints: string[] }> = {
        input: {
          clarifiedUserInput: 'Create a TypeScript function that reads a JSON file and validates the data structure',
          assumptions: ['Working with file system', 'TypeScript environment available'],
          constraints: ['Must be type-safe', 'Should handle errors gracefully']
        },
        bus: mockBus,
      };

      const result = await synthAgent.run(ctx);

      expect(result.ok).toBe(true);
      expect(result.output).toBeDefined();
      expect(result.output!.planJson).toBeDefined();

      // Parse and validate the plan structure
      const parsedPlan = JSON.parse(result.output!.planJson);
      expect(parsedPlan.task_id).toMatch(/^task-\d+$/);
      expect(parsedPlan.original_user_request).toBe(ctx.input.clarifiedUserInput);
      expect(parsedPlan.status).toBe('pending');
      expect(Array.isArray(parsedPlan.plan)).toBe(true);
      expect(parsedPlan.plan.length).toBeGreaterThanOrEqual(1);
      expect(parsedPlan.plan.length).toBeLessThanOrEqual(5);

      // Validate step structure
      parsedPlan.plan.forEach((step: any, index: number) => {
        expect(step.step_id).toBe(`S${index + 1}`);
        expect(step.description).toBeDefined();
        expect(typeof step.description).toBe('string');
        expect(step.description.length).toBeGreaterThan(0);
        expect(Array.isArray(step.depends_on)).toBe(true);
        expect(step.status).toBe('pending');
        expect(Array.isArray(step.artifacts)).toBe(true);
        expect(step.attempts).toBe(0);
        expect(step.max_attempts).toBe(3);

        // First step should have no dependencies
        if (index === 0) {
          expect(step.depends_on).toEqual([]);
        } else {
          expect(step.depends_on).toEqual([`S${index}`]);
        }
      });

      // Verify progress events were published
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'agent-start',
        payload: { id: AgentType.SYNTH }
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
        payload: { id: AgentType.SYNTH }
      }));
    });

    it('should generate plan steps with required verbs', async () => {
      const ctx: AgentContext<{ clarifiedUserInput: string; assumptions: string[]; constraints: string[] }> = {
        input: {
          clarifiedUserInput: 'Build a React component for user authentication with form validation and API integration',
          assumptions: ['React environment available', 'API endpoints exist'],
          constraints: ['Must be reusable', 'Should follow best practices']
        },
        bus: mockBus,
      };

      const result = await synthAgent.run(ctx);

      expect(result.ok).toBe(true);
      const parsedPlan = JSON.parse(result.output!.planJson);
      
      // Check that step descriptions start with required verbs
      const requiredVerbs = ['write', 'create', 'generate', 'run', 'test'];
      parsedPlan.plan.forEach((step: any) => {
        const startsWithRequiredVerb = requiredVerbs.some(verb => 
          step.description.toLowerCase().startsWith(verb)
        );
        expect(startsWithRequiredVerb).toBe(true);
      });
    });

    it('should handle complex input with multiple steps', async () => {
      const ctx: AgentContext<{ clarifiedUserInput: string; assumptions: string[]; constraints: string[] }> = {
        input: {
          clarifiedUserInput: 'Create a comprehensive web application with user authentication, data visualization, API integration, testing, and deployment pipeline',
          assumptions: ['Full-stack development needed', 'Multiple technologies required'],
          constraints: ['Must be scalable', 'Requires testing', 'Multiple phases needed']
        },
        bus: mockBus,
      };

      const result = await synthAgent.run(ctx);

      expect(result.ok).toBe(true);
      const parsedPlan = JSON.parse(result.output!.planJson);
      
      // Complex input should generate more steps
      expect(parsedPlan.plan.length).toBeGreaterThan(1);
      expect(parsedPlan.plan.length).toBeLessThanOrEqual(5);
    });

    it('should handle simple input with single step', async () => {
      const ctx: AgentContext<{ clarifiedUserInput: string; assumptions: string[]; constraints: string[] }> = {
        input: {
          clarifiedUserInput: 'Create a hello world function',
          assumptions: ['Simple task'],
          constraints: []
        },
        bus: mockBus,
      };

      const result = await synthAgent.run(ctx);

      expect(result.ok).toBe(true);
      const parsedPlan = JSON.parse(result.output!.planJson);
      
      // Simple input might generate just one step
      expect(parsedPlan.plan.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('error path', () => {
    it('should handle exceptions and publish error events', async () => {
      // Mock a method to throw an error
      const originalGeneratePlanSteps = synthAgent['generatePlanSteps'];
      synthAgent['generatePlanSteps'] = vi.fn().mockImplementation(() => {
        throw new Error('Planning algorithm failed');
      });

      const ctx: AgentContext<{ clarifiedUserInput: string; assumptions: string[]; constraints: string[] }> = {
        input: {
          clarifiedUserInput: 'Create something that will fail',
          assumptions: [],
          constraints: []
        },
        bus: mockBus,
      };

      const result = await synthAgent.run(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Planning failed: Planning algorithm failed');
      expect(result.output).toBeUndefined();

      // Should publish error event
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'error',
        payload: expect.objectContaining({
          agent: 'SYNTH',
          message: 'Planning algorithm failed'
        })
      }));

      // Should still publish agent-start and agent-end
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'agent-start',
        payload: { id: AgentType.SYNTH }
      }));
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'agent-end',
        payload: { id: AgentType.SYNTH }
      }));

      // Restore original method
      synthAgent['generatePlanSteps'] = originalGeneratePlanSteps;
    });

    it('should handle non-Error exceptions', async () => {
      // Mock a method to throw a non-Error
      synthAgent['generatePlanSteps'] = vi.fn().mockImplementation(() => {
        throw 'String error';
      });

      const ctx: AgentContext<{ clarifiedUserInput: string; assumptions: string[]; constraints: string[] }> = {
        input: {
          clarifiedUserInput: 'Create something that will fail with string error',
          assumptions: [],
          constraints: []
        },
        bus: mockBus,
      };

      const result = await synthAgent.run(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Planning failed: String error');

      // Should publish error event with string error
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'error',
        payload: expect.objectContaining({
          agent: 'SYNTH',
          message: 'Unknown planning error',
          details: 'String error'
        })
      }));
    });
  });

  describe('dependency chain validation', () => {
    it('should create proper dependency chain in multi-step plans', async () => {
      const ctx: AgentContext<{ clarifiedUserInput: string; assumptions: string[]; constraints: string[] }> = {
        input: {
          clarifiedUserInput: 'Create a multi-step application with testing and validation phases',
          assumptions: ['Multiple steps required'],
          constraints: ['Step-by-step approach', 'Dependencies must be respected']
        },
        bus: mockBus,
      };

      const result = await synthAgent.run(ctx);

      expect(result.ok).toBe(true);
      const parsedPlan = JSON.parse(result.output!.planJson);
      
      // Validate dependency chain
      parsedPlan.plan.forEach((step: any, index: number) => {
        if (index === 0) {
          // First step has no dependencies
          expect(step.depends_on).toEqual([]);
        } else {
          // Each subsequent step depends on the previous one
          expect(step.depends_on).toEqual([`S${index}`]);
        }
      });
    });
  });
});
