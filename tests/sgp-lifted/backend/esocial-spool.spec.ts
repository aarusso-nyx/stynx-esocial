import { EsocialSpoolService } from '../../backend/src/esocial-spool';

const tenantId = '00000000-0000-4000-8000-000000060600';
const messageId = '00000000-0000-4000-8000-000000060601';
const createdAt = '2026-05-04T12:00:00.000Z';

describe('EsocialSpoolService', () => {
  it('inserts a PENDING spool row with a deterministic payload hash', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        spoolRow({
          payload_hash:
            '20ba8f314b31e87c3e0e31c150cfcd7f2011aa8ac7a21fd84a7ad3d76dab3d0e',
        }),
      ]);
    const service = new EsocialSpoolService({
      query,
      configured: true,
    } as never);

    const result = await service.recordPending({
      tenantId,
      kind: 'submit',
      eventClass: 'S-1299',
      sourceRef: { batchId: 'batch-1' },
      payload: { b: 2, a: 1 },
      actorSub: 'actor-1',
      requestId: 'req-1',
    });

    expect(result).toMatchObject({
      messageId,
      tenantId,
      kind: 'submit',
      eventClass: 'S-1299',
      status: 'PENDING',
      sourceRef: { batchId: 'batch-1' },
    });
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('status NOT IN'),
      [
        tenantId,
        'submit',
        'S-1299',
        '43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777',
      ],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO public.esocial_events'),
      expect.arrayContaining([
        tenantId,
        'submit',
        'S-1299',
        JSON.stringify({ batchId: 'batch-1' }),
        JSON.stringify({ b: 2, a: 1 }),
      ]),
    );
  });

  it('deduplicates active payloads by tenant, kind, event class, and hash', async () => {
    const query = jest.fn().mockResolvedValueOnce([spoolRow()]);
    const service = new EsocialSpoolService({
      query,
      configured: true,
    } as never);

    const result = await service.recordPending({
      tenantId,
      kind: 'submit',
      eventClass: 'S-1299',
      payload: { batch: 'same' },
    });

    expect(result.messageId).toBe(messageId);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('transitions PENDING to SENT to ACCEPTED', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([spoolRow({ status: 'SENT', attempt: 1 })])
      .mockResolvedValueOnce([
        spoolRow({
          status: 'ACCEPTED',
          attempt: 1,
          response: { receiptNumber: '1.1.1' },
          response_hash:
            '23e11b248afcde86febc535ae9bb7c8caf4051923fd8b60ca794ca27f5f3d4b9',
          tstamp_recv: '2026-05-04T12:05:00.000Z',
          tstamp_terminal: '2026-05-04T12:05:00.000Z',
        }),
      ]);
    const service = new EsocialSpoolService({
      query,
      configured: true,
    } as never);

    await expect(
      service.recordSent({ tenantId, messageId }),
    ).resolves.toMatchObject({
      status: 'SENT',
      attempt: 1,
    });
    await expect(
      service.recordResponse({
        tenantId,
        messageId,
        response: { receiptNumber: '1.1.1' },
      }),
    ).resolves.toMatchObject({
      status: 'ACCEPTED',
      response: { receiptNumber: '1.1.1' },
      terminalAt: '2026-05-04T12:05:00.000Z',
    });
  });

  it('finds tenant-scoped rows only through the tenant-aware query path', async () => {
    const query = jest.fn().mockResolvedValueOnce([spoolRow()]);
    const service = new EsocialSpoolService({
      query,
      configured: true,
    } as never);

    await expect(service.findById(tenantId, messageId)).resolves.toMatchObject({
      tenantId,
      messageId,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id = $1::uuid'),
      [tenantId, messageId],
    );
  });
});

function spoolRow(
  overrides: Partial<ReturnType<typeof baseSpoolRow>> = {},
): ReturnType<typeof baseSpoolRow> {
  return {
    ...baseSpoolRow(),
    ...overrides,
  };
}

function baseSpoolRow() {
  return {
    message_id: messageId,
    tenant_id: tenantId,
    kind: 'submit',
    event_class: 'S-1299',
    source_ref: { batchId: 'batch-1' },
    payload: { batch: 'payload' },
    payload_hash:
      '43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777',
    response: null,
    response_hash: null,
    status: 'PENDING',
    attempt: 0,
    max_attempts: 3,
    error: null,
    tstamp_created: createdAt,
    tstamp_sent: null,
    tstamp_recv: null,
    tstamp_terminal: null,
    actor_sub: 'actor-1',
    actor_login: 'operator@example.test',
    request_id: 'req-1',
  } as const;
}
