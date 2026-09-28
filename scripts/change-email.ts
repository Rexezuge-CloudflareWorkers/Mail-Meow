#!/usr/bin/env tsx
/**
 * Ops: change a user's sign-in address.
 *
 * Wraps the three statements `UserIdentityService.setPrimaryEmail` performs, in
 * the order it performs them:
 *
 *   1. claim the new address as verified for the account,
 *   2. move `users.current_email`,
 *   3. revoke every other verified address for that account.
 *
 * The order is the whole point. Claiming first means the user is never locked
 * out — there is only a brief window where both addresses authenticate. Revoking
 * first opens a window where neither does. And `users.email` is never touched:
 * it is the frozen anchor that `connected_applications.user_email` cascades
 * from, so updating it would delete the user's applications, their API keys,
 * and their OAuth2 sessions. Those all key on the account id and are unaffected.
 *
 * Takes a D1 backup first, and refuses (rather than half-applying) when the new
 * address is already a live login for a different account.
 *
 * Usage:
 *   pnpm exec tsx scripts/change-email.ts --db mail-meow-db --account alice@example.com --to new@example.com
 *   pnpm exec tsx scripts/change-email.ts --db mail-meow-db --id usr_ab12... --to new@example.com --dry-run
 *
 * Flags:
 *   --db <name|binding>  required; D1 database name or binding
 *   --account <email>    match the current sign-in address
 *   --id <usr_id>        match the stable account id (alternative to --account)
 *   --to <email>         the new sign-in address
 *   --config <path>      wrangler config (default ./wrangler.jsonc)
 *   --persist-to <dir>   local persistence directory (only with --local)
 *   --remote             run against the remote database (default: local)
 *   --dry-run            print the plan and the SQL, change nothing
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

interface Args {
  db?: string;
  account?: string;
  id?: string;
  to?: string;
  config: string;
  persistTo?: string;
  remote: boolean;
  dryRun: boolean;
  help: boolean;
}

const USAGE = `Usage:
  pnpm exec tsx scripts/change-email.ts --db <name> (--account <email> | --id <usr_id>) --to <new-email> [--remote] [--dry-run]

Flags:
  --db <name>       D1 database name or binding (required)
  --account <email> the current sign-in address
  --id <usr_id>     the stable account id
  --to <email>      the new sign-in address
  --config <path>   wrangler config (default ./wrangler.jsonc)
  --persist-to <d>  local persistence dir (only with --local; must match where
                    the database was migrated, or you will hit a different DB)
  --remote          run against the remote database (default: local)
  --dry-run         print the plan and SQL without changing anything
`;

/**
 * Flags that take a value, mapped to the field they set.
 *
 * A table rather than a switch: every arm was identical apart from the key and
 * the target, and the nine near-identical `break` arms were the bulk of the
 * function.
 */
const VALUE_FLAGS: Record<string, (out: Args, value: string) => void> = {
  '--db': (out, value) => {
    out.db = value;
  },
  '--account': (out, value) => {
    out.account = value;
  },
  '--id': (out, value) => {
    out.id = value;
  },
  '--to': (out, value) => {
    out.to = value;
  },
  '--config': (out, value) => {
    out.config = value;
  },
  '--persist-to': (out, value) => {
    out.persistTo = value;
  },
};

/**
 * Flags that stand alone.
 */
const BOOLEAN_FLAGS: Record<string, (out: Args) => void> = {
  '--remote': (out) => {
    out.remote = true;
  },
  '--dry-run': (out) => {
    out.dryRun = true;
  },
  '--help': (out) => {
    out.help = true;
  },
  '-h': (out) => {
    out.help = true;
  },
};

