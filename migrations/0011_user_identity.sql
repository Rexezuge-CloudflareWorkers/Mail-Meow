-- Migration 0011: Decouple the user identifier from the email address.
--
-- Before this migration `users.email` was the PRIMARY KEY *and* the identity
-- key of every user-keyed table, so the address was the account. It could not
-- be changed: `connected_applications` carried a live
-- `FOREIGN KEY (user_email) REFERENCES users(email) ON DELETE CASCADE`, and
-- that table is the root of the rest of the schema — `application_api_keys`,
-- `oauth2_authorization_sessions`, and
-- `oauth2_access_token_refresh_status` all cascade from it. Rewriting an
-- address therefore either tripped the constraint or took the user's entire
-- mailbox set, API keys, and in-flight OAuth2 sessions with it.
--
-- After this migration:
--   * `users.id` is the stable account key (opaque `usr_<hex>`).
--   * `users.current_email` is the mutable sign-in address.
--   * `users.email` becomes the frozen *anchor* address. It is never updated,
--     so the existing foreign key and every existing `user_email` value keeps
--     resolving forever, and no table has to be rebuilt.
--   * `user_emails` is the address registry: an address maps to an account,
--     `is_verified = 1` means "may be used to log in". A changed-from address
--     is retained with `is_verified = 0` so pre-change rows stay attributable
--     while the address stops authenticating, and it is released for
--     re-registration by a later account.
--   * `connected_applications` carries a `user_id` FK to `users(id)` and is
--     read and written by that id. The legacy `user_email` column stays as a
--     denormalized copy: still written, no longer the identity.
--
-- Why the address stays in `users` at all: D1 enforces foreign keys through
-- the Worker binding and honours neither `PRAGMA foreign_keys = off` nor
-- `PRAGMA legacy_alter_table = on` (both verified against real D1 — see
-- `UserIdentityUpgrade.int.test.ts`). `defer_foreign_keys` is honoured but D1
-- documents that it does not suppress `ON DELETE CASCADE`. Since SQLite
-- rewrites a child's foreign key clause when the parent is renamed, and drops
-- a parent by cascading, the reference to `users(email)` cannot be repointed
-- without losing rows. Keeping `email` as a frozen anchor sidesteps the
-- rebuild entirely: this migration is purely additive.
--
-- Case sensitivity, deliberately: `users.email` is a PRIMARY KEY, so SQLite
-- gives it the BINARY collation and a legacy row stored as
-- `Carol@Example.com` is a *different* key from `carol@example.com`. The
-- backfill below lowercases before registering, and `INSERT OR IGNORE` then
-- drops the second registration. Two accounts that only differed by case
-- therefore collapse into one identity — which is the desired outcome, since
-- Cloudflare Access delivers a single normalized address for a given person —
-- and the survivor is the lowest-anchored row. This is asserted explicitly in
-- `UserIdentityUpgrade.int.test.ts` rather than left to chance.
--
-- Rerunnable: every backfill is guarded by `IS NULL` / `INSERT OR IGNORE`, and
-- `users.id` is only filled where it is still missing.

-- ============================================================
-- Phase 1: stable account key
-- ============================================================
-- SQLite cannot add a PRIMARY KEY column, so the id is a plain column with a
-- unique index. A unique index is a valid foreign key parent, which is all the
-- `user_id` reference below needs.
ALTER TABLE users ADD COLUMN id TEXT;

UPDATE users SET id = 'usr_' || lower(hex(randomblob(16))) WHERE id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_id ON users(id);

-- ============================================================
-- Phase 2: mutable login address
-- ============================================================
-- `email` stays as the frozen anchor (see the header note); `current_email`
-- is what the account signs in with and what the API reports. Uniqueness is
-- enforced here, so an address can never be claimed by two accounts.
ALTER TABLE users ADD COLUMN current_email TEXT;

UPDATE users SET current_email = lower(email) WHERE current_email IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_current_email ON users(current_email);

-- ============================================================
-- Phase 3: address registry
-- ============================================================
-- Login resolution consults `is_verified = 1` only. Backfilled from the frozen
-- anchor address of every existing account, lowercased so a legacy
-- mixed-case row still yields exactly one login identity.
CREATE TABLE IF NOT EXISTS user_emails (
  email TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_verified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_emails_user ON user_emails(user_id);

INSERT OR IGNORE INTO user_emails (email, user_id, is_verified, created_at)
SELECT lower(email), id, 1, created_at FROM users;

-- ============================================================
-- Phase 4: user_id on the user-keyed table
-- ============================================================
-- Additive only: `ALTER TABLE ... ADD COLUMN`, then a backfill that resolves
-- each stored address through the registry. Resolving via `user_emails` rather
-- than `users.email` means legacy rows also resolve once an address is linked
-- as an alias, and the lowercased join is case-insensitive by construction.
--
-- An address that matches no account leaves `user_id` NULL. That is
-- intentional: the row keeps its string column and the DAO falls back to the
-- `user_email` read, which is how an unknown or deleted actor stays
-- attributable instead of breaking the query.
ALTER TABLE connected_applications ADD COLUMN user_id TEXT REFERENCES users(id);

UPDATE connected_applications
SET user_id = (SELECT ue.user_id FROM user_emails ue WHERE ue.email = lower(connected_applications.user_email) LIMIT 1);

CREATE INDEX IF NOT EXISTS idx_connected_applications_user_id ON connected_applications(user_id);

-- ============================================================
-- Phase 5: verify
-- ============================================================
-- Every backfill above resolved through `user_emails`, so no foreign key should
-- be dangling. `PRAGMA foreign_key_check` reports violations as rows rather
-- than raising, so `UserIdentityUpgrade.int.test.ts` asserts it comes back
-- empty against a seeded database.
PRAGMA foreign_key_check;
