class CryptoUtility {
  public static async sha256Hex(value: string): Promise<string> {
    const digest: ArrayBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return this.toHex(new Uint8Array(digest));
  }

  public static async hmacSha256Hex(value: string, secret: string): Promise<string> {
    const key: CryptoKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature: ArrayBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
    return this.toHex(new Uint8Array(signature));
  }

  private static toHex(bytes: Uint8Array): string {
    return Array.from(bytes, (byte: number): string => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * URL-safe base64, unpadded.
   *
   * `btoa` is used rather than `Uint8Array#toBase64` because the latter is not
   * guaranteed across Workers runtimes. The bytes are accumulated in a loop
   * instead of via `String.fromCodePoint(...bytes)`: a large MIME body would
   * exceed the engine's argument-count ceiling on the spread form.
   */
  public static toBase64Url(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCodePoint(byte);
    }
    return btoa(binary)
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/={0,2}$/, '');
  }

  /**
   * URL-safe base64 of a UTF-8 string.
   *
   * The same transform as {@link toBase64Url}, for callers holding text rather
   * than bytes. This and `toBase64Url` used to be separate implementations in
   * two packages; they are the same encoding and must not drift.
   */
  public static base64UrlEncode(value: string): string {
    return this.toBase64Url(new TextEncoder().encode(value));
  }

  public static randomBase64Url(byteLength: number): string {
    return this.toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
  }
}

export { CryptoUtility as CryptoUtil };
