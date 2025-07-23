import type { AgentContext, AgentResult } from './agent.js';
import { ChimeraEventBus } from '../event-bus/bus.js';
import { AgentType } from '../event-bus/types.js';

export class SynthAgent {
  readonly id = AgentType.SYNTH;
  private bus: ChimeraEventBus;

  constructor(bus: ChimeraEventBus) {
    this.bus = bus;
  }

  async run(
    ctx: AgentContext<{ userInput: string }>
  ): Promise<AgentResult<{ planJson: string }>> {
    this.bus.publish({ ts: Date.now(), type: 'agent-start', payload: { id: this.id }});

    const planJson = JSON.stringify({
      "task_id": "demo-000",
      "original_user_request": ctx.input.userInput,
      "plan": [{
        "step_id": "S1",
        "description": "echo Hello World to stdout"
      }],
      "status": "pending"
    });

    this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id }});
    return { ok: true, output: { planJson } };
  }
}