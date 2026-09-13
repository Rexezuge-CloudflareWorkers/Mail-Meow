import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const localesDir = resolve(__dirname, '../../apps/web/src/locales');

function flat(o: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') Object.assign(out, flat(v as Record<string, unknown>, key));
    else out[key] = String(v);
  }
  return out;
}

describe('web locales', () => {
  it('has all 12 locales with key parity and no empty values', () => {
    const tags = readdirSync(localesDir);
    expect(tags.sort()).toEqual(['de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'nl', 'pl', 'pt', 'zh-CN', 'zh-TW'].sort());
    const en = flat(JSON.parse(readFileSync(resolve(localesDir, 'en/translation.json'), 'utf-8')));
    for (const tag of tags) {
      if (tag === 'en') continue;
      const dict = flat(JSON.parse(readFileSync(resolve(localesDir, `${tag}/translation.json`), 'utf-8')));
      expect(Object.keys(dict).sort()).toEqual(Object.keys(en).sort());
      for (const [k, v] of Object.entries(dict)) {
        expect(v, `${tag}:${k}`).not.toBe('');
      }
    }
  });
});
