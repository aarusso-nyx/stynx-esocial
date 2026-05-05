import {
  adapterQueueTopics,
  InMemoryQueueTransport,
} from '../../backend/src/common/adapters';
import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { DatabaseService } from '../../backend/src/database/database.service';
import { EsocialQueueAdapter } from '../../backend/src/esocial-worker/adapters/queue-adapter';
import { BatchBuilderService } from '../../backend/src/esocial-worker/submission/batch-builder.service';
import { CircuitBreakerService } from '../../backend/src/esocial-worker/submission/circuit-breaker.service';
import { RetryStrategyService } from '../../backend/src/esocial-worker/submission/retry-strategy.service';
import { SubmissionService } from '../../backend/src/esocial-worker/submission/submission.service';
import { EsocialRelayMockResponder } from '../../backend/src/external/mocks/esocial-relay';

const tenantId = '00000000-0000-0000-0000-000000049000';
const s1299EventId = '00000000-0000-4000-8000-000000049001';
const s1000EventId = '00000000-0000-4000-8000-000000049003';
const endpointUrl = 'mock://esocial-relay/r4-90-qualificacao';
const queueTopics = adapterQueueTopics('esocial');

jest.setTimeout(30_000);

describe('R4-90 eSocial submission via R4-97 queue adapter (e2e)', () => {
  let databaseService: DatabaseService;
  let relay: EsocialRelayMockResponder;
  let queueAdapter: EsocialQueueAdapter;
  let submissionService: SubmissionService;
  let transport: InMemoryQueueTransport;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL is required for esocial-submission-via-queue',
      );
    }
    const config = {
      get: (key: string) =>
        ({
          DATABASE_URL: process.env.DATABASE_URL,
          ESOCIAL_ENV: 'QUALIFICATION',
          ESOCIAL_ENDPOINT_ENVIO: endpointUrl,
          ESOCIAL_CIRCUIT_FAILURE_THRESHOLD: '3',
          ESOCIAL_CIRCUIT_COOLDOWN_MS: '60000',
        })[key],
    };
    databaseService = new DatabaseService(config as never);
    transport = new InMemoryQueueTransport();
    relay = new EsocialRelayMockResponder({ transport });
    queueAdapter = new EsocialQueueAdapter({
      databaseService,
      transport,
      responseTimeoutMs: 2_000,
      retryDelayMs: () => 0,
    });
    submissionService = new SubmissionService(
      databaseService,
      {} as never,
      new BatchBuilderService(databaseService, config as never),
      {} as never,
      new RetryStrategyService(),
      new CircuitBreakerService(databaseService, config as never),
      queueAdapter,
    );
    await runAsWorker(() => seed(databaseService));
  });

  afterAll(async () => {
    await runAsWorker(() => cleanup(databaseService));
    queueAdapter?.close();
    relay?.close();
    await databaseService?.onModuleDestroy();
  });

  it('submits the R4-97-supported S-1299 class through the queue and persists receipt state', async () => {
    const result = await submissionService.submitPendingBatch(50);

    expect(result).toMatchObject({
      tenantId,
      eventCount: 1,
      status: 'ACCEPTED',
      attempts: 1,
      endpointUrl,
    });
    expect(transport.history(queueTopics.request)).toHaveLength(1);

    const [persisted] = await runAsWorker(() =>
      databaseService.query<{
        batch_status: string;
        attempts: number;
        event_status: string;
        protocol_number: string | null;
        receipt_number: string | null;
        response_code: string | null;
      }>(
        `
        SELECT
          batch.status::text AS batch_status,
          batch.attempts,
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
        [tenantId, result!.batchId],
      ),
    );

    expect(persisted).toMatchObject({
      batch_status: 'ACCEPTED',
      attempts: 1,
      event_status: 'PROCESSADO_COM_SUCESSO',
      response_code: '201',
    });
    expect(persisted?.protocol_number).toMatch(/^1\.1\.202605\.\d{15}$/);
    expect(persisted?.receipt_number).toMatch(/^1\.1\.\d{19}$/);
  });

  it('blocks unsupported implemented classes instead of falling back to direct SOAP dispatch', async () => {
    await runAsWorker(async () => {
      await cleanup(databaseService);
      await seedS1000(databaseService);
    });

    const result = await submissionService.submitPendingBatch(50);

    expect(result).toMatchObject({
      tenantId,
      eventCount: 1,
      status: 'RETRY',
      attempts: 0,
      endpointUrl,
    });
    expect(transport.history(queueTopics.request)).toHaveLength(1);

    const [persisted] = await runAsWorker(() =>
      databaseService.query<{
        event_status: string;
        last_error_code: string | null;
        last_error_message: string | null;
      }>(
        `
        SELECT
          status::text AS event_status,
          last_error_code,
          last_error_message
        FROM public.esocial_event
        WHERE tenant_id = $1::uuid
          AND id = $2::uuid
        `,
        [tenantId, s1000EventId],
      ),
    );

    expect(persisted).toMatchObject({
      event_status: 'ERRO_TECNICO_RETENTAVEL',
      last_error_code: 'ESOCIAL_QUEUE_EVENT_UNSUPPORTED',
    });
    expect(persisted?.last_error_message).toContain('supports only S-1299');
  });
});

async function seed(database: DatabaseService): Promise<void> {
  await ensureTenant(database);
  await cleanup(database);
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
      repeat('9', 64),
      'S-1.3',
      'PENDENTE'::public."ESocialEventStatus",
      now()
    )
    `,
    [s1299EventId, tenantId, s1299Xml],
  );
}

async function seedS1000(database: DatabaseService): Promise<void> {
  await ensureTenant(database);
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
      'S-1000',
      'S-1000'::esocial.s1xxx_event_kind,
      $1,
      '2026-01',
      '{}'::jsonb,
      $3,
      repeat('1', 64),
      'S-1.3',
      'PENDENTE'::public."ESocialEventStatus",
      now()
    )
    `,
    [s1000EventId, tenantId, s1000Xml],
  );
}

async function ensureTenant(database: DatabaseService): Promise<void> {
  await database.query(
    `
    INSERT INTO public.tenant (id, slug, code, name, status)
    VALUES ($1::uuid, 'r4-90-e2e', 'R490', 'R4-90 eSocial Queue E2E', 'ACTIVE'::public."RecordStatus")
    ON CONFLICT (id) DO NOTHING
    `,
    [tenantId],
  );
}

async function cleanup(database: DatabaseService): Promise<void> {
  await database.query(
    `
    DELETE FROM esocial.submission_batch
    WHERE tenant_id = $1::uuid
    `,
    [tenantId],
  );
  await database.query(
    `
    DELETE FROM public.esocial_event
    WHERE tenant_id = $1::uuid
      AND id = ANY($2::uuid[])
    `,
    [tenantId, [s1299EventId, s1000EventId]],
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
      <verProc>SGP-R4-90</verProc>
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

const s1000Xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtInfoEmpregador/v_S_01_03_00">
  <evtInfoEmpregador Id="ID1234567890123456789012345678901234">
    <ideEvento>
      <tpAmb>2</tpAmb>
      <procEmi>1</procEmi>
      <verProc>SGP-R4-90</verProc>
    </ideEvento>
    <ideEmpregador>
      <tpInsc>1</tpInsc>
      <nrInsc>12345678</nrInsc>
    </ideEmpregador>
    <infoEmpregador>
      <exclusao>
        <idePeriodo>
          <iniValid>2026-01</iniValid>
        </idePeriodo>
      </exclusao>
    </infoEmpregador>
  </evtInfoEmpregador>
</eSocial>`;
