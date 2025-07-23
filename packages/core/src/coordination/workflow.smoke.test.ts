// packages/core/src/coordination/workflow.smoke.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkflowEngine, WorkflowState, advance } from './workflow.js';
import { AuditAgent } from '../agents/audit.js';
import { DriveAgent } from '../agents/drive.js';
import { ChimeraEventBus } from '../event-bus/bus.js';
import { ProgressPayload, ErrorPayload } from '../event-bus/types.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { WriteFileTool } from '../tools/write-file.js';
import { Config } from '../config/config.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

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

  it('should emit progress events with correct percentages for multi-step plan', async () => {
    // Create a mock 3-step plan for testing progress events
    const engine = new WorkflowEngine();
    const progressEvents: ProgressPayload[] = [];

    // Subscribe to progress events
    engine['bus'].subscribe('progress', (event) => {
      progressEvents.push(event.payload as ProgressPayload);
    });

    // Mock the synth result to return a 3-step plan
    const originalSynthRun = engine['synth'].run;
    engine['synth'].run = async () => {
      return {
        ok: true,
        output: {
          planJson: JSON.stringify({
            task_id: 'test-progress',
            plan: [
              { step_id: 'S1', description: 'Step 1' },
              { step_id: 'S2', description: 'Step 2' },
              { step_id: 'S3', description: 'Step 3' }
            ],
            status: 'pending'
          })
        }
      };
    };

    // Mock the drive agent to succeed for all steps
    const originalDriveRun = engine['drive'].run;
    engine['drive'].run = async () => {
      return {
        ok: true,
        output: {
          artifacts: ['mock-artifact']
        }
      };
    };

    try {
      await engine.run({ userInput: 'Test progress events' });
    } catch (error) {
      // Ignore workflow errors, we're only testing progress events
    }

    // Verify progress events were emitted correctly
    expect(progressEvents).toHaveLength(3);
    
    // Check step 1: 33% (1/3 * 100 rounded)
    expect(progressEvents[0]).toEqual({
      stepId: 'S1',
      stepIndex: 0,
      totalSteps: 3,
      percent: 33
    });

    // Check step 2: 67% (2/3 * 100 rounded)
    expect(progressEvents[1]).toEqual({
      stepId: 'S2',
      stepIndex: 1,
      totalSteps: 3,
      percent: 67
    });

    // Check step 3: 100% (3/3 * 100)
    expect(progressEvents[2]).toEqual({
      stepId: 'S3',
      stepIndex: 2,
      totalSteps: 3,
      percent: 100
    });

    // Restore original methods
    engine['synth'].run = originalSynthRun;
    engine['drive'].run = originalDriveRun;
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

  describe('DriveAgent Integration', () => {
    let tempDir: string;
    let agent: DriveAgent;
    let bus: ChimeraEventBus;
    let toolRegistry: ToolRegistry;

    beforeEach(async () => {
      // Create a temporary directory for testing
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'drive-agent-test-'));
      
      bus = new ChimeraEventBus();
      
      // Create a minimal config for ToolRegistry
      const mockConfig = {
        getProjectRoot: () => tempDir,
        getTargetDir: () => tempDir,
        isInteractive: () => false,
        getApprovalMode: () => 'auto',
        setApprovalMode: () => {},
        getGeminiClient: () => null,
        getToolRegistry: async () => toolRegistry
      } as unknown as Config;
      
      toolRegistry = new ToolRegistry(mockConfig);
      
      // Register the write_file tool
      const writeFileTool = new WriteFileTool(mockConfig);
      toolRegistry.registerTool(writeFileTool);
      
      agent = new DriveAgent(bus, toolRegistry);
    });

    afterEach(async () => {
      // Clean up temporary directory
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    it('DriveAgent writes file to disk', async () => {
      const testFileName = 'test-file.txt';
      const testContent = 'Hello Chimera';
      const testFilePath = path.join(tempDir, testFileName);
      
      // Use absolute path for the write command
      const absolutePath = testFilePath;
      
      // Create a planJson with a write: command
      const planJson = JSON.stringify({
        task_id: 'test-write',
        plan: [{
          step_id: 'S1',
          description: `write:${absolutePath}:${testContent}`
        }],
        status: 'pending'
      });

      const ctx = {
        input: {
          stepJson: {
            stepId: 'S1',
            description: `write:${absolutePath}:${testContent}`,
            planJson: planJson
          }
        },
        bus
      };

      // Execute the DriveAgent
      const result = await agent.run(ctx);

      // Assert the agent execution was successful
      expect(result.ok).toBe(true);
      expect(result.output).toBeDefined();
      if (result.output) {
        expect(result.output.artifacts).toContain(absolutePath);
      }

      // Assert the file was actually created (using absolute path for verification)
      const fileExists = await fs.access(testFilePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);

      // Assert the file contents are correct
      const fileContents = await fs.readFile(testFilePath, 'utf-8');
      expect(fileContents).toBe(testContent);
    });
  });

  it('should emit error event when DriveAgent fails on step 2', async () => {
    const engine = new WorkflowEngine();
    const errorEvents: ErrorPayload[] = [];

    // Subscribe to error events
    engine['bus'].subscribe('error', (event) => {
      errorEvents.push(event.payload as ErrorPayload);
    });

    // Mock the synth result to return a 3-step plan
    const originalSynthRun = engine['synth'].run;
    engine['synth'].run = async () => {
      return {
        ok: true,
        output: {
          planJson: JSON.stringify({
            task_id: 'test-drive-failure',
            plan: [
              { step_id: 'S1', description: 'Step 1' },
              { step_id: 'S2', description: 'Step 2' },
              { step_id: 'S3', description: 'Step 3' }
            ],
            status: 'pending'
          })
        }
      };
    };

    // Mock the drive agent to fail on step 2
    const originalDriveRun = engine['drive'].run;
    let callCount = 0;
    engine['drive'].run = async (context) => {
      callCount++;
      if (callCount === 2) { // Fail on second call (step 2)
        return {
          ok: false,
          error: 'Simulated drive failure on step 2'
        };
      }
      return {
        ok: true,
        output: {
          artifacts: ['mock-artifact']
        }
      };
    };

    try {
      await engine.run({ userInput: 'Test drive failure' });
      expect.fail('Expected workflow to throw error');
    } catch (error) {
      // Expected to throw
    }

    // Verify error event was emitted correctly
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0]).toEqual({
      agent: 'DRIVE',
      stepId: 'S2',
      message: 'Drive failed on step S2',
      details: 'Simulated drive failure on step 2'
    });

    // Restore original methods
    engine['synth'].run = originalSynthRun;
    engine['drive'].run = originalDriveRun;
  });

  it('should emit error event when AuditAgent returns pass:false', async () => {
    const engine = new WorkflowEngine();
    const errorEvents: ErrorPayload[] = [];

    // Subscribe to error events
    engine['bus'].subscribe('error', (event) => {
      errorEvents.push(event.payload as ErrorPayload);
    });

    // Mock the synth result to return a simple plan
    const originalSynthRun = engine['synth'].run;
    engine['synth'].run = async () => {
      return {
        ok: true,
        output: {
          planJson: JSON.stringify({
            task_id: 'test-audit-failure',
            plan: [
              { step_id: 'S1', description: 'Step 1' }
            ],
            status: 'pending'
          })
        }
      };
    };

    // Mock the drive agent to succeed
    const originalDriveRun = engine['drive'].run;
    engine['drive'].run = async () => {
      return {
        ok: true,
        output: {
          artifacts: ['mock-artifact']
        }
      };
    };

    // Mock the audit agent to return pass:false
    const originalAuditRun = engine['audit'].run;
    engine['audit'].run = async () => {
      return {
        ok: true,
        output: {
          pass: false,
          reasons: ['Test audit failure']
        }
      };
    };

    try {
      await engine.run({ userInput: 'Test audit failure' });
      expect.fail('Expected workflow to throw error');
    } catch (error) {
      // Expected to throw
    }

    // Verify error event was emitted correctly
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0]).toEqual({
      agent: 'AUDIT',
      message: 'Audit failed',
      details: {
        pass: false,
        reasons: ['Test audit failure']
      }
    });

    // Restore original methods
    engine['synth'].run = originalSynthRun;
    engine['drive'].run = originalDriveRun;
    engine['audit'].run = originalAuditRun;
  });
});
