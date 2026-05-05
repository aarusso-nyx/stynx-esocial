import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge';
import {
  SendMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import type {
  ReturnPublishers,
  SubmissionPublishCommand,
  SubmissionPublisher,
} from '@esocial/domain';

export type AwsReturnPublisherOptions = Readonly<{
  spoolQueueUrl: string;
  dlqQueueUrl: string;
  eventBusName: string;
}>;

export function createAwsReturnPublishersFromEnv(): ReturnPublishers {
  return createAwsReturnPublishers({
    spoolQueueUrl: requiredEnv('ESOCIAL_SPOOL_QUEUE_URL'),
    dlqQueueUrl: requiredEnv('ESOCIAL_DLQ_QUEUE_URL'),
    eventBusName: requiredEnv('ESOCIAL_EVENT_BUS_NAME'),
  });
}

export function createAwsReturnPublishers(
  options: AwsReturnPublisherOptions,
): ReturnPublishers {
  const sqs = new SQSClient({});
  const eventBridge = new EventBridgeClient({});

  return {
    spool: new SqsFifoPublisher(sqs, options.spoolQueueUrl),
    audit: new EventBridgePublisher(eventBridge, options.eventBusName),
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
            Source: 'esocial.retorno',
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
    throw new Error(`${name} is required for the return handler.`);
  }

  return value;
}
