import type { AgentKind } from '../interfaces/agent.js';

// BaseContext interface - contains all possible context fields
export interface BaseContext {
  userInput?: string;
  clarifiedUserInput?: string;         // Kernel's refined task sentence
  planJson?: string;
  planStep?: string;
  artifacts?: string[];
}

export function buildContextSlice<T extends BaseContext>(
  agent: AgentKind,
  full: T,
): Partial<T> {
  switch (agent) {
    case 'KERNEL':
      return full;                                      // gets everything
    case 'SYNTH':
      return { 
        userInput: full.clarifiedUserInput || full.userInput, 
        planJson: full.planJson 
      } as Partial<T>;
    case 'DRIVE':
      return { planStep: full.planStep, artifacts: full.artifacts } as Partial<T>;
    case 'AUDIT':
      return { planJson: full.planJson, artifacts: full.artifacts } as Partial<T>;
    default:
      return {};
  }
}

// Unit tests
// @ts-ignore - vitest adds this at runtime  
if (typeof import.meta.vitest !== 'undefined') {
  // @ts-ignore - vitest adds this at runtime
  const { test, expect } = import.meta.vitest;

  test('buildContextSlice filters context correctly', () => {
    const ctx: BaseContext = { 
      userInput: 'test', 
      clarifiedUserInput: 'Create test app',
      planJson: '{}', 
      planStep: 'step', 
      artifacts: ['f1'] 
    };
    
    expect(buildContextSlice('KERNEL', ctx)).toEqual(ctx);
    expect(buildContextSlice('SYNTH', ctx)).toEqual({ userInput: 'Create test app', planJson: '{}' });
    expect(buildContextSlice('DRIVE', ctx)).toEqual({ planStep: 'step', artifacts: ['f1'] });
    expect(buildContextSlice('AUDIT', ctx)).toEqual({ planJson: '{}', artifacts: ['f1'] });
  });
}
