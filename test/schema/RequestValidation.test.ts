import { describe, expect, it } from 'vitest';
import { getRequestInputSchema, validateRequestInput } from '../../packages/shared/src/schema';

describe('Request input schemas', () => {
  it('finds schemas for path-key API routes', () => {
    const request = new Request('https://mail.example.com/api/mm_test/email', { method: 'POST' });

    expect(getRequestInputSchema(request)).toBeDefined();
  });

  it('sanitizes valid connected application input', async () => {
    const request = new Request('https://mail.example.com/user/application', { method: 'POST' });

    await expect(
      validateRequestInput(request, {
        displayName: 'Gmail sender',
        providerId: 'google-gmail',
        connectionMethod: 'oauth2',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        ignored: true,
      }),
    ).resolves.toEqual({
      success: true,
      data: {
        displayName: 'Gmail sender',
        providerId: 'google-gmail',
        connectionMethod: 'oauth2',
        clientId: 'client-id',
        clientSecret: 'client-secret',
      },
    });
  });

  it('rejects mismatched provider and connection method', async () => {
    const request = new Request('https://mail.example.com/user/application', { method: 'POST' });

    await expect(
      validateRequestInput(request, {
        displayName: 'Bad SNS',
        providerId: 'amazon-sns',
        connectionMethod: 'oauth2',
        clientId: 'client-id',
        clientSecret: 'client-secret',
      }),
    ).resolves.toMatchObject({ success: false, scope: 'body' });
  });

  it('rejects email sends without a recipient', async () => {
    const request = new Request('https://mail.example.com/api/mm_test/email', { method: 'POST' });

    await expect(validateRequestInput(request, { subject: 'Hello', text: 'Body' })).resolves.toMatchObject({
      success: false,
      scope: 'body',
    });
  });

  it('accepts text-only email sends for backward compatibility', async () => {
    const request = new Request('https://mail.example.com/api/mm_test/email', { method: 'POST' });

    await expect(
      validateRequestInput(request, { to: 'recipient@example.com', subject: 'Hello', text: 'Body' }),
    ).resolves.toMatchObject({ success: true });
  });

  it('accepts html-only email sends', async () => {
    const request = new Request('https://mail.example.com/api/mm_test/email', { method: 'POST' });

    await expect(
      validateRequestInput(request, { to: 'recipient@example.com', subject: 'Hello', html: '<p>Body</p>' }),
    ).resolves.toMatchObject({ success: true });
  });

  it('accepts email sends with both text and html', async () => {
    const request = new Request('https://mail.example.com/api/mm_test/email', { method: 'POST' });

    await expect(
      validateRequestInput(request, {
        to: 'recipient@example.com',
        subject: 'Hello',
        text: 'Body',
        html: '<p>Body</p>',
      }),
    ).resolves.toMatchObject({ success: true });
  });

  it('rejects email sends without text and html', async () => {
    const request = new Request('https://mail.example.com/api/mm_test/email', { method: 'POST' });

    await expect(
      validateRequestInput(request, { to: 'recipient@example.com', subject: 'Hello' }),
    ).resolves.toMatchObject({ success: false, scope: 'body' });
  });

  it('rejects email sends with blank text and html', async () => {
    const request = new Request('https://mail.example.com/api/mm_test/email', { method: 'POST' });

    await expect(
      validateRequestInput(request, { to: 'recipient@example.com', subject: 'Hello', text: '   ', html: '  ' }),
    ).resolves.toMatchObject({ success: false, scope: 'body' });
  });

  it('rejects email sends with oversized html', async () => {
    const request = new Request('https://mail.example.com/api/mm_test/email', { method: 'POST' });

    await expect(
      validateRequestInput(request, {
        to: 'recipient@example.com',
        subject: 'Hello',
        html: `<p>${'a'.repeat(20000)}</p>`,
      }),
    ).resolves.toMatchObject({ success: false, scope: 'body' });
  });
});
