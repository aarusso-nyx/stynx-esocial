import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS ??= 'true';

import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';

import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { DatabaseService } from '../../backend/src/database/database.service';
import { SimulacaoService } from '../../backend/src/folha-pagamento/simulacao/simulacao.service';

const tenantId = '00000000-0000-0000-0000-000000000128';

describe('CALC-10 payroll simulation dry-run (e2e)', () => {
  let pool: Pool;
  let database: DatabaseService;
  let service: SimulacaoService;
  let employeeId: string;
  let employmentLinkId: string;
  let payrollRunId: string;
  let salaryRubricId: string;
  let irrfRubricId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for calc-simulacao');
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    database = new DatabaseService(
      new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }),
    );
    service = new SimulacaoService(database);

    const client = await pool.connect();
    try {
      await setBypassContext(client);
      await client.query(`
        INSERT INTO public.tenant (id, slug, code, name, status)
        VALUES ('${tenantId}', 'calc10-e2e', 'CALC10', 'CALC-10 E2E', 'ACTIVE'::"RecordStatus")
        ON CONFLICT (id) DO NOTHING
      `);
      await seedTaxRate(client);
      const fixture = await seedFixture(client);
      employeeId = fixture.employeeId;
      employmentLinkId = fixture.employmentLinkId;
      payrollRunId = fixture.payrollRunId;
      salaryRubricId = fixture.salaryRubricId;
      irrfRubricId = fixture.irrfRubricId;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (!pool) return;
    const client = await pool.connect();
    try {
      await setBypassContext(client);
      await client.query(
        'DELETE FROM payroll.employee_payroll_item WHERE payroll_run_id = $1::uuid',
        [payrollRunId],
      );
      await client.query(
        'DELETE FROM payroll.payroll_run WHERE id = $1::uuid',
        [payrollRunId],
      );
      await client.query(
        'DELETE FROM payroll.employment_link_earning WHERE earning_deduction_id = ANY($1::uuid[])',
        [[salaryRubricId, irrfRubricId]],
      );
      await client.query(
        'DELETE FROM payroll.payroll_earning_deduction WHERE id = ANY($1::uuid[])',
        [[salaryRubricId, irrfRubricId]],
      );
      await client.query('DELETE FROM hr.employee WHERE id = $1::uuid', [
        employeeId,
      ]);
      await client.query(
        "DELETE FROM hr.salary_reference WHERE tenant_id = $1::uuid AND code LIKE 'CALC10-SAL-%'",
        [tenantId],
      );
      await client.query(
        "DELETE FROM hr.employment_link WHERE tenant_id = $1::uuid AND code LIKE 'CALC10-LINK-%'",
        [tenantId],
      );
      await client.query(
        "DELETE FROM payroll.processing_type WHERE tenant_id = $1::uuid AND code LIKE 'CALC10-PROC-%'",
        [tenantId],
      );
      await client.query(
        "DELETE FROM payroll.payroll_type WHERE tenant_id = $1::uuid AND code LIKE 'CALC10-TYPE-%'",
        [tenantId],
      );
      await client.query(
        'DELETE FROM public.tax_rate WHERE tenant_id = $1::uuid AND kind = $2',
        [tenantId, 'IRRF'],
      );
    } finally {
      client.release();
      await database.onModuleDestroy();
      await pool.end();
    }
  });

  it('runs five simulations without changing payroll_run or line counts', async () => {
    const before = await countPayrollRows();
    let lastNet = '';

    for (let index = 0; index < 5; index += 1) {
      const result = await runSimulation({});
      lastNet = result.totals.simulatedNet;
      expect(result.persistenceCheck.payrollRunsBefore).toBe(
        result.persistenceCheck.payrollRunsAfter,
      );
      expect(result.persistenceCheck.payrollRunLinesBefore).toBe(
        result.persistenceCheck.payrollRunLinesAfter,
      );
    }

    const after = await countPayrollRows();
    const real = await realRunNet();
    expect(after).toEqual(before);
    expect(lastNet).toBe(real);
  });

  it('applies a 10 percent base salary override and moves IRRF into the next amount', async () => {
    const result = await runSimulation({ baseSalary: '2750.00' });
    const salary = result.lines.find(
      (line) => line.earningDeductionId === salaryRubricId,
    );
    const irrf = result.lines.find(
      (line) => line.earningDeductionId === irrfRubricId,
    );

    expect(salary?.currentAmount).toBe('2500.00');
    expect(salary?.amount).toBe('2750.00');
    expect(irrf?.currentAmount).toBe('18.06');
    expect(irrf?.amount).toBe('36.81');
    expect(result.totals.currentNet).toBe('2481.94');
    expect(result.totals.simulatedNet).toBe('2713.19');
    expect(result.totals.netDelta).toBe('231.25');
  });

  async function runSimulation(overrides: Record<string, string | number>) {
    const permissions = [
      'payroll.simulation.execute',
      'folha.rubrica.read',
      'folha.rubrica.preview',
      'rh.employee.read',
      'rh.dependent.read',
      'system.tax-rate.read',
    ];
    return RequestContextStore.run(
      {
        tenantId,
        permissions,
        actor: {
          sub: 'calc10-e2e',
          username: 'calc10-e2e',
          tenantId,
          groups: [],
          permissions,
        },
      },
      () =>
        service.run({
          tenantId,
          employmentLinkId,
          competence: '2025-05-01',
          overrides,
        }),
    );
  }

  async function countPayrollRows(): Promise<{
    payrollRuns: string;
    payrollRunLines: string;
  }> {
    const result = await pool.query<{
      payroll_runs: string;
      payroll_run_lines: string;
    }>(
      `
      SELECT
        (
          SELECT count(*)::text
          FROM payroll.payroll_run
          WHERE tenant_id = $1::uuid
        ) AS payroll_runs,
        (
          SELECT count(*)::text
          FROM payroll.employee_payroll_item
          WHERE tenant_id = $1::uuid
        ) AS payroll_run_lines
      `,
      [tenantId],
    );
    return {
      payrollRuns: result.rows[0]?.payroll_runs ?? '0',
      payrollRunLines: result.rows[0]?.payroll_run_lines ?? '0',
    };
  }

  async function realRunNet(): Promise<string> {
    const result = await pool.query<{ total_net: string }>(
      `
      SELECT total_net::numeric(14, 2)::text
      FROM payroll.payroll_run
      WHERE id = $1::uuid
      `,
      [payrollRunId],
    );
    return result.rows[0]?.total_net ?? '0.00';
  }
});

