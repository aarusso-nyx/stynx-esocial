import { InMemoryQueueTransport } from '../../backend/src/common/adapters';
import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { GovBrSignatureSandboxAdapter } from '../../backend/src/auth/govbr/govbr-signature-sandbox.adapter';
import { GovBrSignService } from '../../backend/src/auth/govbr/sign.service';
import { DatabaseService } from '../../backend/src/database/database.service';
import { EsocialQueueAdapter } from '../../backend/src/esocial-worker/adapters/queue-adapter';
import { EsocialRelayMockResponder } from '../../backend/src/external/mocks/esocial-relay';

const tenantId = '00000000-0000-0000-0000-000000049700';
const acceptedEventId = '00000000-0000-4000-8000-000000049701';
const acceptedBatchId = '00000000-0000-4000-8000-000000049702';
const rejectedEventId = '00000000-0000-4000-8000-000000049703';
const rejectedBatchId = '00000000-0000-4000-8000-000000049704';
const endpointUrl = 'mock://esocial-relay/qualificacao';
const signedAt = '2026-05-04T12:00:00.000Z';
const relayNow = () => new Date('2026-05-04T12:05:00.000Z');

jest.setTimeout(30_000);

describe('R4-97 eSocial mock relay queue adapter (e2e)', () => {
  let databaseService: DatabaseService;
  let relay: EsocialRelayMockResponder;
  let adapter: EsocialQueueAdapter;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for esocial-queue-adapter');
    }
    databaseService = new DatabaseService({
      get: (key: string) => ({ DATABASE_URL: process.env.DATABASE_URL })[key],
    } as never);

    const transport = new InMemoryQueueTransport();
    relay = new EsocialRelayMockResponder({
      transport,
      now: relayNow,
    });
    adapter = new EsocialQueueAdapter({
      databaseService,
      transport,
      retryDelayMs: () => 0,
      responseTimeoutMs: 2_000,
      now: relayNow,
    });

    await runAsWorker(() => seed(databaseService));
  });

  afterAll(async () => {
    await runAsWorker(() => cleanup(databaseService));
    adapter?.close();
    relay?.close();
    await databaseService?.onModuleDestroy();
  });

  it('posts a PAdES signed S-1299 envelope through the queue and persists ack plus recibo', async () => {
    const signedEnvelope = signS1299();

    const result = await adapter.submitSignedEnvelope({
      tenantId,
      batchId: acceptedBatchId,
      environment: 'QUALIFICATION',
      endpointUrl,
      eventIds: [acceptedEventId],
      signedEnvelope,
      requestId: 'req-r4-97-accepted',
      correlationId: 'corr-r4-97-accepted',
      idempotencyKey: `${tenantId}:${acceptedBatchId}:S-1299`,
    });

    expect(result).toMatchObject({
      batchId: acceptedBatchId,
      tenantId,
      eventIds: [acceptedEventId],
      eventClass: 'S-1299',
      status: 'ACCEPTED',
      attempts: 1,
      httpStatus: 200,
    });
    expect(result.protocolNumber).toMatch(/^1\.1\.202605\.\d{15}$/);
    expect(result.receiptNumber).toMatch(/^1\.1\.\d{19}$/);

    const [persisted] = await runAsWorker(() =>
      databaseService.query<{
        batch_status: string;
        attempts: number;
        soap_request_hash: string | null;
        soap_response_hash: string | null;
        http_status: number | null;
        event_status: string;
        protocol_number: string | null;
        receipt_number: string | null;
        response_code: string | null;
      }>(
        `
        SELECT
          batch.status::text AS batch_status,
          batch.attempts,
          batch.soap_request_hash,
          batch.soap_response_hash,
          batch.http_status,
          event.status::text AS event_status,
          event.protocol_number,
          event.receipt_number,
          event.response_code
        FROM esocial.submission_batch batch
        JOIN public.esocial_event event
          ON event.tenant_id = batch.tenant_id
         AND event.id = ANY(batch.event_ids)
        WHERE batch.tenant_id = $1::uuid
          AND batch.batch_id = $2::uuid
        `,
        [tenantId, acceptedBatchId],
      ),
    );

    expect(persisted).toMatchObject({
      batch_status: 'ACCEPTED',
      attempts: 1,
      soap_request_hash: result.requestSha256,
      soap_response_hash: result.responseSha256,
      http_status: 200,
      event_status: 'PROCESSADO_COM_SUCESSO',
      protocol_number: result.protocolNumber,
      receipt_number: result.receiptNumber,
      response_code: '201',
    });
  });

  it('dead-letters a tampered envelope and records the definitive relay error', async () => {
    const signedEnvelope = signS1299();

    await expect(
      adapter.submitSignedEnvelope({
        tenantId,
        batchId: rejectedBatchId,
        environment: 'QUALIFICATION',
        endpointUrl,
        eventIds: [rejectedEventId],
        signedEnvelope: {
          ...signedEnvelope,
          payloadXml: signedEnvelope.payloadXml.replace(
            '<perApur>2026-04</perApur>',
            '<perApur>2026-05</perApur>',
          ),
        },
        requestId: 'req-r4-97-rejected',
        correlationId: 'corr-r4-97-rejected',
        idempotencyKey: `${tenantId}:${rejectedBatchId}:S-1299`,
        maxAttempts: 1,
      }),
    ).rejects.toThrow(
      'PAdES/PKCS#7 envelope failed local sandbox verification',
    );

    const [persisted] = await runAsWorker(() =>
      databaseService.query<{
        batch_status: string;
        attempts: number;
        http_status: number | null;
        event_status: string;
        last_error_code: string | null;
        last_error_message: string | null;
      }>(
        `
        SELECT
          batch.status::text AS batch_status,
          batch.attempts,
          batch.http_status,
          event.status::text AS event_status,
          event.last_error_code,
          event.last_error_message
        FROM esocial.submission_batch batch
        JOIN public.esocial_event event
          ON event.tenant_id = batch.tenant_id
         AND event.id = ANY(batch.event_ids)
        WHERE batch.tenant_id = $1::uuid
          AND batch.batch_id = $2::uuid
        `,
        [tenantId, rejectedBatchId],
      ),
    );

    expect(persisted).toMatchObject({
      batch_status: 'REJECTED',
      attempts: 1,
      http_status: null,
      event_status: 'ERRO_DEFINITIVO',
      last_error_code: 'ESOCIAL_RELAY_SIGNATURE_INVALID',
    });
    expect(persisted?.last_error_message).toContain(
      'PAdES/PKCS#7 envelope failed local sandbox verification',
    );
  });
});

