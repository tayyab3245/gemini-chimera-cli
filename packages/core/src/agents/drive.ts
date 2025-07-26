/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentContext, AgentResult } from './agent.js';
import { ChimeraEventBus } from '../event-bus/bus.js';
import { AgentType } from '../event-bus/types.js';
import type { PlanStep } from '../interfaces/chimera.js';
import type { GeminiChat } from '../core/geminiChat.js';
import { loadPrompt } from '../utils/mindLoader.js';
import { withTimeout, withRetries } from '../coordination/recovery.js';

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
  
  constructor(private bus: ChimeraEventBus, private geminiChat?: GeminiChat) {}

  async run(
    ctx: AgentContext<DriveInput>
  ): Promise<AgentResult<DriveOutput>> {
    this.bus.publish({ ts: Date.now(), type: 'agent-start', payload: { id: this.id } });

    try {
      // Progress: 0% - Starting execution
      this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 0 } });

      const { planStep, artifacts: inputArtifacts } = ctx.input;
      const description = planStep.description;

      // Check if ToolRegistry is available via context
      const toolRegistry = ctx.dependencies?.toolRegistry;
      if (!toolRegistry) {
        throw new Error('ToolRegistry not available in agent context');
      }

      // Try to use live prompt with Gemini first, with fallback to rule-based parsing
      const artifacts = await this.executeWithLivePrompt(description, toolRegistry);
      
      // Progress: 100% - Execution complete
      this.bus.publish({ 
        ts: Date.now(), 
        type: 'progress', 
        payload: { percent: 100 } 
      });

      this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id } });
      return { ok: true, output: { artifacts } };

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

  /**
   * Attempts to execute plan step using live prompt + Gemini, falls back to rule-based parsing
   */
  private async executeWithLivePrompt(description: string, toolRegistry: any): Promise<string[]> {
    // Try live prompt path first
    if (this.geminiChat) {
      try {
        // Load prompt from mind folder
        const prompt = await loadPrompt('packages/core/src/mind/drive.prompt.ts');
        
        if (prompt) {
          // Progress: 30% - Prompt loaded, calling Gemini
          this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 30 } });

          const response = await withRetries(
            () => withTimeout(this.geminiChat!.sendMessage(
              {
                message: `${prompt}

Plan Step Description: "${description}"`
              },
              'drive-execution'
            ), 60_000),
            3
          );

          // Progress: 60% - Gemini response received
          this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 60 } });

          // Parse JSON response
          const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (responseText) {
            try {
              const toolInstruction = JSON.parse(responseText);
              const artifacts = await this.executeToolInstruction(toolInstruction, toolRegistry);
              // Success - return artifacts from live prompt path
              return artifacts;
            } catch (parseError) {
              this.bus.publish({ 
                ts: Date.now(), 
                type: 'error', 
                payload: { 
                  agent: 'DRIVE', 
                  message: `Failed to parse Gemini JSON response: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
                  stack: parseError instanceof Error ? parseError.stack : undefined
                } 
              });
              this.bus.publish({ 
                ts: Date.now(), 
                type: 'log', 
                payload: `Failed to parse Gemini JSON response, falling back to rule-based parsing` 
              });
            }
          } else {
            this.bus.publish({ 
              ts: Date.now(), 
              type: 'error', 
              payload: { 
                agent: 'DRIVE', 
                message: 'Empty response from Gemini',
                stack: undefined
              } 
            });
            this.bus.publish({ 
              ts: Date.now(), 
              type: 'log', 
              payload: `Empty Gemini response, falling back to rule-based parsing` 
            });
          }
        } else {
          this.bus.publish({ 
            ts: Date.now(), 
            type: 'log', 
            payload: `Prompt not found, using rule-based parsing` 
          });
        }
      } catch (geminiError) {
        this.bus.publish({ 
          ts: Date.now(), 
          type: 'error', 
          payload: { 
            agent: 'DRIVE', 
            message: geminiError instanceof Error ? geminiError.message : String(geminiError),
            stack: geminiError instanceof Error ? geminiError.stack : undefined
          } 
        });
        this.bus.publish({ 
          ts: Date.now(), 
          type: 'log', 
          payload: `Gemini error: ${geminiError instanceof Error ? geminiError.message : String(geminiError)}, falling back to rule-based parsing` 
        });
      }
    }

    // Fallback to rule-based parsing - this can still throw errors that should propagate
    try {
      return await this.executeWithRuleBasedParsing(description, toolRegistry);
    } catch (fallbackError) {
      // Rule-based parsing also failed - this is a terminal failure
      this.bus.publish({ 
        ts: Date.now(), 
        type: 'error', 
        payload: { 
          agent: 'DRIVE', 
          message: `Rule-based parsing failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
          stack: fallbackError instanceof Error ? fallbackError.stack : undefined
        } 
      });
      throw fallbackError; // Re-throw to trigger the main catch block
    }
  }

  /**
   * Executes a tool instruction from Gemini JSON response
   */
  private async executeToolInstruction(instruction: any, toolRegistry: any): Promise<string[]> {
    if (!instruction.tool || !instruction.args) {
      throw new Error('Invalid tool instruction format');
    }

    const { tool, args } = instruction;
    
    // Get the tool from registry
    const toolInstance = toolRegistry.getTool(tool);
    if (!toolInstance) {
      throw new Error(`Tool '${tool}' not found in registry`);
    }

    // Execute the tool
    const abortController = new AbortController();
    await toolInstance.execute(args, abortController.signal);

    // Return appropriate artifacts based on tool type
    switch (tool) {
      case 'write_file':
        return [args.file_path];
      case 'exec_shell':
        return [args.command];
      default:
        return [tool]; // Fallback: return tool name as artifact
    }
  }

  /**
   * Fallback execution using the original rule-based command parsing
   */
  private async executeWithRuleBasedParsing(description: string, toolRegistry: any): Promise<string[]> {
    // Parse and execute commands using original logic
    const commands = this.parseCommands(description);
    const artifacts: string[] = [];
    
    if (commands.length === 0) {
      return artifacts; // No commands to execute
    }
    
    // Execute each command with progress tracking
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      const progressPercent = Math.round(70 + ((i + 1) / commands.length) * 30); // 70-100%
      
      // Execute the command
      const commandArtifacts = await this.executeCommand(command, toolRegistry);
      artifacts.push(...commandArtifacts);
      
      // Publish progress after each command
      this.bus.publish({ 
        ts: Date.now(), 
        type: 'progress', 
        payload: { percent: progressPercent } 
      });
    }
    
    return artifacts;
  }

  private parseCommands(description: string): Array<{ verb: string; args: string }> {
    // Split by newlines and filter out empty lines
    const lines = description.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const commands: Array<{ verb: string; args: string }> = [];

    for (const line of lines) {
      // Check for supported verbs: write:, run:, test:
      if (line.startsWith('write:')) {
        commands.push({ verb: 'write', args: line.substring(6) }); // Remove "write:"
      } else if (line.startsWith('run:')) {
        commands.push({ verb: 'run', args: line.substring(4) }); // Remove "run:"
      } else if (line.startsWith('test:')) {
        commands.push({ verb: 'test', args: line.substring(5) }); // Remove "test:"
      } else if (line.includes(':')) {
        // Fallback: treat as write command if it contains colons (backward compatibility)
        commands.push({ verb: 'write', args: line });
      }
    }

    // If no commands found, check if the description is a single command
    if (commands.length === 0) {
      if (description.startsWith('write:')) {
        commands.push({ verb: 'write', args: description.substring(6) });
      } else if (description.startsWith('run:')) {
        commands.push({ verb: 'run', args: description.substring(4) });
      } else if (description.startsWith('test:')) {
        commands.push({ verb: 'test', args: description.substring(5) });
      }
      // No default - if it doesn't match any pattern, return empty commands array
    }

    return commands;
  }

  private async executeCommand(
    command: { verb: string; args: string }, 
    toolRegistry: any
  ): Promise<string[]> {
    switch (command.verb) {
      case 'write':
        return await this.executeWriteCommand(command.args, toolRegistry);
      case 'run':
        return await this.executeRunCommand(command.args, toolRegistry);
      case 'test':
        return await this.executeTestCommand(command.args, toolRegistry);
      default:
        throw new Error(`Unsupported verb: ${command.verb}`);
    }
  }

  private async executeWriteCommand(args: string, toolRegistry: any): Promise<string[]> {
    // Parse write command: <filePath>:<content>
    let filePath: string;
    let content: string;
    
    // Check if this looks like a Windows path (starts with drive letter like C:)
    const windowsPathMatch = args.match(/^([a-zA-Z]:\\[^:]*?):(.*)/);
    if (windowsPathMatch) {
      // Windows path: C:\path\file.txt:content
      filePath = windowsPathMatch[1];
      content = windowsPathMatch[2];
    } else {
      // Unix-style path or simple filename: find first colon to separate path from content
      const firstColonIndex = args.indexOf(':');
      if (firstColonIndex === -1) {
        throw new Error('Invalid write command format. Expected: <filePath>:<content>');
      }
      filePath = args.substring(0, firstColonIndex);
      content = args.substring(firstColonIndex + 1);
    }

    if (!filePath) {
      throw new Error('File path cannot be empty in write command');
    }

    // Get the write_file tool from the registry
    const writeFileTool = toolRegistry.getTool('write_file');
    if (!writeFileTool) {
      throw new Error('write_file tool not found in registry');
    }

    // Execute the write_file tool
    const toolParams = {
      file_path: filePath,
      content: content
    };

    const abortController = new AbortController();
    await writeFileTool.execute(toolParams, abortController.signal);

    // Return the file path as an artifact
    return [filePath];
  }

  private async executeRunCommand(args: string, toolRegistry: any): Promise<string[]> {
    // Get the exec_shell tool from the registry
    const execShellTool = toolRegistry.getTool('exec_shell');
    if (!execShellTool) {
      throw new Error('exec_shell tool not found in registry');
    }

    // Execute the shell command
    const toolParams = {
      command: args.trim()
    };

    const abortController = new AbortController();
    const result = await execShellTool.execute(toolParams, abortController.signal);

    // Return command as artifact (could be enhanced to return output files)
    return [args.trim()];
  }

  private async executeTestCommand(args: string, toolRegistry: any): Promise<string[]> {
    // Get the exec_shell tool from the registry
    const execShellTool = toolRegistry.getTool('exec_shell');
    if (!execShellTool) {
      throw new Error('exec_shell tool not found in registry');
    }

    // Default to npm test if no specific command provided
    const testCommand = args.trim() || 'npm test';

    // Execute the test command
    const toolParams = {
      command: testCommand
    };

    const abortController = new AbortController();
    const result = await execShellTool.execute(toolParams, abortController.signal);

    // Return test command as artifact
    return [testCommand];
  }
}