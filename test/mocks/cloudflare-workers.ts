class DurableObject<TEnv = Env> {
  protected ctx: DurableObjectState;
  protected env: TEnv;

  constructor(ctx: DurableObjectState, env: TEnv) {
    this.ctx = ctx;
    this.env = env;
  }
}

class WorkflowEntrypoint<TEnv = Env, _TPayload = unknown> {
  protected env: TEnv;

  constructor(ctx: unknown, env: TEnv) {
    void ctx;
    this.env = env;
  }
}

export { DurableObject, WorkflowEntrypoint };
