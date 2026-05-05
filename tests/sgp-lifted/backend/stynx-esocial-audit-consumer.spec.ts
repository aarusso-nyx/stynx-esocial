import { StynxEsocialAuditConsumer } from '../../backend/src/integrations/stynx-esocial/audit-consumer.service';

const tenantId = '00000000-0000-4000-8000-000000060800';

describe('StynxEsocialAuditConsumer', () => {
  it('materializes a stynx audit envelope idempotently', async () => {
    const query = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const consumer = new StynxEsocialAuditConsumer({
      query,
      configured: true,
    } as never);

    await expect(
      consumer.handle({
        tenant_id: tenantId,
        actor_id: 'stynx-worker',
        action: 'UPDATE',
        target: {
          type: 'submission_message',
          id: 'message-1',
        },
        after: { status: 'ACCEPTED' },
        occurred_at: '2026-05-04T12:00:00.000Z',
        correlation_id: 'corr-1',
      }),
    ).resolves.toEqual({
      inserted: true,
      idempotencyKey: 'audit:corr-1:UPDATE',
    });

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FROM public.audit_event'),
      ['corr-1', 'UPDATE'],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO public.audit_event'),
      expect.arrayContaining([
        tenantId,
        '2026-05-04T12:00:00.000Z',
        'stynx-worker',
      ]),
    );
  });

  it('skips duplicate correlation/action pairs', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ id: 'audit-1' }]);
    const consumer = new StynxEsocialAuditConsumer({
      query,
      configured: true,
    } as never);

    await expect(
      consumer.handle({
        tenant_id: tenantId,
        action: 'UPDATE',
        target: { type: 'submission_message' },
        occurred_at: '2026-05-04T12:00:00.000Z',
        correlation_id: 'corr-1',
      }),
    ).resolves.toMatchObject({ inserted: false });
    expect(query).toHaveBeenCalledTimes(1);
  });
});
