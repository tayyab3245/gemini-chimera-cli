import type { AgentContext, AgentResult } from './context.js';

export type AgentKind = 'KERNEL' | 'SYNTH' | 'DRIVE' | 'AUDIT';

export interface ChimeraAgent<TIn, TOut> {
  id: AgentKind;
  run(ctx: AgentContext<TIn>): Promise<AgentResult<TOut>>;
}
