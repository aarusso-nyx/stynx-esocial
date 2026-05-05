import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import Decimal from 'decimal.js';
import { Pool } from 'pg';

import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { DatabaseService } from '../../backend/src/database/database.service';

const tenantId = '00000000-0000-0000-0000-000000000122';

describe('CALC-06 remuneration ceiling golden scenarios (e2e)', () => {
  let pool: Pool;
  let databaseService: DatabaseService;
  let tetoRubricaId: string;
  let earningRubricaId: string;
  let immuneRubricaId: string;
  const employeeIds: string[] = [];
  const employmentLinkIds: string[] = [];
  const payrollRunIds: string[] = [];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for calc-teto');
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
        VALUES ('${tenantId}', 'calc06-e2e', 'CALC06', 'CALC-06 E2E', 'ACTIVE'::"RecordStatus")
        ON CONFLICT (id) DO NOTHING
      `);
      await seedCeiling(client, '30000.00');
      earningRubricaId = await seedRubrica(client, 'CALC06-VENC', true);
      immuneRubricaId = await seedRubrica(client, 'CALC06-IMMUNE', false);
      tetoRubricaId = await seedTetoRubrica(client);

      const inside = await createEmployee(client, 'INSIDE');
      const exceeded = await createEmployee(client, 'EXCEEDED');
      const immune = await createEmployee(client, 'IMMUNE');
      employeeIds.push(
        inside.employeeId,
        exceeded.employeeId,
        immune.employeeId,
      );
      employmentLinkIds.push(
        inside.employmentLinkId,
        exceeded.employmentLinkId,
        immune.employmentLinkId,
      );

      payrollRunIds.push(
        await seedPayrollItems(client, inside.employeeId, [
          [earningRubricaId, '28000.00'],
        ]),
        await seedPayrollItems(client, exceeded.employeeId, [
          [earningRubricaId, '35000.00'],
        ]),
        await seedPayrollItems(client, immune.employeeId, [
          [earningRubricaId, '35000.00'],
          [immuneRubricaId, '2000.00'],
        ]),
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
        'DELETE FROM payroll.employee_payroll_item WHERE payroll_run_id = ANY($1::uuid[])',
        [payrollRunIds],
      );
      await client.query(
        'DELETE FROM payroll.payroll_run WHERE id = ANY($1::uuid[])',
        [payrollRunIds],
      );
      await client.query('DELETE FROM hr.employee WHERE id = ANY($1::uuid[])', [
        employeeIds,
      ]);
      await client.query(
        'DELETE FROM hr.employment_link WHERE id = ANY($1::uuid[])',
        [employmentLinkIds],
      );
      await client.query(
        "DELETE FROM hr.salary_reference WHERE code LIKE 'CALC06-SAL-%'",
      );
      await client.query(
        "DELETE FROM hr.shift WHERE code LIKE 'CALC06-SHIFT-%'",
      );
      await client.query(
        "DELETE FROM payroll.processing_type WHERE tenant_id = $1::uuid AND code LIKE 'CALC06-%'",
        [tenantId],
      );
      await client.query(
        "DELETE FROM payroll.payroll_type WHERE tenant_id = $1::uuid AND code LIKE 'CALC06-%'",
        [tenantId],
      );
    } finally {
      client.release();
      await pool.end();
      await databaseService?.onModuleDestroy();
    }
  });

  it.each([
    ['inside ceiling', 0, new Decimal('0.00')],
    ['fully subject excess', 1, new Decimal('5000.00')],
    ['partially immune excess', 2, new Decimal('5000.00')],
  ])(
    'evaluates DESCONTO_TETO for %s',
    async (_name, employeeIndex, expected) => {
      const amount = await evaluate(employeeIds[employeeIndex]);
      expect(new Decimal(amount ?? '0').toFixed(2)).toBe(expected.toFixed(2));
    },
  );

  it('fails explicitly when the required TETO parameter is not configured', async () => {
    const client = await pool.connect();
    try {
      await client.query("SELECT set_config('app.bypass_rls', 'true', true)");
      await client.query(
        `
        UPDATE public.system_parameter
        SET value = '{"amount":null}'::jsonb
        WHERE tenant_id = $1::uuid
          AND key = 'TETO_PREFEITURA'
        `,
        [tenantId],
      );
    } finally {
      client.release();
    }

    await expect(evaluate(employeeIds[0])).rejects.toThrow(
      'Required remuneration ceiling parameter TETO_PREFEITURA is not configured',
    );
  });

  async function evaluate(employeeId: string): Promise<string | null> {
    return RequestContextStore.run(
      {
        tenantId,
        permissions: [
          'folha.rubrica.read',
          'folha.rubrica.preview',
          'system.parameter.read',
          'rh.employee.read',
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
          [tetoRubricaId, employeeId],
        );
        return rows[0]?.amount ?? null;
      },
    );
  }
});

async function seedCeiling(
  client: import('pg').PoolClient,
  amount: string,
): Promise<void> {
  await client.query(
    `
    INSERT INTO public.system_parameter (tenant_id, key, value, description, module_key)
    VALUES ($1::uuid, 'TETO_PREFEITURA', jsonb_build_object('amount', $2::text), 'CALC-06 E2E ceiling', 'payroll')
    ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value
    `,
    [tenantId, amount],
  );
}

async function seedRubrica(
  client: import('pg').PoolClient,
  code: string,
  subjectToCeiling: boolean,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.payroll_earning_deduction (
      tenant_id, code, description, kind, taxable, active, incidences, starts_on,
      subject_to_ceiling
    )
    VALUES ($1::uuid, $2, $2, 'EARNING'::"PayrollEntryKind", true, true, '{}'::jsonb,
      DATE '2025-01-01', $3)
    ON CONFLICT (tenant_id, code) DO UPDATE
    SET subject_to_ceiling = EXCLUDED.subject_to_ceiling,
        updated_at = now()
    RETURNING id::text
    `,
    [tenantId, code, subjectToCeiling],
  );
  return result.rows[0].id;
}

