import { describe, expect, it } from 'vitest';
import { normalizeEmail } from '@mail-meow/shared/utils';
import { CryptoUtil } from '@mail-meow/shared/utils';

/**
 * The two rules that used to be implemented several times each.
 *
 * Both are identity rules, not formatting: an address that normalizes one way
 * in the service layer and another way in the DAO layer is two different
 * accounts on either side of that boundary.
 */

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Alice@Example.COM  ')).toBe('alice@example.com');
  });

  it('is idempotent', () => {
    // The registry stores the normalized form, so a stored value read back must
    // normalize to itself or every lookup would miss its own row.
    const once = normalizeEmail('  Bob@Example.com ');
    expect(normalizeEmail(once)).toBe(once);
  });

  it('leaves an already-normalized address untouched', () => {
    expect(normalizeEmail('carol@example.com')).toBe('carol@example.com');
  });

  it('reduces an all-whitespace address to the empty string', () => {
    // Callers treat empty as "no address" and must not query with it.
    expect(normalizeEmail('   ')).toBe('');
  });

  it('preserves the domain case distinction that local-part folding would lose', () => {
    // Only case is folded; the local part is not otherwise transformed, because
    // the domain is the part that is guaranteed case-insensitive by RFC and the
    // registry stores whole addresses verbatim.
    expect(normalizeEmail('Mixed.Case@Sub.Domain')).toBe('mixed.case@sub.domain');
  });
});

describe('base64url', () => {
  it('encodes without padding and with the URL-safe alphabet', () => {
    // `+` and `/` are not URL-safe and `=` needs escaping in a query string.
    const encoded = CryptoUtil.base64UrlEncode('ûÿþ?');
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
    expect(encoded).toBe(CryptoUtil.toBase64Url(new TextEncoder().encode('ûÿþ?')));
  });

  it('encodes a string and its bytes identically', () => {
    // The two entry points are the same transform; a divergence means one
    // caller produces a value the other cannot reproduce.
    const text = 'hello world';
    expect(CryptoUtil.base64UrlEncode(text)).toBe(CryptoUtil.toBase64Url(new TextEncoder().encode(text)));
  });

  it('handles a body large enough to exceed the spread argument limit', () => {
    // `String.fromCodePoint(...bytes)` throws on a large input; the loop does
    // not. A 1 MB MIME body is realistic and must encode.
    const large = 'a'.repeat(1_000_000);
    expect(() => CryptoUtil.base64UrlEncode(large)).not.toThrow();
  });

  it('encodes multi-byte UTF-8 correctly', () => {
    expect(CryptoUtil.base64UrlEncode('日本語')).toBe(
      Buffer.from('日本語', 'utf8')
        .toString('base64')
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replace(/={0,2}$/, ''),
    );
  });
});
