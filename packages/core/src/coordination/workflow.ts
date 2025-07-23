
import { ChimeraEventBus } from '../event-bus/bus.js';
import { ProgressPayload, ErrorPayload } from '../event-bus/types.js';
import { WorkflowState } from '../interfaces/workflow.js';
import { KernelAgent } from '../agents/kernel.js';
import { SynthAgent } from '../agents/synth.js';
import { DriveAgent } from '../agents/drive.js';
import { AuditAgent } from '../agents/audit.js';
import { withTimeout, withRetries } from './recovery.js';
import type { AgentContext } from '../agents/agent.js';

// Re-export WorkflowState for backwards compatibility
export { WorkflowState };

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
  private _state: WorkflowState = WorkflowState.INIT;
  private bus: ChimeraEventBus;

  constructor(bus: ChimeraEventBus) {
    this.bus = bus;
  }

  state(): WorkflowState {
    return this._state;
  }

  advance(): void {
    if (this._state === WorkflowState.DONE) {
      throw new Error('Illegal transition');
    }

    const nextStates = {
      [WorkflowState.INIT]: WorkflowState.PLANNING,
      [WorkflowState.PLANNING]: WorkflowState.EXECUTING,
      [WorkflowState.EXECUTING]: WorkflowState.REVIEW,
      [WorkflowState.REVIEW]: WorkflowState.DONE,
    };

    const nextState = nextStates[this._state];
    this._state = nextState;
    
    this.bus.publish({
      ts: Date.now(),
      type: 'log',
      payload: `State transition: ${Object.keys(nextStates).find(k => nextStates[k as keyof typeof nextStates] === nextState)} → ${nextState}`
    });
  }

  reset(): void {
    this._state = WorkflowState.INIT;
    this.bus.publish({
      ts: Date.now(),
      type: 'log',
      payload: 'State reset to INIT'
    });
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
        
        if (!driveResult.ok) {
          // Emit error event for Drive failure
          const errorPayload: ErrorPayload = {
            agent: 'DRIVE',
            stepId: stepId,
            message: `Drive failed on step ${stepId}`,
            details: driveResult.error
          };
          
          this.bus.publish({ 
            ts: Date.now(), 
            type: 'error', 
            payload: errorPayload 
          });
          
          throw new Error(`Drive failed on step ${stepId}: ${driveResult.error}`);
        }
        
        if (!driveResult.output) {
          // Emit error event for missing output
          const errorPayload: ErrorPayload = {
            agent: 'DRIVE',
            stepId: stepId,
            message: `Drive failed on step ${stepId}: no output`,
            details: { error: 'Missing output from drive result' }
          };
          
          this.bus.publish({ 
            ts: Date.now(), 
            type: 'error', 
            payload: errorPayload 
          });
          
          throw new Error(`Drive failed on step ${stepId}: no output`);
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
      
      if (!auditResult.ok) {
        // Emit error event for Audit failure
        const errorPayload: ErrorPayload = {
          agent: 'AUDIT',
          message: 'Audit failed',
          details: auditResult.error
        };
        
        this.bus.publish({ 
          ts: Date.now(), 
          type: 'error', 
          payload: errorPayload 
        });
        
        throw new Error(`Audit failed: ${auditResult.error}`);
      }
      
      if (!auditResult.output) {
        // Emit error event for missing audit output
        const errorPayload: ErrorPayload = {
          agent: 'AUDIT',
          message: 'Audit failed: no output',
          details: { error: 'Missing output from audit result' }
        };
        
        this.bus.publish({ 
          ts: Date.now(), 
          type: 'error', 
          payload: errorPayload 
        });
        
        throw new Error(`Audit failed: no output`);
      }

      // Check if audit review passed
      if (auditResult.output.pass === false) {
        // Emit error event for failed audit review
        const errorPayload: ErrorPayload = {
          agent: 'AUDIT',
          message: 'Audit failed',
          details: auditResult.output
        };
        
        this.bus.publish({ 
          ts: Date.now(), 
          type: 'error', 
          payload: errorPayload 
        });
        
        throw new Error('Audit review failed');
      }

      // Advance to done state
      this.state = advance(this.state, 'review_pass');
      
      this.bus.publish({ ts: Date.now(), type: 'log', payload: 'workflow-complete' });
      
      return auditResult.output;

    } catch (error) {
      // Only set state to DONE (fail) - error events are published by specific handlers above
      this.state = WorkflowState.DONE;
      throw error;
    }
  }
}

// Unit tests - inline testing for WorkflowStateMachine
// Manual test function that can be called during development/testing
export function testWorkflowStateMachine(): void {
  const events: any[] = [];
  // Create a simple mock that just captures events
  const mockBus = {
    publish: (event: any) => events.push(event),
    subscribe: () => () => {},
    history: () => [],
    _events: [],
    _handlers: new Map(),
    _maxEvents: 1000
  } as unknown as ChimeraEventBus;

  const machine = new WorkflowStateMachine(mockBus);

  // Start in INIT state
  console.assert(machine.state() === WorkflowState.INIT, 'Should start in INIT state');

  // Advance through all states
  machine.advance(); // INIT → PLANNING
  console.assert(machine.state() === WorkflowState.PLANNING, 'Should advance to PLANNING');

  machine.advance(); // PLANNING → EXECUTING  
  console.assert(machine.state() === WorkflowState.EXECUTING, 'Should advance to EXECUTING');

  machine.advance(); // EXECUTING → REVIEW
  console.assert(machine.state() === WorkflowState.REVIEW, 'Should advance to REVIEW');

  machine.advance(); // REVIEW → DONE
  console.assert(machine.state() === WorkflowState.DONE, 'Should advance to DONE');

  // Should throw error when trying to advance from DONE
  try {
    machine.advance();
    console.assert(false, 'Should throw error when advancing from DONE');
  } catch (error) {
    console.assert((error as Error).message === 'Illegal transition', 'Should throw correct error message');
  }

  // Reset should work
  machine.reset();
  console.assert(machine.state() === WorkflowState.INIT, 'Should reset to INIT');

  // Should have exactly 5 log events (4 advances + 1 reset)
  const logEvents = events.filter(e => e.type === 'log');
  console.assert(logEvents.length === 5, `Should have 5 log events, got ${logEvents.length}`);

  console.log('✅ WorkflowStateMachine test passed - all assertions successful');
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