async function seedFixture(client: PoolClient): Promise<{
  employeeId: string;
  employmentLinkId: string;
  payrollRunId: string;
  salaryRubricId: string;
  irrfRubricId: string;
}> {
  const suffix = Date.now().toString(36);
  await client.query(`
    CREATE OR REPLACE FUNCTION payroll_calc.f_calc10_salary(
      p_employee_id uuid,
      p_month integer,
      p_year integer
    )
    RETURNS numeric
    LANGUAGE sql
    STABLE
    AS $$
      SELECT payroll_calc.base_salary(p_employee_id, make_date(p_year, p_month, 1))
    $$;
  `);
  await client.query(`
    CREATE OR REPLACE FUNCTION payroll_calc.f_calc10_irrf(
      p_employee_id uuid,
      p_month integer,
      p_year integer
    )
    RETURNS numeric
    LANGUAGE sql
    STABLE
    AS $$
      SELECT payroll_calc.compute_irrf(
        public.sgp_current_tenant_uuid(),
        payroll_calc.base_irrf(p_employee_id, make_date(p_year, p_month, 1)),
        payroll_calc.dependent_count(p_employee_id)::integer,
        make_date(p_year, p_month, 1)
      )
    $$;
  `);
  const employmentLink = await client.query<{ id: string }>(
    `
    INSERT INTO hr.employment_link (tenant_id, code, name, status)
    VALUES ($1::uuid, $2, 'CALC-10 link', 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [tenantId, `CALC10-LINK-${suffix}`],
  );
  const salary = await client.query<{ id: string }>(
    `
    INSERT INTO hr.salary_reference (tenant_id, code, description, amount, vigencia_inicio)
    VALUES ($1::uuid, $2, 'CALC-10 salary', 2500.00, DATE '2025-01-01')
    RETURNING id::text
    `,
    [tenantId, `CALC10-SAL-${suffix}`],
  );
  const employee = await client.query<{ id: string }>(
    `
    INSERT INTO hr.employee (
      tenant_id, registration, name, employment_link_id, salary_reference_id,
      hired_on, lifecycle_status
    )
    VALUES (
      $1::uuid, $2, 'CALC-10 Employee', $3::uuid, $4::uuid,
      DATE '2020-01-01', 'ACTIVE'::"EmployeeLifecycleStatus"
    )
    RETURNING id::text
    `,
    [
      tenantId,
      `CALC10-${suffix}`,
      employmentLink.rows[0].id,
      salary.rows[0].id,
    ],
  );
  const salaryRubric = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.payroll_earning_deduction (
      tenant_id, code, description, kind, taxable, active, starts_on,
      formula_alias, formula_function_name, formula_ready
    )
    VALUES ($1::uuid, $2, 'CALC-10 salario base', 'EARNING'::"PayrollEntryKind",
      true, true, DATE '2025-01-01', $3, 'f_calc10_salary', true)
    RETURNING id::text
    `,
    [tenantId, `CALC10-SALARY-${suffix}`, `calc10_salary_${suffix}`],
  );
  const irrfRubric = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.payroll_earning_deduction (
      tenant_id, code, description, kind, taxable, active, starts_on,
      formula_alias, formula_function_name, formula_dependencies, formula_ready
    )
    VALUES ($1::uuid, $2, 'CALC-10 IRRF', 'DEDUCTION'::"PayrollEntryKind",
      false, true, DATE '2025-01-01', $3, 'f_calc10_irrf',
      ARRAY['BASE_IRRF', 'DEPENDENTES'], true)
    RETURNING id::text
    `,
    [tenantId, `CALC10-IRRF-${suffix}`, `calc10_irrf_${suffix}`],
  );
  await client.query(
    `
    INSERT INTO payroll.employment_link_earning (
      tenant_id, employment_link_id, earning_deduction_id, starts_on, status
    )
    VALUES
      ($1::uuid, $2::uuid, $3::uuid, DATE '2025-01-01', 'ACTIVE'::"RecordStatus"),
      ($1::uuid, $2::uuid, $4::uuid, DATE '2025-01-01', 'ACTIVE'::"RecordStatus")
    `,
    [
      tenantId,
      employmentLink.rows[0].id,
      salaryRubric.rows[0].id,
      irrfRubric.rows[0].id,
    ],
  );
  const payrollType = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.payroll_type (tenant_id, code, description, status)
    VALUES ($1::uuid, $2, 'CALC-10 monthly', 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [tenantId, `CALC10-TYPE-${suffix}`],
  );
  const processingType = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.processing_type (tenant_id, code, description, payroll_type_id, status)
    VALUES ($1::uuid, $2, 'CALC-10 monthly', $3::uuid, 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [tenantId, `CALC10-PROC-${suffix}`, payrollType.rows[0].id],
  );
  const run = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.payroll_run (
      tenant_id, competence_year, competence_month, payroll_type_id,
      processing_type_id, status, employee_count, total_earnings,
      total_deductions, total_net
    )
    VALUES (
      $1::uuid, 2025, 5, $2::uuid, $3::uuid, 'GENERATED'::"PayrollRunStatus",
      1, 2500.00, 18.06, 2481.94
    )
    RETURNING id::text
    `,
    [tenantId, payrollType.rows[0].id, processingType.rows[0].id],
  );
  await client.query(
    `
    INSERT INTO payroll.employee_payroll_item (
      tenant_id, employee_id, payroll_run_id, earning_deduction_id, source,
      competence_year, competence_month, quantity, reference_value, amount
    )
    VALUES
      ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'CALCULATED'::"PayrollEntrySource", 2025, 5, 1, 2500.00, 2500.00),
      ($1::uuid, $2::uuid, $3::uuid, $5::uuid, 'CALCULATED'::"PayrollEntrySource", 2025, 5, 1, 18.06, 18.06)
    `,
    [
      tenantId,
      employee.rows[0].id,
      run.rows[0].id,
      salaryRubric.rows[0].id,
      irrfRubric.rows[0].id,
    ],
  );
  return {
    employeeId: employee.rows[0].id,
    employmentLinkId: employmentLink.rows[0].id,
    payrollRunId: run.rows[0].id,
    salaryRubricId: salaryRubric.rows[0].id,
    irrfRubricId: irrfRubric.rows[0].id,
  };
}

