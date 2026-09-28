import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROVIDER_GOOGLE_GMAIL, PROVIDER_MICROSOFT_OUTLOOK } from '@mail-meow/shared/constants';
import { PROVIDER_AMAZON_SNS } from '@mail-meow/shared/constants';
import { resolveStrategy } from '@mail-meow/provider-clients';
import { EmailMimeBuilder } from '@mail-meow/provider-clients';

function decodeBase64Url(value: string): string {
  const normalized: string = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded: string = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const binary: string = atob(padded);
  const bytes: Uint8Array = Uint8Array.from(binary, (char: string): number => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function extractMimeBoundary(rawMessage: string): string {
  const match: RegExpMatchArray | null = rawMessage.match(/boundary="([^"]+)"/);
  expect(match).not.toBeNull();
  return match![1];
}

/** Pulls the request body of the nth fetch call. */
function requestBody(fetchMock: ReturnType<typeof vi.fn>, index: number): unknown {
  return JSON.parse(fetchMock.mock.calls[index][1].body as string) as unknown;
}

describe('provider registry', () => {
  it('resolves a strategy for every email-capable provider', () => {
    expect(resolveStrategy(PROVIDER_GOOGLE_GMAIL).label).toBe('Gmail');
    expect(resolveStrategy(PROVIDER_MICROSOFT_OUTLOOK).label).toBe('Microsoft Graph');
  });

  it('rejects a provider with no strategy, including SNS', () => {
    // SNS publishes rather than sends mail; it must not resolve to a mail strategy.
    expect(() => resolveStrategy(PROVIDER_AMAZON_SNS)).toThrow(/does not support email delivery/);
    expect(() => resolveStrategy('nonexistent')).toThrow(/does not support email delivery/);
  });
});

describe('gmail strategy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends text-only Gmail as a single text/plain part', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 'msg-1' }, { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await resolveStrategy(PROVIDER_GOOGLE_GMAIL).sendEmail({
      from: 'sender@example.com',
      to: 'recipient@example.com',
      subject: 'Hello',
      body: { text: 'Message body' },
      accessToken: 'token',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    const rawMessage: string = decodeBase64Url((requestBody(fetchMock, 0) as { raw: string }).raw);
    expect(rawMessage).toContain('Content-Type: text/plain; charset=utf-8');
    expect(rawMessage).not.toContain('multipart/alternative');
    expect(rawMessage).toContain('Message body');
  });

  it('sends Gmail with html as multipart/alternative', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 'msg-2' }, { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await resolveStrategy(PROVIDER_GOOGLE_GMAIL).sendEmail({
      from: 'sender@example.com',
      to: 'recipient@example.com',
      subject: 'Hello',
      body: { text: 'Message body', html: '<p>Message body</p>' },
      accessToken: 'token',
    });

    const rawMessage: string = decodeBase64Url((requestBody(fetchMock, 0) as { raw: string }).raw);
    const boundary: string = extractMimeBoundary(rawMessage);
    expect(rawMessage).toContain(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    expect(rawMessage).toContain(`--${boundary}\r\nContent-Type: text/plain; charset=utf-8`);
    expect(rawMessage).toContain(`--${boundary}\r\nContent-Type: text/html; charset=utf-8`);
    expect(rawMessage).toContain('<p>Message body</p>');
    expect(rawMessage).toContain(`--${boundary}--`);
  });

  it('derives the Gmail text fallback from html when text is missing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 'msg-3' }, { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await resolveStrategy(PROVIDER_GOOGLE_GMAIL).sendEmail({
      from: 'sender@example.com',
      to: 'recipient@example.com',
      subject: 'Hello',
      body: { html: '<p>Hello <strong>world</strong></p>' },
      accessToken: 'token',
    });

    const rawMessage: string = decodeBase64Url((requestBody(fetchMock, 0) as { raw: string }).raw);
    expect(rawMessage).toContain('Content-Type: text/html; charset=utf-8');
    expect(rawMessage).toContain('<p>Hello <strong>world</strong></p>');
    expect(rawMessage).toContain('Hello world');
  });

  it('trashes the sent message so it does not linger in Drafts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 'msg-4' }, { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await resolveStrategy(PROVIDER_GOOGLE_GMAIL).sendEmail({
      from: 'sender@example.com',
      to: 'recipient@example.com',
      subject: 'Hello',
      body: { text: 'body' },
      accessToken: 'token',
    });

    expect(fetchMock.mock.calls[1][0]).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/msg-4/trash');
  });

  it('url-encodes the message id before it becomes a path segment', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 'a/../b?x=1' }, { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await resolveStrategy(PROVIDER_GOOGLE_GMAIL).sendEmail({
      from: 'sender@example.com',
      to: 'recipient@example.com',
      subject: 'Hello',
      body: { text: 'body' },
      accessToken: 'token',
    });

    expect(String(fetchMock.mock.calls[1][0])).toContain('a%2F..%2Fb%3Fx%3D1');
  });

  it('still succeeds when the draft cleanup fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 'msg-5' }, { status: 200 }))
      .mockResolvedValueOnce(new Response('nope', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      resolveStrategy(PROVIDER_GOOGLE_GMAIL).sendEmail({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Hello',
        body: { text: 'body' },
        accessToken: 'token',
      }),
    ).resolves.toBeUndefined();
    // Logged, not swallowed silently.
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('fails when Gmail accepts the send but returns no message id', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      resolveStrategy(PROVIDER_GOOGLE_GMAIL).sendEmail({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Hello',
        body: { text: 'body' },
        accessToken: 'token',
      }),
    ).rejects.toThrow(/did not return a message id/);
  });

  it('does not inject headers through a subject containing CRLF', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 'msg-6' }, { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await resolveStrategy(PROVIDER_GOOGLE_GMAIL).sendEmail({
      from: 'sender@example.com',
      to: 'victim@example.com',
      subject: 'Hi\r\nBcc: attacker@example.com',
      body: { text: 'body' },
      accessToken: 'token',
    });

    const rawMessage: string = decodeBase64Url((requestBody(fetchMock, 0) as { raw: string }).raw);
    expect(rawMessage).not.toMatch(/^Bcc:/m);
  });
});

