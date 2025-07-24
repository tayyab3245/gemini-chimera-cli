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

describe('DriveAgent', () => {
  let driveAgent: DriveAgent;
  let mockBus: ChimeraEventBus;
  let mockToolRegistry: ToolRegistry;
  let publishSpy: Mock;
  let mockWriteTool: any;

  beforeEach(() => {
    mockBus = new ChimeraEventBus();
    publishSpy = vi.spyOn(mockBus, 'publish') as Mock;
    
    // Create mock write tool
    mockWriteTool = {
      execute: vi.fn().mockResolvedValue({ success: true })
    };
    
    // Create mock tool registry
    mockToolRegistry = {
      getTool: vi.fn().mockImplementation((toolName: string) => {
        if (toolName === 'write_file') {
          return mockWriteTool;
        }
        return null;
      })
    } as any;
    
    driveAgent = new DriveAgent(mockBus, mockToolRegistry);
  });

  describe('successful file write', () => {
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

      const ctx: AgentContext<{ planStep: PlanStep; artifacts: string[] }> = {
        input: { planStep, artifacts: [] },
        bus: mockBus,
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

      const ctx: AgentContext<{ planStep: PlanStep; artifacts: string[] }> = {
        input: { planStep, artifacts: [] },
        bus: mockBus,
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

      const ctx: AgentContext<{ planStep: PlanStep; artifacts: string[] }> = {
        input: { planStep, artifacts: [] },
        bus: mockBus,
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

  describe('error cases', () => {
    it('should handle missing write_file tool and publish error event', async () => {
      // Create agent without tool registry
      const agentWithoutRegistry = new DriveAgent(mockBus);

      const planStep: PlanStep = {
        step_id: 'S1',
        description: 'write:./test.txt:Hello World',
        depends_on: [],
        status: 'pending',
        artifacts: [],
        attempts: 0,
        max_attempts: 3
      };

      const ctx: AgentContext<{ planStep: PlanStep; artifacts: string[] }> = {
        input: { planStep, artifacts: [] },
        bus: mockBus,
      };

      const result = await agentWithoutRegistry.run(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Tool registry not available');

      // Should publish error event
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'error',
        payload: expect.objectContaining({
          agent: 'DRIVE',
          message: 'Tool registry not available for write_file execution'
        })
      }));
    });

    it('should handle tool not found in registry', async () => {
      // Mock registry that returns null for write_file
      const emptyRegistry = {
        getTool: vi.fn().mockReturnValue(null)
      } as any;

      const agentWithEmptyRegistry = new DriveAgent(mockBus, emptyRegistry);

      const planStep: PlanStep = {
        step_id: 'S1',
        description: 'write:./test.txt:Hello World',
        depends_on: [],
        status: 'pending',
        artifacts: [],
        attempts: 0,
        max_attempts: 3
      };

      const ctx: AgentContext<{ planStep: PlanStep; artifacts: string[] }> = {
        input: { planStep, artifacts: [] },
        bus: mockBus,
      };

      const result = await agentWithEmptyRegistry.run(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('write_file tool not found in registry');

      // Should publish error event
      expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'error',
        payload: expect.objectContaining({
          agent: 'DRIVE',
          message: 'write_file tool not found in registry'
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

      const ctx: AgentContext<{ planStep: PlanStep; artifacts: string[] }> = {
        input: { planStep, artifacts: [] },
        bus: mockBus,
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

      const ctx: AgentContext<{ planStep: PlanStep; artifacts: string[] }> = {
        input: { planStep, artifacts: [] },
        bus: mockBus,
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

      const ctx: AgentContext<{ planStep: PlanStep; artifacts: string[] }> = {
        input: { planStep, artifacts: [] },
        bus: mockBus,
      };

      const result = await driveAgent.run(ctx);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('File path cannot be empty');
    });
  });

  describe('non-write commands', () => {
    it('should handle non-write commands by returning empty artifacts', async () => {
      const planStep: PlanStep = {
        step_id: 'S1',
        description: 'run tests for the application',
        depends_on: [],
        status: 'pending',
        artifacts: [],
        attempts: 0,
        max_attempts: 3
      };

      const ctx: AgentContext<{ planStep: PlanStep; artifacts: string[] }> = {
        input: { planStep, artifacts: [] },
        bus: mockBus,
      };

      const result = await driveAgent.run(ctx);

      expect(result.ok).toBe(true);
      expect(result.output!.artifacts).toEqual([]);

      // Should not call any tools
      expect(mockWriteTool.execute).not.toHaveBeenCalled();

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
