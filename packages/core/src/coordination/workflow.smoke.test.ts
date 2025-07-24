// packages/core/src/coordination/workflow.smoke.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkflowEngine } from './workflowEngine.js';
import { WorkflowState, advance } from './workflow.js';
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
  let bus: ChimeraEventBus;
  
  beforeEach(() => {
    bus = new ChimeraEventBus();
    engine = new WorkflowEngine(bus);
  });

  it('should complete basic workflow with valid input', async () => {
    // The new WorkflowEngine returns void, so we just check it doesn't throw
    await expect(engine.run('Echo hello')).resolves.toBeUndefined();
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

  it('should emit workflow start and complete events', async () => {
    const events: any[] = [];

    // Subscribe to all events
    bus.subscribe('log', (event) => {
      events.push(event.payload);
    });

    await engine.run('Test workflow events');

    // Check that we get workflow-start and workflow-complete events
    expect(events).toContain('workflow-start');
    expect(events).toContain('workflow-complete');
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
});
