import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge';
import {
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import type {
  SubmissionPublishCommand,
  SubmissionPublisher,
  SubmissionPublishers,
} from '@esocial/domain';

export type AwsSubmissionPublisherOptions = Readonly<{
  responseQueueUrl: string;
  spoolQueueUrl: string;
  retryQueueUrl: string;
  dlqQueueUrl: string;
  eventBusName: string;
}>;

export function createAwsSubmissionPublishersFromEnv(): SubmissionPublishers {
  return createAwsSubmissionPublishers({
    responseQueueUrl: requiredEnv('ESOCIAL_RESPONSE_QUEUE_URL'),
    spoolQueueUrl: requiredEnv('ESOCIAL_SPOOL_QUEUE_URL'),
    retryQueueUrl: requiredEnv('ESOCIAL_RETRY_QUEUE_URL'),
    dlqQueueUrl: requiredEnv('ESOCIAL_DLQ_QUEUE_URL'),
    eventBusName: requiredEnv('ESOCIAL_EVENT_BUS_NAME'),
  });
}

export function createAwsSubmissionPublishers(
  options: AwsSubmissionPublisherOptions,
): SubmissionPublishers {
  const sqs = new SQSClient({});
  const eventBridge = new EventBridgeClient({});

  return {
    response: new SqsFifoPublisher(sqs, options.responseQueueUrl),
    spool: new SqsFifoPublisher(sqs, options.spoolQueueUrl),
    audit: new EventBridgePublisher(eventBridge, options.eventBusName),
    retry: new SqsFifoPublisher(sqs, options.retryQueueUrl),
    dlq: new SqsFifoPublisher(sqs, options.dlqQueueUrl),
  };
}

class SqsFifoPublisher<TEnvelope> implements SubmissionPublisher<TEnvelope> {
  constructor(
    private readonly client: SQSClient,
    private readonly queueUrl: string,
  ) {}

  async publish(command: SubmissionPublishCommand<TEnvelope>): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(command.envelope),
        MessageGroupId: command.fifo.messageGroupId,
        MessageDeduplicationId: command.fifo.messageDeduplicationId,
        MessageAttributes: {
          topic: stringAttribute(command.topic),
          family: stringAttribute(command.family),
          correlationId: stringAttribute(command.correlationId),
        },
      }),
    );
  }
}

class EventBridgePublisher<TEnvelope> implements SubmissionPublisher<TEnvelope> {
  constructor(
    private readonly client: EventBridgeClient,
    private readonly eventBusName: string,
  ) {}

  async publish(command: SubmissionPublishCommand<TEnvelope>): Promise<void> {
    await this.client.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: this.eventBusName,
            Source: 'esocial.submission',
            DetailType: command.topic,
            Detail: JSON.stringify({
              envelope: command.envelope,
              correlationId: command.correlationId,
              fifo: command.fifo,
            }),
          },
        ],
      }),
    );
  }
}

function stringAttribute(value: string) {
  return {
    DataType: 'String',
    StringValue: value,
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for the submission handler.`);
  }

  return value;
}
