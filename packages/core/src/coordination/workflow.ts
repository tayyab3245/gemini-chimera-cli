
import { ChimeraEventBus } from '../event-bus/bus.js';
import { ProgressPayload } from '../event-bus/types.js';
import { KernelAgent } from '../agents/kernel.js';
import { SynthAgent } from '../agents/synth.js';
import { DriveAgent } from '../agents/drive.js';
import { AuditAgent } from '../agents/audit.js';
import { withTimeout, withRetries } from './recovery.js';
import type { AgentContext } from '../agents/agent.js';

export enum WorkflowState {
  INIT = 'INIT',
  PLANNING = 'PLANNING',
  EXECUTING = 'EXECUTING',
  REVIEW = 'REVIEW',
  DONE = 'DONE'
}

export function advance(current: WorkflowState, event: string): WorkflowState {
  const transitions: Record<WorkflowState, Record<string, WorkflowState>> = {
    [WorkflowState.INIT]: {
      'start': WorkflowState.PLANNING
    },
    [WorkflowState.PLANNING]: {
      'plan_ready': WorkflowState.EXECUTING,
      'restart': WorkflowState.INIT
    },
    [WorkflowState.EXECUTING]: {
      'execution_complete': WorkflowState.REVIEW,
      'restart': WorkflowState.INIT
    },
    [WorkflowState.REVIEW]: {
      'review_pass': WorkflowState.DONE,
      'review_fail': WorkflowState.PLANNING,
      'restart': WorkflowState.INIT
    },
    [WorkflowState.DONE]: {
      'restart': WorkflowState.INIT
    }
  };

  const stateTransitions = transitions[current];
  if (!stateTransitions || !(event in stateTransitions)) {
    throw new Error('illegal transition');
  }

  return stateTransitions[event];
}

export class WorkflowStateMachine {
  async runOnce(userRequest: string): Promise<void> {
    // TODO: real implementation will be added in later tickets.
    console.log('[FSM] received', userRequest);
  }
}

export class WorkflowEngine {
  private bus: ChimeraEventBus;
  private kernel: KernelAgent;
  private synth: SynthAgent;
  private drive: DriveAgent;
  private audit: AuditAgent;
  private state: WorkflowState = WorkflowState.INIT;

  constructor() {
    this.bus = new ChimeraEventBus();
    this.kernel = new KernelAgent(this.bus);
    this.synth = new SynthAgent(this.bus);
    this.drive = new DriveAgent(this.bus);
    this.audit = new AuditAgent(this.bus);
  }

  async run(raw: { userInput: string }): Promise<any> {
    try {
      // Push initial event
      this.bus.publish({ ts: Date.now(), type: 'log', payload: 'workflow-start' });
      
      // Advance to planning state
      this.state = advance(this.state, 'start');
      
      // 1. Kernel phase
      const kernelContext: AgentContext<{ userInput: string }> = {
        input: { userInput: raw.userInput },
        bus: this.bus
      };
      
      const kernelResult = await withRetries(
        () => withTimeout(this.kernel.run(kernelContext), 60_000),
        3
      );
      
      if (!kernelResult.ok) {
        throw new Error(`Kernel failed: ${kernelResult.error}`);
      }

      // 2. Synth phase - advance to executing
      this.state = advance(this.state, 'plan_ready');
      
      const synthContext: AgentContext<{ userInput: string; needToKnow: string }> = {
        input: { userInput: raw.userInput, needToKnow: 'minimal context' },
        bus: this.bus
      };
      
      const synthResult = await withRetries(
        () => withTimeout(this.synth.run(synthContext), 60_000),
        3
      );
      
      if (!synthResult.ok || !synthResult.output) {
        throw new Error(`Synth failed: ${synthResult.error}`);
      }

      // 3. Drive phase - execute each step
      let planSteps: any[] = [];
      try {
        const plan = JSON.parse(synthResult.output.planJson);
        planSteps = plan.plan || [];
      } catch (error) {
        throw new Error(`Invalid planJson structure: ${error instanceof Error ? error.message : String(error)}`);
      }

      const totalSteps = planSteps.length;
      let allArtifacts: string[] = [];

      for (let stepIndex = 0; stepIndex < totalSteps; stepIndex++) {
        const step = planSteps[stepIndex];
        const stepId = step.step_id || step.stepId || `step_${stepIndex + 1}`;
        
        const driveContext: AgentContext<{ stepJson: any }> = {
          input: { 
            stepJson: { 
              stepId: stepId,
              description: step.description,
              planJson: synthResult.output.planJson 
            } 
          },
          bus: this.bus
        };
        
        const driveResult = await withRetries(
          () => withTimeout(this.drive.run(driveContext), 60_000),
          3
        );
        
        if (!driveResult.ok || !driveResult.output) {
          throw new Error(`Drive failed on step ${stepId}: ${driveResult.error}`);
        }

        // Collect artifacts from this step
        allArtifacts.push(...driveResult.output.artifacts);

        // Emit progress event after successful step completion
        const percent = Math.round(((stepIndex + 1) / totalSteps) * 100);
        const progressPayload: ProgressPayload = {
          stepId: stepId,
          stepIndex: stepIndex,
          totalSteps: totalSteps,
          percent: percent
        };
        
        this.bus.publish({ 
          ts: Date.now(), 
          type: 'progress', 
          payload: progressPayload 
        });
      }

      // Advance to review state
      this.state = advance(this.state, 'execution_complete');

      // 4. Audit phase
      const auditContext: AgentContext<{ planJson: string; artifacts: string[] }> = {
        input: { 
          planJson: synthResult.output.planJson,
          artifacts: allArtifacts
        },
        bus: this.bus
      };
      
      const auditResult = await withRetries(
        () => withTimeout(this.audit.run(auditContext), 60_000),
        3
      );
      
      if (!auditResult.ok || !auditResult.output) {
        throw new Error(`Audit failed: ${auditResult.error}`);
      }

      // Advance to done state
      this.state = advance(this.state, 'review_pass');
      
      this.bus.publish({ ts: Date.now(), type: 'log', payload: 'workflow-complete' });
      
      return auditResult.output;

    } catch (error) {
      // Publish error event and set state to DONE (fail)
      this.bus.publish({ 
        ts: Date.now(), 
        type: 'error', 
        payload: `Workflow failed: ${error instanceof Error ? error.message : String(error)}` 
      });
      this.state = WorkflowState.DONE;
      throw error;
    }
  }
}

// Inline smoke test
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith('workflow.js')) {
  async function runSmokeTest() {
    try {
      const engine = new WorkflowEngine();
      const result = await engine.run({ userInput: 'Echo hello' });
      
      if (!result || typeof result.pass !== 'boolean') {
        throw new Error('Invalid result from workflow');
      }
      
      console.log('Workflow smoke-test passed ✅');
    } catch (error) {
      console.error('Workflow smoke-test failed:', error);
      process.exit(1);
    }
  }

  runSmokeTest();
}
