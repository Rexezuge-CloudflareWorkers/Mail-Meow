import type { Env as GeneratedEnv } from '../../worker-configuration';

/**
 * Global binding type for `backend-runtime` abstract workers.
 *
 * Sourced from the Wrangler-generated `worker-configuration.d.ts` rather than
 * hand-maintained: the previous hand-written list had drifted badly, declaring
 * bindings for features that do not exist in this project (`AI`,
 * `EMAIL_EVENTS_QUEUE`, `EMAIL_PROCESSING_WORKFLOW`, `EMAIL_CONTEXT_INDEX`,
 * `ACTION_*`, `RAG_*`, `GMAIL_WATCH_RENEWAL_*`) while omitting ones that do.
 * `skipLibCheck` meant none of that was ever type-checked.
 *
 * Regenerate with `pnpm run typegen` after changing wrangler bindings.
 */
declare global {
  type Env = GeneratedEnv;
}

export {};
