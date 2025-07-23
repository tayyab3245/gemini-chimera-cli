// packages/core/src/coordination/workflow.smoke.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowEngine, WorkflowState, advance } from './workflow.js';
import { AuditAgent } from '../agents/audit.js';
import { ChimeraEventBus } from '../event-bus/bus.js';

describe('Workflow Smoke Tests', () => {
  let engine: WorkflowEngine;
  
  beforeEach(() => {
    engine = new WorkflowEngine();
  });

  it('should complete basic workflow with valid input', async () => {
    const result = await engine.run({ userInput: 'Echo hello' });
    
    expect(result).toBeDefined();
    expect(typeof result.pass).toBe('boolean');
  });

  it('should handle state transitions correctly', () => {
    expect(advance(WorkflowState.INIT, 'start')).toBe(WorkflowState.PLANNING);
    expect(advance(WorkflowState.PLANNING, 'plan_ready')).toBe(WorkflowState.EXECUTING);
    expect(advance(WorkflowState.EXECUTING, 'execution_complete')).toBe(WorkflowState.REVIEW);
    expect(advance(WorkflowState.REVIEW, 'review_pass')).toBe(WorkflowState.DONE);
  });

  it('should throw error on illegal state transitions', () => {
    expect(() => advance(WorkflowState.INIT, 'invalid_event')).toThrow('illegal transition');
    expect(() => advance(WorkflowState.DONE, 'plan_ready')).toThrow('illegal transition');
  });

  describe('AuditAgent Integration', () => {
    let agent: AuditAgent;
    let bus: ChimeraEventBus;

    beforeEach(() => {
      bus = new ChimeraEventBus();
      agent = new AuditAgent(bus);
    });

    it('should fail with invalid JSON in planJson', async () => {
      const ctx = {
        input: {
          artifacts: ['valid artifact'],
          planJson: 'invalid json {'
        },
        bus
      };

      const result = await agent.run(ctx);

      expect(result.ok).toBe(true);
      expect((result as any).output.pass).toBe(false);
      expect((result as any).output.reasons).toContain('planJson is not valid JSON');
    });
  });
});
