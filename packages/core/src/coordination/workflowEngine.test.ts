import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChimeraEventBus } from '../event-bus/bus.js';
import { WorkflowEngine } from './workflowEngine.js';
import { ToolRegistry } from '../tools/tool-registry.js';

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
  let mockToolRegistry: ToolRegistry;
  let publishedEvents: any[];

  beforeEach(() => {
    vi.clearAllMocks();
    publishedEvents = [];
    
    bus = {
      publish: vi.fn((event) => publishedEvents.push(event)),
      subscribe: vi.fn()
    } as any;

    // Create mock tool registry  
    mockToolRegistry = {
      getTool: vi.fn().mockImplementation((toolName: string) => {
        if (toolName === 'write_file') {
          return {
            execute: vi.fn().mockResolvedValue({ success: true })
          };
        }
        if (toolName === 'exec_shell') {
          return {
            execute: vi.fn().mockResolvedValue({ success: true })
          };
        }
        return null;
      })
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

    engine = new WorkflowEngine(bus, mockToolRegistry);
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

      engine = new WorkflowEngine(bus, mockToolRegistry);
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

      engine = new WorkflowEngine(bus, mockToolRegistry);
      
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

  describe('P3.12-DRIVE: ToolRegistry Integration', () => {
    it('should inject ToolRegistry into DriveAgent context and execute 3-step plan', async () => {
      let capturedContext: any = null;
      
      // Mock DriveAgent to capture the context it receives
      vi.mocked(DriveAgent).mockImplementation(() => ({
        run: vi.fn().mockImplementation(async (context) => {
          capturedContext = context;
          return { 
            ok: true, 
            output: { 
              artifacts: ['package.json', 'npm install', 'npm test'] 
            } 
          };
        })
      }) as any);

      engine = new WorkflowEngine(bus, mockToolRegistry);
      await engine.run('test input');

      // Verify ToolRegistry was injected into DriveAgent context
      expect(capturedContext).not.toBeNull();
      expect(capturedContext.dependencies).toBeDefined();
      expect(capturedContext.dependencies.toolRegistry).toBe(mockToolRegistry);
    });

    it('should handle DriveAgent with write/run/test commands and progress events', async () => {
      const progressEvents: any[] = [];
      
      // Mock DriveAgent to simulate multi-command execution with progress
      vi.mocked(DriveAgent).mockImplementation(() => ({
        run: vi.fn().mockImplementation(async (context) => {
          // Simulate progress events for 3 commands: write, run, test
          context.bus.publish({ type: 'progress', payload: { percent: 0 } });
          context.bus.publish({ type: 'progress', payload: { percent: 33 } });
          context.bus.publish({ type: 'progress', payload: { percent: 67 } });
          context.bus.publish({ type: 'progress', payload: { percent: 100 } });
          
          return { 
            ok: true, 
            output: { 
              artifacts: ['package.json', 'npm install', 'npm test'] 
            } 
          };
        })
      }) as any);

      engine = new WorkflowEngine(bus, mockToolRegistry);
      await engine.run('test input');

      // Verify progress events were emitted
      const emittedProgressEvents = publishedEvents.filter(e => e.type === 'progress');
      expect(emittedProgressEvents).toHaveLength(4);
      expect(emittedProgressEvents.map(e => e.payload.percent)).toEqual([0, 33, 67, 100]);
    });

    it('should verify ToolRegistry tools are accessible to DriveAgent', async () => {
      let toolRegistryUsed: any = null;
      
      // Mock DriveAgent to simulate tool usage
      vi.mocked(DriveAgent).mockImplementation(() => ({
        run: vi.fn().mockImplementation(async (context) => {
          toolRegistryUsed = context.dependencies.toolRegistry;
          
          // Simulate calling getTool like real DriveAgent would
          const writeTool = toolRegistryUsed.getTool('write_file');
          const execTool = toolRegistryUsed.getTool('exec_shell');
          
          expect(writeTool).toBeTruthy();
          expect(execTool).toBeTruthy();
          
          return { 
            ok: true, 
            output: { 
              artifacts: ['file.txt', 'command executed'] 
            } 
          };
        })
      }) as any);

      engine = new WorkflowEngine(bus, mockToolRegistry);
      await engine.run('test input');

      // Verify tool registry was used
      expect(toolRegistryUsed).toBe(mockToolRegistry);
      expect(mockToolRegistry.getTool).toHaveBeenCalledWith('write_file');
      expect(mockToolRegistry.getTool).toHaveBeenCalledWith('exec_shell');
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

      engine = new WorkflowEngine(bus, mockToolRegistry);
      
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