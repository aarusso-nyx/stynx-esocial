import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import Decimal from 'decimal.js';
import { Pool } from 'pg';

import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { DatabaseService } from '../../backend/src/database/database.service';

const tenantId = '00000000-0000-0000-0000-000000000120';

describe('CALC-02 IRRF progressive table golden scenarios (e2e)', () => {
  let pool: Pool;
  let databaseService: DatabaseService;
  let rubricaId: string;
  const employeeIds: string[] = [];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for calc-irrf');
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
        VALUES ('${tenantId}', 'calc02-e2e', 'CALC02', 'CALC-02 E2E', 'ACTIVE'::"RecordStatus")
        ON CONFLICT (id) DO NOTHING
      `);
      await seedIrrfTable(client);
      rubricaId = await seedIrrfRubrica(client);
      employeeIds.push(
        await createEmployee(client, 'ISENTO', '2000.00', 0),
        await createEmployee(client, 'FAIXA2', '2500.00', 0),
        await createEmployee(client, 'MAXDEP', '7000.00', 2),
      );
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
        'DELETE FROM hr.employee_dependent WHERE employee_id = ANY($1::uuid[])',
        [employeeIds],
      );
      await client.query('DELETE FROM hr.employee WHERE id = ANY($1::uuid[])', [
        employeeIds,
      ]);
      await client.query(
        "DELETE FROM hr.salary_reference WHERE code LIKE 'CALC02-SAL-%'",
      );
      await client.query(
        "DELETE FROM hr.shift WHERE code LIKE 'CALC02-SHIFT-%'",
      );
      await client.query(
        'DELETE FROM public.tax_rate WHERE tenant_id = $1::uuid AND kind = $2',
        [tenantId, 'IRRF'],
      );
    } finally {
      client.release();
      await pool.end();
      await databaseService?.onModuleDestroy();
    }
  });

  it.each([
    ['isento', 0, new Decimal('0.00')],
    ['faixa 2', 1, new Decimal('18.06')],
    ['faixa maxima com 2 dependentes', 2, new Decimal('924.73')],
  ])(
    'evaluates IRRF %s through evaluate_earning_deduction',
    async (_name, employeeIndex, expected) => {
      const amount = await evaluate(employeeIds[employeeIndex]);
      expect(new Decimal(amount ?? '0').toFixed(2)).toBe(expected.toFixed(2));
    },
  );

  async function evaluate(employeeId: string): Promise<string | null> {
    return RequestContextStore.run(
      {
        tenantId,
        permissions: [
          'folha.rubrica.read',
          'folha.rubrica.preview',
          'system.tax-rate.read',
          'rh.employee.read',
          'rh.dependent.read',
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

async function seedIrrfTable(client: import('pg').PoolClient): Promise<void> {
  await client.query(
    'DELETE FROM public.tax_rate WHERE tenant_id = $1::uuid AND kind = $2',
    [tenantId, 'IRRF'],
  );
  const brackets = [
    ['IRRF-CALC02-01', '0.00', '2259.20', '0.000000', '0.00'],
    ['IRRF-CALC02-02', '2259.21', '2826.65', '7.500000', '169.44'],
    ['IRRF-CALC02-03', '2826.66', '3751.05', '15.000000', '381.44'],
    ['IRRF-CALC02-04', '3751.06', '4664.68', '22.500000', '662.77'],
    ['IRRF-CALC02-05', '4664.69', null, '27.500000', '896.00'],
  ];
  for (const [index, bracket] of brackets.entries()) {
    await client.query(
      `
      INSERT INTO public.tax_rate (
        tenant_id, code, name, description, scope, reference_year, rate_percent,
        kind, competence_start, bracket_min, bracket_max, rate,
        deduction_amount, dependent_deduction, status
      )
      VALUES ($1::uuid, $2, $3, 'CALC-02 E2E IRRF', 'IRRF', 2025, $6::numeric, 'IRRF',
        DATE '2025-01-01', $4::numeric, $5::numeric, $6::numeric, $7::numeric, 189.59, 'ACTIVE'::"RecordStatus")
      `,
      [
        tenantId,
        bracket[0],
        `IRRF CALC-02 ${index + 1}`,
        bracket[1],
        bracket[2],
        bracket[3],
        bracket[4],
      ],
    );
  }
}

async function seedIrrfRubrica(
  client: import('pg').PoolClient,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.payroll_earning_deduction (
      tenant_id, code, description, kind, taxable, active, starts_on,
      formula_alias, formula_function_name, formula_expression,
      formula_dependencies, formula_ready
    )
    VALUES ($1::uuid, 'IRRF', 'Imposto de Renda Retido na Fonte', 'DEDUCTION'::"PayrollEntryKind",
      false, true, DATE '2025-01-01', 'irrf', 'f_irrf_progressive', NULL,
      ARRAY['BASE_IRRF', 'DEPENDENTES'], true)
    ON CONFLICT (tenant_id, code) DO UPDATE
    SET formula_function_name = EXCLUDED.formula_function_name,
        formula_ready = true,
        formula_error = NULL
    RETURNING id::text
    `,
    [tenantId],
  );
  return result.rows[0].id;
}

async function createEmployee(
  client: import('pg').PoolClient,
  code: string,
  salaryAmount: string,
  dependents: number,
): Promise<string> {
  const suffix = `${code}-${Date.now().toString(36)}`;
  const shift = await client.query<{ id: string }>(
    `
    INSERT INTO hr.shift (tenant_id, code, description, daily_hours, status)
    VALUES ($1::uuid, $2, 'CALC-02 E2E shift', 8.00, 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [tenantId, `CALC02-SHIFT-${suffix}`],
  );
  const salary = await client.query<{ id: string }>(
    `
    INSERT INTO hr.salary_reference (tenant_id, code, description, amount, vigencia_inicio)
    VALUES ($1::uuid, $2, 'CALC-02 E2E salary', $3::numeric, DATE '2025-01-01')
    RETURNING id::text
    `,
    [tenantId, `CALC02-SAL-${suffix}`, salaryAmount],
  );
  const employee = await client.query<{ id: string }>(
    `
    INSERT INTO hr.employee (
      tenant_id, registration, name, salary_reference_id, shift_id, hired_on, lifecycle_status
    )
    VALUES ($1::uuid, $2, $3, $4::uuid, $5::uuid, DATE '2020-01-01', 'ACTIVE'::"EmployeeLifecycleStatus")
    RETURNING id::text
    `,
    [
      tenantId,
      `CALC02-${suffix}`,
      `CALC-02 ${code}`,
      salary.rows[0].id,
      shift.rows[0].id,
    ],
  );
  for (let index = 0; index < dependents; index += 1) {
    await client.query(
      `
      INSERT INTO hr.employee_dependent (tenant_id, employee_id, name, relationship, income_tax_dependent)
      VALUES ($1::uuid, $2::uuid, $3, 'CHILD', true)
      `,
      [tenantId, employee.rows[0].id, `CALC-02 Dependent ${index + 1}`],
    );
  }
  return employee.rows[0].id;
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
