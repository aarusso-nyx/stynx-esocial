import {
  ESOCIAL_QUEUE_TRANSPORT_PARAMETER_KEY,
  EsocialQueueTransportFlag,
} from '../../backend/src/system-parameters/esocial-queue-transport-flag';

const tenantId = '00000000-0000-4000-8000-000000060700';

describe('EsocialQueueTransportFlag', () => {
  it('defaults to in-memory when the database is not configured', async () => {
    const service = new EsocialQueueTransportFlag({
      configured: false,
    } as never);

    await expect(service.resolve(tenantId)).resolves.toBe('in-memory');
  });

  it('resolves sqs only for the tenant-scoped feature flag row', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      {
        value: {
          active: true,
          transport: 'sqs',
        },
      },
    ]);
    const service = new EsocialQueueTransportFlag({
      configured: true,
      query,
    } as never);

    await expect(service.resolve(tenantId)).resolves.toBe('sqs');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM public.system_parameter'),
      [tenantId, ESOCIAL_QUEUE_TRANSPORT_PARAMETER_KEY],
    );
  });

  it('falls back to in-memory for inactive or invalid flag values', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ value: { active: false, transport: 'sqs' } }])
      .mockResolvedValueOnce([
        { value: { active: true, transport: 'invalid' } },
      ])
      .mockResolvedValueOnce([]);
    const service = new EsocialQueueTransportFlag({
      configured: true,
      query,
    } as never);

    await expect(service.resolve(tenantId)).resolves.toBe('in-memory');
    await expect(service.resolve(tenantId)).resolves.toBe('in-memory');
    await expect(service.resolve(tenantId)).resolves.toBe('in-memory');
  });
});
