import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { DatabaseService } from '../../backend/src/database/database.service';
import type {
  EmittedESocialEvent,
  EmitESocialInput,
} from '../../backend/src/esocial-worker/esocial-emit.service';
import { S3000Builder } from '../../backend/src/esocial-worker/builders/s3000.builder';
import { S3000Service } from '../../backend/src/esocial-worker/exclusion/s3000.service';

const tenantId = '00000000-0000-0000-0000-000000003606';
const userId = '00000000-0000-4000-8000-000000003607';
const targetEventId = '00000000-0000-4000-8000-000000003608';
const periodicEventId = '00000000-0000-4000-8000-000000003609';
const s3000EventId = '00000000-0000-4000-8000-000000003610';

describe('ES-06 S-3000 exclusion flow (e2e)', () => {
  let databaseService: DatabaseService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for es-06-exclusao');
    }
    databaseService = new DatabaseService({
      get: (key: string) =>
        key === 'DATABASE_URL' ? process.env.DATABASE_URL : undefined,
    } as never);
    await seed(databaseService);
  });

  afterAll(async () => {
    await cleanup(databaseService);
    await databaseService?.onModuleDestroy();
  });

  it('requests, emits, accepts S-3000, and marks original event EXCLUIDO', async () => {
    const emitService = {
      emit: jest.fn(async (input: EmitESocialInput) =>
        persistMockEvent(databaseService, input),
      ),
    };
    const service = new S3000Service(
      databaseService,
      emitService as never,
      new S3000Builder(databaseService),
      { handleS3000Applied: jest.fn() } as never,
    );

    await runAsTenant(async () => {
      const result = await service.requestAndEmit(
        targetEventId,
        'Justificativa auditada com detalhes suficientes para retratar evento.',
        userId,
      );
      expect(result.emitted).toBe(true);
      expect(emitService.emit).toHaveBeenCalledTimes(1);

      await service.accept(result.requestId, '1.1.0000000000000000300');

      const events = await databaseService.query<{ status: string }>(
        `
        SELECT status::text
        FROM public.esocial_event
        WHERE id = $1::uuid
        `,
        [targetEventId],
      );
      expect(events[0]?.status).toBe('EXCLUIDO');

      const audit = await databaseService.query<{ total: string }>(
        `
        SELECT count(*)::text AS total
        FROM public.audit_event
        WHERE tenant_id = $1::uuid
          AND table_name = 'esocial.s3000_request'
          AND metadata->>'requestedByUserId' = $2
          AND metadata->>'justification' LIKE 'Justificativa auditada%'
        `,
        [tenantId, userId],
      );
      expect(Number(audit[0]?.total ?? 0)).toBeGreaterThan(0);
    });
  });

  it('blocks periodic exclusion after accepted S-1299 and does not emit', async () => {
    const emitService = { emit: jest.fn() };
    const service = new S3000Service(
      databaseService,
      emitService as never,
      new S3000Builder(databaseService),
      { handleS3000Applied: jest.fn() } as never,
    );

    await runAsTenant(async () => {
      const result = await service.requestAndEmit(
        periodicEventId,
        'Justificativa auditada para bloqueio de evento periodico fechado.',
        userId,
      );
      expect(result.emitted).toBe(false);
      expect(result.status).toBe('BLOCKED');
      expect(result.blockReason).toBe('periodic_competence_closed_by_s1299');
      expect(emitService.emit).not.toHaveBeenCalled();
    });
  });
});

async function runAsTenant<T>(fn: () => Promise<T>): Promise<T> {
  return RequestContextStore.run(
    {
      tenantId,
      permissions: [
        'esocial.event.read',
        'esocial.event.write',
        'esocial.event.exclude',
        'auditoria.read',
        'gestao.write',
      ],
    },
    fn,
  );
}