describe('outlook strategy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a text body as Text content', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('', { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    await resolveStrategy(PROVIDER_MICROSOFT_OUTLOOK).sendEmail({
      from: 'sender@example.com',
      to: 'recipient@example.com',
      subject: 'Hello',
      body: { text: 'Message body' },
      accessToken: 'token',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://graph.microsoft.com/v1.0/me/sendMail');
    const payload = requestBody(fetchMock, 0) as { message: { body: { contentType: string; content: string } } };
    expect(payload.message.body).toEqual({ contentType: 'Text', content: 'Message body' });
  });

  it('prefers the html body when both are present', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('', { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    await resolveStrategy(PROVIDER_MICROSOFT_OUTLOOK).sendEmail({
      from: 'sender@example.com',
      to: 'recipient@example.com',
      subject: 'Hello',
      body: { text: 'Message body', html: '<p>Message body</p>' },
      accessToken: 'token',
    });

    const payload = requestBody(fetchMock, 0) as { message: { body: { contentType: string; content: string } } };
    expect(payload.message.body).toEqual({ contentType: 'HTML', content: '<p>Message body</p>' });
  });

  it('surfaces a provider failure as a classified error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'quota exceeded' } }), { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      resolveStrategy(PROVIDER_MICROSOFT_OUTLOOK).sendEmail({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Hello',
        body: { text: 'body' },
        accessToken: 'token',
      }),
    ).rejects.toThrow(/quota exceeded/);
  });
});

describe('profile resolution', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the Gmail mailbox address', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ emailAddress: 'me@gmail.com' })));

    await expect(resolveStrategy(PROVIDER_GOOGLE_GMAIL).resolveProfileEmail('token')).resolves.toBe('me@gmail.com');
  });

  it('rejects a Gmail profile with no address rather than returning undefined', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({})));

    await expect(resolveStrategy(PROVIDER_GOOGLE_GMAIL).resolveProfileEmail('token')).rejects.toThrow(/did not include an email address/);
  });

  it('falls back to the Graph principal name when mail is null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ mail: null, userPrincipalName: 'me@outlook.com' })));

    await expect(resolveStrategy(PROVIDER_MICROSOFT_OUTLOOK).resolveProfileEmail('token')).resolves.toBe('me@outlook.com');
  });

  it('rejects a Graph profile with neither field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ mail: null, userPrincipalName: null })));

    await expect(resolveStrategy(PROVIDER_MICROSOFT_OUTLOOK).resolveProfileEmail('token')).rejects.toThrow(
      /did not include a mailbox address/,
    );
  });
});

describe('EmailMimeBuilder.buildRawMessage', () => {
  it('produces base64url without padding', () => {
    const raw: string = EmailMimeBuilder.buildRawMessage('a@example.com', 'b@example.com', 'Subject', { text: 'body' });

    expect(raw).not.toContain('=');
    expect(raw).not.toContain('+');
    expect(raw).not.toContain('/');
    expect(decodeBase64Url(raw)).toContain('Subject: Subject');
  });
});
