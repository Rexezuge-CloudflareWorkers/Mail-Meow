import { z } from 'zod';
import type { ZodTypeAny } from 'zod';
import { ConnectedApplicationBaseSchema, UuidSchema, nonEmptyStringSchema, positiveIntegerBodySchema } from './common';

interface RequestInputSchema {
  body?: ZodTypeAny | undefined;
  query?: ZodTypeAny | undefined;
}

const CreateApplicationBodySchema = ConnectedApplicationBaseSchema;

const UpdateApplicationBodySchema = ConnectedApplicationBaseSchema.extend({
  applicationId: UuidSchema,
});

const DeleteApplicationBodySchema = z.object({
  applicationId: UuidSchema,
});

const OAuth2AuthorizeBodySchema = z.object({
  applicationId: UuidSchema,
});

const ApplicationIdQuerySchema = z.object({
  applicationId: UuidSchema,
});

const CreateApiKeyBodySchema = z.object({
  applicationId: UuidSchema,
  name: nonEmptyStringSchema('name', 128),
  expiresInDays: positiveIntegerBodySchema('expiresInDays').optional(),
});

const DeleteApiKeyBodySchema = z.object({
  applicationId: UuidSchema,
  apiKeyId: UuidSchema,
});

const SendEmailBodySchema = z.object({
  to: z.string().email('to must be a valid email address.').max(320),
  subject: nonEmptyStringSchema('subject', 512),
  text: nonEmptyStringSchema('text', 20000),
});

const SendSNSBodySchema = z.object({
  subject: nonEmptyStringSchema('subject', 100).optional(),
  message: nonEmptyStringSchema('message', 20000),
});

const OAuth2CallbackQuerySchema = z
  .object({
    code: nonEmptyStringSchema('code', 4096).optional(),
    state: nonEmptyStringSchema('state', 512).optional(),
    error: nonEmptyStringSchema('error', 1024).optional(),
  })
  .refine((input): boolean => Boolean(input.error || (input.code && input.state)), 'OAuth2 callback requires code and state.');

const RequestInputSchemas: Record<string, RequestInputSchema> = {
  'POST /user/application': { body: CreateApplicationBodySchema },
  'PUT /user/application': { body: UpdateApplicationBodySchema },
  'DELETE /user/application': { body: DeleteApplicationBodySchema },
  'POST /user/application/oauth2/authorize': { body: OAuth2AuthorizeBodySchema },
  'GET /user/application/api-keys': { query: ApplicationIdQuerySchema },
  'POST /user/application/api-key': { body: CreateApiKeyBodySchema },
  'DELETE /user/application/api-key': { body: DeleteApiKeyBodySchema },
  'POST /api/:api_key/email': { body: SendEmailBodySchema },
  'POST /api/:api_key/sns': { body: SendSNSBodySchema },
  'GET /api/oauth2/callback/:applicationId': { query: OAuth2CallbackQuerySchema },
};

export { RequestInputSchemas };
export type { RequestInputSchema };
