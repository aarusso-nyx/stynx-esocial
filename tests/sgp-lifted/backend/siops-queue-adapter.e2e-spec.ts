import {
  InMemoryQueueTransport,
  type QueueAdapterRequestEnvelope,
} from '../../backend/src/common/adapters';
import {
  SiopsRelayMockResponder,
  type SiopsRelayRequestPayload,
} from '../../backend/src/external/mocks/siops-relay';
import { SiopsQueueAdapter } from '../../backend/src/integrations-worker/siops/adapters/queue-adapter';
import {
  SiopsExportGenerator,
  type SiopsExportInput,
} from '../../backend/src/integrations-worker/siops/siops-export.generator';

const fixedNow = () => new Date('2026-05-04T14:10:00.000Z');

describe('R5-40 SIOPS mock relay queue adapter (e2e)', () => {
  let transport: InMemoryQueueTransport;
  let relay: SiopsRelayMockResponder;
  let adapter: SiopsQueueAdapter;

  beforeEach(() => {
    transport = new InMemoryQueueTransport();
    relay = new SiopsRelayMockResponder({ transport, now: fixedNow });
    adapter = new SiopsQueueAdapter({
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

  it('posts caller-selected health fiscal CSV through the SIOPS queue and receives deterministic local ack', async () => {
    const exportInput: SiopsExportInput = {
      sourceStatus: 'CALLER_SELECTED_OFFICIAL_LAYOUT',
      layoutEdition: 'SIOPS-2026-1BIM',
      sourceUrl:
        'https://portalfns.saude.gov.br/siops-arquivos-de-estrutura-e-nova-versao-do-sistema-para-o-1o-bimestre-de-2026-ja-estao-disponiveis/',
      tenantIbgeCode: '3550308',
      period: '2026-BIM-01',
      rows: [
        {
          category: 'ASPS',
          accountCode: '3.1.90.11',
          label: 'Vencimentos e vantagens fixas',
          value: '750000.00',
        },
      ],
    };
    const content = new SiopsExportGenerator().generateCsv(exportInput);

    const first = await adapter.submitExport({
      tenantId: '00000000-0000-4000-8000-000000000142',
      exportId: '00000000-0000-4000-8000-000000005042',
      export: exportInput,
      content,
      correlationId: 'corr-r5-40-siops-1',
    });
    const second = await adapter.submitExport({
      tenantId: '00000000-0000-4000-8000-000000000142',
      exportId: '00000000-0000-4000-8000-000000005042',
      export: exportInput,
      content,
      correlationId: 'corr-r5-40-siops-2',
    });

    expect(first.relay).toMatchObject({
      relay: 'siops-relay',
      handledBy: 'siops-relay-mock',
      exportId: '00000000-0000-4000-8000-000000005042',
      sourceStatus: 'CALLER_SELECTED_OFFICIAL_LAYOUT',
      period: '2026-BIM-01',
      ack: {
        status: 'SANDBOX_ACK',
        receivedAt: '2026-05-04T14:10:00.000Z',
      },
      boundary: {
        transmission: 'OUT_OF_SCOPE',
        acceptance: 'NOT_ASSERTED',
      },
    });
    expect(first.relay.ack.protocol).toMatch(/^SIOPS-2026-BIM-01-/);
    expect(first.relay.ack.protocol).toBe(second.relay.ack.protocol);
    expect(first.relay.hashes.contentSha256).toBe(
      second.relay.hashes.contentSha256,
    );
    expect(first.dispatchState).toEqual(
      expect.objectContaining({
        system: 'SIOPS',
        status: 'SANDBOX_ACK',
        protocol: first.relay.ack.protocol,
        boundary: {
          transmission: 'OUT_OF_SCOPE',
          acceptance: 'NOT_ASSERTED',
        },
      }),
    );

    const [request] = transport.history<
      QueueAdapterRequestEnvelope<'siops', SiopsRelayRequestPayload>
    >('sgp.adapter.siops.request');
    expect(request).toEqual(
      expect.objectContaining({
        'correlation-id': 'corr-r5-40-siops-1',
        tenant_id: '00000000-0000-4000-8000-000000000142',
        kind: 'siops',
        payload: expect.objectContaining({
          exportId: '00000000-0000-4000-8000-000000005042',
          period: '2026-BIM-01',
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
