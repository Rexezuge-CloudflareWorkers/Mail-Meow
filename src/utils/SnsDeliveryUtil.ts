import { InternalServerError } from '@/error';
import { AwsClient } from 'aws4fetch';

class SnsDeliveryUtil {
  public static async publish(
    accessKeyId: string,
    secretAccessKey: string,
    topicArn: string,
    message: string,
    subject?: string,
  ): Promise<string> {
    const region: string | undefined = topicArn.split(':')[3];
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

    const response: Response = await client.fetch(`https://sns.${region}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    if (!response.ok) {
      throw new InternalServerError(`SNS API error: ${response.status} ${await response.text()}`);
    }
    const responseText: string = await response.text();
    const messageIdMatch: RegExpMatchArray | null = responseText.match(/<MessageId>([^<]+)<\/MessageId>/);
    return messageIdMatch ? messageIdMatch[1] : 'unknown';
  }
}

export { SnsDeliveryUtil };