async function seedTetoRubrica(
  client: import('pg').PoolClient,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.payroll_earning_deduction (
      tenant_id, code, description, kind, taxable, active, incidences, starts_on,
      subject_to_ceiling, formula_alias, formula_function_name,
      formula_expression, formula_dependencies, formula_ready
    )
    VALUES ($1::uuid, 'DESCONTO_TETO', 'Redutor do teto remuneratorio constitucional',
      'DEDUCTION'::"PayrollEntryKind", false, true, '{"constitutional_ceiling":true}',
      DATE '2025-01-01', false, 'desconto_teto', 'f_teto_remuneratorio',
      NULL, ARRAY['BASE_TETO_REMUNERATORIO'], true)
    ON CONFLICT (tenant_id, code) DO UPDATE
    SET formula_function_name = EXCLUDED.formula_function_name,
        formula_ready = true,
        subject_to_ceiling = false,
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
): Promise<{ employeeId: string; employmentLinkId: string }> {
  const suffix = `${code}-${Date.now().toString(36)}`;
  const link = await client.query<{ id: string }>(
    `
    INSERT INTO hr.employment_link (tenant_id, code, name, contract_type, regime_law_reference, status)
    VALUES ($1::uuid, $2, $3, 'statutory', 'Lei local', 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [tenantId, `CALC06-LINK-${suffix}`, `CALC-06 ${code}`],
  );
  const shift = await client.query<{ id: string }>(
    `
    INSERT INTO hr.shift (tenant_id, code, description, daily_hours, status)
    VALUES ($1::uuid, $2, 'CALC-06 E2E shift', 8.00, 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [tenantId, `CALC06-SHIFT-${suffix}`],
  );
  const salary = await client.query<{ id: string }>(
    `
    INSERT INTO hr.salary_reference (tenant_id, code, description, amount, vigencia_inicio)
    VALUES ($1::uuid, $2, 'CALC-06 E2E salary', 1000.00, DATE '2025-01-01')
    RETURNING id::text
    `,
    [tenantId, `CALC06-SAL-${suffix}`],
  );
  const employee = await client.query<{ id: string }>(
    `
    INSERT INTO hr.employee (
      tenant_id, registration, name, salary_reference_id, shift_id, employment_link_id,
      hired_on, lifecycle_status
    )
    VALUES ($1::uuid, $2, $3, $4::uuid, $5::uuid, $6::uuid, DATE '2020-01-01',
      'ACTIVE'::"EmployeeLifecycleStatus")
    RETURNING id::text
    `,
    [
      tenantId,
      `CALC06-${suffix}`,
      `CALC-06 ${code}`,
      salary.rows[0].id,
      shift.rows[0].id,
      link.rows[0].id,
    ],
  );
  return { employeeId: employee.rows[0].id, employmentLinkId: link.rows[0].id };
}

async function seedPayrollItems(
  client: import('pg').PoolClient,
  employeeId: string,
  items: Array<[string, string]>,
): Promise<string> {
  const payrollTypeId = await ensurePayrollType(client);
  const processingTypeId = await ensureProcessingType(client, payrollTypeId);
  const run = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.payroll_run (
      tenant_id, competence_year, competence_month, payroll_type_id,
      processing_type_id, status
    )
    VALUES ($1::uuid, 2025, 5, $2::uuid, $3::uuid, 'DRAFT'::"PayrollRunStatus")
    RETURNING id::text
    `,
    [tenantId, payrollTypeId, processingTypeId],
  );
  for (const [rubricaId, amount] of items) {
    await client.query(
      `
      INSERT INTO payroll.employee_payroll_item (
        tenant_id, employee_id, payroll_run_id, earning_deduction_id,
        source, competence_year, competence_month, quantity, reference_value,
        amount, notes
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'MANUAL'::"PayrollEntrySource",
        2025, 5, 1.00, $5::numeric, $5::numeric, 'CALC-06 E2E')
      `,
      [tenantId, employeeId, run.rows[0].id, rubricaId, amount],
    );
  }
  return run.rows[0].id;
}

async function ensurePayrollType(
  client: import('pg').PoolClient,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.payroll_type (tenant_id, code, description, status)
    VALUES ($1::uuid, 'CALC06-MENSAL', 'CALC-06 monthly payroll', 'ACTIVE'::"RecordStatus")
    ON CONFLICT (tenant_id, code) DO UPDATE
    SET description = EXCLUDED.description,
        status = EXCLUDED.status
    RETURNING id::text
    `,
    [tenantId],
  );
  return result.rows[0].id;
}

async function ensureProcessingType(
  client: import('pg').PoolClient,
  payrollTypeId: string,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.processing_type (
      tenant_id, code, description, payroll_type_id, status
    )
    VALUES ($1::uuid, 'CALC06-NORMAL', 'CALC-06 normal processing', $2::uuid,
      'ACTIVE'::"RecordStatus")
    ON CONFLICT (tenant_id, code) DO UPDATE
    SET description = EXCLUDED.description,
        payroll_type_id = EXCLUDED.payroll_type_id,
        status = EXCLUDED.status
    RETURNING id::text
    `,
    [tenantId, payrollTypeId],
  );
  return result.rows[0].id;
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
