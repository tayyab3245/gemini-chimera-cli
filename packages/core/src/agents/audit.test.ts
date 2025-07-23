// packages/core/src/agents/audit.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { AuditAgent } from './audit.js';
import { ChimeraEventBus } from '../event-bus/bus.js';

describe('AuditAgent', () => {
  let agent: AuditAgent;
  let bus: ChimeraEventBus;

  beforeEach(() => {
    bus = new ChimeraEventBus();
    agent = new AuditAgent(bus);
  });

  it('should pass valid artifacts and planJson', async () => {
    const ctx = {
      input: {
        artifacts: ['valid code', 'another artifact'],
        planJson: JSON.stringify({
          task_id: 'test-123',
          plan: 'Test plan',
          status: 'active'
        })
      },
      bus
    };

    const result = await agent.run(ctx);

    expect(result.ok).toBe(true);
    expect((result as any).output.pass).toBe(true);
    expect((result as any).output.reasons).toEqual([]);
  });

  it('should fail with empty artifacts', async () => {
    const ctx = {
      input: {
        artifacts: ['', '   ', 'valid artifact'],
        planJson: JSON.stringify({
          task_id: 'test-123',
          plan: 'Test plan',
          status: 'active'
        })
      },
      bus
    };

    const result = await agent.run(ctx);

    expect(result.ok).toBe(true);
    expect((result as any).output.pass).toBe(false);
    expect((result as any).output.reasons).toContain('Artifact 1 is empty or contains only whitespace');
    expect((result as any).output.reasons).toContain('Artifact 2 is empty or contains only whitespace');
  });

  it('should fail with missing required planJson keys', async () => {
    const ctx = {
      input: {
        artifacts: ['valid artifact'],
        planJson: JSON.stringify({
          task_id: 'test-123',
          // missing 'plan' and 'status'
        })
      },
      bus
    };

    const result = await agent.run(ctx);

    expect(result.ok).toBe(true);
    expect((result as any).output.pass).toBe(false);
    expect((result as any).output.reasons).toContain('planJson missing required key: "plan"');
    expect((result as any).output.reasons).toContain('planJson missing required key: "status"');
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

  it('should handle all validation failures together', async () => {
    const ctx = {
      input: {
        artifacts: ['', 'valid'],
        planJson: JSON.stringify({
          task_id: 'test-123'
          // missing 'plan' and 'status'
        })
      },
      bus
    };

    const result = await agent.run(ctx);

    expect(result.ok).toBe(true);
    expect((result as any).output.pass).toBe(false);
    expect((result as any).output.reasons).toHaveLength(3); // empty artifact + 2 missing keys
    expect((result as any).output.reasons).toContain('Artifact 1 is empty or contains only whitespace');
    expect((result as any).output.reasons).toContain('planJson missing required key: "plan"');
    expect((result as any).output.reasons).toContain('planJson missing required key: "status"');
  });
});
