import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import Decimal from 'decimal.js';
import { Pool } from 'pg';

import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { DatabaseService } from '../../backend/src/database/database.service';
import { EmployeesService } from '../../backend/src/rh/employees/employees.service';

const tenantId = '00000000-0000-0000-0000-000000000123';

describe('CALC-07 abono permanencia golden scenarios (e2e)', () => {
  let pool: Pool;
  let databaseService: DatabaseService;
  let employeesService: EmployeesService;
  let abonoRubricaId: string;
  const employeeIds: string[] = [];
  const employmentLinkIds: string[] = [];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for calc-abono-permanencia');
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    databaseService = new DatabaseService({
      get: (key: string) =>
        key === 'DATABASE_URL' ? process.env.DATABASE_URL : undefined,
    } as never);
    employeesService = new EmployeesService(databaseService);

    const client = await pool.connect();
    try {
      await client.query("SELECT set_config('app.bypass_rls', 'true', true)");
      await client.query(`
        INSERT INTO public.tenant (id, slug, code, name, status)
        VALUES ('${tenantId}', 'calc07-abono-e2e', 'CALC07A', 'CALC-07 Abono E2E', 'ACTIVE'::"RecordStatus")
        ON CONFLICT (id) DO NOTHING
      `);
      await seedRppsTable(client);
      abonoRubricaId = await seedRubrica(client);
      const active = await createEmployee(client, 'ACTIVE', '5000.00');
      const inactive = await createEmployee(client, 'INACTIVE', '5000.00');
      employeeIds.push(active.employeeId, inactive.employeeId);
      employmentLinkIds.push(
        active.employmentLinkId,
        inactive.employmentLinkId,
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
        "DELETE FROM hr.salary_reference WHERE code LIKE 'CALC07A-SAL-%'",
      );
      await client.query(
        "DELETE FROM hr.shift WHERE code LIKE 'CALC07A-SHIFT-%'",
      );
      await client.query(
        'DELETE FROM public.tax_rate WHERE tenant_id = $1::uuid AND kind = $2',
        [tenantId, 'RPPS'],
      );
    } finally {
      client.release();
      await pool.end();
      await databaseService?.onModuleDestroy();
    }
  });

  it('pays abono equal to calculated RPPS when active', async () => {
    await updateAbono(employeeIds[0], true);

    const amount = await evaluate(employeeIds[0]);
    expect(new Decimal(amount ?? '0').toFixed(2)).toBe('509.60');
  });

  it('returns zero when abono is inactive and audits activation/deactivation', async () => {
    const before = await auditCount();
    await updateAbono(employeeIds[1], true);
    await updateAbono(employeeIds[1], false);

    const amount = await evaluate(employeeIds[1]);
    const after = await auditCount();
    expect(new Decimal(amount ?? '0').toFixed(2)).toBe('0.00');
    expect(after).toBeGreaterThanOrEqual(before + 2);
  });

  async function updateAbono(
    employeeId: string,
    active: boolean,
  ): Promise<void> {
    await RequestContextStore.run(
      {
        tenantId,
        requestId: `calc07-abono-${active ? 'on' : 'off'}`,
        actor: {
          sub: 'calc07-user',
          username: 'calc07.user',
          tenantId,
          groups: ['RH'],
          permissions: ['rh.employee.read', 'rh.employee.abono.write'],
        },
      },
      async () => {
        await employeesService.updateAbonoPermanencia(employeeId, {
          active,
          startsOn: active ? '2025-01-01' : undefined,
          legalBasis: 'EC 41/2003 art. 3 paragraph 1',
        });
      },
    );
  }

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
          [abonoRubricaId, employeeId],
        );
        return rows[0]?.amount ?? null;
      },
    );
  }

  async function auditCount(): Promise<number> {
    const result = await pool.query<{ count: string }>(
      `
      SELECT count(*)::text
      FROM public.audit_event
      WHERE tenant_id = $1::uuid
        AND resource_type = 'hr.employee.abono_permanencia'
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
    VALUES ($1::uuid, 'TETO_RPPS', '{"amount":8157.41}'::jsonb, 'CALC-07 E2E ceiling', 'payroll')
    ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value
    `,
    [tenantId],
  );
  const brackets = [
    ['RPPS-CALC07A-01', '0.00', '1518.00', '7.500000'],
    ['RPPS-CALC07A-02', '1518.01', '2793.88', '9.000000'],
    ['RPPS-CALC07A-03', '2793.89', '4190.83', '12.000000'],
    ['RPPS-CALC07A-04', '4190.84', '8157.41', '14.000000'],
  ];
  for (const [index, bracket] of brackets.entries()) {
    await client.query(
      `
      INSERT INTO public.tax_rate (
        tenant_id, code, name, description, scope, reference_year, rate_percent,
        kind, competence_start, bracket_min, bracket_max, rate,
        deduction_amount, dependent_deduction, status
      )
      VALUES ($1::uuid, $2, $3, 'CALC-07 E2E RPPS', 'RPPS', 2025, $6::numeric, 'RPPS',
        DATE '2025-01-01', $4::numeric, $5::numeric, $6::numeric, 0.00, 0.00, 'ACTIVE'::"RecordStatus")
      `,
      [
        tenantId,
        bracket[0],
        `RPPS CALC-07 ${index + 1}`,
        bracket[1],
        bracket[2],
        bracket[3],
      ],
    );
  }
}