function parseArgs(argv: string[]): Args {
  const out: Args = { config: './wrangler.jsonc', remote: false, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    // Under `noUncheckedIndexedAccess` the element is `string | undefined`; the
    // bound check makes it defined, and a bare `as string` would be erased by
    // the compiler rather than proved.
    const arg: string = argv[i] ?? '';
    const setValue = VALUE_FLAGS[arg];
    if (setValue) {
      const value: string | undefined = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      setValue(out, value);
      i += 1;
      continue;
    }
    const setFlag = BOOLEAN_FLAGS[arg];
    if (setFlag) {
      setFlag(out);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function die(message: string): never {
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}

/**
 * Single-quote a value for SQLite.
 *
 * The pattern allowlist is the safety property here: this script interpolates
 * into SQL, so anything that is not a plain address or a plain id token is
 * refused rather than escaped-and-hoped. A bogus id simply matches no account.
 */
function sqlEmail(value: string): string {
  if (!/^[\w.%+-]+@[A-Z0-9.-]+$/i.test(value)) {
    die(`refusing to interpolate ${JSON.stringify(value)}: not a plain email address`);
  }
  return `'${value.toLowerCase()}'`;
}

function sqlToken(value: string, label: string): string {
  if (!/^[\w.@-]+$/.test(value)) {
    die(`refusing to interpolate ${JSON.stringify(value)}: not a plain ${label}`);
  }
  return `'${value}'`;
}

interface QueryResult {
  results?: Array<Record<string, unknown>>;
}

/**
 * Run `wrangler d1 <verb>` and fail loudly.
 *
 * `wrangler` is resolved out of `node_modules/.bin` rather than off `PATH`: a
 * shell resolved through `PATH` could execute a different `wrangler` than the
 * one this repo pins.
 */
function wrangler(verbArgs: string[]): string {
  const bin = path.join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler');
  const result = spawnSync(bin, verbArgs, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) {
    die(`wrangler ${verbArgs[0]} failed:\n${(result.stderr || result.stdout || '').trim()}`);
  }
  return result.stdout || '';
}

/**
 * Local or remote, depending on the flags.
 */
function target(args: Args): string[] {
  return args.remote ? ['--remote'] : ['--local', ...(args.persistTo ? ['--persist-to', args.persistTo] : [])];
}

function d1(args: Args, sql: string): QueryResult {
  const stdout = wrangler(['d1', 'execute', args.db as string, '--command', sql, '--config', args.config, '--json', ...target(args)]);
  // wrangler --json emits one JSON array per statement; a single statement is
  // the common case here.
  const trimmed = stdout.trim();
  const start = trimmed.indexOf('[');
  const end = stdout.lastIndexOf(']');
  if (start === -1 || end === -1) die(`unexpected wrangler output: ${trimmed.slice(0, 400)}`);
  try {
    const parsed = JSON.parse(stdout.slice(start, end + 1)) as unknown;
    if (Array.isArray(parsed) && parsed.length > 0) {
      const first = parsed[0] as QueryResult | undefined;
      return first ?? {};
    }
  } catch {
    die(`could not parse wrangler output: ${trimmed.slice(0, 400)}`);
  }
  return {};
}

interface AccountRow {
  id: string;
  anchor: string;
  current_email: string | null;
}

/**
 * Take a D1 backup before the first write.
 *
 * The change is three statements and is not destructive on its own, but it
 * changes who can sign in, and there is no `undo` flag here. A backup turns a
 * mistake into a restore rather than a hand-written corrective SQL.
 */
function backup(args: Args): void {
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
  // Created up front: `wrangler d1 export` will not create the parent directory,
  // so a backup that fails on a missing folder is no backup at all.
  const dir = path.resolve('.wrangler/backups');
  mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${args.db}-${stamp}.sql`);
  // Best-effort: a backup that cannot be taken must not block a change that is
  // three statements and trivially reversible, so this warns rather than dies.
  try {
    wrangler(['d1', 'export', args.db as string, '--config', args.config, '--output', out, ...target(args)]);
  } catch (error) {
    process.stderr.write(`warning: D1 backup failed, continuing:\n${error instanceof Error ? error.message : String(error)}\n`);
    return;
  }
  process.stdout.write(`backup   ${out}\n`);
}

/**
The one-line description of which database the run would touch.
*/
function targetLine(args: Args): string {
  const where: string = args.remote ? 'REMOTE' : 'local';
  const persist: string = args.persistTo ? ` (persist-to ${args.persistTo})` : '';
  return `target    ${where} database '${args.db}'${persist}`;
}

function main(): void {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    die(error instanceof Error ? error.message : String(error));
  }
  if (args.help || (!args.account && !args.id) || !args.to || !args.db) {
    process.stdout.write(USAGE);
    process.exit(args.help ? 0 : 2);
  }
  const target = sqlEmail(args.to);
  const selector = args.id
    ? { sql: `id = ${sqlToken(args.id, 'account id')}`, label: `id ${args.id}` }
    : { sql: `lower(current_email) = lower(${sqlEmail(args.account as string)})`, label: `account ${args.account}` };

  const found = d1(args, `SELECT id, email AS anchor, current_email FROM users WHERE ${selector.sql} LIMIT 1`);
  const account = (found.results ?? [])[0] as AccountRow | undefined;
  if (!account?.id)
    die(`no account matched ${selector.label}. Check the current sign-in address; the frozen anchor is not searchable by the new address.`);

  const holder = d1(
    args,
    `SELECT ue.user_id, ue.is_verified, u.current_email FROM user_emails ue JOIN users u ON u.id = ue.user_id WHERE ue.email = ${target} LIMIT 1`,
  );
  const existing = (holder.results ?? [])[0] as { user_id: string; is_verified: number; current_email: string | null } | undefined;
  if (existing && existing.is_verified === 1 && existing.user_id !== account.id) {
    die(
      `${args.to} is already a live login for account ${existing.user_id} (current_email ${existing.current_email ?? '?'}). ` +
        'Re-pointing it would hand that account to this user. Resolve the conflict first.',
    );
  }

  const current = account.current_email ?? account.anchor;
  const now = Math.floor(Date.now() / 1000);
  const id = sqlToken(account.id, 'account id');
  const statements = [
    `INSERT INTO user_emails (email, user_id, is_verified, created_at) VALUES (${target}, ${id}, 1, ${now}) ON CONFLICT(email) DO UPDATE SET user_id = excluded.user_id, is_verified = excluded.is_verified;`,
    `UPDATE users SET current_email = ${target}, updated_at = ${now} WHERE id = ${id};`,
    `UPDATE user_emails SET is_verified = 0 WHERE user_id = ${id} AND email != ${target};`,
  ];

  process.stdout.write(
    [
      `account   ${account.id}`,
      `anchor    ${account.anchor}  (frozen — never updated)`,
      `from      ${current}`,
      `to        ${args.to.toLowerCase()}`,
      targetLine(args),
      existing ? `note      ${args.to} already existed for this account (is_verified ${existing.is_verified}); it will be re-claimed` : '',
      '',
      'statements (applied in this order, as one batch):',
      ...statements.map((s, i) => `  ${i + 1}. ${s}`),
      '',
    ]
      .filter((line) => line !== '')
      .join('\n'),
  );

  if (args.dryRun) {
    process.stdout.write('dry run — nothing was changed.\n');
    return;
  }
  backup(args);
  d1(args, statements.join(' '));
  const after = d1(
    args,
    `SELECT u.email AS anchor, u.current_email, (SELECT group_concat(email || ':' || is_verified, ' ') FROM user_emails WHERE user_id = u.id) AS registry FROM users u WHERE u.id = ${id}`,
  );
  const row = (after.results ?? [])[0] as { anchor: string; current_email: string; registry: string } | undefined;
  process.stdout.write(
    [
      '',
      'applied. verify:',
      `  anchor        ${row?.anchor ?? '?'}`,
      `  current_email ${row?.current_email ?? '?'}`,
      `  registry      ${row?.registry ?? '?'}`,
      '',
      'not touched (they key on the account id and keep working):',
      '  connected_applications and everything cascading from it — application_api_keys,',
      '  oauth2_authorization_sessions, oauth2_access_token_refresh_status — and',
      '  background_task_runs visibility.',
      'A row created before 0011 has user_id IS NULL and still reports the old address;',
      'stamp it to report the new one:',
      `  UPDATE connected_applications SET user_id = ${id} WHERE lower(user_email) = lower(${sqlEmail(current)});`,
      '',
    ].join('\n'),
  );
}

main();
