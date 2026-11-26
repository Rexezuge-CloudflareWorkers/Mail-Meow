# Feature — D1 Database Backup

Scope: `.github/workflows/backup-d1.yml`, `scripts/backup/**`, `docs/db-backup-recovery.md`. Parent index: `../../../AGENTS.md`.

The backup workflow exports `mail-meow-db` daily at 04:15 UTC and uploads an encrypted dump to S3-compatible storage and/or WebDAV. The operator playbook (secrets, restore, Time Travel) lives in `docs/db-backup-recovery.md`; do not duplicate it here.

## Invariants

- **Fail closed on encryption.** A destination configured without `BACKUP_ENCRYPTION_KEY` is a hard failure; a repository with no destination configured is a valid no-backup state and stays green.
- **One database.** The export job runs `scripts/deploy/prepare-wrangler-config.ts` first, exactly like CD, then resolves the target from the materialized `wrangler.jsonc`. There is no second database id to keep in sync.
- **No empty backups.** A D1 database created by that same provisioning run holds no user data; `PROVISIONED_RESOURCES` is the only reliable signal because provisioning patches the placeholder id away. Export aborts in that case.
- **Plaintext never leaves the job.** `encrypt-backup.ts` compresses with xz, encrypts with AES-256-CBC, then deletes the `.sql` and `.xz` files before the artifact is uploaded.
- **Prune is narrow.** S3 deletion is limited to `*.sql.xz[.enc]` / `*.sql.gz[.enc]` under `mail-meow/production/`. WebDAV prunes by age under `webdav:mail-meow/production/`.
- **Names are one fact in two places.** `BACKUP_FILE_PREFIX` in `scripts/backup/naming.ts` must match the upload glob in `backup-d1.yml`; a mismatch makes every upload step report success with no files.

Rules live in pure modules (`destination-config.ts`, `d1-target.ts`, `naming.ts`, `s3-prune.ts`, `webdav-target.ts`, `retention.ts`) and are covered by `test/backup/`. Entry points carry `#!` lines and do I/O only.
