export type ChimeraPhase =
  | 'MASTER'
  | 'ARCHITECT'
  | 'IMPLEMENTER'
  | 'CRITIC';

const COLOR: Record<ChimeraPhase, string> = {
  MASTER: '\x1b[36m',       // cyan
  ARCHITECT: '\x1b[35m',    // magenta
  IMPLEMENTER: '\x1b[33m',  // yellow
  CRITIC: '\x1b[31m',       // red
};

export function chimeraLog(phase: ChimeraPhase, msg: string) {
  if (process.env.CHIMERA_DEBUG !== '1') return;
  const stamp = new Date().toISOString().split('T')[1].slice(0, 8);
  console.log(`${COLOR[phase]}[${stamp}] [${phase}] ${msg}\x1b[0m`);
}
