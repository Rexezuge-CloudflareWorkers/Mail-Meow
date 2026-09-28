interface EmailBody {
  text?: string;
  html?: string;
}

/**
 * Builds RFC 5322 messages for provider send APIs.
 *
 * Exists mainly to keep CRLF out of header values. Header injection through an
 * unsanitized `Subject` (or `To`, or `From`) lets a caller append arbitrary
 * headers such as `Bcc:` to a message they are about to send, so every value
 * that lands in the header block is scrubbed here rather than at each call site.
 */
class EmailMimeBuilder {
  /**
   * Removes CR and LF so a value cannot terminate its header and start another.
   * Other control characters are stripped too, since they would otherwise be
   * relayed verbatim into the message stream.
   */
  public static sanitizeHeaderValue(value: string): string {
    return (
      value
        .replaceAll(/[\r\n]/g, ' ')
        // eslint-disable-next-line unicorn/prefer-string-replace-all -- \p{C} needs the global flag, which the rule's suggestion drops
        .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
        .trim()
    );
  }

  /**
  Normalizes any newline convention to CRLF, which is what SMTP requires.
  */
  public static toCrlf(value: string): string {
    return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n').replaceAll('\n', '\r\n');
  }

  public static buildTextEmail(sender: string, recipient: string, subject: string, text: string): string {
    return this.joinHeaders(
      [
        ['From', sender],
        ['To', recipient],
        ['Subject', subject],
        ['MIME-Version', '1.0'],
        ['Content-Type', 'text/plain; charset=utf-8'],
      ],
      [text],
    );
  }

  /**
  multipart/alternative with the plain-text part first, as RFC 2046 requires.
  */
  public static buildAlternativeEmail(sender: string, recipient: string, subject: string, textBody: string, htmlBody: string): string {
    const boundary: string = this.createMimeBoundary();
    const body: string = [
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      this.toCrlf(textBody),
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      this.toCrlf(htmlBody),
      `--${boundary}--`,
      '',
    ].join('\r\n');

    return this.joinHeaders(
      [
        ['From', sender],
        ['To', recipient],
        ['Subject', subject],
        ['MIME-Version', '1.0'],
        ['Content-Type', `multipart/alternative; boundary="${boundary}"`],
      ],
      [body],
    );
  }

  private static joinHeaders(headers: Array<[string, string]>, bodyLines: string[]): string {
    const headerBlock: string = headers
      // Header names are literal constants, so only the values need scrubbing.
      .map(([name, value]): string => `${name}: ${this.sanitizeHeaderValue(value)}`)
      .join('\r\n');
    return [headerBlock, '', ...bodyLines].join('\r\n');
  }

  private static createMimeBoundary(): string {
    // The random suffix keeps the boundary from colliding with message content.
    return `mail-meow-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  }
}

export { EmailMimeBuilder };
export type { EmailBody };
