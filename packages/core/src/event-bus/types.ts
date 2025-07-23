export type ChimeraEventType = 'log' | 'progress' | 'agent-start' | 'agent-end' | 'error';

export interface ChimeraEvent<T = unknown> {
  ts: number;
  type: ChimeraEventType;
  payload: T;
}

// Re-export AgentKind for consumers
export { type AgentKind } from '../interfaces/agent.js';

export interface ProgressPayload {
  stepId: string;          // e.g. "S1"
  stepIndex: number;       // zero‑based index
  totalSteps: number;      // plan.plan.length
  percent: number;         // rounded integer 0‑100
}

export interface ErrorPayload {
  agent: 'DRIVE' | 'AUDIT';
  stepId?: string;         // present if DRIVE failed
  message: string;         // human‑readable summary
  details?: unknown;       // optional raw error / review object
}

export type ChimeraEventHandler<T> = (evt: ChimeraEvent<T>) => void;

/** identity of a Chimera agent */
export enum AgentType {
  KERNEL = 'KERNEL',
  SYNTH  = 'SYNTH',
  DRIVE  = 'DRIVE',
  AUDIT  = 'AUDIT',
}