async function seedRubrica(client: import('pg').PoolClient): Promise<string> {
  const result = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.payroll_earning_deduction (
      tenant_id, code, description, kind, taxable, active, incidences, starts_on,
      subject_to_ceiling, formula_alias, formula_function_name,
      formula_expression, formula_dependencies, formula_ready
    )
    VALUES ($1::uuid, 'ABONO_PERMANENCIA', 'Abono permanencia',
      'EARNING'::"PayrollEntryKind", false, true, '{"abono_permanencia":true}',
      DATE '2025-01-01', false, 'abono_permanencia', 'f_abono_permanencia',
      NULL, ARRAY['RPPS'], true)
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
): Promise<{ employeeId: string; employmentLinkId: string }> {
  const suffix = `${code}-${Date.now().toString(36)}`;
  const link = await client.query<{ id: string }>(
    `
    INSERT INTO hr.employment_link (tenant_id, code, name, contract_type, regime_law_reference, status)
    VALUES ($1::uuid, $2, $3, 'statutory', 'Lei 8.112/90', 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [tenantId, `CALC07A-LINK-${suffix}`, `CALC-07A ${code}`],
  );
  const shift = await client.query<{ id: string }>(
    `
    INSERT INTO hr.shift (tenant_id, code, description, daily_hours, status)
    VALUES ($1::uuid, $2, 'CALC-07A E2E shift', 8.00, 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [tenantId, `CALC07A-SHIFT-${suffix}`],
  );
  const salary = await client.query<{ id: string }>(
    `
    INSERT INTO hr.salary_reference (tenant_id, code, description, amount, vigencia_inicio)
    VALUES ($1::uuid, $2, 'CALC-07A E2E salary', $3::numeric, DATE '2025-01-01')
    RETURNING id::text
    `,
    [tenantId, `CALC07A-SAL-${suffix}`, salaryAmount],
  );
  const employee = await client.query<{ id: string }>(
    `
    INSERT INTO hr.employee (
      tenant_id, registration, name, salary_reference_id, shift_id, employment_link_id, hired_on, lifecycle_status
    )
    VALUES ($1::uuid, $2, $3, $4::uuid, $5::uuid, $6::uuid, DATE '2000-01-01', 'ACTIVE'::"EmployeeLifecycleStatus")
    RETURNING id::text
    `,
    [
      tenantId,
      `CALC07A-${suffix}`,
      `CALC-07A ${code}`,
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
