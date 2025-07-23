// packages/core/src/agents/audit.ts
import type { AgentContext, AgentResult } from './agent.js';
import { ChimeraEventBus } from '../event-bus/bus.js';
import { AgentType } from '../event-bus/types.js';

type AuditInput  = { planJson: string; artifacts: string[] };
type AuditOutput = { pass: boolean; reasons: string[] };

export class AuditAgent {
  readonly id = AgentType.AUDIT;
  constructor(private bus: ChimeraEventBus) {}

  async run(ctx: AgentContext<AuditInput>): Promise<AgentResult<AuditOutput>> {
    this.bus.publish({ ts: Date.now(), type: 'agent-start', payload: { id: this.id } });
    
    try {
      const { planJson, artifacts } = ctx.input;
      const reasons: string[] = [];

      // Rule 1: Check for empty or whitespace-only artifacts
      for (let i = 0; i < artifacts.length; i++) {
        const artifact = artifacts[i];
        if (!artifact || artifact.trim().length === 0) {
          const failureReason = `Artifact ${i + 1} is empty or contains only whitespace`;
          reasons.push(failureReason);
          this.bus.publish({ 
            ts: Date.now(), 
            type: 'log', 
            payload: `AUDIT FAILURE: ${failureReason}` 
          });
        }
      }

      // Rule 2: Check planJson for required keys
      let parsedPlan: any;
      try {
        parsedPlan = JSON.parse(planJson);
      } catch (error) {
        const failureReason = 'planJson is not valid JSON';
        reasons.push(failureReason);
        this.bus.publish({ 
          ts: Date.now(), 
          type: 'log', 
          payload: `AUDIT FAILURE: ${failureReason}` 
        });
        parsedPlan = null;
      }

      if (parsedPlan) {
        const requiredKeys = ['task_id', 'plan', 'status'];
        for (const key of requiredKeys) {
          if (!(key in parsedPlan)) {
            const failureReason = `planJson missing required key: "${key}"`;
            reasons.push(failureReason);
            this.bus.publish({ 
              ts: Date.now(), 
              type: 'log', 
              payload: `AUDIT FAILURE: ${failureReason}` 
            });
          }
        }
      }

      const pass = reasons.length === 0;
      
      if (pass) {
        this.bus.publish({ 
          ts: Date.now(), 
          type: 'log', 
          payload: 'AUDIT PASSED: All quality checks successful' 
        });
      }

      const output: AuditOutput = { pass, reasons };
      this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id } });
      return { ok: true, output };

    } catch (error) {
      this.bus.publish({ 
        ts: Date.now(), 
        type: 'error', 
        payload: `AUDIT ERROR: ${error instanceof Error ? error.message : String(error)}` 
      });
      this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id } });
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
