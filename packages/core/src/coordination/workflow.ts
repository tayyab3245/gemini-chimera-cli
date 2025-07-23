
export enum WorkflowState {
  INIT = 'INIT',
  PLANNING = 'PLANNING',
  EXECUTING = 'EXECUTING',
  REVIEW = 'REVIEW',
  DONE = 'DONE'
}

export function advance(current: WorkflowState, event: string): WorkflowState {
  const transitions: Record<WorkflowState, Record<string, WorkflowState>> = {
    [WorkflowState.INIT]: {
      'start': WorkflowState.PLANNING
    },
    [WorkflowState.PLANNING]: {
      'plan_ready': WorkflowState.EXECUTING,
      'restart': WorkflowState.INIT
    },
    [WorkflowState.EXECUTING]: {
      'execution_complete': WorkflowState.REVIEW,
      'restart': WorkflowState.INIT
    },
    [WorkflowState.REVIEW]: {
      'review_pass': WorkflowState.DONE,
      'review_fail': WorkflowState.PLANNING,
      'restart': WorkflowState.INIT
    },
    [WorkflowState.DONE]: {
      'restart': WorkflowState.INIT
    }
  };

  const stateTransitions = transitions[current];
  if (!stateTransitions || !(event in stateTransitions)) {
    throw new Error('illegal transition');
  }

  return stateTransitions[event];
}

export class WorkflowStateMachine {
  async runOnce(userRequest: string): Promise<void> {
    // TODO: real implementation will be added in later tickets.
    console.log('[FSM] received', userRequest);
  }
}
