import type { AgentContext, AgentResult } from './agent.js';
import { ChimeraEventBus } from '../event-bus/bus.js';
import { AgentType } from '../event-bus/types.js';
import { ToolRegistry } from '../tools/tool-registry.js';

export class DriveAgent {
  readonly id = AgentType.DRIVE;
  
  constructor(
    private bus: ChimeraEventBus,
    private toolRegistry?: ToolRegistry
  ) {}

  async run(
    ctx: AgentContext<{ stepJson: any }>
  ): Promise<AgentResult<{ artifacts: string[] }>> {
    this.bus.publish({ ts: Date.now(), type: 'agent-start', payload: { id: this.id } });

    // Error path
    if (!ctx.input.stepJson) {
      this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id } });
      return { ok: false, error: 'No step provided' } as any;
    }

    // Parse step_id with default fallback
    const stepId = ctx.input.stepJson.step_id || ctx.input.stepJson.stepId || "UNKNOWN";
    
    // Try to extract description from the step or from planJson
    let description = ctx.input.stepJson.description || "";
    
    // If no direct description, try to parse from planJson if available
    if (!description && ctx.input.stepJson.planJson) {
      try {
        const plan = JSON.parse(ctx.input.stepJson.planJson);
        if (plan.plan && Array.isArray(plan.plan) && plan.plan.length > 0) {
          // For now, use the first step's description
          description = plan.plan[0].description || "";
        }
      } catch (error) {
        // If planJson parsing fails, continue with empty description
      }
    }

    // Check if this is a write: command and we have a tool registry
    if (description.startsWith('write:') && this.toolRegistry) {
      try {
        // Publish progress event
        this.bus.publish({ 
          ts: Date.now(), 
          type: 'progress', 
          payload: `Processing write command: ${description}` 
        });

        // Parse the write command: write:<filePath>:<content>
        // To handle Windows paths with drive letters (e.g., C:\path), we need to be careful with splitting
        const writePrefix = 'write:';
        if (!description.startsWith(writePrefix)) {
          this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id } });
          return { ok: false, error: 'Invalid write command format. Expected: write:<filePath>:<content>' } as any;
        }
        
        const afterWrite = description.substring(writePrefix.length);
        
        // Find the last colon to separate content from path
        const lastColonIndex = afterWrite.lastIndexOf(':');
        if (lastColonIndex === -1) {
          this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id } });
          return { ok: false, error: 'Invalid write command format. Expected: write:<filePath>:<content>' } as any;
        }
        
        const filePath = afterWrite.substring(0, lastColonIndex);
        const content = afterWrite.substring(lastColonIndex + 1);

        // Get the write_file tool from the registry
        const writeFileTool = this.toolRegistry.getTool('write_file');
        if (!writeFileTool) {
          this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id } });
          return { ok: false, error: 'write_file tool not found in registry' } as any;
        }

        // Execute the write_file tool
        const toolParams = {
          file_path: filePath,
          content: content
        };

        const abortController = new AbortController();
        const toolResult = await writeFileTool.execute(toolParams, abortController.signal);

        // Check if the tool execution was successful
        if (!toolResult || typeof toolResult !== 'object') {
          this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id } });
          return { ok: false, error: 'Tool execution returned invalid result' } as any;
        }

        // Publish agent-end event
        this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id } });

        // Return the path of the written file as an artifact
        return { ok: true, output: { artifacts: [filePath] } };

      } catch (error) {
        this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id } });
        return { 
          ok: false, 
          error: `Failed to execute write command: ${error instanceof Error ? error.message : String(error)}` 
        } as any;
      }
    }

    // Fallback to original behavior for non-write commands or when no tool registry
    const artifact = `Executed ${stepId} (stub)`;

    this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id } });
    return { ok: true, output: { artifacts: [artifact] } };
  }
}