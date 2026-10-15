/**
 * The account layer is `@rexezuge/identity`'s, re-exported.
 *
 * This repo's `identity/UserIdentityService.ts` and `user/accountLookup.ts` were
 * the kit's own provenance: the kit says it converged them *from* Mail-Meow and
 * four siblings. Keeping a local copy meant two implementations of the
 * fail-closed resolution order, and the one that mattered most was the branch
 * that had already been written once: the registry read that tolerates only a
 * genuinely absent `user_emails` table, and rethrows everything else. That
 * branch is why a transient D1 error cannot be mistaken for an absent schema and
 * send a revoked address back through the anchor lookup.
 *
 * Re-exported rather than imported per-call-site so the migration is one import
 * change for consumers and so the provenance is visible where someone looks for
 * the identity code.
 */
export { UserIdentityService } from '@rexezuge/identity';
export type { ResolvedAccount, UserIdentityDeps, UserIdentityEnv } from '@rexezuge/identity';