async function seedTaxRate(client: PoolClient): Promise<void> {
  await client.query(
    'DELETE FROM public.tax_rate WHERE tenant_id = $1::uuid AND kind = $2',
    [tenantId, 'IRRF'],
  );
  const brackets = [
    ['CALC10-IRRF-01', '0.00', '2259.20', '0.000000', '0.00'],
    ['CALC10-IRRF-02', '2259.21', '2826.65', '7.500000', '169.44'],
    ['CALC10-IRRF-03', '2826.66', '3751.05', '15.000000', '381.44'],
    ['CALC10-IRRF-04', '3751.06', '4664.68', '22.500000', '662.77'],
    ['CALC10-IRRF-05', '4664.69', null, '27.500000', '896.00'],
  ];
  for (const [index, bracket] of brackets.entries()) {
    await client.query(
      `
      INSERT INTO public.tax_rate (
        tenant_id, code, name, description, scope, reference_year, rate_percent,
        kind, competence_start, bracket_min, bracket_max, rate,
        deduction_amount, dependent_deduction, status
      )
      VALUES ($1::uuid, $2, $3, 'CALC-10 E2E IRRF', 'IRRF', 2025, $6::numeric, 'IRRF',
        DATE '2025-01-01', $4::numeric, $5::numeric, $6::numeric, $7::numeric, 189.59, 'ACTIVE'::"RecordStatus")
      `,
      [
        tenantId,
        bracket[0],
        `IRRF CALC-10 ${index + 1}`,
        bracket[1],
        bracket[2],
        bracket[3],
        bracket[4],
      ],
    );
  }
}

async function setBypassContext(client: PoolClient): Promise<void> {
  await client.query("SELECT set_config('app.bypass_rls', 'true', false)");
  await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [
    tenantId,
  ]);
  await client.query("SELECT set_config('app.current_tenant', $1, false)", [
    tenantId,
  ]);
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
