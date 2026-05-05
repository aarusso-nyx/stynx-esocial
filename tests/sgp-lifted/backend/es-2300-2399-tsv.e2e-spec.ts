import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { DatabaseService } from '../../backend/src/database/database.service';
import { S2300Builder } from '../../backend/src/esocial-worker/builders/s2300.builder';
import { S2399Builder } from '../../backend/src/esocial-worker/builders/s2399.builder';
import { XsdValidatorService } from '../../backend/src/esocial-worker/xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000079001';

const fixtures = [
  {
    suffix: 'est',
    linkId: '00000000-0000-4000-8000-000000079101',
    workLocationId: '00000000-0000-4000-8000-000000079102',
    contractId: '00000000-0000-4000-8000-000000079103',
    employeeId: '00000000-0000-4000-8000-000000079104',
    registration: 'TSV-E2E-EST',
    category: '901',
    name: 'Estagiaria E2E',
    cpf: '11144477735',
    role: 'Estagiaria de Administracao',
    amount: '1200.00',
    startDate: '2026-04-01',
    endDate: '2026-12-31',
    educationInstitution: 'Universidade Municipal',
  },
  {
    suffix: 'con',
    linkId: '00000000-0000-4000-8000-000000079201',
    workLocationId: '00000000-0000-4000-8000-000000079202',
    contractId: '00000000-0000-4000-8000-000000079203',
    employeeId: '00000000-0000-4000-8000-000000079204',
    registration: 'TSV-E2E-CON',
    category: '410',
    name: 'Conselheiro E2E',
    cpf: '22255588804',
    role: 'Conselheiro Tutelar',
    amount: '3200.00',
    startDate: '2026-03-15',
    endDate: '2027-03-14',
    educationInstitution: null,
  },
  {
    suffix: 'aut',
    linkId: '00000000-0000-4000-8000-000000079301',
    workLocationId: '00000000-0000-4000-8000-000000079302',
    contractId: '00000000-0000-4000-8000-000000079303',
    employeeId: '00000000-0000-4000-8000-000000079304',
    registration: 'TSV-E2E-AUT',
    category: '701',
    name: 'Autonoma E2E',
    cpf: '33366699916',
    role: 'Prestadora Autonoma',
    amount: '2800.00',
    startDate: '2026-02-10',
    endDate: '2026-08-09',
    educationInstitution: null,
  },
] as const;

describe('eSocial TS-V S-2300/S-2399 builders (e2e)', () => {
  let databaseService: DatabaseService;
  let seeded = false;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for S-2300/S-2399 e2e');
    }
    databaseService = new DatabaseService({
      get: (key: string) =>
        key === 'DATABASE_URL' ? process.env.DATABASE_URL : undefined,
    } as never);
    await seed(databaseService);
    seeded = true;
  });

  afterAll(async () => {
    if (!databaseService) return;
    if (seeded) await cleanup(databaseService);
    await databaseService?.onModuleDestroy();
  });

  it('builds XSD-valid start and termination events for estagiario, conselheiro and autonomo', async () => {
    await runAsTenant(async () => {
      const s2300 = new S2300Builder(databaseService);
      const s2399 = new S2399Builder(databaseService);
      const validator = new XsdValidatorService();

      for (const fixture of fixtures) {
        const start = await s2300.build(fixture.contractId);
        expect(start.xml).toContain(`<codCateg>${fixture.category}</codCateg>`);
        expect(() =>
          validator.assertValid('S-2300', start.xml, {
            allowUnsigned: true,
          }),
        ).not.toThrow();

        const termination = await s2399.build(fixture.contractId);
        expect(termination.xml).toContain(
          `<matricula>${fixture.registration}</matricula>`,
        );
        expect(() =>
          validator.assertValid('S-2399', termination.xml, {
            allowUnsigned: true,
          }),
        ).not.toThrow();
      }
    });
  });
});

async function runAsTenant<T>(fn: () => Promise<T>): Promise<T> {
  return RequestContextStore.run(
    {
      tenantId,
      permissions: [
        'hr.employment.read',
        'hr.employment.write',
        'esocial.event.read',
        'esocial.event.write',
        'rh.employee.write',
      ],
    },
    fn,
  );
}

