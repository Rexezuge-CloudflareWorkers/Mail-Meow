/**
 * D1 sessions.
 *
 * This lived in `backend-data/utils`, which was the wrong layer and the kit's
 * `no-restricted-imports` boundary said so: `apps/api` needs it to own the
 * `x-d1-bookmark` round-trip, and a rule that bans `apps/api` from reaching
 * `backend-data` values (because the layer's real subject is DAOs) is a rule the
 * entrypoint has to be exempted from — which is how a boundary stops meaning
 * anything.
 *
 * So it moved down to where it belongs. `createD1SessionEnv` calls
 * `env.DB.withSession(...)`; it is a wrapper over a *binding*, not data access.
 * `backend-runtime` is the layer that owns bindings, and being there means every
 * layer may use it — including `apps/api` — without a carve-out.
 */

/**
 * The slice of `D1Database` this codebase uses.
 *
 * Structural rather than `D1Database` itself, because `D1DatabaseSession` and
 * `D1Database` both satisfy it and a session is what a cron task holds. Naming
 * the platform type would make every DAO's constructor reject a session at
 * compile time.
 */
type D1Queryable = Pick<D1Database, 'prepare' | 'batch'>;

/**
 * An environment whose `DB` binding has been swapped for a session.
 *
 * `Omit<TEnv, 'DB'> & { DB: D1DatabaseSession }` rather than a cast, so the
 * returned object is a complete environment — every other binding is carried
 * through, and a caller cannot lose one by accident.
 */
type D1SessionEnv<TEnv extends { DB: D1Database }> = Omit<TEnv, 'DB'> & {
  DB: D1DatabaseSession;
};

/**
 * Open a D1 session for this invocation.
 *
 * A request gets a session so its reads and writes are consistent with each
 * other — a write followed by a read cannot observe a different replica. That is
 * only true if both go through the same session, which is why the API worker
 * round-trips the returned bookmark in the `x-d1-bookmark` response header and
 * sends it back on the next request: a new `env` arrives per request, and the
 * bookmark is what carries the session across.
 *
 * Without that header, a read after a write can miss the write. It fails silently
 * — no error, just a stale read — which is the worst shape a consistency bug can
 * have.
 *
 * `constraintOrBookmark` defaults to `'first-primary'`, the consistency model
 * Cloudflare recommends for most read paths; pass a bookmark to continue an
 * earlier session instead.
 */
function createD1SessionEnv<TEnv extends { DB: D1Database }>(
  env: TEnv,
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  constraintOrBookmark: D1SessionBookmark | D1SessionConstraint = 'first-primary',
): D1SessionEnv<TEnv> {
  return {
    ...env,
    DB: env.DB.withSession(constraintOrBookmark),
  };
}

export { createD1SessionEnv };
export type { D1Queryable, D1SessionEnv };
