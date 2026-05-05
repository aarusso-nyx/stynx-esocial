import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  InMemoryQueueTransport,
  type QueueAdapterRequestEnvelope,
} from '../../backend/src/common/adapters';
import {
  TceRelayMockResponder,
  type TceRelayRequestPayload,
} from '../../backend/src/external/mocks/tce-relay';
import {
  buildRreoFiscalReport,
  type RreoBuilderInput,
} from '../../backend/src/tce/builders/rreo.builder';
import {
  buildRgfFiscalReport,
  type RgfBuilderInput,
} from '../../backend/src/tce/builders/rgf.builder';
import {
  TceQueueAdapter,
  TceSubmissionSqlStateWriter,
  type TceQueueDatabase,
} from '../../backend/src/tce/adapters/queue-adapter';

const GOLDEN_ROOT = join(__dirname, 'golden/tce');
const relayNow = () => new Date('2026-05-04T13:00:00.000Z');

describe('R4-96 TCE mock relay queue adapter (e2e)', () => {
  let transport: InMemoryQueueTransport;
  let relay: TceRelayMockResponder;
  let adapter: TceQueueAdapter;
  let database: FakeTceSubmissionDatabase;

  beforeEach(() => {
    transport = new InMemoryQueueTransport();
    relay = new TceRelayMockResponder({
      transport,
      now: relayNow,
    });
    database = new FakeTceSubmissionDatabase();
    adapter = new TceQueueAdapter({
      transport,
      stateWriter: new TceSubmissionSqlStateWriter(database),
      retryDelayMs: () => 0,
      responseTimeoutMs: 1_000,
      now: relayNow,
      idFactory: deterministicIdFactory(),
    });
  });

  afterEach(() => {
    adapter.close();
    relay.close();
  });

  it('posts SP RREO and MG RGF reports through the TCE queue and persists mock ack state', async () => {
    const spRreo = buildRreoFiscalReport(
      readJson<RreoBuilderInput>('rreo-v01/sp/input.json'),
    );
    const mgRgf = buildRgfFiscalReport(
      readJson<RgfBuilderInput>('rgf-v01/mg/input.json'),
    );

    const spResult = await adapter.submitFiscalReport({
      tenantId: spRreo.entity.tenantId,
      submissionId: '00000000-0000-4000-8000-000000009601',
      report: spRreo,
      correlationId: 'corr-r4-96-sp-rreo',
    });
    const mgResult = await adapter.submitFiscalReport({
      tenantId: mgRgf.entity.tenantId,
      submissionId: '00000000-0000-4000-8000-000000009602',
      report: mgRgf,
      correlationId: 'corr-r4-96-mg-rgf',
    });

    expect(spResult.relay).toEqual(
      expect.objectContaining({
        relay: 'tce-relay',
        handledBy: 'tce-relay-mock',
        submissionId: '00000000-0000-4000-8000-000000009601',
        reportType: 'RREO',
        stateCode: 'SP',
        adapterId: 'audesp-sp',
        officialConformance: false,
        ack: expect.objectContaining({
          protocol: expect.stringMatching(/^TCE-SP-RREO-/),
          status: 'SANDBOX_ACK',
        }),
        stateAck: {
          stateCode: 'SP',
          audesp: expect.objectContaining({
            protocoloAudesp: expect.stringMatching(/^AUDESP-TCE-SP-RREO-/),
            situacao: 'RECEBIDO_EM_AMBIENTE_SIMULADO',
          }),
        },
      }),
    );
    expect(mgResult.relay).toEqual(
      expect.objectContaining({
        relay: 'tce-relay',
        handledBy: 'tce-relay-mock',
        submissionId: '00000000-0000-4000-8000-000000009602',
        reportType: 'RGF',
        stateCode: 'MG',
        adapterId: 'tce-mg',
        officialConformance: false,
        ack: expect.objectContaining({
          protocol: expect.stringMatching(/^TCE-MG-RGF-/),
          status: 'SANDBOX_ACK',
        }),
        stateAck: {
          stateCode: 'MG',
          sicom: expect.objectContaining({
            numeroProtocolo: expect.stringMatching(/^SICOM-TCE-MG-RGF-/),
            situacao: 'RECEBIDO_EM_AMBIENTE_SIMULADO',
            hashPacote: mgRgf.evidenceHash,
          }),
        },
      }),
    );

    expect(spResult.submissionState).toMatchObject({
      submissionId: '00000000-0000-4000-8000-000000009601',
      tenantId: spRreo.entity.tenantId,
      reportType: 'RREO',
      stateCode: 'SP',
      status: 'STUB_OK',
      requestHash: spResult.relay.hashes.reportSha256,
      responsePayload: spResult.relay,
      submittedAt: '2026-05-04T13:00:00.000Z',
    });
    expect(mgResult.submissionState).toMatchObject({
      submissionId: '00000000-0000-4000-8000-000000009602',
      tenantId: mgRgf.entity.tenantId,
      reportType: 'RGF',
      stateCode: 'MG',
      status: 'STUB_OK',
      requestHash: mgResult.relay.hashes.reportSha256,
      responsePayload: mgResult.relay,
      submittedAt: '2026-05-04T13:00:00.000Z',
    });

    expect(database.updates).toEqual([
      expect.objectContaining({
        submissionId: '00000000-0000-4000-8000-000000009601',
        tenantId: spRreo.entity.tenantId,
        status: 'STUB_OK',
        envelopeHash: spResult.relay.hashes.reportSha256,
        responsePayload: spResult.relay,
      }),
      expect.objectContaining({
        submissionId: '00000000-0000-4000-8000-000000009602',
        tenantId: mgRgf.entity.tenantId,
        status: 'STUB_OK',
        envelopeHash: mgResult.relay.hashes.reportSha256,
        responsePayload: mgResult.relay,
      }),
    ]);

    const requests = transport.history<
      QueueAdapterRequestEnvelope<'tce', TceRelayRequestPayload>
    >('sgp.adapter.tce.request');
    expect(requests).toHaveLength(2);
    expect(requests[0]).toEqual(
      expect.objectContaining({
        'correlation-id': 'corr-r4-96-sp-rreo',
        tenant_id: spRreo.entity.tenantId,
        kind: 'tce',
        payload: expect.objectContaining({
          submissionId: '00000000-0000-4000-8000-000000009601',
          report: expect.objectContaining({
            reportType: 'RREO',
            evidenceHash: spRreo.evidenceHash,
          }),
        }),
      }),
    );
  });
});

class FakeTceSubmissionDatabase implements TceQueueDatabase {
  readonly updates: Array<{
    submissionId: string;
    status: string;
    envelopeHash: string;
    requestSizeBytes: number;
    responsePayload: unknown;
    responseHash: string;
    submittedAt: string;
    responseAt: string;
    tenantId: string;
  }> = [];

  async query<T>(sql: string, values: unknown[] = []): Promise<T[]> {
    if (!sql.includes('UPDATE tce.submission')) return [] as T[];

    const update = {
      submissionId: String(values[0]),
      status: String(values[1]),
      envelopeHash: String(values[2]),
      requestSizeBytes: Number(values[3]),
      responsePayload: JSON.parse(String(values[4])) as unknown,
      responseHash: String(values[5]),
      submittedAt: String(values[6]),
      responseAt: String(values[7]),
      tenantId: String(values[8]),
    };
    this.updates.push(update);

    return [{ id: update.submissionId }] as T[];
  }
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(join(GOLDEN_ROOT, path), 'utf8')) as T;
}

function deterministicIdFactory(): () => string {
  let next = 1;
  return () => {
    const suffix = String(next).padStart(12, '0');
    next += 1;
    return `00000000-0000-4000-8000-${suffix}`;
  };
}
