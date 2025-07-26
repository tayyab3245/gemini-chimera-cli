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

  /**
   * Compute confidence score for input clarity (0-1 scale)
   * Lower scores indicate vague/unclear inputs that need follow-up questions
   */
  private computeConfidenceScore(userInput: string): number {
    const input = userInput.toLowerCase().trim();
    
    // Factor 1: Token count (very short inputs are often vague)
    const tokens = input.split(/\s+/).filter(token => token.length > 0);
    const tokenScore = Math.min(tokens.length / 5, 1.0); // 5+ tokens = full score
    
    // Factor 2: Vague phrases detection
    const vaguePatterns = [
      'help me', 'do something', 'make it', 'fix this', 'fix it',
      'help with', 'work on', 'handle', 'deal with', 'take care',
      'make better', 'improve', 'optimize', 'enhance', 'update',
      'something', 'anything', 'stuff', 'things', 'whatever',
      'make my', 'make app better', 'better'
    ];
    
    const hasVaguePhrase = vaguePatterns.some(pattern => input.includes(pattern));
    const vagueScore = hasVaguePhrase ? 0.1 : 1.0; // Lower penalty for vague phrases
    
    // Factor 3: Specificity indicators (specific terms boost confidence)
    const specificPatterns = [
      'bug', 'error', 'function', 'class', 'variable', 'method',
      'login', 'authentication', 'database', 'api', 'endpoint',
      'component', 'module', 'file', 'directory', 'config'
    ];
    
    const hasSpecificTerm = specificPatterns.some(pattern => input.includes(pattern));
    const specificityBonus = hasSpecificTerm ? 0.2 : 0.0;
    
    // Combine factors (weighted average)
    const baseScore = (tokenScore * 0.3) + (vagueScore * 0.7);
    const finalScore = Math.min(baseScore + specificityBonus, 1.0);
    
    return finalScore;
  }

  async run(ctx: AgentContext<{ userInput: string }>): Promise<AgentResult<string>> {
    this.bus.publish({ ts: Date.now(), type: 'agent-start', payload: { id: this.id }});
    
    try {
      // Progress: 25% - Starting analysis
      this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 25 } });
      this.bus.publish({ ts: Date.now(), type: 'log', payload: `${this.id} analyzing user request` });

      // Progress: 30% - Computing confidence score
      this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 30 } });
      
      // Compute confidence score for input clarity
      const confidence = this.computeConfidenceScore(ctx.input.userInput);
      const isVague = confidence < 0.6; // Low confidence threshold as per P3.13.F requirement
      
      this.bus.publish({ ts: Date.now(), type: 'log', payload: `Confidence score: ${confidence.toFixed(2)} (${isVague ? 'vague' : 'clear'})` });

      // Progress: 50% - Calling GeminiChat for analysis
      this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 50 } });
      
      if (this.geminiChat) {
        let prompt: string;
        let analysisType: string;
        
        if (isVague) {
          // Use follow-up prompt for vague inputs
          const followupPrompt = await loadPrompt('packages/core/src/mind/kernel.followup.prompt.ts');
          prompt = followupPrompt || 'What specific task would you like help with?';
          analysisType = 'follow-up';
        } else {
          // Use consultant prompt for clear inputs
          const consultPrompt = await loadPrompt('packages/core/src/mind/kernel.consult.prompt.ts');
          prompt = consultPrompt || 'Rewrite user request in ≤50 chars.';
          analysisType = 'clarification';
        }
        
        const fullPrompt = `${prompt}

User request: "${ctx.input.userInput}"

Response:`;

        const response = await this.geminiChat.sendMessage(
          { message: fullPrompt },
          `kernel-${analysisType}-analysis`
        );
        
        // Extract response from Gemini
        let responseText = isVague ? 'Could you provide more details?' : 'Process user request';
        if (response?.candidates?.[0]?.content?.parts) {
          responseText = response.candidates[0].content.parts
            .map((part: any) => part.text)
            .join('')
            .trim();
        }
        
        if (isVague) {
          // Progress: 100% - Follow-up question generated
          this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 100 } });
          this.bus.publish({ ts: Date.now(), type: 'log', payload: `Follow-up question: ${responseText}` });
          this.bus.publish({ 
            ts: Date.now(), 
            type: 'agent-followup', 
            payload: { 
              agent: this.id, 
              question: responseText 
            } 
          });
          this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id }});
          
          return { ok: true, output: responseText };
        } else {
          // Progress: 100% - Task clarified
          this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 100 } });
          this.bus.publish({ ts: Date.now(), type: 'log', payload: `Clarified task: ${responseText}` });
          this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id }});
          
          return { ok: true, output: responseText };
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