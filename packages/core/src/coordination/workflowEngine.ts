import { ChimeraEventBus } from '../event-bus/bus.js';
import { AgentKind } from '../interfaces/agent.js';
import { WorkflowState } from '../interfaces/workflow.js';
import { buildContextSlice, BaseContext } from '../context/broker.js';
import { WorkflowStateMachine } from './workflow.js';
import { withTimeout, withRetries } from './recovery.js';
import { KernelAgent } from '../agents/kernel.js';
import { SynthAgent } from '../agents/synth.js';
import { DriveAgent } from '../agents/drive.js';
import { AuditAgent } from '../agents/audit.js';
import type { AgentContext } from '../agents/agent.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { GeminiChat } from '../core/geminiChat.js';

export class WorkflowEngine {
  private stateMachine: WorkflowStateMachine;
  private kernel: KernelAgent;
  private synth: SynthAgent;
  private drive: DriveAgent;
  private audit: AuditAgent;

  constructor(private bus: ChimeraEventBus, private geminiChat: GeminiChat, private toolRegistry?: ToolRegistry) {
    this.stateMachine = new WorkflowStateMachine(bus);
    this.kernel = new KernelAgent(bus, geminiChat);
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

    try {
      // ③ call Kernel → Synth → Drive → Audit in sequence with retries and timeouts
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
    } catch (error) {
      // Publish error event and re-throw to abort workflow
      this.bus.publish({
        ts: Date.now(),
        type: 'error',
        payload: {
          agent: 'WORKFLOW',
          message: error instanceof Error ? error.message : 'Unknown workflow error',
          stack: error instanceof Error ? error.stack : String(error)
        }
      });
      throw error;
    }
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

    try {
      // Execute agent with retry and timeout logic
      await withRetries(
        () => withTimeout(this.executeAgent(agentKind, fullContext), 60_000),
        3
      );
    } catch (error) {
      // Publish error event on final failure
      this.bus.publish({
        ts: Date.now(),
        type: 'error',
        payload: {
          agent: agentKind,
          message: error instanceof Error ? error.message : 'Unknown agent error',
          stack: error instanceof Error ? error.stack : String(error)
        }
      });
      throw error; // Re-throw to abort workflow
    }

    // Emit agent-end event
    this.bus.publish({
      ts: Date.now(),
      type: 'log',
      payload: `agent-end-${agentKind}`
    });
  }

  private async executeAgent(agentKind: AgentKind, fullContext: BaseContext): Promise<void> {
    // Build context slice for the specific agent
    const contextSlice = buildContextSlice(agentKind, fullContext);
    const agentContext: AgentContext<any> = {
      input: contextSlice,
      bus: this.bus,
      dependencies: {
        toolRegistry: this.toolRegistry
      }
    };

    // Execute the appropriate agent
    let result;
    switch (agentKind) {
      case 'KERNEL':
        result = await this.kernel.run(agentContext);
        break;
      case 'SYNTH':
        result = await this.synth.run(agentContext);
        break;
      case 'DRIVE':
        result = await this.drive.run(agentContext);
        break;
      case 'AUDIT':
        result = await this.audit.run(agentContext);
        break;
      default:
        throw new Error(`Unknown agent kind: ${agentKind}`);
    }

    // Check if the agent execution was successful
    if (!result.ok) {
      throw new Error(result.error || `Agent ${agentKind} execution failed`);
    }

    // Update fullContext with any outputs (for future implementation)
    // This is where we would merge agent outputs back into the full context
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

    const mockGeminiChat = {} as unknown as GeminiChat;

    const engine = new WorkflowEngine(mockBus, mockGeminiChat);
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
