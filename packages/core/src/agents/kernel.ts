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
      // Progress: 25% - Starting consultant analysis
      this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 25 } });
      this.bus.publish({ ts: Date.now(), type: 'log', payload: `${this.id} analyzing user request` });

      // Progress: 50% - Calling GeminiChat for consultant rewrite
      this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 50 } });
      
      // Use AI-as-Consultant prompt to rewrite user input
      if (this.geminiChat) {
        const consultantPrompt = `Rewrite the user request as one short (< 50 chars) task sentence. Return **only** that sentence.

User request: "${ctx.input.userInput}"`;

        const consultantResponse = await this.geminiChat.sendMessage(
          { message: consultantPrompt },
          "kernel-consultant-rewrite"
        );
        
        // Extract rewritten task sentence from response
        let taskSentence = 'Process user request'; // default fallback
        if (consultantResponse?.candidates?.[0]?.content?.parts) {
          taskSentence = consultantResponse.candidates[0].content.parts
            .map((part: any) => part.text)
            .join('')
            .trim();
        }
        
        // Progress: 100% - Complete
        this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 100 } });
        this.bus.publish({ ts: Date.now(), type: 'log', payload: taskSentence });
        this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id }});
        
        return { ok: true, output: taskSentence };
      } else {
        // Fallback: return simple task description without GeminiChat
        const fallbackTask = 'Process user request';
        this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 100 } });
        this.bus.publish({ ts: Date.now(), type: 'log', payload: fallbackTask });
        this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id }});
        
        return { ok: true, output: fallbackTask };
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during consultant analysis';
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