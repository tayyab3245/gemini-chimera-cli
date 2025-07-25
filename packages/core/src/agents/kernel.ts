import { ChimeraEventBus } from '../event-bus/bus.js';
import { AgentType } from '../event-bus/types.js';
import type { AgentContext, AgentResult } from './agent.js';
import { buildContextSlice } from '../context/broker.js';
import type { GeminiChat } from '../core/geminiChat.js';
import { loadPrompt } from '../utils/mindLoader.js';

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

      // Progress: 50% - Calling GeminiChat for consultant analysis
      this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 50 } });
      
      // Use AI-as-Consultant prompt to analyze user input
      if (this.geminiChat) {
        // Load prompt dynamically from mind directory
        const consultPrompt = await loadPrompt('packages/core/src/mind/kernel.consult.prompt.ts');
        const prompt = consultPrompt || 'Rewrite user request in ≤50 chars.';
        
        const fullPrompt = `${prompt}

User request: "${ctx.input.userInput}"

Response:`;

        const consultantResponse = await this.geminiChat.sendMessage(
          { message: fullPrompt },
          "kernel-consultant-analysis"
        );
        
        // Extract response from Gemini
        let response = 'Process user request'; // default fallback
        if (consultantResponse?.candidates?.[0]?.content?.parts) {
          response = consultantResponse.candidates[0].content.parts
            .map((part: any) => part.text)
            .join('')
            .trim();
        }
        
        // Check if response is a follow-up question (ends with "?")
        if (response.endsWith('?')) {
          // Progress: 100% - Follow-up question generated
          this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 100 } });
          this.bus.publish({ ts: Date.now(), type: 'log', payload: `Follow-up question: ${response}` });
          this.bus.publish({ 
            ts: Date.now(), 
            type: 'agent-followup', 
            payload: { 
              agent: this.id, 
              question: response 
            } 
          });
          this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id }});
          
          return { ok: true, output: response };
        } else {
          // Progress: 100% - Task clarified
          this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 100 } });
          this.bus.publish({ ts: Date.now(), type: 'log', payload: `Clarified task: ${response}` });
          this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id }});
          
          return { ok: true, output: response };
        }
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