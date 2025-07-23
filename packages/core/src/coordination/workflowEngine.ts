import { ChimeraEventBus } from '../event-bus/bus.js';
import { AgentKind } from '../interfaces/agent.js';
import { WorkflowState } from '../interfaces/workflow.js';
import { buildContextSlice, BaseContext } from '../context/broker.js';
import { WorkflowStateMachine } from './workflow.js';
import { KernelAgent } from '../agents/kernel.js';
import { SynthAgent } from '../agents/synth.js';
import { DriveAgent } from '../agents/drive.js';
import { AuditAgent } from '../agents/audit.js';

export class WorkflowEngine {
  private stateMachine: WorkflowStateMachine;
  private kernel: KernelAgent;
  private synth: SynthAgent;
  private drive: DriveAgent;
  private audit: AuditAgent;

  constructor(private bus: ChimeraEventBus) {
    this.stateMachine = new WorkflowStateMachine(bus);
    this.kernel = new KernelAgent(bus);
    this.synth = new SynthAgent(bus);
    this.drive = new DriveAgent(bus);
    this.audit = new AuditAgent(bus);
  }

  async run(userInput: string): Promise<void> {
    // ① publish workflow‑start
    this.bus.publish({
      ts: Date.now(),
      type: 'log',
      payload: 'workflow-start'
    });

    // ② build initial context
    const fullContext: BaseContext = {
      userInput,
      planJson: '{}',
      planStep: 'initial',
      artifacts: []
    };

    // ③ call Kernel → Synth → Drive → Audit in sequence
    await this.runAgent('KERNEL', fullContext);
    await this.runAgent('SYNTH', fullContext);
    await this.runAgent('DRIVE', fullContext);
    await this.runAgent('AUDIT', fullContext);

    // ④ publish workflow-complete
    this.bus.publish({
      ts: Date.now(),
      type: 'log',
      payload: 'workflow-complete'
    });
  }

  private async runAgent(agentKind: AgentKind, fullContext: BaseContext): Promise<void> {
    // Emit agent-start event
    this.bus.publish({
      ts: Date.now(),
      type: 'log',
      payload: `agent-start-${agentKind}`
    });

    // Advance state machine
    this.stateMachine.advance();

    // Run agent with dummy results for now (skip actual agent.run calls)
    // This is a skeleton implementation - real logic will be added in future tickets
    const dummyResult = { ok: true };

    // Emit agent-end event
    this.bus.publish({
      ts: Date.now(),
      type: 'log',
      payload: `agent-end-${agentKind}`
    });
  }
}

// Inline vitest smoke test
// @ts-ignore - vitest adds this at runtime  
if (typeof import.meta.vitest !== 'undefined') {
  // @ts-ignore - vitest adds this at runtime
  const { test, expect } = import.meta.vitest;

  test('WorkflowEngine emits correct event sequence', async () => {
    const events: any[] = [];
    const mockBus = {
      publish: (event: any) => events.push(event),
      subscribe: () => () => {},
      history: () => [],
    } as unknown as ChimeraEventBus;

    const engine = new WorkflowEngine(mockBus);
    await engine.run('test input');

    // Extract event payloads for easier testing
    const payloads = events.map(e => e.payload);

    // Verify event order: workflow‑start → 4 agent‑start/‑end pairs → workflow‑complete
    expect(payloads[0]).toBe('workflow-start');
    expect(payloads[1]).toBe('agent-start-KERNEL');
    expect(payloads[2]).toContain('State transition:'); // from state machine advance
    expect(payloads[3]).toBe('agent-end-KERNEL');
    expect(payloads[4]).toBe('agent-start-SYNTH');
    expect(payloads[5]).toContain('State transition:');
    expect(payloads[6]).toBe('agent-end-SYNTH');
    expect(payloads[7]).toBe('agent-start-DRIVE');
    expect(payloads[8]).toContain('State transition:');
    expect(payloads[9]).toBe('agent-end-DRIVE');
    expect(payloads[10]).toBe('agent-start-AUDIT');
    expect(payloads[11]).toContain('State transition:');
    expect(payloads[12]).toBe('agent-end-AUDIT');
    expect(payloads[13]).toBe('workflow-complete');

    // Verify we have exactly 4 agent-start events
    const agentStartEvents = payloads.filter(p => typeof p === 'string' && p.startsWith('agent-start-'));
    expect(agentStartEvents).toHaveLength(4);

    // Verify we have exactly 4 agent-end events
    const agentEndEvents = payloads.filter(p => typeof p === 'string' && p.startsWith('agent-end-'));
    expect(agentEndEvents).toHaveLength(4);
  });
}
