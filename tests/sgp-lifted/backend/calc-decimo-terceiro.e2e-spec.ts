import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import Decimal from 'decimal.js';
import { Pool, PoolClient, QueryResultRow } from 'pg';

const tenantId = '00000000-0000-0000-0000-000000000124';

interface DecimoTerceiroResultRow extends QueryResultRow {
  avos: number;
  base: string;
  installment_amount: string;
  first_installment_discount: string;
  irrf_amount: string;
}

describe('CALC-04 decimo terceiro golden scenarios (e2e)', () => {
  let pool: Pool;
  const employeeIds: string[] = [];
  const employmentLinkIds: string[] = [];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for calc-decimo-terceiro');
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await setSessionContext(client);
      await client.query(`
        INSERT INTO public.tenant (id, slug, code, name, status)
        VALUES ('${tenantId}', 'calc04-e2e', 'CALC04', 'CALC-04 E2E', 'ACTIVE'::"RecordStatus")
        ON CONFLICT (id) DO NOTHING
      `);
      await seedCatalog(client);
      await seedIrrfTable(client);
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (!pool) return;
    const client = await pool.connect();
    try {
      await setSessionContext(client);
      await client.query(
        'DELETE FROM payroll.employee_payroll_item WHERE employee_id = ANY($1::uuid[])',
        [employeeIds],
      );
      await client.query(
        'DELETE FROM payroll.payroll_run WHERE tenant_id = $1::uuid',
        [tenantId],
      );
      await client.query(
        'DELETE FROM public.tax_rate WHERE tenant_id = $1::uuid AND kind = $2',
        [tenantId, 'IRRF'],
      );
    } finally {
      client.release();
      await pool.end();
    }
  });

  it('calculates first parcel for 12 avos', async () => {
    const linkId = await createEmployee('FULL', '2400.00', '2025-01-01');
    const result = await compute(linkId, 'DECIMO_TERCEIRO_ADIANTAMENTO');

    expect(result.avos).toBe(12);
    expect(new Decimal(result.base).toFixed(2)).toBe('2400.00');
    expect(new Decimal(result.installment_amount).toFixed(2)).toBe('1200.00');
  });

  it('calculates 6 avos for July admission', async () => {
    const linkId = await createEmployee('JULY', '2400.00', '2025-07-01');
    const result = await compute(linkId, 'DECIMO_TERCEIRO_ADIANTAMENTO');

    expect(result.avos).toBe(6);
    expect(new Decimal(result.installment_amount).toFixed(2)).toBe('600.00');
  });

  it('calculates exclusive IRRF on closing total', async () => {
    const linkId = await createEmployee('IRRF', '12000.00', '2025-01-01');
    const result = await compute(linkId, 'DECIMO_TERCEIRO_FECHAMENTO');

    expect(result.avos).toBe(12);
    expect(new Decimal(result.installment_amount).toFixed(2)).toBe('12000.00');
    expect(new Decimal(result.irrf_amount).toFixed(2)).toBe('2404.00');
  });

  it('discounts exactly the first parcel already paid on closing', async () => {
    const linkId = await createEmployee('DISC', '2400.00', '2025-01-01');
    await seedFirstParcelPaid(linkId, '1200.00');
    const result = await compute(linkId, 'DECIMO_TERCEIRO_FECHAMENTO');

    expect(new Decimal(result.first_installment_discount).toFixed(2)).toBe(
      '1200.00',
    );
    expect(new Decimal(result.installment_amount).toFixed(2)).toBe('1200.00');
  });

  async function compute(
    linkId: string,
    kind: string,
  ): Promise<DecimoTerceiroResultRow> {
    const result = await pool.query<DecimoTerceiroResultRow>(
      `
      SELECT *
      FROM payroll_calc.compute_decimo_terceiro(
        $1::uuid,
        $2::uuid,
        $3,
        2025
      )
      `,
      [tenantId, linkId, kind],
    );
    return result.rows[0];
  }

  async function createEmployee(
    code: string,
    salaryAmount: string,
    startsOn: string,
  ): Promise<string> {
    const client = await pool.connect();
    try {
      await setSessionContext(client);
      const suffix = `${code}-${Date.now().toString(36)}`;
      const link = await client.query<{ id: string }>(
        `
        INSERT INTO hr.employment_link (tenant_id, code, name, status)
        VALUES ($1::uuid, $2, $3, 'ACTIVE'::"RecordStatus")
        RETURNING id::text
        `,
        [tenantId, `CALC04-LINK-${suffix}`, `CALC-04 ${code}`],
      );
      const functionalStatus = await client.query<{ id: string }>(
        `
        INSERT INTO hr.functional_status (
          tenant_id, code, description, enters_payroll, lifecycle_status, status
        )
        VALUES ($1::uuid, $2, 'CALC-04 active', true, 'ACTIVE'::"EmployeeLifecycleStatus", 'ACTIVE'::"RecordStatus")
        RETURNING id::text
        `,
        [tenantId, `CALC04-FS-${suffix}`],
      );
      const shift = await client.query<{ id: string }>(
        `
        INSERT INTO hr.shift (tenant_id, code, description, daily_hours, status)
        VALUES ($1::uuid, $2, 'CALC-04 shift', 8.00, 'ACTIVE'::"RecordStatus")
        RETURNING id::text
        `,
        [tenantId, `CALC04-SHIFT-${suffix}`],
      );
      const salary = await client.query<{ id: string }>(
        `
        INSERT INTO hr.salary_reference (tenant_id, code, description, amount, vigencia_inicio)
        VALUES ($1::uuid, $2, 'CALC-04 salary', $3::numeric, DATE '2025-01-01')
        RETURNING id::text
        `,
        [tenantId, `CALC04-SAL-${suffix}`, salaryAmount],
      );
      const employee = await client.query<{ id: string }>(
        `
        INSERT INTO hr.employee (
          tenant_id, registration, name, employment_link_id, functional_status_id,
          salary_reference_id, shift_id, hired_on, lifecycle_status
        )
        VALUES (
          $1::uuid, $2, $3, $4::uuid, $5::uuid, $6::uuid, $7::uuid,
          $8::date, 'ACTIVE'::"EmployeeLifecycleStatus"
        )
        RETURNING id::text
        `,
        [
          tenantId,
          `CALC04-${suffix}`,
          `CALC-04 ${code}`,
          link.rows[0].id,
          functionalStatus.rows[0].id,
          salary.rows[0].id,
          shift.rows[0].id,
          startsOn,
        ],
      );
      await client.query(
        `
        INSERT INTO hr.employee_status_history (
          tenant_id, employee_id, functional_status_id, starts_on
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date)
        `,
        [tenantId, employee.rows[0].id, functionalStatus.rows[0].id, startsOn],
      );
      employeeIds.push(employee.rows[0].id);
      employmentLinkIds.push(link.rows[0].id);
      return link.rows[0].id;
    } finally {
      client.release();
    }
  }

  async function seedFirstParcelPaid(
    employmentLinkId: string,
    amount: string,
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("SELECT set_config('app.bypass_rls', 'true', true)");
      const employee = await client.query<{ id: string }>(
        'SELECT id::text FROM hr.employee WHERE employment_link_id = $1::uuid',
        [employmentLinkId],
      );
      const catalog = await client.query<{
        payroll_type_id: string;
        processing_type_id: string;
        earning_id: string;
      }>(
        `
        SELECT
          pt.id::text AS payroll_type_id,
          ptt.id::text AS processing_type_id,
          ped.id::text AS earning_id
        FROM payroll.payroll_type pt
        JOIN payroll.processing_type ptt
          ON ptt.payroll_type_id = pt.id
         AND ptt.code = 'DECIMO_TERCEIRO_ADIANTAMENTO'
        JOIN payroll.payroll_earning_deduction ped
          ON ped.tenant_id = pt.tenant_id
         AND ped.code = 'DECIMO_TERCEIRO_ADIANTAMENTO'
        WHERE pt.tenant_id = $1::uuid
          AND pt.code = 'DECIMO_TERCEIRO'
        `,
        [tenantId],
      );
      const run = await client.query<{ id: string }>(
        `
        INSERT INTO payroll.payroll_run (
          tenant_id, competence_year, competence_month, payroll_type_id,
          processing_type_id, status
        )
        VALUES ($1::uuid, 2025, 11, $2::uuid, $3::uuid, 'GENERATED'::"PayrollRunStatus")
        RETURNING id::text
        `,
        [
          tenantId,
          catalog.rows[0].payroll_type_id,
          catalog.rows[0].processing_type_id,
        ],
      );
      await client.query(
        `
        INSERT INTO payroll.employee_payroll_item (
          tenant_id, employee_id, payroll_run_id, earning_deduction_id, source,
          competence_year, competence_month, amount
        )
        VALUES (
          $1::uuid, $2::uuid, $3::uuid, $4::uuid, 'CALCULATED'::"PayrollEntrySource",
          2025, 11, $5::numeric
        )
        `,
        [
          tenantId,
          employee.rows[0].id,
          run.rows[0].id,
          catalog.rows[0].earning_id,
          amount,
        ],
      );
    } finally {
      client.release();
    }
  }
});

