import {
  InMemoryQueueTransport,
  type QueueAdapterRequestEnvelope,
} from '../../backend/src/common/adapters';
import {
  SiconfiRelayMockResponder,
  type SiconfiRelayRequestPayload,
} from '../../backend/src/external/mocks/siconfi-relay';
import { SiconfiQueueAdapter } from '../../backend/src/integrations-worker/siconfi/adapters/queue-adapter';
import {
  SiconfiRreoRgfGenerator,
  type SiconfiFiscalStatementInput,
} from '../../backend/src/integrations-worker/siconfi/rreo-rgf.generator';

const fixedNow = () => new Date('2026-05-04T14:00:00.000Z');

describe('R5-40 SICONFI mock relay queue adapter (e2e)', () => {
  let transport: InMemoryQueueTransport;
  let relay: SiconfiRelayMockResponder;
  let adapter: SiconfiQueueAdapter;

  beforeEach(() => {
    transport = new InMemoryQueueTransport();
    relay = new SiconfiRelayMockResponder({ transport, now: fixedNow });
    adapter = new SiconfiQueueAdapter({
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

  it('posts caller-selected RREO CSV through the SICONFI queue and receives deterministic local ack', async () => {
    const statement: SiconfiFiscalStatementInput = {
      sourceStatus: 'CALLER_SELECTED_OFFICIAL_LAYOUT',
      declaration: 'RREO',
      layoutEdition: 'MDF-15-2026',
      sourceUrl:
        'https://www.gov.br/tesouronacional/pt-br/contabilidade-e-custos/manuais/manual-de-demonstrativos-fiscais-mdf',
      tenantIbgeCode: '3550308',
      period: '2026-BIM-02',
      rows: [
        {
          annex: 'Anexo 1',
          table: 'Receitas',
          accountCode: '1.0.0.0.00.0.0',
          label: 'Receita corrente',
          value: '1250000.00',
        },
      ],
    };
    const content = new SiconfiRreoRgfGenerator().generateCsv(statement);

    const first = await adapter.submitFiscalStatement({
      tenantId: '00000000-0000-4000-8000-000000000140',
      submissionId: '00000000-0000-4000-8000-000000005040',
      statement,
      content,
      correlationId: 'corr-r5-40-siconfi-1',
    });
    const second = await adapter.submitFiscalStatement({
      tenantId: '00000000-0000-4000-8000-000000000140',
      submissionId: '00000000-0000-4000-8000-000000005040',
      statement,
      content,
      correlationId: 'corr-r5-40-siconfi-2',
    });

    expect(first.relay).toMatchObject({
      relay: 'siconfi-relay',
      handledBy: 'siconfi-relay-mock',
      submissionId: '00000000-0000-4000-8000-000000005040',
      declaration: 'RREO',
      sourceStatus: 'CALLER_SELECTED_OFFICIAL_LAYOUT',
      ack: {
        status: 'SANDBOX_ACK',
        receivedAt: '2026-05-04T14:00:00.000Z',
      },
      boundary: {
        transmission: 'OUT_OF_SCOPE',
        acceptance: 'NOT_ASSERTED',
      },
    });
    expect(first.relay.ack.protocol).toMatch(/^SICONFI-RREO-2026-BIM-02-/);
    expect(first.relay.ack.protocol).toBe(second.relay.ack.protocol);
    expect(first.relay.hashes.contentSha256).toBe(
      second.relay.hashes.contentSha256,
    );
    expect(first.dispatchState).toEqual(
      expect.objectContaining({
        system: 'SICONFI',
        status: 'SANDBOX_ACK',
        protocol: first.relay.ack.protocol,
        boundary: {
          transmission: 'OUT_OF_SCOPE',
          acceptance: 'NOT_ASSERTED',
        },
      }),
    );

    const [request] = transport.history<
      QueueAdapterRequestEnvelope<'siconfi', SiconfiRelayRequestPayload>
    >('sgp.adapter.siconfi.request');
    expect(request).toEqual(
      expect.objectContaining({
        'correlation-id': 'corr-r5-40-siconfi-1',
        tenant_id: '00000000-0000-4000-8000-000000000140',
        kind: 'siconfi',
        payload: expect.objectContaining({
          submissionId: '00000000-0000-4000-8000-000000005040',
          declaration: 'RREO',
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
