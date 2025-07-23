import type { ChimeraEventBus } from '../event-bus/index.js';

export interface AgentContext<T> {
  bus: ChimeraEventBus;
  input: T;
}

export interface AgentResult<T> {
  ok: boolean;
  output?: T;
  error?: string;
}
