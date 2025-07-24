/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { DriveAgent } from './drive.js';
import { ChimeraEventBus } from '../event-bus/bus.js';
import { AgentType } from '../event-bus/types.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import type { AgentContext } from './agent.js';
import type { PlanStep } from '../interfaces/chimera.js';
import type { DriveInput } from './drive.js';

describe('DriveAgent', () => {
  let driveAgent: DriveAgent;
  let mockBus: ChimeraEventBus;
  let mockToolRegistry: ToolRegistry;
  let publishSpy: Mock;
  let mockWriteTool: any;
  let mockExecTool: any;

  beforeEach(() => {
    mockBus = new ChimeraEventBus();
    publishSpy = vi.spyOn(mockBus, 'publish') as Mock;
    
    // Create mock write tool
    mockWriteTool = {
      execute: vi.fn().mockResolvedValue({ success: true })
    };

    // Create mock exec tool  
    mockExecTool = {
      execute: vi.fn().mockResolvedValue({ success: true })
    };
    
    // Create mock tool registry
    mockToolRegistry = {
      getTool: vi.fn().mockImplementation((toolName: string) => {
        if (toolName === 'write_file') {
          return mockWriteTool;
        }
        if (toolName === 'exec_shell') {
          return mockExecTool;
        }
        return null;
      })
    } as any;
    
    driveAgent = new DriveAgent(mockBus);
  });

  describe('write command', () => {
    it('should execute write command and return file path as artifact', async () => {
      const planStep: PlanStep = {
        step_id: 'S1',
        description: 'write:./test.txt:Hello World',
        depends_on: [],
        status: 'pending',
        artifacts: [],
        attempts: 0,
        max_attempts: 3
      };

      const ctx: AgentContext<DriveInput> = {
        input: { planStep, artifacts: [] },
        bus: mockBus,
        dependencies: { toolRegistry: mockToolRegistry }
      };

      const result = await driveAgent.run(ctx);

      expect(result.ok).toBe(true);
      expect(result.output!.artifacts).toEqual(['./test.txt']);

      // Verify write_file tool was called with correct parameters
      expect(mockWriteTool.execute).toHaveBeenCalledWith(
        { file_path: './test.txt', content: 'Hello World' },
        expect.any(AbortSignal)
      );

      // Verify events were published
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'agent-start',
        payload: { id: AgentType.DRIVE }
      }));
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'progress',
        payload: { percent: 0 }
      }));
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'progress',
        payload: { percent: 100 }
      }));
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'agent-end',
        payload: { id: AgentType.DRIVE }
      }));
    });

    it('should handle Windows file paths with drive letters', async () => {
      const planStep: PlanStep = {
        step_id: 'S1',
        description: 'write:C:\\Users\\test\\file.txt:Content with multiple words',
        depends_on: [],
        status: 'pending',
        artifacts: [],
        attempts: 0,
        max_attempts: 3
      };

      const ctx: AgentContext<DriveInput> = {
        input: { planStep, artifacts: [] },
        bus: mockBus,
        dependencies: { toolRegistry: mockToolRegistry }
      };

      const result = await driveAgent.run(ctx);

      expect(result.ok).toBe(true);
      expect(result.output!.artifacts).toEqual(['C:\\Users\\test\\file.txt']);

      expect(mockWriteTool.execute).toHaveBeenCalledWith(
        { file_path: 'C:\\Users\\test\\file.txt', content: 'Content with multiple words' },
        expect.any(AbortSignal)
      );
    });

    it('should handle content with colons', async () => {
      const planStep: PlanStep = {
        step_id: 'S1',
        description: 'write:config.json:{"url": "http://localhost:3000", "port": 8080}',
        depends_on: [],
        status: 'pending',
        artifacts: [],
        attempts: 0,
        max_attempts: 3
      };

      const ctx: AgentContext<DriveInput> = {
        input: { planStep, artifacts: [] },
        bus: mockBus,
        dependencies: { toolRegistry: mockToolRegistry }
      };

      const result = await driveAgent.run(ctx);

      expect(result.ok).toBe(true);
      expect(result.output!.artifacts).toEqual(['config.json']);

      expect(mockWriteTool.execute).toHaveBeenCalledWith(
        { file_path: 'config.json', content: '{"url": "http://localhost:3000", "port": 8080}' },
        expect.any(AbortSignal)
      );
    });
  });

  describe('run command', () => {
    it('should execute run command with exec_shell tool', async () => {
      const planStep: PlanStep = {
        step_id: 'S2',
        description: 'run:npm install',
        depends_on: [],
        status: 'pending',
        artifacts: [],
        attempts: 0,
        max_attempts: 3
      };

      const ctx: AgentContext<DriveInput> = {
        input: { planStep, artifacts: [] },
        bus: mockBus,
        dependencies: { toolRegistry: mockToolRegistry }
      };

      const result = await driveAgent.run(ctx);

      expect(result.ok).toBe(true);
      expect(result.output!.artifacts).toEqual(['npm install']);
      expect(mockToolRegistry.getTool).toHaveBeenCalledWith('exec_shell');
      expect(mockExecTool.execute).toHaveBeenCalledWith(
        { command: 'npm install' },
        expect.any(AbortSignal)
      );
    });
  });

  describe('test command', () => {
    it('should execute test command with exec_shell tool', async () => {
      const planStep: PlanStep = {
        step_id: 'S3',
        description: 'test:npm test -- --coverage',
        depends_on: [],
        status: 'pending',
        artifacts: [],
        attempts: 0,
        max_attempts: 3
      };

      const ctx: AgentContext<DriveInput> = {
        input: { planStep, artifacts: [] },
        bus: mockBus,
        dependencies: { toolRegistry: mockToolRegistry }
      };

      const result = await driveAgent.run(ctx);

      expect(result.ok).toBe(true);
      expect(result.output!.artifacts).toEqual(['npm test -- --coverage']);
      expect(mockToolRegistry.getTool).toHaveBeenCalledWith('exec_shell');
      expect(mockExecTool.execute).toHaveBeenCalledWith(
        { command: 'npm test -- --coverage' },
        expect.any(AbortSignal)
      );
    });

    it('should default to npm test when no args provided', async () => {
      const planStep: PlanStep = {
        step_id: 'S3',
        description: 'test:',
        depends_on: [],
        status: 'pending',
        artifacts: [],
        attempts: 0,
        max_attempts: 3
      };

      const ctx: AgentContext<DriveInput> = {
        input: { planStep, artifacts: [] },
        bus: mockBus,
        dependencies: { toolRegistry: mockToolRegistry }
      };

      const result = await driveAgent.run(ctx);

      expect(result.ok).toBe(true);
      expect(result.output!.artifacts).toEqual(['npm test']);
      expect(mockExecTool.execute).toHaveBeenCalledWith(
        { command: 'npm test' },
        expect.any(AbortSignal)
      );
    });
  });

  describe('multiple commands', () => {
    it('should execute multiple commands and emit progress events', async () => {
      const planStep: PlanStep = {
        step_id: 'S4',
        description: 'write:package.json:{"name":"test"}\nrun:npm install\ntest:npm test',
        depends_on: [],
        status: 'pending',
        artifacts: [],
        attempts: 0,
        max_attempts: 3
      };

      const ctx: AgentContext<DriveInput> = {
        input: { planStep, artifacts: [] },
        bus: mockBus,
        dependencies: { toolRegistry: mockToolRegistry }
      };

      const result = await driveAgent.run(ctx);

      expect(result.ok).toBe(true);
      expect(result.output!.artifacts).toEqual(['package.json', 'npm install', 'npm test']);
      
      // Check progress events were emitted
      const progressEvents = publishSpy.mock.calls
        .filter(call => call[0].type === 'progress')
        .map(call => call[0].payload.percent);
      expect(progressEvents).toEqual([0, 33, 67, 100]);
      
      // Verify all tools were called
      expect(mockWriteTool.execute).toHaveBeenCalledWith(
        { file_path: 'package.json', content: '{"name":"test"}' },
        expect.any(AbortSignal)
      );
      expect(mockExecTool.execute).toHaveBeenCalledWith(
        { command: 'npm install' },
        expect.any(AbortSignal)
      );
      expect(mockExecTool.execute).toHaveBeenCalledWith(
        { command: 'npm test' },
        expect.any(AbortSignal)
      );
    });
  });

  describe('error cases', () => {
    it('should handle missing ToolRegistry and publish error event', async () => {
      const planStep: PlanStep = {
        step_id: 'S1',
        description: 'write:./test.txt:Hello World',
        depends_on: [],
        status: 'pending',
        artifacts: [],
        attempts: 0,
        max_attempts: 3
      };

      const ctx: AgentContext<DriveInput> = {
        input: { planStep, artifacts: [] },
        bus: mockBus,
        dependencies: {} // No toolRegistry
      };

      const result = await driveAgent.run(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('ToolRegistry not available');

      // Should publish error event
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'error',
        payload: expect.objectContaining({
          agent: 'DRIVE',
          message: expect.stringContaining('ToolRegistry not available')
        })
      }));
    });

    it('should handle tool not found in registry', async () => {
      // Mock registry that returns null for write_file
      const emptyRegistry = {
        getTool: vi.fn().mockReturnValue(null)
      } as any;

      const planStep: PlanStep = {
        step_id: 'S1',
        description: 'write:./test.txt:Hello World',
        depends_on: [],
        status: 'pending',
        artifacts: [],
        attempts: 0,
        max_attempts: 3
      };

      const ctx: AgentContext<DriveInput> = {
        input: { planStep, artifacts: [] },
        bus: mockBus,
        dependencies: { toolRegistry: emptyRegistry }
      };

      const result = await driveAgent.run(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('write_file tool not found');

      // Should publish error event
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'error',
        payload: expect.objectContaining({
          agent: 'DRIVE',
          message: expect.stringContaining('write_file tool not found')
        })
      }));
    });

    it('should handle invalid write command format', async () => {
      const planStep: PlanStep = {
        step_id: 'S1',
        description: 'write:invalid-format-no-content-separator',
        depends_on: [],
        status: 'pending',
        artifacts: [],
        attempts: 0,
        max_attempts: 3
      };

      const ctx: AgentContext<DriveInput> = {
        input: { planStep, artifacts: [] },
        bus: mockBus,
        dependencies: { toolRegistry: mockToolRegistry }
      };

      const result = await driveAgent.run(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Invalid write command format');
    });

    it('should handle tool execution failure', async () => {
      // Mock tool that throws an error
      mockWriteTool.execute.mockRejectedValue(new Error('File system error'));

      const planStep: PlanStep = {
        step_id: 'S1',
        description: 'write:./test.txt:Hello World',
        depends_on: [],
        status: 'pending',
        artifacts: [],
        attempts: 0,
        max_attempts: 3
      };

      const ctx: AgentContext<DriveInput> = {
        input: { planStep, artifacts: [] },
        bus: mockBus,
        dependencies: { toolRegistry: mockToolRegistry }
      };

      const result = await driveAgent.run(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('File system error');

      // Should publish error event
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'error',
        payload: expect.objectContaining({
          agent: 'DRIVE',
          message: 'File system error'
        })
      }));
    });

    it('should handle empty file path', async () => {
      const planStep: PlanStep = {
        step_id: 'S1',
        description: 'write::Hello World',
        depends_on: [],
        status: 'pending',
        artifacts: [],
        attempts: 0,
        max_attempts: 3
      };

      const ctx: AgentContext<DriveInput> = {
        input: { planStep, artifacts: [] },
        bus: mockBus,
        dependencies: { toolRegistry: mockToolRegistry }
      };

      const result = await driveAgent.run(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('File path cannot be empty');
    });
  });

  describe('non-command descriptions', () => {
    it('should handle non-command descriptions by returning empty artifacts', async () => {
      const planStep: PlanStep = {
        step_id: 'S1',
        description: 'Analyze the requirements and create a plan',
        depends_on: [],
        status: 'pending',
        artifacts: [],
        attempts: 0,
        max_attempts: 3
      };

      const ctx: AgentContext<DriveInput> = {
        input: { planStep, artifacts: [] },
        bus: mockBus,
        dependencies: { toolRegistry: mockToolRegistry }
      };

      const result = await driveAgent.run(ctx);

      expect(result.ok).toBe(true);
      expect(result.output!.artifacts).toEqual([]);

      // Should not call any tools
      expect(mockWriteTool.execute).not.toHaveBeenCalled();
      expect(mockExecTool.execute).not.toHaveBeenCalled();

      // Should still publish progress events
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'progress',
        payload: { percent: 0 }
      }));
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'progress',
        payload: { percent: 100 }
      }));
    });
  });
});
