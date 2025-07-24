/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentContext, AgentResult } from './agent.js';
import { ChimeraEventBus } from '../event-bus/bus.js';
import { AgentType } from '../event-bus/types.js';
import type { PlanStep } from '../interfaces/chimera.js';
import { ToolRegistry } from '../tools/tool-registry.js';

export interface DriveInput {
  planStep: PlanStep;
  artifacts: string[];
}

export interface DriveOutput {
  artifacts: string[];
}

export interface ExecutedStep {
  stepId: string;
  success: boolean;
  artifacts: string[];
  error?: string;
}

export class DriveAgent {
  readonly id = AgentType.DRIVE;
  
  constructor(
    private bus: ChimeraEventBus,
    private toolRegistry?: ToolRegistry
  ) {}

  async run(
    ctx: AgentContext<DriveInput>
  ): Promise<AgentResult<DriveOutput>> {
    this.bus.publish({ ts: Date.now(), type: 'agent-start', payload: { id: this.id } });

    try {
      // Progress: 0% - Starting execution
      this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 0 } });

      const { planStep, artifacts: inputArtifacts } = ctx.input;
      const description = planStep.description;

      // Check if this is a write:<filePath>:<content> pattern
      if (this.isWriteCommand(description)) {
        const result = await this.executeWriteCommand(description);
        
        // Progress: 100% - Execution complete
        this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 100 } });
        
        this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id } });
        return { ok: true, output: { artifacts: result.artifacts } };
      }

      // For non-write commands, return empty artifacts (not implemented)
      this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 100 } });
      this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id } });
      return { ok: true, output: { artifacts: [] } };

    } catch (error) {
      this.bus.publish({
        ts: Date.now(),
        type: 'error',
        payload: {
          agent: 'DRIVE',
          message: error instanceof Error ? error.message : 'Unknown execution error',
          details: error instanceof Error ? error.stack : String(error)
        }
      });
      this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id } });
      return { ok: false, error: `Drive execution failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  private isWriteCommand(description: string): boolean {
    return description.startsWith('write:') && description.includes(':');
  }

  private async executeWriteCommand(description: string): Promise<{ artifacts: string[] }> {
    // Parse write:<filePath>:<content> pattern
    const writePrefix = 'write:';
    const afterWrite = description.substring(writePrefix.length);
    
    let filePath: string;
    let content: string;
    
    // Check if this looks like a Windows path (starts with drive letter like C:)
    const windowsPathMatch = afterWrite.match(/^([a-zA-Z]:\\[^:]*?):(.*)/);
    if (windowsPathMatch) {
      // Windows path: C:\path\file.txt:content
      filePath = windowsPathMatch[1];
      content = windowsPathMatch[2];
    } else {
      // Unix-style path or simple filename: find first colon to separate path from content
      const firstColonIndex = afterWrite.indexOf(':');
      if (firstColonIndex === -1) {
        throw new Error('Invalid write command format. Expected: write:<filePath>:<content>');
      }
      filePath = afterWrite.substring(0, firstColonIndex);
      content = afterWrite.substring(firstColonIndex + 1);
    }

    if (!filePath) {
      throw new Error('File path cannot be empty in write command');
    }

    // Check if tool registry is available
    if (!this.toolRegistry) {
      throw new Error('Tool registry not available for write_file execution');
    }

    // Get the write_file tool from the registry
    const writeFileTool = this.toolRegistry.getTool('write_file');
    if (!writeFileTool) {
      throw new Error('write_file tool not found in registry');
    }

    // Execute the write_file tool
    const toolParams = {
      file_path: filePath,
      content: content
    };

    const abortController = new AbortController();
    const toolResult = await writeFileTool.execute(toolParams, abortController.signal);

    // Validate tool execution result
    if (!toolResult || typeof toolResult !== 'object') {
      throw new Error('Tool execution returned invalid result');
    }

    // Return the file path as an artifact
    return { artifacts: [filePath] };
  }
}