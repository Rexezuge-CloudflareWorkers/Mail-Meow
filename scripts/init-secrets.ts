#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'jsonc-parser';

interface WranglerConfig {
  secrets_store_secrets?: Array<{
    binding: string;
    store_id: string;
    secret_name: string;
  }>;
}

/**
Names this script knows how to generate. Anything else must be supplied externally.
*/
const GENERATED_SECRET_NAMES: ReadonlySet<string> = new Set(['mail-meow-aes-encryption-key']);

function wrangler(args: string[], input?: string): string {
  try {
    // `pnpm` is intentionally resolved from PATH. Arguments are passed as an argv
    // array, never interpolated into a shell string, so argument injection is not possible.
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    return execFileSync('pnpm', ['exec', 'wrangler', ...args], {
      encoding: 'utf8',
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      ...(input !== undefined && { input }),
    });
  } catch (error: unknown) {
    const maybeProcessError = error as { stdout?: string | Buffer; stderr?: string | Buffer; message?: string };
    const stdout: string = maybeProcessError.stdout ? maybeProcessError.stdout.toString() : '';
    const stderr: string = maybeProcessError.stderr ? maybeProcessError.stderr.toString() : '';
    throw new Error(`Command failed: pnpm exec wrangler ${args.join(' ')}\n${stdout}${stderr || maybeProcessError.message || ''}`);
  }
}

function parseWranglerConfig(): WranglerConfig {
  const configPath: string = path.join(process.cwd(), 'wrangler.jsonc');
  const content: string = readFileSync(configPath, 'utf8');
  return parse(content) as WranglerConfig;
}

/**
 * Lists the secret names present in a Secrets Store.
 *
 * Returns `undefined` when the listing itself failed, which is deliberately
 * distinct from an empty list: a transient CLI failure must not be read as
 * "the secret is missing" and cause a duplicate insert.
 */
function listSecretNames(storeId: string): Set<string> | undefined {
  try {
    const output: string = wrangler(['secrets-store', 'secret', 'list', storeId, '--remote']);
    const names: Set<string> = new Set();
    // `wrangler secrets-store secret list` prints a table; match the name
    // column exactly so a prefix cannot make an absent secret look present.
    for (const line of output.split('\n')) {
      // Column layout is two-or-more spaces; \S+ cannot itself contain whitespace,
      // so this is unambiguous and cannot backtrack.
      const match: RegExpMatchArray | null = /^\s*(\S+)\s{2,}\S/.exec(line);
      if (match) {
        names.add(match[1]);
      }
    }
    return names;
  } catch (error: unknown) {
    console.warn(`Unable to list secrets in store ${storeId}:`, error instanceof Error ? error.message : 'unknown error');
    return undefined;
  }
}

async function generateAESGCMKey(): Promise<string> {
  const key: CryptoKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const exported: ArrayBuffer = await crypto.subtle.exportKey('raw', key);
  // Chunked to stay well clear of the engine's spread-argument ceiling.
  const keyBytes: Uint8Array = new Uint8Array(exported);
  let binary: string = '';
  for (const byte of keyBytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary);
}

function createSecret(storeId: string, secretName: string, secretValue: string): void {
  console.log(`Creating secret: ${secretName}`);
  // The value is passed on stdin, not as a shell argument. Interpolating it
  // into a command string would expose the AES master key in the process table
  // and in any process-argv logging on the runner.
  wrangler(['secrets-store', 'secret', 'create', storeId, '--name', secretName, '--scopes', 'workers', '--remote'], secretValue);
}

async function main(): Promise<void> {
  console.log('Initializing Cloudflare secrets...');
  const config: WranglerConfig = parseWranglerConfig();
  const listedByStore: Map<string, Set<string> | undefined> = new Map();

  const declaredSecrets: Array<{ binding: string; store_id: string; secret_name: string }> = config.secrets_store_secrets ?? [];
  for (const secret of declaredSecrets) {
    if (!listedByStore.has(secret.store_id)) {
      listedByStore.set(secret.store_id, listSecretNames(secret.store_id));
    }
    const existing: Set<string> | undefined = listedByStore.get(secret.store_id);
    if (existing === undefined) {
      // Refuse to guess: creating a secret we could not read back risks
      // overwriting a live value with a freshly generated one.
      throw new Error(
        `Could not list secrets in store ${secret.store_id}; refusing to create ${secret.secret_name} without confirming it is absent.`,
      );
    }
    if (existing.has(secret.secret_name)) {
      console.log(`Secret ${secret.secret_name} already exists`);
      continue;
    }

    if (!GENERATED_SECRET_NAMES.has(secret.secret_name)) {
      throw new Error(`Unknown secret: ${secret.secret_name}`);
    }
    const secretValue: string = await generateAESGCMKey();
    console.log('Generated AES encryption key');
    createSecret(secret.store_id, secret.secret_name, secretValue);
    console.log(`Created secret: ${secret.secret_name}`);
  }
  console.log('Secret initialization complete');
}

// A non-zero exit is essential: this runs in the deploy pipeline, and swallowing
// the rejection reported a failed AES key bootstrap as a green step that
// `retry-step` would not retry.
main().catch((error: unknown) => {
  console.error('Secret initialization failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
