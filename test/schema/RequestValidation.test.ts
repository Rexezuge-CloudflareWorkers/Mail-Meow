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
});
