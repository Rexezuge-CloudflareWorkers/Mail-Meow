#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.resolve(here, '..', 'apps/api/src/generated/spa-shell.ts');

if (existsSync(outPath)) process.exit(0);

mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  "// Auto-generated stub - real content is produced by `npm run build` via the Vite plugin.\nexport const SPA_HTML: string = '';\n",
);
console.log(`ensure-spa-shell-stub: created stub at ${outPath}`);
