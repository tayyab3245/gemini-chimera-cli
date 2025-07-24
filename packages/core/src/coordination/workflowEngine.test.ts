import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChimeraEventBus } from '../event-bus/bus.js';
import { WorkflowEngine } from './workflowEngine.js';

// Mock the agent modules before importing them
vi.mock('../agents/kernel.js', () => ({
  KernelAgent: vi.fn()
}));
vi.mock('../agents/synth.js', () => ({
  SynthAgent: vi.fn()
}));
vi.mock('../agents/drive.js', () => ({
  DriveAgent: vi.fn()
}));
vi.mock('../agents/audit.js', () => ({
  AuditAgent: vi.fn()
}));
vi.mock('./workflow.js', () => ({
  WorkflowStateMachine: vi.fn(() => ({
    advance: vi.fn()
  }))
}));

import { KernelAgent } from '../agents/kernel.js';
import { SynthAgent } from '../agents/synth.js';
import { DriveAgent } from '../agents/drive.js';
import { AuditAgent } from '../agents/audit.js';

describe('WorkflowEngine Integration Tests', () => {
  let bus: ChimeraEventBus;
  let engine: WorkflowEngine;
  let publishedEvents: any[];

  beforeEach(() => {
    vi.clearAllMocks();
    publishedEvents = [];
    
    bus = {
      publish: vi.fn((event) => publishedEvents.push(event)),
      subscribe: vi.fn()
    } as any;

    // Setup default agent mocks
    vi.mocked(KernelAgent).mockImplementation(() => ({
      run: vi.fn().mockResolvedValue({ ok: true })
    }) as any);
    
    vi.mocked(SynthAgent).mockImplementation(() => ({
      run: vi.fn().mockResolvedValue({ ok: true })
    }) as any);
    
    vi.mocked(DriveAgent).mockImplementation(() => ({
      run: vi.fn().mockResolvedValue({ ok: true })
    }) as any);
    
    vi.mocked(AuditAgent).mockImplementation(() => ({
      run: vi.fn().mockResolvedValue({ ok: true })
    }) as any);

    engine = new WorkflowEngine(bus);
  });

  describe('Successful workflow execution', () => {
    it('should complete workflow with all agents succeeding', async () => {
      await engine.run('test input');

      // Verify workflow completed
      expect(publishedEvents).toContainEqual(
        expect.objectContaining({
          type: 'log',
          payload: 'workflow-start'
        })
      );
      expect(publishedEvents).toContainEqual(
        expect.objectContaining({
          type: 'log', 
          payload: 'workflow-complete'
        })
      );
    });
  });

  describe('Retry functionality', () => {
    it('should retry when DriveAgent fails twice then succeeds', async () => {
      let driveCallCount = 0;
      vi.mocked(DriveAgent).mockImplementation(() => ({
        run: vi.fn().mockImplementation(async () => {
          driveCallCount++;
          if (driveCallCount <= 2) {
            throw new Error(`Drive failure ${driveCallCount}`);
          }
          return { ok: true };
        })
      }) as any);

      engine = new WorkflowEngine(bus);
      await engine.run('test input');

      // Verify DriveAgent was called 3 times (1 initial + 2 retries)
      expect(driveCallCount).toBe(3);

      // Verify workflow completed successfully
      expect(publishedEvents).toContainEqual(
        expect.objectContaining({
          type: 'log',
          payload: 'workflow-complete'
        })
      );
    });

    it('should publish error event and abort workflow when agent fails all retries', async () => {
      vi.mocked(SynthAgent).mockImplementation(() => ({
        run: vi.fn().mockRejectedValue(new Error('Synth permanently failed'))
      }) as any);

      engine = new WorkflowEngine(bus);
      
      await expect(engine.run('test input')).rejects.toThrow('Synth permanently failed');

      // Verify error event was published
      expect(publishedEvents).toContainEqual(
        expect.objectContaining({
          type: 'error',
          payload: expect.objectContaining({
            agent: 'SYNTH',
            message: 'Synth permanently failed'
          })
        })
      );
    });
  });

  describe('Agent result validation', () => {
    it('should fail when agent returns ok:false', async () => {
      vi.mocked(KernelAgent).mockImplementation(() => ({
        run: vi.fn().mockResolvedValue({ 
          ok: false, 
          error: 'Kernel processing failed' 
        })
      }) as any);

      engine = new WorkflowEngine(bus);
      
      await expect(engine.run('test input')).rejects.toThrow('Kernel processing failed');

      // Verify error event was published
      expect(publishedEvents).toContainEqual(
        expect.objectContaining({
          type: 'error',
          payload: expect.objectContaining({
            agent: 'KERNEL',
            message: 'Kernel processing failed'
          })
        })
      );
    });
  });
});