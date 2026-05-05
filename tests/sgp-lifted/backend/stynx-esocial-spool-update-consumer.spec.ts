import { StynxEsocialSpoolUpdateConsumer } from '../../backend/src/integrations/stynx-esocial/spool-update-consumer.service';

const tenantId = '00000000-0000-4000-8000-000000060801';
const messageId = '00000000-0000-4000-8000-000000060802';

describe('StynxEsocialSpoolUpdateConsumer', () => {
  it('applies ACCEPTED spool updates through EsocialSpoolService', async () => {
    const spoolService = {
      findById: jest.fn().mockResolvedValue({ status: 'SENT' }),
      recordResponse: jest.fn().mockResolvedValue({ status: 'ACCEPTED' }),
      recordSent: jest.fn(),
      recordError: jest.fn(),
    };
    const consumer = new StynxEsocialSpoolUpdateConsumer(spoolService as never);

    await expect(
      consumer.handle({
        tenant_id: tenantId,
        message_id: messageId,
        kind: 'submit',
        status_transition: {
          from: 'SENT',
          to: 'ACCEPTED',
        },
        response_payload: { receiptNumber: '1.1.1' },
        response_hash:
          '451b8de5e3db8ac4d42723254fe9545038a1e4e6bc2dcbce57c050ee2ed8bc92',
        occurred_at: '2026-05-04T12:00:00.000Z',
      }),
    ).resolves.toEqual({
      applied: true,
      idempotencyKey: `spool:${messageId}:SENT>ACCEPTED`,
    });

    expect(spoolService.recordResponse).toHaveBeenCalledWith({
      tenantId,
      messageId,
      status: 'ACCEPTED',
      response: { receiptNumber: '1.1.1' },
      responseHash:
        '451b8de5e3db8ac4d42723254fe9545038a1e4e6bc2dcbce57c050ee2ed8bc92',
    });
  });

  it('skips idempotent duplicate transitions', async () => {
    const spoolService = {
      findById: jest.fn().mockResolvedValue({ status: 'ACCEPTED' }),
      recordResponse: jest.fn(),
      recordSent: jest.fn(),
      recordError: jest.fn(),
    };
    const consumer = new StynxEsocialSpoolUpdateConsumer(spoolService as never);

    await expect(
      consumer.handle({
        tenant_id: tenantId,
        message_id: messageId,
        kind: 'submit',
        status_transition: {
          from: 'SENT',
          to: 'ACCEPTED',
        },
        occurred_at: '2026-05-04T12:00:00.000Z',
      }),
    ).resolves.toMatchObject({ applied: false });
    expect(spoolService.recordResponse).not.toHaveBeenCalled();
  });
});
