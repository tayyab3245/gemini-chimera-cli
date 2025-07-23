import { ChimeraEventBus } from '../event-bus/bus.js';
import { AgentType } from '../event-bus/types.js';
import type { AgentContext, AgentResult } from './agent.js';
import { buildContextSlice } from '../context/broker.js';

export class KernelAgent {
  readonly id = AgentType.KERNEL;

  constructor(private bus: ChimeraEventBus) {}

  async run(ctx: AgentContext<{ userInput: string }>): Promise<AgentResult<{ack: boolean}>> {
    this.bus.publish({ ts: Date.now(), type: 'agent-start', payload: { id: this.id }});
    this.bus.publish({ ts: Date.now(), type: 'log', payload: `${this.id} received user input` });

    // build minimal context for SYNTH (not yet used)
    buildContextSlice(AgentType.SYNTH, {
      userInput: ctx.input.userInput,
      planJson: '',
      artifacts: [],
    });

    this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id }});
    return { ok: true, output: { ack: true } };
  }
}