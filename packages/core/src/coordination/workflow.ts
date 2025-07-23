
import { ChimeraEventBus } from '../event-bus/bus.js';
import { KernelAgent } from '../agents/kernel.js';
import { SynthAgent } from '../agents/synth.js';
import { DriveAgent } from '../agents/drive.js';
import { AuditAgent } from '../agents/audit.js';
import type { AgentContext } from '../agents/agent.js';

// Inline timeout and retry helpers for T12
function withTimeout<T>(p: Promise<T>, ms = 60_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('timeout'));
    }, ms);

    p.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

async function withRetries<T>(
  fn: () => Promise<T>,
  max = 3,
  firstDelayMs = 250,
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= max; attempt++) {
    try {
      if (attempt > 0) {
        const delayMs = firstDelayMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === max) {
        throw lastError;
      }
    }
  }
  
  throw lastError!;
}

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

      // 3. Drive phase - execute each step (for now, just one step)
      const driveContext: AgentContext<{ stepJson: any }> = {
        input: { stepJson: { stepId: "step_1", planJson: synthResult.output.planJson } },
        bus: this.bus
      };
      
      const driveResult = await withRetries(
        () => withTimeout(this.drive.run(driveContext), 60_000),
        3
      );
      
      if (!driveResult.ok || !driveResult.output) {
        throw new Error(`Drive failed: ${driveResult.error}`);
      }

      // Advance to review state
      this.state = advance(this.state, 'execution_complete');

      // 4. Audit phase
      const auditContext: AgentContext<{ planJson: string; artifacts: string[] }> = {
        input: { 
          planJson: synthResult.output.planJson,
          artifacts: driveResult.output.artifacts
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
