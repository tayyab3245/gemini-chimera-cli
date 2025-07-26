import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChimeraEventBus } from '../event-bus/bus.js';
import { WorkflowEngine } from './workflowEngine.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import type { GeminiChat } from '../core/geminiChat.js';

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
  let mockGeminiChat: GeminiChat;
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

    // Create mock GeminiChat with correct response structure
    mockGeminiChat = {
      sendMessage: vi.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'Create a Node.js app' }] } }]
      })
    } as any;

    engine = new WorkflowEngine(bus, mockGeminiChat, mockToolRegistry);
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

    it('should execute consultant workflow through WorkflowEngine', async () => {
      // Note: This test runs with mocked agents but verifies the consultant workflow structure
      
      await engine.run('Build me a basic Node.js application with Express');

      // Verify that KernelAgent was executed (even if mocked)
      expect(publishedEvents).toContainEqual(
        expect.objectContaining({
          type: 'log',
          payload: 'agent-start-KERNEL'
        })
      );

      expect(publishedEvents).toContainEqual(
        expect.objectContaining({
          type: 'log',
          payload: 'agent-end-KERNEL'
        })
      );

      // Verify workflow completed successfully
      expect(publishedEvents).toContainEqual(
        expect.objectContaining({
          type: 'log',
          payload: 'workflow-complete'
        })
      );
    });

    it('should route Kernel output through ContextBroker to SYNTH', async () => {
      // Mock KernelAgent to return a result with output
      const mockKernelRun = vi.fn().mockResolvedValue({
        ok: true,
        output: 'Create a Node.js app' // This will be the clarified input
      });
      
      vi.mocked(KernelAgent).mockImplementation(() => ({
        run: mockKernelRun
      }) as any);

      // Mock SynthAgent to capture the context it receives
      let synthReceivedContext: any = null;
      const mockSynthRun = vi.fn().mockImplementation(async (ctx: any) => {
        synthReceivedContext = ctx.input;
        return { ok: true };
      });
      
      vi.mocked(SynthAgent).mockImplementation(() => ({
        run: mockSynthRun
      }) as any);

      // Create new engine and run workflow
      engine = new WorkflowEngine(bus, mockGeminiChat, mockToolRegistry);
      await engine.run('Build me a Node.js application with Express');

      // Verify that context slice preparation log was published
      expect(publishedEvents).toContainEqual(
        expect.objectContaining({
          type: 'log',
          payload: 'Context slice prepared for SYNTH'
        })
      );

      // Verify that SYNTH received the clarified input from Kernel
      expect(synthReceivedContext).toEqual(
        expect.objectContaining({
          clarifiedUserInput: 'Create a Node.js app', // This should be the clarified input
          assumptions: [],
          constraints: [],
          planJson: '{}'
        })
      );

      // Verify that forbidden fields like artifacts are absent from SYNTH context
      expect(synthReceivedContext).not.toHaveProperty('artifacts');
      expect(synthReceivedContext).not.toHaveProperty('planStep');
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

      engine = new WorkflowEngine(bus, mockGeminiChat, mockToolRegistry);
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

      engine = new WorkflowEngine(bus, mockGeminiChat, mockToolRegistry);
      
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

    it('should publish structured error event when KernelAgent fails with timeout', async () => {
      // Mock KernelAgent to simulate timeout failure
      vi.mocked(KernelAgent).mockImplementation(() => ({
        run: vi.fn().mockImplementation(async () => {
          // Simulate the actual error that would be published by KernelAgent
          const error = new Error('timeout');
          bus.publish({ 
            ts: Date.now(), 
            type: 'error', 
            payload: { 
              agent: 'KERNEL', 
              message: 'timeout',
              stack: error.stack
            } 
          });
          return { ok: false, error: 'timeout' };
        })
      }) as any);

      engine = new WorkflowEngine(bus, mockGeminiChat, mockToolRegistry);
      
      await expect(engine.run('test input')).rejects.toThrow();

      // Verify structured error event was published with timeout, message, and stack
      expect(publishedEvents).toContainEqual(
        expect.objectContaining({
          type: 'error',
          payload: expect.objectContaining({
            agent: 'KERNEL',
            message: 'timeout',
            stack: expect.any(String)
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

      engine = new WorkflowEngine(bus, mockGeminiChat, mockToolRegistry);
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

      engine = new WorkflowEngine(bus, mockGeminiChat, mockToolRegistry);
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

      engine = new WorkflowEngine(bus, mockGeminiChat, mockToolRegistry);
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

      engine = new WorkflowEngine(bus, mockGeminiChat, mockToolRegistry);
      
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

  describe('P3.14-SYNTH-ITEST: SynthAgent resilience integration', () => {
    it('should handle SynthAgent Gemini failures with retry logic and emit correct events', async () => {
      let geminiCallCount = 0;

      // Mock GeminiChat to fail twice then succeed
      mockGeminiChat.sendMessage = vi.fn().mockImplementation(async () => {
        geminiCallCount++;
        console.log(`GeminiChat.sendMessage called: ${geminiCallCount}`);
        if (geminiCallCount <= 2) {
          // First two calls fail with network errors
          throw new Error(`Network failure ${geminiCallCount}`);
        }
        // Third call succeeds with valid plan JSON
        return {
          candidates: [{
            content: {
              parts: [{
                text: `[
                  {"step_id": "S1", "description": "create initial implementation", "depends_on": [], "status": "pending", "artifacts": [], "attempts": 0, "max_attempts": 3},
                  {"step_id": "S2", "description": "add error handling", "depends_on": ["S1"], "status": "pending", "artifacts": [], "attempts": 0, "max_attempts": 3},
                  {"step_id": "S3", "description": "write comprehensive tests", "depends_on": ["S2"], "status": "pending", "artifacts": [], "attempts": 0, "max_attempts": 3}
                ]`
              }]
            }
          }]
        };
      });

      // Mock KernelAgent to provide input for SynthAgent
      vi.mocked(KernelAgent).mockImplementation(() => ({
        run: vi.fn().mockResolvedValue({
          ok: true,
          output: {
            clarifiedUserInput: 'Create a resilient function with error handling',
            assumptions: ['Error handling needed', 'Retry logic required'],
            constraints: ['Must be robust', 'Should handle timeouts']
          }
        })
      }) as any);

      // Clear the SynthAgent mock for this test to use the real implementation
      const { SynthAgent: ActualSynthAgent } = await vi.importActual('../agents/synth.js') as any;
      vi.mocked(SynthAgent).mockImplementation((eventBus, geminiChat) => {
        console.log('Creating SynthAgent with:', { eventBus: !!eventBus, geminiChat: !!geminiChat });
        return new ActualSynthAgent(eventBus, geminiChat);
      });

      engine = new WorkflowEngine(bus, mockGeminiChat, mockToolRegistry);
      
      let result;
      try {
        result = await engine.run('Create a resilient function with error handling');
      } catch (error) {
        console.log('Workflow failed with error:', error);
        throw error;
      }

      // Log all published events for debugging
      console.log('Published events:', publishedEvents.map(e => ({ type: e.type, payload: e.payload })));

      // Verify exactly 3 calls were made to GeminiChat (2 failures + 1 success)
      console.log('geminiCallCount:', geminiCallCount);
      expect(geminiCallCount).toBe(3);

      // Verify two error events were published from retry failures
      const errorEvents = publishedEvents.filter(event => 
        event.type === 'error' && 
        event.payload.agent === 'SYNTH' &&
        event.payload.message.includes('Network failure')
      );
      console.log('Error events:', errorEvents);
      expect(errorEvents).toHaveLength(2);

      // Verify a progress event is emitted after successful retry
      expect(publishedEvents).toContainEqual(
        expect.objectContaining({
          type: 'progress',
          payload: expect.objectContaining({
            percent: expect.any(Number)
          })
        })
      );

      // Verify workflow completed successfully
      expect(publishedEvents).toContainEqual(
        expect.objectContaining({
          type: 'log',
          payload: 'workflow-complete'
        })
      );

      // Verify the workflow run method completed without throwing (result is void)
      expect(result).toBeUndefined();
    });
  });
});