function signS1299() {
  const service = new GovBrSignService(new GovBrSignatureSandboxAdapter());
  return service.signEsocialS1299SoftwareCertificate({
    tenantId,
    signedAt,
    xml: s1299Xml,
  });
}

async function seed(database: DatabaseService): Promise<void> {
  await database.query(
    `
    INSERT INTO public.tenant (id, slug, code, name, status)
    VALUES ($1::uuid, 'r4-97-e2e', 'R497', 'R4-97 eSocial Relay E2E', 'ACTIVE'::public."RecordStatus")
    ON CONFLICT (id) DO NOTHING
    `,
    [tenantId],
  );
  await cleanup(database);
  for (const [eventId, batchId] of [
    [acceptedEventId, acceptedBatchId],
    [rejectedEventId, rejectedBatchId],
  ] as const) {
    await database.query(
      `
      INSERT INTO public.esocial_event (
        id,
        tenant_id,
        event_type,
        event_kind,
        reference,
        competence,
        payload,
        xml_payload,
        xml_hash,
        schema_version,
        status,
        generated_at
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        'S-1299',
        'S-1299'::esocial.s1xxx_event_kind,
        $1,
        '2026-04',
        '{}'::jsonb,
        $3,
        repeat('d', 64),
        'S-1.3',
        'ENVIANDO'::public."ESocialEventStatus",
        now()
      )
      `,
      [eventId, tenantId, s1299Xml],
    );
    await database.query(
      `
      INSERT INTO esocial.submission_batch (
        tenant_id,
        batch_id,
        environment,
        endpoint_url,
        event_ids,
        status
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        'QUALIFICATION'::esocial.submission_environment,
        $3,
        ARRAY[$4::uuid],
        'PENDING'::esocial.submission_batch_status
      )
      `,
      [tenantId, batchId, endpointUrl, eventId],
    );
  }
}

async function cleanup(database: DatabaseService): Promise<void> {
  await database.query(
    `
    DELETE FROM esocial.submission_batch
    WHERE tenant_id = $1::uuid
      AND batch_id = ANY($2::uuid[])
    `,
    [tenantId, [acceptedBatchId, rejectedBatchId]],
  );
  await database.query(
    `
    DELETE FROM public.esocial_event
    WHERE tenant_id = $1::uuid
      AND id = ANY($2::uuid[])
    `,
    [tenantId, [acceptedEventId, rejectedEventId]],
  );
}

function runAsWorker<T>(fn: () => Promise<T>): Promise<T> {
  return RequestContextStore.run(
    {
      tenantId,
      permissions: [
        'esocial.event.read',
        'esocial.event.write',
        'esocial.submission.read',
        'esocial.submission.retry',
      ],
      bypassRls: true,
      bypassRlsReason: 'esocial-worker',
    },
    fn,
  );
}

const s1299Xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtFechaEvPer/v_S_01_03_00">
  <evtFechaEvPer Id="ID1234567890123456789012345678901234">
    <ideEvento>
      <indApuracao>1</indApuracao>
      <perApur>2026-04</perApur>
      <tpAmb>2</tpAmb>
      <procEmi>1</procEmi>
      <verProc>SGP-R4-97</verProc>
    </ideEvento>
    <ideEmpregador>
      <tpInsc>1</tpInsc>
      <nrInsc>12345678</nrInsc>
    </ideEmpregador>
    <infoFech>
      <evtRemun>S</evtRemun>
      <evtPgtos>S</evtPgtos>
      <evtComProd>N</evtComProd>
      <evtContratAvNP>N</evtContratAvNP>
      <evtInfoComplPer>N</evtInfoComplPer>
      <indExcApur1250>S</indExcApur1250>
      <transDCTFWeb>S</transDCTFWeb>
      <naoValid>N</naoValid>
    </infoFech>
  </evtFechaEvPer>
</eSocial>`;
