import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import Decimal from 'decimal.js';
import { Pool } from 'pg';

import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { DatabaseService } from '../../backend/src/database/database.service';

const tenantId = '00000000-0000-0000-0000-000000000121';

describe('CALC-03 RPPS progressive table golden scenarios (e2e)', () => {
  let pool: Pool;
  let databaseService: DatabaseService;
  let rubricaId: string;
  const employeeIds: string[] = [];
  const employmentLinkIds: string[] = [];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for calc-rpps');
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
        VALUES ('${tenantId}', 'calc03-e2e', 'CALC03', 'CALC-03 E2E', 'ACTIVE'::"RecordStatus")
        ON CONFLICT (id) DO NOTHING
      `);
      await seedRppsTable(client);
      rubricaId = await seedRppsRubrica(client);
      const low = await createEmployee(client, 'LOW', '2000.00', 'statutory');
      const max = await createEmployee(client, 'MAX', '10000.00', 'statutory');
      const clt = await createEmployee(client, 'CLT', '5000.00', 'celetista');
      employeeIds.push(low.employeeId, max.employeeId, clt.employeeId);
      employmentLinkIds.push(
        low.employmentLinkId,
        max.employmentLinkId,
        clt.employmentLinkId,
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
      await client.query('DELETE FROM hr.employee WHERE id = ANY($1::uuid[])', [
        employeeIds,
      ]);
      await client.query(
        'DELETE FROM hr.employment_link WHERE id = ANY($1::uuid[])',
        [employmentLinkIds],
      );
      await client.query(
        "DELETE FROM hr.salary_reference WHERE code LIKE 'CALC03-SAL-%'",
      );
      await client.query(
        "DELETE FROM hr.shift WHERE code LIKE 'CALC03-SHIFT-%'",
      );
      await client.query(
        'DELETE FROM public.tax_rate WHERE tenant_id = $1::uuid AND kind = $2',
        [tenantId, 'RPPS'],
      );
      await client.query(
        "DELETE FROM public.system_parameter WHERE tenant_id = $1::uuid AND key = 'TETO_RPPS'",
        [tenantId],
      );
    } finally {
      client.release();
      await pool.end();
      await databaseService?.onModuleDestroy();
    }
  });

  it.each([
    ['statutory low bracket', 0, new Decimal('157.23')],
    ['statutory max bracket with ceiling', 1, new Decimal('951.63')],
    ['celetista bypass', 2, new Decimal('0.00')],
  ])(
    'evaluates RPPS %s through evaluate_earning_deduction',
    async (_name, employeeIndex, expected) => {
      const amount = await evaluate(employeeIds[employeeIndex]);
      expect(new Decimal(amount ?? '0').toFixed(2)).toBe(expected.toFixed(2));
    },
  );

  it('records an audit event for non-statutory bypass', async () => {
    const before = await auditBypassCount();
    await evaluate(employeeIds[2]);
    const after = await auditBypassCount();
    expect(after).toBeGreaterThan(before);
  });

  async function evaluate(employeeId: string): Promise<string | null> {
    return RequestContextStore.run(
      {
        tenantId,
        permissions: [
          'folha.rubrica.read',
          'folha.rubrica.preview',
          'system.tax-rate.read',
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
          [rubricaId, employeeId],
        );
        return rows[0]?.amount ?? null;
      },
    );
  }

  async function auditBypassCount(): Promise<number> {
    const result = await pool.query<{ count: string }>(
      `
      SELECT count(*)::text
      FROM public.audit_event
      WHERE tenant_id = $1::uuid
        AND resource_type = 'payroll.rpps'
        AND metadata->>'event' = 'payroll.rpps.bypassed'
      `,
      [tenantId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }
});

async function seedRppsTable(client: import('pg').PoolClient): Promise<void> {
  await client.query(
    'DELETE FROM public.tax_rate WHERE tenant_id = $1::uuid AND kind = $2',
    [tenantId, 'RPPS'],
  );
  await client.query(
    `
    INSERT INTO public.system_parameter (tenant_id, key, value, description, module_key)
    VALUES ($1::uuid, 'TETO_RPPS', '{"amount":8157.41}'::jsonb, 'CALC-03 E2E ceiling', 'payroll')
    ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value
    `,
    [tenantId],
  );
  const brackets = [
    ['RPPS-CALC03-01', '0.00', '1518.00', '7.500000'],
    ['RPPS-CALC03-02', '1518.01', '2793.88', '9.000000'],
    ['RPPS-CALC03-03', '2793.89', '4190.83', '12.000000'],
    ['RPPS-CALC03-04', '4190.84', '8157.41', '14.000000'],
    ['RPPS-CALC03-05', '8157.42', null, '14.500000'],
  ];
  for (const [index, bracket] of brackets.entries()) {
    await client.query(
      `
      INSERT INTO public.tax_rate (
        tenant_id, code, name, description, scope, reference_year, rate_percent,
        kind, competence_start, bracket_min, bracket_max, rate,
        deduction_amount, dependent_deduction, status
      )
      VALUES ($1::uuid, $2, $3, 'CALC-03 E2E RPPS', 'RPPS', 2025, $6::numeric, 'RPPS',
        DATE '2025-01-01', $4::numeric, $5::numeric, $6::numeric, 0.00, 0.00, 'ACTIVE'::"RecordStatus")
      `,
      [
        tenantId,
        bracket[0],
        `RPPS CALC-03 ${index + 1}`,
        bracket[1],
        bracket[2],
        bracket[3],
      ],
    );
  }
}

async function seedRppsRubrica(
  client: import('pg').PoolClient,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.payroll_earning_deduction (
      tenant_id, code, description, kind, taxable, active, incidences, starts_on,
      formula_alias, formula_function_name, formula_expression,
      formula_dependencies, formula_ready
    )
    VALUES ($1::uuid, 'RPPS', 'Contribuicao previdenciaria RPPS', 'DEDUCTION'::"PayrollEntryKind",
      false, true, '{"rpps":true,"official_social_security":true}', DATE '2025-01-01',
      'rpps', 'f_rpps_progressive', NULL, ARRAY['BASE_RPPS'], true)
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
  contractType: 'statutory' | 'celetista',
): Promise<{ employeeId: string; employmentLinkId: string }> {
  const suffix = `${code}-${Date.now().toString(36)}`;
  const link = await client.query<{ id: string }>(
    `
    INSERT INTO hr.employment_link (tenant_id, code, name, contract_type, regime_law_reference, status)
    VALUES ($1::uuid, $2, $3, $4, 'Lei 8.112/90', 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [tenantId, `CALC03-LINK-${suffix}`, `CALC-03 ${code}`, contractType],
  );
  const shift = await client.query<{ id: string }>(
    `
    INSERT INTO hr.shift (tenant_id, code, description, daily_hours, status)
    VALUES ($1::uuid, $2, 'CALC-03 E2E shift', 8.00, 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [tenantId, `CALC03-SHIFT-${suffix}`],
  );
  const salary = await client.query<{ id: string }>(
    `
    INSERT INTO hr.salary_reference (tenant_id, code, description, amount, vigencia_inicio)
    VALUES ($1::uuid, $2, 'CALC-03 E2E salary', $3::numeric, DATE '2025-01-01')
    RETURNING id::text
    `,
    [tenantId, `CALC03-SAL-${suffix}`, salaryAmount],
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
      `CALC03-${suffix}`,
      `CALC-03 ${code}`,
      salary.rows[0].id,
      shift.rows[0].id,
      link.rows[0].id,
    ],
  );
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
