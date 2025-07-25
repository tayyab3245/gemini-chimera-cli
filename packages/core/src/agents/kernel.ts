import { ChimeraEventBus } from '../event-bus/bus.js';
import { AgentType } from '../event-bus/types.js';
import type { AgentContext, AgentResult } from './agent.js';
import { buildContextSlice } from '../context/broker.js';

interface KernelOutput {
  clarifiedUserInput: string;          // concise requirement sentence
  assumptions: string[];               // auto-detected assumptions
  constraints: string[];               // any obvious constraints
}

export class KernelAgent {
  readonly id = AgentType.KERNEL;

  constructor(private bus: ChimeraEventBus) {}

  async run(ctx: AgentContext<{ userInput: string }>): Promise<AgentResult<KernelOutput>> {
    this.bus.publish({ ts: Date.now(), type: 'agent-start', payload: { id: this.id }});
    
    try {
      // Progress: 25% - Starting analysis
      this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 25 } });
      this.bus.publish({ ts: Date.now(), type: 'log', payload: `${this.id} analyzing user input` });

      const userInput = ctx.input.userInput.trim();
      
      // Progress: 50% - Input validation
      this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 50 } });
      
      // Check if input lacks clarity
      const tokenCount = userInput.split(/\s+/).filter(token => token.length > 0).length;
      const hasUnclearIndicators = userInput.includes('...') || userInput.includes('?') || 
                                   userInput.toLowerCase().includes('help') ||
                                   userInput.toLowerCase().includes('what') ||
                                   userInput.toLowerCase().includes('how');
      
      if (tokenCount < 15 || hasUnclearIndicators) {
        this.bus.publish({ ts: Date.now(), type: 'log', payload: `${this.id} requesting clarification` });
        this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id }});
        
        return { 
          ok: false, 
          error: "Could you specify the desired output format and provide more details about what you'd like to accomplish?" 
        };
      }

      // Progress: 75% - Extracting requirements
      this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 75 } });
      
      // Parse and clarify the input
      const clarifiedUserInput = this.clarifyInput(userInput);
      const assumptions = this.extractAssumptions(userInput);
      const constraints = this.extractConstraints(userInput);

      const output: KernelOutput = {
        clarifiedUserInput,
        assumptions,
        constraints
      };

      // Build context for SYNTH
      buildContextSlice(AgentType.SYNTH, {
        userInput: clarifiedUserInput,
        assumptions,
        constraints,
        planJson: '',
        artifacts: [],
      });

      // Progress: 100% - Complete
      this.bus.publish({ ts: Date.now(), type: 'progress', payload: { percent: 100 } });

      this.bus.publish({ ts: Date.now(), type: 'log', payload: `${this.id} clarified requirements successfully` });
      this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id }});
      
      return { ok: true, output };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during kernel processing';
      this.bus.publish({ ts: Date.now(), type: 'error', payload: { agent: 'KERNEL' as any, message: errorMessage } });
      this.bus.publish({ ts: Date.now(), type: 'agent-end', payload: { id: this.id }});
      
      return { ok: false, error: errorMessage };
    }
  }

  private clarifyInput(userInput: string): string {
    // Convert user input to a concise requirement sentence
    let clarified = userInput;
    
    // Remove redundant words and normalize
    clarified = clarified.replace(/\b(please|could you|can you|i want|i need|help me)\b/gi, '').trim();
    clarified = clarified.replace(/\s+/g, ' ');
    
    // Ensure it starts with a capital letter and ends with period
    if (clarified.length > 0) {
      clarified = clarified.charAt(0).toUpperCase() + clarified.slice(1);
      if (!clarified.endsWith('.') && !clarified.endsWith('!') && !clarified.endsWith('?')) {
        clarified += '.';
      }
    }
    
    return clarified || userInput;
  }

  private extractAssumptions(userInput: string): string[] {
    const assumptions: string[] = [];
    const lower = userInput.toLowerCase();
    
    // Detect common assumption patterns
    if (lower.includes('file') || lower.includes('code')) {
      assumptions.push('Working with file system or code modifications');
    }
    
    if (lower.includes('test') || lower.includes('spec')) {
      assumptions.push('Testing functionality is required');
    }
    
    if (lower.includes('build') || lower.includes('compile')) {
      assumptions.push('Build process involvement expected');
    }
    
    if (lower.includes('api') || lower.includes('endpoint')) {
      assumptions.push('API or web service interaction needed');
    }
    
    if (lower.includes('data') || lower.includes('json') || lower.includes('xml')) {
      assumptions.push('Data processing or transformation required');
    }
    
    return assumptions;
  }

  private extractConstraints(userInput: string): string[] {
    const constraints: string[] = [];
    const lower = userInput.toLowerCase();
    
    // Detect constraint patterns
    if (lower.includes('only') || lower.includes('just') || lower.includes('minimal')) {
      constraints.push('Minimal changes preferred');
    }
    
    if (lower.includes('without') || lower.includes("don't") || lower.includes('avoid')) {
      constraints.push('Certain approaches should be avoided');
    }
    
    if (lower.includes('existing') || lower.includes('current')) {
      constraints.push('Work within existing codebase structure');
    }
    
    if (lower.includes('quick') || lower.includes('fast') || lower.includes('simple')) {
      constraints.push('Quick/simple solution preferred');
    }
    
    if (lower.includes('typescript') || lower.includes('ts')) {
      constraints.push('TypeScript language requirement');
    }
    
    return constraints;
  }
}