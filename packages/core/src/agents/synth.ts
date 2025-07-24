/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentContext, AgentResult } from './agent.js';
import { ChimeraEventBus } from '../event-bus/bus.js';
import { AgentType } from '../event-bus/types.js';
import type { PlanStep } from '../interfaces/chimera.js';

export interface SynthInput {
  clarifiedUserInput: string;
  assumptions: string[];
  constraints: string[];
}

export interface SynthOutput {
  planJson: string;
}

export { PlanStep };

export class SynthAgent {
  readonly id = AgentType.SYNTH;
  private bus: ChimeraEventBus;

  constructor(bus: ChimeraEventBus) {
    this.bus = bus;
  }

  async run(
    ctx: AgentContext<SynthInput>
  ): Promise<AgentResult<SynthOutput>> {
    this.bus.publish({ ts: Date.now(), type: 'agent-start', payload: { id: this.id }});

    try {
      // Progress: 25% - Starting plan generation
      this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 25 }});

      const steps = this.generatePlanSteps(ctx.input);

      // Progress: 50% - Plan steps generated
      this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 50 }});

      const planJson = this.formatPlanAsJson(steps, ctx.input);

      // Progress: 75% - Plan formatted
      this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 75 }});

      // Progress: 100% - Complete
      this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 100 }});

      this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id }});
      return { ok: true, output: { planJson } };

    } catch (error) {
      this.bus.publish({
        ts: Date.now(),
        type: 'error',
        payload: {
          agent: 'SYNTH',
          message: error instanceof Error ? error.message : 'Unknown planning error',
          details: error instanceof Error ? error.stack : String(error)
        }
      });
      this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id }});
      return { ok: false, error: `Planning failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  private generatePlanSteps(input: SynthInput): PlanStep[] {
    const steps: PlanStep[] = [];
    const planVerbs = ['write', 'create', 'generate', 'run', 'test'];
    
    // Analyze input to determine plan complexity (1-5 steps)
    const complexity = this.determinePlanComplexity(input);
    
    for (let i = 0; i < complexity; i++) {
      const stepId = `S${i + 1}`;
      const verb = planVerbs[i % planVerbs.length];
      const description = this.generateStepDescription(verb, input, i + 1, complexity);
      const dependsOn = i === 0 ? [] : [`S${i}`];

      steps.push({
        step_id: stepId,
        description,
        depends_on: dependsOn,
        status: 'pending',
        artifacts: [],
        attempts: 0,
        max_attempts: 3
      });
    }

    return steps;
  }

  private determinePlanComplexity(input: SynthInput): number {
    const { clarifiedUserInput, constraints } = input;
    let complexity = 1;

    // Increase complexity based on input analysis
    if (clarifiedUserInput.includes('test') || clarifiedUserInput.includes('validate')) complexity++;
    if (clarifiedUserInput.includes('multiple') || clarifiedUserInput.includes('several')) complexity++;
    if (constraints.some(c => c.includes('step') || c.includes('phase'))) complexity++;
    if (clarifiedUserInput.length > 100) complexity++;

    return Math.min(Math.max(complexity, 1), 5);
  }

  private generateStepDescription(verb: string, input: SynthInput, stepNum: number, totalSteps: number): string {
    const { clarifiedUserInput } = input;
    
    if (totalSteps === 1) {
      return `${verb} ${clarifiedUserInput.toLowerCase()}`;
    }

    // Multi-step plans
    switch (stepNum) {
      case 1:
        return `${verb} initial implementation for ${this.extractMainObject(clarifiedUserInput)}`;
      case 2:
        return stepNum === totalSteps ? 
          `test and validate the implementation` : 
          `${verb} supporting components and configuration`;
      case 3:
        return stepNum === totalSteps ? 
          `test and validate the complete solution` : 
          `${verb} integration and connection logic`;
      case 4:
        return stepNum === totalSteps ? 
          `test and validate all components` : 
          `${verb} error handling and edge cases`;
      case 5:
        return `test and validate the complete implementation`;
      default:
        return `${verb} additional implementation details`;
    }
  }

  private extractMainObject(input: string): string {
    // Extract the main object/concept from the clarified input
    const words = input.toLowerCase().split(' ');
    const objectWords = words.filter(word => 
      !['a', 'an', 'the', 'that', 'this', 'create', 'build', 'make', 'generate', 'write'].includes(word)
    );
    return objectWords.slice(0, 3).join(' ') || 'the requested solution';
  }

  private formatPlanAsJson(steps: PlanStep[], input: SynthInput): string {
    const plan = {
      task_id: `task-${Date.now()}`,
      original_user_request: input.clarifiedUserInput,
      plan: steps,
      status: 'pending'
    };

    return JSON.stringify(plan, null, 2);
  }
}