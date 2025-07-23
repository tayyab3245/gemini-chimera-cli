// packages/core/src/agents/audit.ts
import type { AgentContext, AgentResult } from './agent.js';
import { ChimeraEventBus } from '../event-bus/bus.js';
import { AgentType } from '../event-bus/types.js';

type AuditInput  = { planJson: string; artifacts: string[] };
type AuditOutput = { pass: boolean; recommendation?: string };

export class AuditAgent {
  readonly id = AgentType.AUDIT;
  constructor(private bus: ChimeraEventBus) {}

  async run(ctx: AgentContext<AuditInput>): Promise<AgentResult<AuditOutput>> {
    this.bus.publish({ ts: Date.now(), type: 'agent-start', payload: { id: this.id } });
    // 🔧  TODO: real LLM QA – stub passes for now
    const output: AuditOutput = { pass: true };
    this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id } });
    return { ok: true, output };
  }
}