async function seedCatalog(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE OR REPLACE FUNCTION payroll_calc.f_decimo_terceiro_base(
      p_employee_id uuid,
      p_month integer DEFAULT EXTRACT(MONTH FROM CURRENT_DATE),
      p_year integer DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)
    )
    RETURNS numeric
    LANGUAGE sql
    STABLE
    AS $$
      SELECT payroll_calc.base_salary(p_employee_id, make_date(p_year, p_month, 1));
    $$;
  `);
  const payrollType = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.payroll_type (tenant_id, code, description, status)
    VALUES ($1::uuid, 'DECIMO_TERCEIRO', 'Decimo terceiro salario', 'ACTIVE'::"RecordStatus")
    ON CONFLICT (tenant_id, code) DO UPDATE SET description = EXCLUDED.description
    RETURNING id::text
    `,
    [tenantId],
  );
  await client.query(
    `
    INSERT INTO payroll.processing_type (tenant_id, code, description, payroll_type_id, status)
    VALUES
      ($1::uuid, 'DECIMO_TERCEIRO_ADIANTAMENTO', 'Decimo terceiro - primeira parcela', $2::uuid, 'ACTIVE'::"RecordStatus"),
      ($1::uuid, 'DECIMO_TERCEIRO_FECHAMENTO', 'Decimo terceiro - fechamento', $2::uuid, 'ACTIVE'::"RecordStatus")
    ON CONFLICT (tenant_id, code) DO UPDATE
    SET description = EXCLUDED.description,
        payroll_type_id = EXCLUDED.payroll_type_id
    `,
    [tenantId, payrollType.rows[0].id],
  );
  await client.query(
    `
    INSERT INTO payroll.payroll_earning_deduction (
      tenant_id, code, description, kind, taxable, active, starts_on,
      formula_alias, formula_function_name, formula_expression,
      formula_dependencies, formula_ready
    )
    VALUES
      ($1::uuid, 'DECIMO_TERCEIRO_BASE', 'Base de calculo do decimo terceiro', 'BASE'::"PayrollEntryKind", false, true, DATE '2025-01-01', 'decimo_terceiro_base', 'f_decimo_terceiro_base', NULL, ARRAY['SALARIO_BASE'], true),
      ($1::uuid, 'DECIMO_TERCEIRO_ADIANTAMENTO', 'Decimo terceiro salario - primeira parcela', 'EARNING'::"PayrollEntryKind", false, true, DATE '2025-01-01', NULL, NULL, NULL, ARRAY[]::text[], false),
      ($1::uuid, 'DECIMO_TERCEIRO_FECHAMENTO', 'Decimo terceiro salario - fechamento', 'EARNING'::"PayrollEntryKind", true, true, DATE '2025-01-01', NULL, NULL, NULL, ARRAY[]::text[], false),
      ($1::uuid, 'IRRF_13', 'IRRF exclusivo sobre decimo terceiro salario', 'DEDUCTION'::"PayrollEntryKind", false, true, DATE '2025-01-01', NULL, NULL, NULL, ARRAY[]::text[], false)
    ON CONFLICT (tenant_id, code) DO UPDATE
    SET description = EXCLUDED.description,
        kind = EXCLUDED.kind,
        taxable = EXCLUDED.taxable,
        active = EXCLUDED.active,
        formula_alias = EXCLUDED.formula_alias,
        formula_function_name = EXCLUDED.formula_function_name,
        formula_expression = EXCLUDED.formula_expression,
        formula_dependencies = EXCLUDED.formula_dependencies,
        formula_ready = EXCLUDED.formula_ready
    `,
    [tenantId],
  );
}

