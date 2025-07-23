import type { AgentType } from '../event-bus/types.js';

export interface ContextSlice {
  userInput?: string;
  planJson?: string;
  planStep?: string;
  artifacts?: string[];
}

export function buildContextSlice(agent: AgentType, data: {
  userInput: string;
  planJson: string;
  planStep?: string;
  artifacts: string[];
}): ContextSlice {
  // TODO: switch (agent) { … } – return just what each agent needs
  return { /* stub for now */ };
}
