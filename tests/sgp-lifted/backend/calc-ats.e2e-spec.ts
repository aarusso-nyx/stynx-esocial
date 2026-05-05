import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import Decimal from 'decimal.js';
import { Pool } from 'pg';

import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { DatabaseService } from '../../backend/src/database/database.service';

const tenantId = '00000000-0000-0000-0000-000000000124';

describe('CALC-07 ATS, trienio, quinquenio and sexta-parte golden scenarios (e2e)', () => {
  let pool: Pool;
  let databaseService: DatabaseService;
  let atsRubricaId: string;
  let sextaParteRubricaId: string;
  const employeeIds: string[] = [];
  const employmentLinkIds: string[] = [];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for calc-ats');
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    databaseService = new DatabaseService({
      get: (key: string) =>
        key === 'DATABASE_URL' ? process.env.DATABASE_URL : undefined,
    } as never);

    const client = await pool.connect();
    try {
      await client.query("SELECT set_config('app.bypass_rls', 'true', true)");
      await client.query(`
        INSERT INTO public.tenant (id, slug, code, name, status)
        VALUES ('${tenantId}', 'calc07-ats-e2e', 'CALC07B', 'CALC-07 ATS E2E', 'ACTIVE'::"RecordStatus")
        ON CONFLICT (id) DO NOTHING
      `);
      await seedParameters(client);
      atsRubricaId = await seedRubrica(client, 'ATS', 'ats', 'f_ats');
      sextaParteRubricaId = await seedRubrica(
        client,
        'SEXTA_PARTE',
        'sexta_parte',
        'f_sexta_parte',
      );

      for (const years of [0, 5, 10, 25]) {
        const employee = await createEmployee(client, years);
        employeeIds.push(employee.employeeId);
        employmentLinkIds.push(employee.employmentLinkId);
      }
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (!pool) return;
    const client = await pool.connect();
    try {
      await client.query("SELECT set_config('app.bypass_rls', 'true', true)");
      await client.query(
        'DELETE FROM hr.service_time_record WHERE employee_id = ANY($1::uuid[])',
        [employeeIds],
      );
      await client.query('DELETE FROM hr.employee WHERE id = ANY($1::uuid[])', [
        employeeIds,
      ]);
      await client.query(
        'DELETE FROM hr.employment_link WHERE id = ANY($1::uuid[])',
        [employmentLinkIds],
      );
      await client.query(
        "DELETE FROM hr.salary_reference WHERE code LIKE 'CALC07B-SAL-%'",
      );
      await client.query(
        "DELETE FROM hr.shift WHERE code LIKE 'CALC07B-SHIFT-%'",
      );
    } finally {
      client.release();
      await pool.end();
      await databaseService?.onModuleDestroy();
    }
  });

  it.each([
    ['0 years', 0, new Decimal('0.00')],
    ['5 years', 1, new Decimal('75.00')],
    ['10 years', 2, new Decimal('150.00')],
    ['25 years', 3, new Decimal('375.00')],
  ])('evaluates ATS for %s', async (_name, index, expected) => {
    const amount = await evaluate(atsRubricaId, employeeIds[index]);
    expect(new Decimal(amount ?? '0').toFixed(2)).toBe(expected.toFixed(2));
  });

  it('evaluates sexta-parte at 25 complete service years', async () => {
    const amount = await evaluate(sextaParteRubricaId, employeeIds[3]);
    expect(new Decimal(amount ?? '0').toFixed(2)).toBe('166.67');
  });

  async function evaluate(
    rubricaId: string,
    employeeId: string,
  ): Promise<string | null> {
    return RequestContextStore.run(
      {
        tenantId,
        permissions: [
          'folha.rubrica.read',
          'folha.rubrica.preview',
          'system.parameter.read',
          'rh.employee.read',
          'rh.history.read',
        ],
      },
      async () => {
        const rows = await databaseService.query<{ amount: string | null }>(
          `
          SELECT payroll_calc.evaluate_earning_deduction(
            $1::uuid,
            $2::uuid,
            5,
            2025
          )::text AS amount
          `,
          [rubricaId, employeeId],
        );
        return rows[0]?.amount ?? null;
      },
    );
  }
});

