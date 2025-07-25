import { ChimeraEventBus } from '../event-bus/bus.js';
import { AgentType } from '../event-bus/types.js';
import type { AgentContext, AgentResult } from './agent.js';
import type { GeminiChat } from '../core/geminiChat.js';
import { withTimeout, withRetries } from '../coordination/recovery.js';

export class KernelAgent {
  readonly id = AgentType.KERNEL;

  constructor(private bus: ChimeraEventBus, private geminiChat: GeminiChat) {}

  async run(ctx: AgentContext<{ userInput: string }>): Promise<AgentResult<string>> {
    this.bus.publish({ ts: Date.now(), type: 'agent-start', payload: { id: this.id }});
    
    try {
      // Progress: 25% - Starting analysis
      this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 25 } });
      this.bus.publish({ ts: Date.now(), type: 'log', payload: `${this.id} analyzing user input` });

      // Progress: 50% - Calling Gemini
      this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 50 } });
      this.bus.publish({ ts: Date.now(), type: 'log', payload: `${this.id} calling Gemini for ACK handshake` });
      
      // Progress: 75% - Processing response
      this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 75 } });
      
      // Call GeminiChat with the hard-coded prompt wrapped in timeout and retries
      const response = await withRetries(async () => {
        return await withTimeout(
          this.geminiChat.sendMessage(
            { message: "Respond with only the word 'ACK'." },
            "kernel-ack-handshake"
          ),
          60_000
        );
      }, 3);
      
      // Extract text from response
      const responseText = response.candidates?.[0]?.content?.parts?.map((part) => part.text).join('') || '';
      const output = responseText.trim();

      // Progress: 100% - Complete
      this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 100 } });

      this.bus.publish({ ts: Date.now(), type: 'log', payload: `${this.id} received response: ${output}` });
      this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id }});
      
      return { ok: true, output };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during kernel processing';
      const stack = error instanceof Error ? error.stack : undefined;
      
      this.bus.publish({ 
        ts: Date.now(), 
        type: 'error', 
        payload: { 
          agent: 'KERNEL' as any, 
          message: errorMessage,
          stack
        } 
      });
      this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id }});
      
      return { ok: false, error: errorMessage };
    }
  }
}