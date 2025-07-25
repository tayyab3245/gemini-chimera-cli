import { ChimeraEventBus } from '../event-bus/bus.js';
import { AgentType } from '../event-bus/types.js';
import type { AgentContext, AgentResult } from './agent.js';
import { buildContextSlice } from '../context/broker.js';
import type { GeminiChat } from '../core/geminiChat.js';

interface KernelOutput {
  clarifiedUserInput: string;          // concise requirement sentence
  assumptions: string[];               // auto-detected assumptions
  constraints: string[];               // any obvious constraints
}

export class KernelAgent {
  readonly id = AgentType.KERNEL;

  constructor(private bus: ChimeraEventBus, private geminiChat?: GeminiChat) {}

  async run(ctx: AgentContext<{ userInput: string }>): Promise<AgentResult<string>> {
    this.bus.publish({ ts: Date.now(), type: 'agent-start', payload: { id: this.id }});
    
    try {
      // Progress: 25% - Starting ACK handshake
      this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 25 } });
      this.bus.publish({ ts: Date.now(), type: 'log', payload: `${this.id} performing ACK handshake` });

      // Progress: 50% - Calling GeminiChat
      this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 50 } });
      
      // Perform ACK handshake with GeminiChat if available
      if (this.geminiChat) {
        const ackResponse = await this.geminiChat.sendMessage(
          { message: "Respond with only the word 'ACK'." },
          "kernel-ack-handshake"
        );
        
        // Extract ACK text from response
        let ackText = 'ACK'; // default fallback
        if (ackResponse?.candidates?.[0]?.content?.parts) {
          ackText = ackResponse.candidates[0].content.parts
            .map((part: any) => part.text)
            .join('')
            .trim();
        }
        
        // Progress: 100% - Complete
        this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 100 } });
        this.bus.publish({ ts: Date.now(), type: 'log', payload: `${this.id} ACK handshake successful` });
        this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id }});
        
        return { ok: true, output: ackText };
      } else {
        // Fallback: return simple ACK without GeminiChat
        this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 100 } });
        this.bus.publish({ ts: Date.now(), type: 'log', payload: `${this.id} returning simple ACK (no GeminiChat)` });
        this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id }});
        
        return { ok: true, output: 'ACK' };
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during ACK handshake';
      this.bus.publish({ 
        ts: Date.now(), 
        type: 'error', 
        payload: { 
          agent: this.id, 
          message: errorMessage,
          stack: error instanceof Error ? error.stack : undefined
        } 
      });
      this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id }});
      
      return { ok: false, error: errorMessage };
    }
  }
}