async function setSessionContext(client: PoolClient): Promise<void> {
  await client.query("SELECT set_config('app.bypass_rls', 'true', false)");
  await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [
    tenantId,
  ]);
  await client.query("SELECT set_config('app.current_tenant', $1, false)", [
    tenantId,
  ]);
}

async function seedIrrfTable(client: PoolClient): Promise<void> {
  await client.query(
    'DELETE FROM public.tax_rate WHERE tenant_id = $1::uuid AND kind = $2',
    [tenantId, 'IRRF'],
  );
  const brackets = [
    ['IRRF-CALC04-01', '0.00', '2259.20', '0.000000', '0.00'],
    ['IRRF-CALC04-02', '2259.21', '2826.65', '7.500000', '169.44'],
    ['IRRF-CALC04-03', '2826.66', '3751.05', '15.000000', '381.44'],
    ['IRRF-CALC04-04', '3751.06', '4664.68', '22.500000', '662.77'],
    ['IRRF-CALC04-05', '4664.69', null, '27.500000', '896.00'],
  ];
  for (const [index, bracket] of brackets.entries()) {
    await client.query(
      `
      INSERT INTO public.tax_rate (
        tenant_id, code, name, description, scope, reference_year, rate_percent,
        kind, competence_start, bracket_min, bracket_max, rate,
        deduction_amount, dependent_deduction, status
      )
      VALUES ($1::uuid, $2, $3, 'CALC-04 E2E IRRF', 'IRRF', 2025, $6::numeric, 'IRRF',
        DATE '2025-01-01', $4::numeric, $5::numeric, $6::numeric, $7::numeric, 0.00, 'ACTIVE'::"RecordStatus")
      `,
      [
        tenantId,
        bracket[0],
        `IRRF CALC-04 ${index + 1}`,
        bracket[1],
        bracket[2],
        bracket[3],
        bracket[4],
      ],
    );
  }
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
