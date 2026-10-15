# Mail-Meow — backend-runtime

Scope: `packages/backend-runtime/**`. Parent index: `../../AGENTS.md`.

See root `AGENTS.md` Index and `docs/agents/runtime/AGENTS.md` for layer rules. Layer 1: may import Layer 0 and `@rexezuge/*`, nothing higher.

## Error Logging

`base/AbstractEntrypointWorker` and `base/AbstractDurableObjectWorker` extend `@rexezuge/runtime`'s, overriding exactly one method: `reportUnhandled`. The kit's default hands the caught value to `console.error` verbatim, which is only safe when nothing in the call path can carry a secret; here everything can, so the override is the redaction boundary rather than an incidental change. Do not "simplify" these back to the kit classes.

They are also the last handler before an unhandled error becomes a bare 500, and the outermost `try` in the runtime — everything below them, including provider API bodies, flows through the `err` they catch. Each therefore logs `ErrorSanitizationUtil.sanitizeErrorForLogging(err)`, never the raw `err`. `ErrorSanitizationUtil` is `@rexezuge/shared`'s; the local copy was deleted in the SDK adoption and nothing should re-create it.

`base/D1SessionEnv.ts` — `createD1SessionEnv`, `D1Queryable`, `D1SessionEnv`. It used to live in `backend-data/utils`, which put `apps/api` in violation of the boundary that bans it from reaching `backend-data` _values_; the helper wraps a binding rather than doing data access, so it belongs here where every layer may use it.

`@rexezuge/shared` sits below every layer, so importing the sanitizer here carries no direction violation. Do not log a raw error object from any subclass or from `config/AppConfig.ts`.
