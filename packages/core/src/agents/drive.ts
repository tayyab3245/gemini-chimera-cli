import type { AgentContext, AgentResult } from './agent.js';
import { ChimeraEventBus } from '../event-bus/bus.js';
import { AgentType } from '../event-bus/types.js';

export class DriveAgent {
  readonly id = AgentType.DRIVE;
  constructor(private bus: ChimeraEventBus) {}

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
    const stepId = ctx.input.stepJson.step_id || "UNKNOWN";

    // Build artifact text
    const artifact = `Executed ${stepId} (stub)`;

    this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id } });
    return { ok: true, output: { artifacts: [artifact] } };
  }
}