#!/usr/bin/env tsx

import { execSync } from 'node:child_process';
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

function exec(command: string): string {
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'pipe' });
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`Command failed: ${command}\n${error.message}`);
    }
    throw new Error(`Command failed: ${command}\nUnknown error.`);
  }
}

function parseWranglerConfig(): WranglerConfig {
  const configPath = path.join(process.cwd(), 'wrangler.jsonc');
  const content = readFileSync(configPath, 'utf8');
  return parse(content) as WranglerConfig;
}

function checkSecret(storeId: string, secretName: string): boolean {
  try {
    const output = exec(`pnpm exec wrangler secrets-store secret list ${storeId} --remote`);
    return output.includes(secretName);
  } catch {
    return false;
  }
}

async function generateAESGCMKey(): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const exported = await crypto.subtle.exportKey('raw', key);
  // Chunked to stay well clear of the engine's spread-argument ceiling.
  const keyBytes = new Uint8Array(exported);
  let binary = '';
  for (const byte of keyBytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary);
}

function createSecret(storeId: string, secretName: string, secretValue: string): void {
  console.log(`Creating secret: ${secretName}`);
  exec(`echo "${secretValue}" | pnpm exec wrangler secrets-store secret create ${storeId} --name ${secretName} --scopes workers --remote`);
}

async function main() {
  console.log('Initializing Cloudflare secrets...');
  const config = parseWranglerConfig();
  if (config.secrets_store_secrets) {
    for (const secret of config.secrets_store_secrets) {
      if (checkSecret(secret.store_id, secret.secret_name)) {
        console.log(`Secret ${secret.secret_name} already exists`);
      } else {
        let secretValue: string;
        if (secret.secret_name === 'mail-meow-aes-encryption-key') {
          secretValue = await generateAESGCMKey();
          console.log(`Generated AES encryption key`);
        } else {
          throw new Error(`Unknown secret: ${secret.secret_name}`);
        }
        createSecret(secret.store_id, secret.secret_name, secretValue);
        console.log(`Created secret: ${secret.secret_name}`);
      }
    }
  }
  console.log('Secret initialization complete');
}

main().catch(console.error);
