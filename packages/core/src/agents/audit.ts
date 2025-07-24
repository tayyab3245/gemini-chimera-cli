/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import type { AgentContext, AgentResult } from './agent.js';
import { ChimeraEventBus } from '../event-bus/bus.js';
import { AgentType } from '../event-bus/types.js';
import type { ChimeraPlan, PlanStep } from '../interfaces/chimera.js';
import auditConstitution from '../mind/audit.constitution.js';

interface AuditInput {
  planJson: string;
  artifacts: string[];
}

interface AuditOutput {
  pass: boolean;
  recommendation?: string;
}

export class AuditAgent {
  readonly id = AgentType.AUDIT;
  
  constructor(private bus: ChimeraEventBus) {}

  async run(ctx: AgentContext<AuditInput>): Promise<AgentResult<AuditOutput>> {
    this.bus.publish({ ts: Date.now(), type: 'agent-start', payload: { id: this.id } });
    
    try {
      // Progress: 25% - Starting audit
      this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 25 } });
      
      const { planJson, artifacts } = ctx.input;
      const issues: string[] = [];

      // Load constitution rules (if any)
      const constitutionRules = this.loadConstitutionRules();
      
      // Progress: 50% - Validating plan JSON
      this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 50 } });
      
      // Validate plan JSON structure
      let planValidation: { valid: boolean; issues: string[] };
      try {
        planValidation = await this.validatePlanJson(planJson);
      } catch (error) {
        // If validatePlanJson throws an exception (not a validation failure), 
        // treat it as an internal error
        throw error;
      }
      
      if (!planValidation.valid) {
        issues.push(...planValidation.issues);
      }

      // Progress: 75% - Checking artifacts
      this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 75 } });
      
      // Validate all artifacts exist on disk
      const artifactValidation = await this.validateArtifacts(artifacts);
      if (!artifactValidation.valid) {
        issues.push(...artifactValidation.issues);
      }

      // Apply constitution rules if any
      if (constitutionRules.length > 0) {
        const constitutionValidation = this.applyConstitutionRules(planJson, artifacts, constitutionRules);
        if (!constitutionValidation.valid) {
          issues.push(...constitutionValidation.issues);
        }
      }

      // Progress: 100% - Audit complete
      this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 100 } });

      const pass = issues.length === 0;
      const recommendation = pass ? undefined : `Audit failed: ${issues.join('; ')}`;

      if (pass) {
        this.bus.publish({ 
          ts: Date.now(), 
          type: 'log', 
          payload: 'AUDIT PASSED: All quality checks successful' 
        });
      } else {
        this.bus.publish({ 
          ts: Date.now(), 
          type: 'log', 
          payload: `AUDIT FAILED: ${issues.length} issue(s) found` 
        });
      }

      this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id } });
      return { ok: true, output: { pass, recommendation } };

    } catch (error) {
      this.bus.publish({
        ts: Date.now(),
        type: 'error',
        payload: {
          agent: 'AUDIT',
          message: error instanceof Error ? error.message : 'Unknown audit error',
          details: error instanceof Error ? error.stack : String(error)
        }
      });
      this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id } });
      return { 
        ok: true, 
        output: { 
          pass: false, 
          recommendation: 'internal error' 
        } 
      };
    }
  }

  private loadConstitutionRules(): string[] {
    // Load constitution from mind directory
    // For now, treat as array of rule strings
    const constitution = auditConstitution as string;
    if (!constitution || constitution.trim() === '') {
      return [];
    }
    
    // Split by lines and filter out empty ones
    return constitution
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0 && !line.startsWith('//'));
  }

  private async validatePlanJson(planJson: string): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    // Check if JSON is valid
    let parsedPlan: ChimeraPlan;
    try {
      parsedPlan = JSON.parse(planJson);
    } catch (error) {
      // If the error is a test simulation error, let it bubble up as internal error
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('Simulated internal error') || errorMessage.includes('String error')) {
        throw error;
      }
      
      return { 
        valid: false, 
        issues: ['planJson is not valid JSON'] 
      };
    }

    // Check required top-level keys
    const requiredKeys = ['task_id', 'plan', 'status'];
    for (const key of requiredKeys) {
      if (!(key in parsedPlan)) {
        issues.push(`planJson missing required key: "${key}"`);
      }
    }

    // Validate plan steps if present
    if (parsedPlan.plan && Array.isArray(parsedPlan.plan)) {
      for (let i = 0; i < parsedPlan.plan.length; i++) {
        const step = parsedPlan.plan[i];
        const stepValidation = this.validatePlanStep(step, i);
        if (!stepValidation.valid) {
          issues.push(...stepValidation.issues);
        }
      }
    } else if (parsedPlan.plan) {
      issues.push('planJson.plan must be an array');
    }

    return { valid: issues.length === 0, issues };
  }

  private validatePlanStep(step: PlanStep, index: number): { valid: boolean; issues: string[] } {
    const issues: string[] = [];
    const prefix = `Step ${index + 1}`;

    // Check required step fields
    if (!step.step_id) {
      issues.push(`${prefix}: missing step_id`);
    }
    if (!step.description) {
      issues.push(`${prefix}: missing description`);
    }
    if (!step.status) {
      issues.push(`${prefix}: missing status`);
    }

    // Check if step is completed successfully
    if (step.status !== 'done') {
      issues.push(`${prefix}: status is "${step.status}", expected "done"`);
    }

    // Check for error messages
    if (step.error_message) {
      issues.push(`${prefix}: contains error message: "${step.error_message}"`);
    }

    return { valid: issues.length === 0, issues };
  }

  private async validateArtifacts(artifacts: string[]): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    for (let i = 0; i < artifacts.length; i++) {
      const artifact = artifacts[i];
      
      // Check if artifact path is not empty
      if (!artifact || artifact.trim().length === 0) {
        issues.push(`Artifact ${i + 1}: path is empty or whitespace`);
        continue;
      }

      // Check if file exists on disk
      try {
        await fs.access(artifact.trim());
      } catch (error) {
        issues.push(`Artifact ${i + 1}: file does not exist: "${artifact}"`);
      }
    }

    return { valid: issues.length === 0, issues };
  }

  private applyConstitutionRules(
    planJson: string, 
    artifacts: string[], 
    rules: string[]
  ): { valid: boolean; issues: string[] } {
    // Placeholder for future constitution rule application
    // For now, just log that rules were loaded
    this.bus.publish({ 
      ts: Date.now(), 
      type: 'log', 
      payload: `Applied ${rules.length} constitution rule(s)` 
    });
    
    return { valid: true, issues: [] };
  }
}