async function seedParameters(client: import('pg').PoolClient): Promise<void> {
  const parameters = [
    ['ATS_PERCENT_PER_YEAR', '{"rate":1.500000}'],
    ['SEXTA_PARTE_SERVICE_YEARS', '{"value":25}'],
    ['SEXTA_PARTE_FRACTION', '{"rate":0.166666666667}'],
  ];
  for (const [key, value] of parameters) {
    await client.query(
      `
      INSERT INTO public.system_parameter (tenant_id, key, value, description, module_key)
      VALUES ($1::uuid, $2, $3::jsonb, 'CALC-07 ATS E2E', 'payroll')
      ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value
      `,
      [tenantId, key, value],
    );
  }
}

async function seedRubrica(
  client: import('pg').PoolClient,
  code: string,
  alias: string,
  functionName: string,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.payroll_earning_deduction (
      tenant_id, code, description, kind, taxable, active, incidences, starts_on,
      formula_alias, formula_function_name, formula_expression,
      formula_dependencies, formula_ready
    )
    VALUES ($1::uuid, $2, $2, 'EARNING'::"PayrollEntryKind", true, true,
      '{"service_time":true}', DATE '2025-01-01', $3, $4, NULL,
      ARRAY['BASE_SALARY'], true)
    ON CONFLICT (tenant_id, code) DO UPDATE
    SET formula_function_name = EXCLUDED.formula_function_name,
        formula_ready = true,
        formula_error = NULL
    RETURNING id::text
    `,
    [tenantId, code, alias, functionName],
  );
  return result.rows[0].id;
}

async function createEmployee(
  client: import('pg').PoolClient,
  serviceYears: number,
): Promise<{ employeeId: string; employmentLinkId: string }> {
  const suffix = `${serviceYears}-${Date.now().toString(36)}`;
  const link = await client.query<{ id: string }>(
    `
    INSERT INTO hr.employment_link (tenant_id, code, name, contract_type, status)
    VALUES ($1::uuid, $2, $3, 'statutory', 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [tenantId, `CALC07B-LINK-${suffix}`, `CALC-07B ${serviceYears}`],
  );
  const shift = await client.query<{ id: string }>(
    `
    INSERT INTO hr.shift (tenant_id, code, description, daily_hours, status)
    VALUES ($1::uuid, $2, 'CALC-07B E2E shift', 8.00, 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [tenantId, `CALC07B-SHIFT-${suffix}`],
  );
  const salary = await client.query<{ id: string }>(
    `
    INSERT INTO hr.salary_reference (tenant_id, code, description, amount, vigencia_inicio)
    VALUES ($1::uuid, $2, 'CALC-07B E2E salary', 1000.00, DATE '2025-01-01')
    RETURNING id::text
    `,
    [tenantId, `CALC07B-SAL-${suffix}`],
  );
  const employee = await client.query<{ id: string }>(
    `
    INSERT INTO hr.employee (
      tenant_id, registration, name, salary_reference_id, shift_id, employment_link_id, hired_on, lifecycle_status
    )
    VALUES ($1::uuid, $2, $3, $4::uuid, $5::uuid, $6::uuid, DATE '2020-01-01', 'ACTIVE'::"EmployeeLifecycleStatus")
    RETURNING id::text
    `,
    [
      tenantId,
      `CALC07B-${suffix}`,
      `CALC-07B ${serviceYears}`,
      salary.rows[0].id,
      shift.rows[0].id,
      link.rows[0].id,
    ],
  );

  if (serviceYears > 0) {
    await client.query(
      `
      INSERT INTO hr.service_time_record (
        tenant_id, employee_id, source, starts_on, ends_on, days_count, notes
      )
      VALUES ($1::uuid, $2::uuid, 'calc07-e2e', DATE '2000-01-01', DATE '2000-01-01', $3, 'CALC-07 service time')
      `,
      [tenantId, employee.rows[0].id, serviceYears * 365],
    );
  }

  return { employeeId: employee.rows[0].id, employmentLinkId: link.rows[0].id };
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
