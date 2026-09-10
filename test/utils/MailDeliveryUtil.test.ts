import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MailDeliveryUtil } from '@/utils/MailDeliveryUtil';

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

describe('MailDeliveryUtil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends text-only Gmail as single text/plain part', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 'msg-1' }, { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await MailDeliveryUtil.sendEmail(
      'google-gmail',
      'sender@example.com',
      'recipient@example.com',
      'Hello',
      { text: 'Message body' },
      'token',
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const sendCall = fetchMock.mock.calls[0];
    expect(sendCall[0]).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    const rawMessage: string = decodeBase64Url((JSON.parse(sendCall[1].body as string) as { raw: string }).raw);
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

    await MailDeliveryUtil.sendEmail(
      'google-gmail',
      'sender@example.com',
      'recipient@example.com',
      'Hello',
      { text: 'Message body', html: '<p>Message body</p>' },
      'token',
    );

    const sendCall = fetchMock.mock.calls[0];
    const rawMessage: string = decodeBase64Url((JSON.parse(sendCall[1].body as string) as { raw: string }).raw);
    const boundary: string = extractMimeBoundary(rawMessage);
    expect(rawMessage).toContain(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    expect(rawMessage).toContain(`--${boundary}\r\nContent-Type: text/plain; charset=utf-8`);
    expect(rawMessage).toContain(`--${boundary}\r\nContent-Type: text/html; charset=utf-8`);
    expect(rawMessage).toContain('<p>Message body</p>');
    expect(rawMessage).toContain(`--${boundary}--`);
  });

  it('derives Gmail text fallback from html when text is missing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 'msg-3' }, { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await MailDeliveryUtil.sendEmail(
      'google-gmail',
      'sender@example.com',
      'recipient@example.com',
      'Hello',
      { html: '<p>Hello <strong>world</strong></p>' },
      'token',
    );

    const sendCall = fetchMock.mock.calls[0];
    const rawMessage: string = decodeBase64Url((JSON.parse(sendCall[1].body as string) as { raw: string }).raw);
    expect(rawMessage).toContain('Content-Type: text/html; charset=utf-8');
    expect(rawMessage).toContain('<p>Hello <strong>world</strong></p>');
    expect(rawMessage).toContain('Hello world');
  });

  it('sends Outlook text body as Text content', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('', { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    await MailDeliveryUtil.sendEmail(
      'microsoft-outlook',
      'sender@example.com',
      'recipient@example.com',
      'Hello',
      { text: 'Message body' },
      'token',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe('https://graph.microsoft.com/v1.0/me/sendMail');
    const payload = JSON.parse(call[1].body as string) as {
      message: { body: { contentType: string; content: string } };
    };
    expect(payload.message.body).toEqual({ contentType: 'Text', content: 'Message body' });
  });

  it('prefers html body for Outlook when both are present', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('', { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    await MailDeliveryUtil.sendEmail(
      'microsoft-outlook',
      'sender@example.com',
      'recipient@example.com',
      'Hello',
      { text: 'Message body', html: '<p>Message body</p>' },
      'token',
    );

    const call = fetchMock.mock.calls[0];
    const payload = JSON.parse(call[1].body as string) as {
      message: { body: { contentType: string; content: string } };
    };
    expect(payload.message.body).toEqual({ contentType: 'HTML', content: '<p>Message body</p>' });
  });
});
