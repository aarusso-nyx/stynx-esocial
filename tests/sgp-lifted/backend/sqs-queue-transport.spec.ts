import { SendMessageCommand, GetQueueUrlCommand } from '@aws-sdk/client-sqs';

import { SqsQueueTransport } from '../../backend/src/common/adapters';

describe('SqsQueueTransport', () => {
  it('publishes JSON messages to configured queue URLs', async () => {
    const send = jest.fn().mockResolvedValue({});
    const transport = new SqsQueueTransport({
      client: { send } as never,
      queueUrls: {
        'sgp.esocial.submit.request':
          'https://sqs.us-east-1.amazonaws.com/123/sgp_esocial_submit_request',
      },
    });

    await transport.publish('sgp.esocial.submit.request', {
      tenant_id: 'tenant-1',
      payload: { ok: true },
    });

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0] as SendMessageCommand;
    expect(command).toBeInstanceOf(SendMessageCommand);
    expect(command.input).toMatchObject({
      QueueUrl:
        'https://sqs.us-east-1.amazonaws.com/123/sgp_esocial_submit_request',
      MessageBody: JSON.stringify({
        tenant_id: 'tenant-1',
        payload: { ok: true },
      }),
    });
  });

  it('resolves queue URLs once when a topic has no explicit URL', async () => {
    const send = jest.fn(async (command: GetQueueUrlCommand) => {
      if (command instanceof GetQueueUrlCommand) {
        return {
          QueueUrl:
            'https://sqs.us-east-1.amazonaws.com/123/sgp_esocial_submit_request.fifo',
        };
      }
      return {};
    });
    const transport = new SqsQueueTransport({
      client: { send } as never,
      topicToQueueName: (topic) => `${topic}.fifo`,
    });

    await transport.publish('sgp.esocial.submit.request', {
      tenant_id: 'tenant-1',
      payload: { ok: true },
    });
    await transport.publish('sgp.esocial.submit.request', {
      tenant_id: 'tenant-1',
      payload: { ok: true },
    });

    expect(
      send.mock.calls.filter(
        ([command]) => command instanceof GetQueueUrlCommand,
      ),
    ).toHaveLength(1);
    const publishCommand = send.mock.calls.find(
      ([command]) => command instanceof SendMessageCommand,
    )?.[0] as SendMessageCommand;
    expect(publishCommand.input).toMatchObject({
      MessageGroupId: 'tenant-1',
    });
    expect(publishCommand.input.MessageDeduplicationId).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });
});
