import { z } from 'zod';
import {
  CONNECTION_METHOD_ACCESS_KEYS,
  CONNECTION_METHOD_OAUTH2,
  PROVIDER_AMAZON_SNS,
  PROVIDER_GOOGLE_GMAIL,
  PROVIDER_MICROSOFT_OUTLOOK,
  SUPPORTED_PROVIDER_CONNECTIONS,
} from '../constants';

const UUID_PATTERN: RegExp = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ARN_SNS_PATTERN: RegExp = /^arn:aws:sns:[a-z0-9-]+:\d{12}:[A-Za-z0-9_.-]+$/;

const UuidSchema = z.string().regex(UUID_PATTERN, 'Value must be a valid UUID.');
const EmailSchema = z.string().email('Value must be a valid email address.').max(320);
const nonEmptyStringSchema = (fieldName: string, maxLength: number = 2048) =>
  z
    .string()
    .min(1, `${fieldName} is required.`)
    .max(maxLength, `${fieldName} must be ${maxLength} characters or less.`)
    .refine((value: string): boolean => value.trim().length > 0, `${fieldName} is required.`);

const ProviderIdSchema = z.enum([PROVIDER_GOOGLE_GMAIL, PROVIDER_MICROSOFT_OUTLOOK, PROVIDER_AMAZON_SNS]);
const ConnectionMethodSchema = z.enum([CONNECTION_METHOD_OAUTH2, CONNECTION_METHOD_ACCESS_KEYS]);

const ConnectedApplicationBaseSchema = z
  .object({
    displayName: nonEmptyStringSchema('displayName', 128),
    providerId: ProviderIdSchema,
    connectionMethod: ConnectionMethodSchema,
    clientId: nonEmptyStringSchema('clientId', 512).optional(),
    clientSecret: nonEmptyStringSchema('clientSecret', 2048).optional(),
    accessKeyId: nonEmptyStringSchema('accessKeyId', 128).optional(),
    secretAccessKey: nonEmptyStringSchema('secretAccessKey', 512).optional(),
    topicArn: z.string().regex(ARN_SNS_PATTERN, 'topicArn must be a valid SNS topic ARN.').optional(),
  })
  .refine(
    (input): boolean => SUPPORTED_PROVIDER_CONNECTIONS[input.providerId] === input.connectionMethod,
    'providerId and connectionMethod are not a supported combination.',
  )
  .refine(
    (input): boolean => input.connectionMethod !== CONNECTION_METHOD_OAUTH2 || Boolean(input.clientId && input.clientSecret),
    'clientId and clientSecret are required for OAuth2 applications.',
  )
  .refine(
    (input): boolean =>
      input.connectionMethod !== CONNECTION_METHOD_ACCESS_KEYS || Boolean(input.accessKeyId && input.secretAccessKey && input.topicArn),
    'accessKeyId, secretAccessKey, and topicArn are required for access-key applications.',
  );

const positiveIntegerBodySchema = (fieldName: string) => z.number().int().min(1, `${fieldName} must be at least 1.`);

export {
  ConnectedApplicationBaseSchema,
  ConnectionMethodSchema,
  EmailSchema,
  ProviderIdSchema,
  UuidSchema,
  nonEmptyStringSchema,
  positiveIntegerBodySchema,
};
