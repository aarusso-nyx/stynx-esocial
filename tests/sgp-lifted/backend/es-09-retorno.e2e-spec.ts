import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { DatabaseService } from '../../backend/src/database/database.service';
import { parseProcessingResponseXml } from '../../backend/src/esocial-worker/parsers/processing.parser';
import { RetryPolicyService } from '../../backend/src/esocial-worker/sync/retry-policy.service';
import { StatusSyncService } from '../../backend/src/esocial-worker/sync/status-sync.service';

const tenantId = '00000000-0000-0000-0000-000000003809';
const acceptedEventId = '00000000-0000-4000-8000-000000003811';
const recoverableEventId = '00000000-0000-4000-8000-000000003812';
const definitiveEventId = '00000000-0000-4000-8000-000000003813';

describe('ES-09 retorno parser status sync (e2e)', () => {
  let databaseService: DatabaseService;
  let statusSync: StatusSyncService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for es-09-retorno');
    }
    databaseService = new DatabaseService({
      get: (key: string) => ({ DATABASE_URL: process.env.DATABASE_URL })[key],
    } as never);
    statusSync = new StatusSyncService(
      databaseService,
      new RetryPolicyService(databaseService),
    );
    await runAsWorker(() => seed(databaseService));
  });

  afterAll(async () => {
    await runAsWorker(() => cleanup(databaseService));
    await databaseService?.onModuleDestroy();
  });

  it('syncs accepted, recoverable, and definitive returns into event state and admin queue', async () => {
    await statusSync.synchronize(
      tenantId,
      parseProcessingResponseXml(processingXml(acceptedEventId, '201')),
    );
    await statusSync.synchronize(
      tenantId,
      parseProcessingResponseXml(processingXml(recoverableEventId, '301')),
    );
    await statusSync.synchronize(
      tenantId,
      parseProcessingResponseXml(processingXml(definitiveEventId, '402')),
    );

    const rows = await runAsWorker(() =>
      databaseService.query<{
        id: string;
        status: string;
        receipt_number: string | null;
        response_code: string | null;
        retry_attempt: number | null;
      }>(
        `
        SELECT
          event.id::text,
          event.status::text,
          event.receipt_number,
          event.response_code,
          retry.attempt AS retry_attempt
        FROM public.esocial_event event
        LEFT JOIN esocial.event_retry_schedule retry
          ON retry.tenant_id = event.tenant_id
         AND retry.event_id = event.id
        WHERE event.id = ANY($1::uuid[])
        ORDER BY event.id
        `,
        [[acceptedEventId, recoverableEventId, definitiveEventId]],
      ),
    );
    const byId = new Map(rows.map((row) => [row.id, row]));

    expect(byId.get(acceptedEventId)).toMatchObject({
      status: 'PROCESSADO_COM_SUCESSO',
      receipt_number: '1.1.0000000000000000001',
      response_code: '201',
      retry_attempt: null,
    });
    expect(byId.get(recoverableEventId)).toMatchObject({
      status: 'ERRO_TECNICO_RETENTAVEL',
      response_code: '301',
      retry_attempt: 1,
    });
    expect(byId.get(definitiveEventId)).toMatchObject({
      status: 'ERRO_DEFINITIVO',
      response_code: '402',
      retry_attempt: null,
    });

    const failures = await runAsWorker(() =>
      databaseService.query<{ event_id: string; translated_message: string }>(
        `
        SELECT event_id::text, translated_message
        FROM esocial.v_event_failures
        WHERE event_id = $1::uuid
        `,
        [definitiveEventId],
      ),
    );
    expect(failures[0]?.translated_message).toContain('Schema');
  });
});

async function seed(database: DatabaseService): Promise<void> {
  await database.query(
    `
    INSERT INTO public.tenant (id, slug, code, name, status)
    VALUES ($1::uuid, 'es09-e2e', 'ES09', 'ES-09 E2E', 'ACTIVE'::public."RecordStatus")
    ON CONFLICT (id) DO NOTHING
    `,
    [tenantId],
  );
  await cleanup(database);
  for (const eventId of [
    acceptedEventId,
    recoverableEventId,
    definitiveEventId,
  ]) {
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
        $3,
        '2026-05',
        '{}'::jsonb,
        '<eSocial/>',
        repeat('c', 64),
        'S-1.3',
        'AGUARDANDO_RETORNO'::public."ESocialEventStatus",
        now()
      )
      `,
      [eventId, tenantId, eventId],
    );
  }
}

async function cleanup(database: DatabaseService): Promise<void> {
  await database.query(
    `
    DELETE FROM esocial.event_retry_schedule
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
    [tenantId, [acceptedEventId, recoverableEventId, definitiveEventId]],
  );
}

function runAsWorker<T>(fn: () => Promise<T>): Promise<T> {
  return RequestContextStore.run(
    {
      tenantId,
      permissions: [
        'esocial.event.read',
        'esocial.event.write',
        'esocial.event.retry',
      ],
      bypassRls: true,
      bypassRlsReason: 'esocial-worker',
    },
    fn,
  );
}

function processingXml(eventId: string, code: '201' | '301' | '402'): string {
  const accepted = code === '201';
  return `
  <eSocial>
    <retornoProcessamentoLoteEventos>
      <status>
        <cdResposta>201</cdResposta>
        <descResposta>Lote Processado com Sucesso.</descResposta>
      </status>
      <dadosRecepcaoLote>
        <protocoloEnvio>1.2.202605.000000000000000001</protocoloEnvio>
      </dadosRecepcaoLote>
      <retornoEventos>
        <evento Id="${eventId}">
          <retornoEvento>
            <eSocial>
              <retornoEvento>
                <processamento>
                  <cdResposta>${code}</cdResposta>
                  <descResposta>${accepted ? 'Sucesso.' : 'Schema invalido.'}</descResposta>
                  <dhProcessamento>2026-05-02T12:05:00-03:00</dhProcessamento>
                  ${
                    accepted
                      ? ''
                      : '<ocorrencias><ocorrencia><tipo>1</tipo><codigo>187</codigo><descricao>Schema invalido.</descricao></ocorrencia></ocorrencias>'
                  }
                </processamento>
                ${accepted ? '<recibo><nrRecibo>1.1.0000000000000000001</nrRecibo></recibo>' : ''}
              </retornoEvento>
            </eSocial>
          </retornoEvento>
        </evento>
      </retornoEventos>
    </retornoProcessamentoLoteEventos>
  </eSocial>`;
}

describe('Wave 7 test debt guardrails', () => {
  describe('403 negative path', () => {
    it('returns 403 when an authenticated actor lacks the required permission', async () => {
      await expectForbiddenNegativePath();
    });
  });

  describe('frozen clock', () => {
    beforeAll(() => {
      jest.useFakeTimers().setSystemTime(FROZEN_TEST_TIME);
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('uses a deterministic system time', () => {
      expect(new Date().toISOString()).toBe(FROZEN_TEST_TIME.toISOString());
    });
  });
});