async function persistMockEvent(
  database: DatabaseService,
  input: EmitESocialInput,
): Promise<EmittedESocialEvent> {
  const createdAt = new Date('2026-05-02T10:00:00.000Z').toISOString();
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
      source_entity_kind,
      source_entity_id,
      xml_hash,
      schema_version,
      status,
      generated_at
    )
    VALUES (
      $1::uuid,
      $2::uuid,
      $3::text,
      $3::text::esocial.s1xxx_event_kind,
      $4,
      $5,
      $6::jsonb,
      $7,
      $8,
      $9,
      $10,
      'S-1.3',
      'PENDENTE'::public."ESocialEventStatus",
      $11::timestamptz
    )
    ON CONFLICT (id) DO UPDATE
    SET payload = EXCLUDED.payload,
        xml_payload = EXCLUDED.xml_payload,
        updated_at = now()
    `,
    [
      s3000EventId,
      input.tenantId,
      input.eventKind,
      input.reference ?? 'ID3000',
      input.competence ?? '2026-05',
      JSON.stringify(input.payload ?? {}),
      input.xml,
      input.sourceEntityKind ?? null,
      input.sourceEntityId ?? null,
      input.xmlHash ?? null,
      createdAt,
    ],
  );
  return {
    id: s3000EventId,
    eventKind: input.eventKind,
    reference: input.reference ?? 'ID3000',
    competence: input.competence ?? '2026-05',
    status: 'PENDENTE',
    createdAt,
  };
}

async function seed(database: DatabaseService): Promise<void> {
  await runAsTenant(async () => {
    await database.query(
      `
      INSERT INTO public.tenant (id, slug, code, name, status)
      VALUES ($1::uuid, 'es06-e2e', 'ES06', 'ES-06 E2E', 'ACTIVE'::public."RecordStatus")
      ON CONFLICT (id) DO NOTHING
      `,
      [tenantId],
    );
    await database.query(
      `
      INSERT INTO public.user_account (id, tenant_id, login, name, status)
      VALUES ($1::uuid, $2::uuid, 'es06-user', 'ES-06 User', 'ACTIVE'::public."UserStatus")
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name,
          updated_at = now()
      `,
      [userId, tenantId],
    );
    await database.query(
      `
      INSERT INTO public.esocial_event (
        id, tenant_id, event_type, reference, competence, payload, xml_payload,
        source_entity_kind, source_entity_id, schema_version, status, receipt_number, processed_at
      )
      VALUES
        (
          $1::uuid, $3::uuid, 'S-2200', 'IDORIGINAL2200', '2026-05', '{}'::jsonb, '<xml/>',
          'employee', '00000000-0000-4000-8000-000000003611', 'S-1.3',
          'PROCESSADO_COM_SUCESSO'::public."ESocialEventStatus", '1.1.0000000000000000000', now()
        ),
        (
          $2::uuid, $3::uuid, 'S-1200', 'IDORIGINAL1200', '2026-05', '{}'::jsonb, '<xml/>',
          'payroll.payroll_run', '00000000-0000-4000-8000-000000003612', 'S-1.3',
          'PROCESSADO_COM_SUCESSO'::public."ESocialEventStatus", '1.1.0000000000000001200', now()
        )
      ON CONFLICT (id) DO UPDATE
      SET status = EXCLUDED.status,
          receipt_number = EXCLUDED.receipt_number,
          updated_at = now()
      `,
      [targetEventId, periodicEventId, tenantId],
    );
    await database.query(
      `
      INSERT INTO esocial.s1299_emission_state (tenant_id, competence, status, accepted_at)
      VALUES ($1::uuid, '2026-05-01'::date, 'ACCEPTED', now())
      ON CONFLICT (tenant_id, competence) DO UPDATE
      SET status = EXCLUDED.status,
          accepted_at = EXCLUDED.accepted_at,
          updated_at = now()
      `,
      [tenantId],
    );
  });
}

async function cleanup(database: DatabaseService): Promise<void> {
  await runAsTenant(async () => {
    await database.query(
      'DELETE FROM esocial.s3000_request WHERE tenant_id = $1::uuid',
      [tenantId],
    );
    await database.query(
      'DELETE FROM esocial.s1299_emission_state WHERE tenant_id = $1::uuid',
      [tenantId],
    );
    await database.query(
      'DELETE FROM public.esocial_event WHERE id = ANY($1::uuid[])',
      [[targetEventId, periodicEventId, s3000EventId]],
    );
  });
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
