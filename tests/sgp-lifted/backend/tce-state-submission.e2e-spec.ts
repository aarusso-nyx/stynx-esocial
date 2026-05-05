import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  adapterQueueTopics,
  InMemoryQueueTransport,
  type QueueAdapterRequestEnvelope,
} from '../../backend/src/common/adapters';
import { TceStateSubmissionService } from '../../backend/src/tce/submission';
import {
  buildRreoFiscalReport,
  type RreoBuilderInput,
} from '../../backend/src/tce/builders/rreo.builder';
import {
  buildRgfFiscalReport,
  type RgfBuilderInput,
} from '../../backend/src/tce/builders/rgf.builder';
import type { TceRelayRequestPayload } from '../../backend/src/external/mocks/tce-relay';

const GOLDEN_ROOT = join(__dirname, 'golden/tce');
const relayNow = () => new Date('2026-05-04T14:00:00.000Z');
const queueTopics = adapterQueueTopics('tce');

describe('R4-81 TCE state submission through R4-96 queue relay (e2e)', () => {
  let database: FakeTceStateSubmissionDatabase;
  let service: TceStateSubmissionService;
  let transport: InMemoryQueueTransport;

  beforeEach(() => {
    database = new FakeTceStateSubmissionDatabase();
    transport = new InMemoryQueueTransport();
    service = new TceStateSubmissionService(database as never, {
      transport,
      now: relayNow,
      idFactory: deterministicIdFactory(),
      retryDelayMs: () => 0,
      responseTimeoutMs: 1_000,
    });
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('round-trips MG RREO and SP RGF payloads through the queue and persists each acknowledgement', async () => {
    const cases = [
      {
        submissionId: '00000000-0000-4000-8000-000000008101',
        correlationId: 'corr-r4-81-mg-rreo',
        report: buildRreoFiscalReport(
          readJson<RreoBuilderInput>('rreo-v01/mg/input.json'),
        ),
      },
      {
        submissionId: '00000000-0000-4000-8000-000000008102',
        correlationId: 'corr-r4-81-sp-rgf',
        report: buildRgfFiscalReport(
          readJson<RgfBuilderInput>('rgf-v01/sp/input.json'),
        ),
      },
    ];

    const results = [];
    for (const input of cases) {
      results.push(
        await service.submitStateReport({
          ...input,
          tenantId: input.report.entity.tenantId,
        }),
      );
    }

    expect(
      results.map((result) => `${result.stateCode}:${result.reportType}`),
    ).toEqual(['MG:RREO', 'SP:RGF']);
    expect(results).toEqual([
      expect.objectContaining({
        submissionId: '00000000-0000-4000-8000-000000008101',
        queueStatus: 'OK',
        queueAttempt: 1,
        correlationId: 'corr-r4-81-mg-rreo',
        protocol: expect.stringMatching(/^TCE-MG-RREO-/),
        status: 'STUB_OK',
        stateAck: {
          stateCode: 'MG',
          sicom: expect.objectContaining({
            numeroProtocolo: expect.stringMatching(/^SICOM-TCE-MG-RREO-/),
            situacao: 'RECEBIDO_EM_AMBIENTE_SIMULADO',
            hashPacote: cases[0]!.report.evidenceHash,
          }),
        },
      }),
      expect.objectContaining({
        submissionId: '00000000-0000-4000-8000-000000008102',
        queueStatus: 'OK',
        queueAttempt: 1,
        correlationId: 'corr-r4-81-sp-rgf',
        protocol: expect.stringMatching(/^TCE-SP-RGF-/),
        status: 'STUB_OK',
        stateAck: {
          stateCode: 'SP',
          audesp: expect.objectContaining({
            protocoloAudesp: expect.stringMatching(/^AUDESP-TCE-SP-RGF-/),
            situacao: 'RECEBIDO_EM_AMBIENTE_SIMULADO',
          }),
        },
      }),
    ]);

    expect(database.updates).toEqual([
      expect.objectContaining({
        submissionId: '00000000-0000-4000-8000-000000008101',
        tenantId: cases[0]!.report.entity.tenantId,
        status: 'STUB_OK',
        envelopeHash: results[0]!.relay.hashes.reportSha256,
        responsePayload: expect.objectContaining({
          handledBy: 'tce-relay-mock',
          stateCode: 'MG',
          reportType: 'RREO',
        }),
      }),
      expect.objectContaining({
        submissionId: '00000000-0000-4000-8000-000000008102',
        tenantId: cases[1]!.report.entity.tenantId,
        status: 'STUB_OK',
        envelopeHash: results[1]!.relay.hashes.reportSha256,
        responsePayload: expect.objectContaining({
          handledBy: 'tce-relay-mock',
          stateCode: 'SP',
          reportType: 'RGF',
        }),
      }),
    ]);

    const requests = transport.history<
      QueueAdapterRequestEnvelope<'tce', TceRelayRequestPayload>
    >(queueTopics.request);
    expect(requests).toHaveLength(2);
    expect(
      requests.map((request) => ({
        correlationId: request['correlation-id'],
        tenantId: request.tenant_id,
        kind: request.kind,
        submissionId: request.payload.submissionId,
        reportType: request.payload.report.reportType,
        stateCode: request.payload.report.target.stateCode,
      })),
    ).toEqual([
      {
        correlationId: 'corr-r4-81-mg-rreo',
        tenantId: cases[0]!.report.entity.tenantId,
        kind: 'tce',
        submissionId: '00000000-0000-4000-8000-000000008101',
        reportType: 'RREO',
        stateCode: 'MG',
      },
      {
        correlationId: 'corr-r4-81-sp-rgf',
        tenantId: cases[1]!.report.entity.tenantId,
        kind: 'tce',
        submissionId: '00000000-0000-4000-8000-000000008102',
        reportType: 'RGF',
        stateCode: 'SP',
      },
    ]);
  });
});

class FakeTceStateSubmissionDatabase {
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
