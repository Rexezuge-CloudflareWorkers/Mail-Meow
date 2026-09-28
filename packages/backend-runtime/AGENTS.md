# Mail-Meow — backend-runtime

Scope: `packages/backend-runtime/**`. Parent index: `../../AGENTS.md`.

See root `AGENTS.md` Index and `docs/agents/runtime/AGENTS.md` for layer rules. Follow Otter import direction: Layer 0 `shared, backend-errors` → Layer 1 `backend-runtime` → Layer 2 `backend-data, provider-clients` → Layer 3 `backend-services` → Layer 5 `apps/*`.

## Error Logging

The `base/` abstract workers (`AbstractEntrypointWorker`, `AbstractDurableObjectWorker`, `AbstractQueueWorker`, `AbstractWorkflowWorker`) are the last handler before an unhandled error becomes a bare 500, and they are the outermost `try` in the runtime — everything below them, including provider API bodies, flows through the `err` they catch. Each therefore logs `ErrorSanitizationUtil.sanitizeErrorForLogging(err)`, never the raw `err`.

`shared` is Layer 0, so importing the sanitizer here is allowed and carries no direction violation. Do not log a raw error object from any subclass or from `config/AppConfig.ts`.
