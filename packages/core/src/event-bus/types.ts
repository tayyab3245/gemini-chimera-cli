export type ChimeraEventType = 'log' | 'progress' | 'agent-start' | 'agent-end' | 'error';

export interface ChimeraEvent<T = unknown> {
  ts: number;              // epoch ms
  type: ChimeraEventType;
  payload: T;
}

export type ChimeraEventHandler<T> = (evt: ChimeraEvent<T>) => void;

/** identity of a Chimera agent */
export enum AgentType {
  KERNEL = 'KERNEL',
  SYNTH  = 'SYNTH',
  DRIVE  = 'DRIVE',
  AUDIT  = 'AUDIT',
}