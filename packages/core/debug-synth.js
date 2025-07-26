// Debug script to test what SYNTH produces with "ACK" input
import { SynthAgent } from './src/agents/synth.js';
import { ChimeraEventBus } from './src/event-bus/bus.js';

const bus = new ChimeraEventBus();
const mockGeminiChat = {
  sendMessage: () => Promise.resolve({
    candidates: [{ content: { parts: [{ text: 'ACK' }] } }]
  })
};

const synthAgent = new SynthAgent(bus, mockGeminiChat);

const input = {
  clarifiedUserInput: 'ACK',
  assumptions: [],
  constraints: []
};

const context = {
  input,
  dependencies: {}
};

try {
  const result = await synthAgent.run(context);
  console.log('SYNTH result:', JSON.stringify(result, null, 2));
  
  if (result.ok && result.output) {
    console.log('Plan JSON:', result.output.planJson);
    const plan = JSON.parse(result.output.planJson);
    console.log('Parsed plan:', JSON.stringify(plan, null, 2));
    
    if (plan.plan && plan.plan[0]) {
      console.log('First step description:', plan.plan[0].description);
    }
  }
} catch (error) {
  console.error('Error:', error);
}
