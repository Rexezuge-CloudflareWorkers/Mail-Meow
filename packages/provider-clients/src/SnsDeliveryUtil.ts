import { InternalServerError, ProviderApiRetryableError } from '@mail-meow/backend-errors';
import { AwsClient } from 'aws4fetch';
import { isRetryableHttpStatus } from './BaseProviderHttp';

/**
GovCloud and China ARNs do not resolve under the commercial endpoint.
*/
const AWS_PARTITION_SUFFIX: Record<string, string> = {
  'aws-us-gov': 'amazonaws.com',
  'aws-cn': 'amazonaws.com.cn',
};

const AWS_DEFAULT_PARTITION = 'aws';
const AWS_COMMERCIAL_SUFFIX = 'amazonaws.com';
const MAX_ERROR_DETAIL_LENGTH = 512;
const PUBLISH_TIMEOUT_MS = 15_000;

class SnsDeliveryUtil {
  public static async publish(
    accessKeyId: string,
    secretAccessKey: string,
    topicArn: string,
    message: string,
    subject?: string,
    // Normally `AppConfigReader.providerRequestTimeoutMs`. Separate from the
    // shared `IHttpClient` because `aws4fetch` owns its own signing client.
    timeoutMs: number = PUBLISH_TIMEOUT_MS,
  ): Promise<string> {
    const region: string | undefined = topicArn.split(':', 4)[3];
    if (!region) {
      throw new InternalServerError('SNS topic ARN does not contain a region.');
    }
    const client = new AwsClient({
      accessKeyId,
      secretAccessKey,
      region,
      service: 'sns',
    });

    const params = new URLSearchParams({
      Action: 'Publish',
      TopicArn: topicArn,
      Message: message,
      Version: '2010-03-31',
    });
    if (subject) {
      params.append('Subject', subject);
    }

    const response: Response = await client.fetch(this.endpointFor(topicArn, region), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      const body: string = await response.text();
      const detail: string = body.replaceAll(/\s+/g, ' ').trim().slice(0, MAX_ERROR_DETAIL_LENGTH);
      const failure: string = `SNS publish failed (${response.status.toString()}): ${detail || response.statusText}`;
      // A 5xx or a throttle is worth another attempt on the next tick; a 4xx
      // will fail identically forever.
      throw isRetryableHttpStatus(response.status) ? new ProviderApiRetryableError(failure) : new InternalServerError(failure);
    }
    const responseText: string = await response.text();
    const messageIdMatch: RegExpExecArray | null = /<MessageId>([^<]+)<\/MessageId>/.exec(responseText);
    if (!messageIdMatch) {
      // A publish that succeeded but returned an unparseable body is ambiguous:
      // the message may or may not have been accepted. Reporting a synthetic
      // 'unknown' id would hide that from the caller.
      throw new InternalServerError('SNS publish succeeded but the response contained no MessageId.');
    }
    return messageIdMatch[1];
  }

  private static endpointFor(topicArn: string, region: string): string {
    const partition: string = topicArn.split(':', 1)[0] ?? AWS_DEFAULT_PARTITION;
    const suffix: string = AWS_PARTITION_SUFFIX[partition] ?? AWS_COMMERCIAL_SUFFIX;
    return `https://sns.${region}.${suffix}/`;
  }
}

export { SnsDeliveryUtil };