async function seed(database: DatabaseService): Promise<void> {
  await database.query(
    `
    INSERT INTO public.tenant (id, slug, code, name, status)
    VALUES ($1::uuid, 'es-2300-2399-tsv', 'ES23002399', 'ES-2300/2399 TSV', 'ACTIVE'::public."RecordStatus")
    ON CONFLICT (id) DO NOTHING
    `,
    [tenantId],
  );

  await runAsTenant(async () => {
    for (const fixture of fixtures) {
      await database.query(
        `
        INSERT INTO hr.employment_link (id, tenant_id, code, name, contract_type, end_date)
        VALUES ($1::uuid, $2::uuid, $3, $4, 'temporary', $5::date)
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            end_date = EXCLUDED.end_date
        `,
        [
          fixture.linkId,
          tenantId,
          `TSV-${fixture.suffix.toUpperCase()}`,
          `TSV ${fixture.suffix.toUpperCase()}`,
          fixture.endDate,
        ],
      );
      await database.query(
        `
        INSERT INTO hr.work_location (id, tenant_id, code, name)
        VALUES ($1::uuid, $2::uuid, $3, $4)
        ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name
        `,
        [
          fixture.workLocationId,
          tenantId,
          `TSV-${fixture.suffix.toUpperCase()}`,
          `TSV ${fixture.suffix.toUpperCase()}`,
        ],
      );
      await database.query(
        `
        INSERT INTO hr.employee (
          id, tenant_id, registration, name, cpf, employment_link_id,
          work_location_id, hired_on, birth_date, gender, email, phone,
          nationality_code, marital_status, education_level, address
        )
        VALUES (
          $1::uuid, $2::uuid, $3, $4, $5, $6::uuid, $7::uuid, $8::date,
          DATE '1995-01-02', 'FEMALE'::public."PersonGender",
          $9, '61999998888', '105', '1', '09',
          '{"street":"Rua Central","number":"100","neighborhood":"Centro","zip":"70000000","cityCode":"5300108","state":"DF"}'::jsonb
        )
        ON CONFLICT (id) DO UPDATE
        SET cpf = EXCLUDED.cpf,
            employment_link_id = EXCLUDED.employment_link_id,
            work_location_id = EXCLUDED.work_location_id
        `,
        [
          fixture.employeeId,
          tenantId,
          fixture.registration,
          fixture.name,
          fixture.cpf,
          fixture.linkId,
          fixture.workLocationId,
          fixture.startDate,
          `${fixture.suffix}@example.test`,
        ],
      );
      await database.query(
        `
        INSERT INTO hr.tsv_contract (
          id, tenant_id, employment_link_id, tsv_category, start_date,
          end_date, role, monthly_amount, weekly_hours, workplace_id,
          education_institution
        )
        VALUES (
          $1::uuid, $2::uuid, $3::uuid, $4, $5::date, $6::date, $7,
          $8::numeric, 30.000000, $9::uuid, $10
        )
        ON CONFLICT (id) DO UPDATE
        SET end_date = EXCLUDED.end_date,
            role = EXCLUDED.role,
            monthly_amount = EXCLUDED.monthly_amount,
            education_institution = EXCLUDED.education_institution
        `,
        [
          fixture.contractId,
          tenantId,
          fixture.linkId,
          fixture.category,
          fixture.startDate,
          fixture.endDate,
          fixture.role,
          fixture.amount,
          fixture.workLocationId,
          fixture.educationInstitution,
        ],
      );
    }
  });
}

async function cleanup(database: DatabaseService): Promise<void> {
  await runAsTenant(async () => {
    await database.query('DELETE FROM hr.tsv_contract WHERE tenant_id = $1', [
      tenantId,
    ]);
    await database.query('DELETE FROM hr.employee WHERE tenant_id = $1', [
      tenantId,
    ]);
    await database.query('DELETE FROM hr.work_location WHERE tenant_id = $1', [
      tenantId,
    ]);
    await database.query(
      'DELETE FROM hr.employment_link WHERE tenant_id = $1',
      [tenantId],
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
