import {
  InMemoryQueueTransport,
  type QueueAdapterRequestEnvelope,
} from '../../backend/src/common/adapters';
import {
  SiopeRelayMockResponder,
  type SiopeRelayRequestPayload,
} from '../../backend/src/external/mocks/siope-relay';
import { SiopeQueueAdapter } from '../../backend/src/integrations-worker/siope/adapters/queue-adapter';
import {
  SiopeExportGenerator,
  type SiopeExportInput,
} from '../../backend/src/integrations-worker/siope/siope-export.generator';

const fixedNow = () => new Date('2026-05-04T14:05:00.000Z');

describe('R5-40 SIOPE mock relay queue adapter (e2e)', () => {
  let transport: InMemoryQueueTransport;
  let relay: SiopeRelayMockResponder;
  let adapter: SiopeQueueAdapter;

  beforeEach(() => {
    transport = new InMemoryQueueTransport();
    relay = new SiopeRelayMockResponder({ transport, now: fixedNow });
    adapter = new SiopeQueueAdapter({
      transport,
      retryDelayMs: () => 0,
      responseTimeoutMs: 1_000,
      now: fixedNow,
      idFactory: deterministicIdFactory(),
    });
  });

  afterEach(() => {
    adapter.close();
    relay.close();
  });

  it('posts caller-selected education fiscal CSV through the SIOPE queue and receives deterministic local ack', async () => {
    const exportInput: SiopeExportInput = {
      sourceStatus: 'CALLER_SELECTED_OFFICIAL_LAYOUT',
      layoutEdition: 'SIOPE-2026-26.0.1.2',
      sourceUrl: 'https://www.fnde.gov.br/siope/download.do',
      tenantIbgeCode: '3550308',
      year: 2026,
      rows: [
        {
          category: 'REMUNERACAO_PROFISSIONAIS',
          accountCode: 'FUNDEB-REM',
          label: 'Remuneracao dos profissionais da educacao',
          value: '500000.00',
        },
      ],
    };
    const content = new SiopeExportGenerator().generateCsv(exportInput);

    const first = await adapter.submitExport({
      tenantId: '00000000-0000-4000-8000-000000000141',
      exportId: '00000000-0000-4000-8000-000000005041',
      export: exportInput,
      content,
      correlationId: 'corr-r5-40-siope-1',
    });
    const second = await adapter.submitExport({
      tenantId: '00000000-0000-4000-8000-000000000141',
      exportId: '00000000-0000-4000-8000-000000005041',
      export: exportInput,
      content,
      correlationId: 'corr-r5-40-siope-2',
    });

    expect(first.relay).toMatchObject({
      relay: 'siope-relay',
      handledBy: 'siope-relay-mock',
      exportId: '00000000-0000-4000-8000-000000005041',
      sourceStatus: 'CALLER_SELECTED_OFFICIAL_LAYOUT',
      year: 2026,
      ack: {
        status: 'SANDBOX_ACK',
        receivedAt: '2026-05-04T14:05:00.000Z',
      },
      boundary: {
        transmission: 'OUT_OF_SCOPE',
        acceptance: 'NOT_ASSERTED',
      },
    });
    expect(first.relay.ack.protocol).toMatch(/^SIOPE-2026-/);
    expect(first.relay.ack.protocol).toBe(second.relay.ack.protocol);
    expect(first.relay.hashes.contentSha256).toBe(
      second.relay.hashes.contentSha256,
    );
    expect(first.dispatchState).toEqual(
      expect.objectContaining({
        system: 'SIOPE',
        status: 'SANDBOX_ACK',
        protocol: first.relay.ack.protocol,
        boundary: {
          transmission: 'OUT_OF_SCOPE',
          acceptance: 'NOT_ASSERTED',
        },
      }),
    );

    const [request] = transport.history<
      QueueAdapterRequestEnvelope<'siope', SiopeRelayRequestPayload>
    >('sgp.adapter.siope.request');
    expect(request).toEqual(
      expect.objectContaining({
        'correlation-id': 'corr-r5-40-siope-1',
        tenant_id: '00000000-0000-4000-8000-000000000141',
        kind: 'siope',
        payload: expect.objectContaining({
          exportId: '00000000-0000-4000-8000-000000005041',
          year: 2026,
          contentBase64: Buffer.from(content, 'utf8').toString('base64'),
        }),
      }),
    );
  });
});

function deterministicIdFactory(): () => string {
  let next = 1;
  return () => {
    const suffix = String(next).padStart(12, '0');
    next += 1;
    return `00000000-0000-4000-8000-${suffix}`;
  };
}
