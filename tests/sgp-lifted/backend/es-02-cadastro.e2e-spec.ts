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
import { S2200Builder } from '../../backend/src/esocial-worker/builders/s2200.builder';
import { S2205Builder } from '../../backend/src/esocial-worker/builders/s2205.builder';
import { S22xxDispatchService } from '../../backend/src/esocial-worker/builders/s22xx-common';
import { XsdValidatorService } from '../../backend/src/esocial-worker/xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000003202';
const employeeId = '00000000-0000-4000-8000-000000003202';
const dependentId = '00000000-0000-4000-8000-000000003203';
const s2200EventId = '00000000-0000-4000-8000-000000003220';
const s2205EventId = '00000000-0000-4000-8000-000000003225';

describe('ES-02 S-2200/S-2205 cadastro flow (e2e)', () => {
  let databaseService: DatabaseService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for es-02-cadastro');
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

  it('queues whitelisted changes, ignores non-whitelisted changes, emits XSD-valid S-2205, and blocks unchanged S-2200 reemission', async () => {
    const validator = new XsdValidatorService();
    const emitService = {
      emit: jest.fn(async (input: EmitESocialInput) =>
        persistMockEvent(databaseService, input),
      ),
    };
    const dispatch = new S22xxDispatchService(
      databaseService,
      emitService as never,
    );
    const s2200 = new S2200Builder(databaseService);
    const s2205 = new S2205Builder(databaseService);

    await runAsTenant(async () => {
      await databaseService.query(
        `
        UPDATE hr.employee
        SET address = jsonb_set(address, '{street}', '"Rua Nova"', true)
        WHERE id = $1::uuid
        `,
        [employeeId],
      );
      await databaseService.query(
        `
        UPDATE hr.employee
        SET mother_name = 'Campo fora da whitelist'
        WHERE id = $1::uuid
        `,
        [employeeId],
      );
      await databaseService.query(
        `
        INSERT INTO hr.employee_dependent (
          id, tenant_id, employee_id, name, cpf, birth_date, relationship, income_tax_dependent
        )
        VALUES (
          $1::uuid, $2::uuid, $3::uuid, 'Dependente ES02', '44455566677', DATE '2019-03-04', 'filho', true
        )
        ON CONFLICT (id) DO NOTHING
        `,
        [dependentId, tenantId, employeeId],
      );

      const pending = await databaseService.query<{ field_path: string }>(
        `
        SELECT field_path
        FROM esocial.s2205_pending_alteration
        WHERE tenant_id = $1::uuid
          AND employee_id = $2::uuid
          AND status = 'PENDING'
        ORDER BY field_path
        `,
        [tenantId, employeeId],
      );
      expect(pending.map((row) => row.field_path)).toEqual([
        'address.street',
        'dependent.*',
      ]);

      const s2205Build = await s2205.buildPending(tenantId, employeeId);
      expect(() =>
        validator.assertValid('S-2205', s2205Build.record.xml, {
          allowUnsigned: true,
        }),
      ).not.toThrow();
      const s2205Result = await dispatch.emitS2205(
        s2205Build.record,
        s2205Build.pendingIds,
      );
      expect(s2205Result.emitted).toBe(true);

      const s2200Record = await s2200.build(tenantId, employeeId);
      expect(() =>
        validator.assertValid('S-2200', s2200Record.xml, {
          allowUnsigned: true,
        }),
      ).not.toThrow();
      await dispatch.emitS2200(s2200Record);
      await expect(
        dispatch.emitS2200(s2200Record, { force: true }),
      ).rejects.toThrow('payload_hash did not change');
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
        'rh.employee.read',
        'rh.employee.write',
        'rh.employee.admit',
        'rh.dependent.write',
      ],
    },
    fn,
  );
}

async function cleanup(database: DatabaseService): Promise<void> {
  await runAsTenant(async () => {
    await database.query(
      'DELETE FROM hr.employee_dependent WHERE id = $1::uuid',
      [dependentId],
    );
    await database.query('DELETE FROM hr.employee WHERE id = $1::uuid', [
      employeeId,
    ]);
    await database.query(
      'DELETE FROM public.esocial_event WHERE id = ANY($1::uuid[])',
      [[s2200EventId, s2205EventId]],
    );
  });
}

async function persistMockEvent(
  database: DatabaseService,
  input: EmitESocialInput,
): Promise<EmittedESocialEvent> {
  const eventKind = input.eventKind.trim().toUpperCase();
  const id = eventKind === 'S-2200' ? s2200EventId : s2205EventId;
  const reference = input.reference ?? 'ref';
  const competence = input.competence ?? '2026-01';
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
      'PENDENTE'::"ESocialEventStatus",
      $11::timestamptz
    )
    ON CONFLICT (id) DO UPDATE
    SET reference = EXCLUDED.reference,
        competence = EXCLUDED.competence,
        payload = EXCLUDED.payload,
        xml_payload = EXCLUDED.xml_payload,
        source_entity_kind = EXCLUDED.source_entity_kind,
        source_entity_id = EXCLUDED.source_entity_id,
        xml_hash = EXCLUDED.xml_hash,
        generated_at = EXCLUDED.generated_at,
        updated_at = now()
    `,
    [
      id,
      input.tenantId,
      eventKind,
      reference,
      competence,
      JSON.stringify(input.payload ?? {}),
      input.xml,
      input.sourceEntityKind ?? null,
      input.sourceEntityId ?? null,
      input.xmlHash ?? null,
      createdAt,
    ],
  );

  return {
    id,
    eventKind,
    reference,
    competence,
    status: 'PENDENTE',
    createdAt,
  };
}

async function seed(database: DatabaseService): Promise<void> {
  await runAsTenant(async () => {
    await database.query(
      `
    INSERT INTO public.tenant (id, slug, code, name, status)
    VALUES ($1::uuid, 'es02-e2e', 'ES02', 'ES-02 E2E', 'ACTIVE'::"RecordStatus")
    ON CONFLICT (id) DO NOTHING
    `,
      [tenantId],
    );
    await database.query(
      `
    INSERT INTO hr.employee (
      id,
      tenant_id,
      registration,
      name,
      cpf,
      birth_date,
      gender,
      email,
      phone,
      address,
      hired_on,
      marital_status,
      education_level,
      lifecycle_status
    )
    VALUES (
      $1::uuid,
      $2::uuid,
      'ES02-001',
      'Servidor ES02',
      '11122233344',
      DATE '1990-01-02',
      'MALE'::"PersonGender",
      'es02@example.test',
      '61988887777',
      '{"street":"Rua Original","number":"10","zip":"70000000","cityCode":"5300108","state":"DF"}'::jsonb,
      DATE '2026-01-10',
      '1',
      '07',
      'ACTIVE'::"EmployeeLifecycleStatus"
    )
    ON CONFLICT (id) DO UPDATE
    SET address = EXCLUDED.address,
        mother_name = NULL,
        updated_at = now()
    `,
      [employeeId, tenantId],
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
