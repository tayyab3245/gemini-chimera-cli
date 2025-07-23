
export class WorkflowStateMachine {
  async runOnce(userRequest: string): Promise<void> {
    // TODO: real implementation will be added in later tickets.
    console.log('[FSM] received', userRequest);
  }
}
