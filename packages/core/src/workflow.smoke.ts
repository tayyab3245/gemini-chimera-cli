#!/usr/bin/env node
/**
 * Smoke test harness for Chimera agent workflow
 * Tests that agents instantiate, events flow, and workflow advances
 */

import { ChimeraEventBus } from './event-bus/bus.js';
import { KernelAgent } from './agents/kernel.js';
import { SynthAgent } from './agents/synth.js';
import { DriveAgent } from './agents/drive.js';
import { AuditAgent } from './agents/audit.js';
import type { AgentContext } from './agents/agent.js';
import type { GeminiChat } from './core/geminiChat.js';

async function runSmokeTest() {
  console.log('🧪 Starting Chimera workflow smoke test...');

  // 1. Instantiate ChimeraEventBus
  const bus = new ChimeraEventBus();

  // 2. Create mock GeminiChat for dependency injection
  const mockGeminiChat = {
    sendMessage: async () => ({ text: () => 'ACK' })
  } as unknown as GeminiChat;

  // 3. Create agents with the bus and dependencies
  const kernel = new KernelAgent(bus, mockGeminiChat);
  const synth = new SynthAgent(bus);
  const drive = new DriveAgent(bus);
  const audit = new AuditAgent(bus);

  console.log('✓ Agents instantiated');

  // 3. Feed Kernel dummy context
  const kernelContext: AgentContext<{ userInput: string }> = {
    input: { userInput: "echo 'hi'" },
    bus
  };

  // 4. Run the full workflow: Kernel → Synth → Drive → Audit
  console.log('🔄 Running workflow...');

  // Kernel phase
  const kernelResult = await kernel.run(kernelContext);
  console.assert(kernelResult.ok === true, 'Kernel should succeed');
  console.log('✓ Kernel completed');

  // Synth phase
  const synthContext: AgentContext<{ clarifiedUserInput: string; assumptions: string[]; constraints: string[] }> = {
    input: { 
      clarifiedUserInput: "echo 'hi'", 
      assumptions: ["Shell command execution"], 
      constraints: ["Simple echo command"] 
    },
    bus
  };
  const synthResult = await synth.run(synthContext);
  console.assert(synthResult.ok === true, 'Synth should succeed');
  console.assert(synthResult.output?.planJson, 'Synth should return planJson');
  console.log('✓ Synth completed');

  // Drive phase
  const driveContext: AgentContext<{ planStep: any; artifacts: string[] }> = {
    input: { 
      planStep: {
        step_id: "step_1",
        description: "echo 'hi'",
        depends_on: [],
        status: 'pending',
        artifacts: [],
        attempts: 0,
        max_attempts: 3
      },
      artifacts: []
    },
    bus
  };
  const driveResult = await drive.run(driveContext);
  console.assert(driveResult.ok === true, 'Drive should succeed');
  console.assert(driveResult.output?.artifacts, 'Drive should return artifacts');
  console.log('✓ Drive completed');

  // Audit phase
  const auditContext: AgentContext<{ planJson: string; artifacts: string[] }> = {
    input: { 
      planJson: synthResult.output!.planJson, 
      artifacts: driveResult.output!.artifacts 
    },
    bus
  };
  const auditResult = await audit.run(auditContext);

  // 5. Assert final Audit result
  console.assert(auditResult.ok === true, 'Audit should succeed');
  console.assert(auditResult.output?.pass === true, 'Audit should pass');
  console.log('✓ Audit completed');

  // 6. Print last 5 events from bus for manual inspection
  const events = bus.history();
  const lastFiveEvents = events.slice(-5);
  console.log('\n📋 Last 5 events from bus:');
  console.log(JSON.stringify(lastFiveEvents, null, 2));

  console.log('\n✅ SMOKE TEST PASSED');
}

// Run the smoke test
runSmokeTest().catch((error) => {
  console.error('💥 SMOKE TEST FAILED:', error);
  process.exit(1);
});
