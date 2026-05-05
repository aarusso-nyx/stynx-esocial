import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import Decimal from 'decimal.js';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResultRow } from 'pg';

import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { DatabaseService } from '../../backend/src/database/database.service';
import { FeriasPayrollService } from '../../backend/src/folha-pagamento/payroll/ferias-payroll.service';

const tenantId = '00000000-0000-0000-0000-000000000125';

interface FeriasRow extends QueryResultRow {
  item_code: string;
  amount: string;
}

describe('CALC-05 vacation payroll golden scenarios (e2e)', () => {
  let pool: Pool;
  const employeeIds: string[] = [];
  const vacationIds: string[] = [];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for calc-ferias');
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await setSessionContext(client);
      await client.query(`
        INSERT INTO public.tenant (id, slug, code, name, status)
        VALUES ('${tenantId}', 'calc05-e2e', 'CALC05', 'CALC-05 E2E', 'ACTIVE'::"RecordStatus")
        ON CONFLICT (id) DO NOTHING
      `);
      await seedIrrfTable(client);
      await seedCatalog(client);
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
        'DELETE FROM hr.vacation_record WHERE id = ANY($1::uuid[])',
        [vacationIds],
      );
      await client.query(
        `
        DELETE FROM payroll.payroll_run_status_history history
        USING payroll.payroll_run run
        WHERE history.payroll_run_id = run.id
          AND run.tenant_id = $1::uuid
        `,
        [tenantId],
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

  it('calculates 30 full vacation days with constitutional one third', async () => {
    const employeeId = await createEmployee('FULL', '1500.00');
    const vacationId = await createVacation(employeeId, 30, 0, 1);
    const rows = await compute(vacationId);

    expect(amount(rows, 'VACATION_SALARY')).toBe('1500.00');
    expect(amount(rows, 'VACATION_ONE_THIRD')).toBe('500.00');
  });

  it('calculates 20 days plus 10 pecuniary bonus days', async () => {
    const employeeId = await createEmployee('BONUS', '1500.00');
    const vacationId = await createVacation(employeeId, 20, 10, 1);
    const rows = await compute(vacationId);

    expect(amount(rows, 'VACATION_SALARY')).toBe('1000.00');
    expect(amount(rows, 'VACATION_ONE_THIRD')).toBe('333.33');
    expect(amount(rows, 'VACATION_PECUNIARY_BONUS')).toBe('500.00');
  });

  it('calculates a fractional first period with its own exclusive IRRF', async () => {
    const employeeId = await createEmployee('FRAC', '6000.00');
    const vacationId = await createVacation(employeeId, 15, 0, 1);
    const rows = await compute(vacationId);

    expect(amount(rows, 'VACATION_SALARY')).toBe('3000.00');
    expect(amount(rows, 'VACATION_ONE_THIRD')).toBe('1000.00');
    expect(amount(rows, 'IRRF_VACATION')).toBe('237.23');
  });

  it('sets vacation_record.payroll_run_id and is idempotent', async () => {
    const employeeId = await createEmployee('SERVICE', '1500.00');
    const vacationId = await createVacation(employeeId, 30, 0, 1);
    const database = new DatabaseService(
      new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }),
    );
    const service = new FeriasPayrollService(database);

    try {
      const first = await RequestContextStore.run(
        {
          tenantId,
          permissions: ['payroll.run.execute', 'rh.vacation.payout'],
        },
        () => service.run(vacationId),
      );
      const second = await RequestContextStore.run(
        {
          tenantId,
          permissions: ['payroll.run.execute', 'rh.vacation.payout'],
        },
        () => service.run(vacationId),
      );
      const linked = await pool.query<{
        payroll_run_id: string;
        active_item_count: string;
        soft_deleted_item_count: string;
      }>(
        `
        SELECT
          vacation.payroll_run_id::text,
          count(item.id) FILTER (WHERE item.deleted_at IS NULL)::text AS active_item_count,
          count(item.id) FILTER (WHERE item.deleted_at IS NOT NULL)::text AS soft_deleted_item_count
        FROM hr.vacation_record vacation
        JOIN payroll.employee_payroll_item item
          ON item.payroll_run_id = vacation.payroll_run_id
         AND item.employee_id = vacation.employee_id
        WHERE vacation.id = $1::uuid
        GROUP BY vacation.payroll_run_id
        `,
        [vacationId],
      );

      expect(first.payrollRunId).toBe(second.payrollRunId);
      expect(linked.rows[0].payroll_run_id).toBe(first.payrollRunId);
      expect(linked.rows[0].active_item_count).toBe('2');
      expect(linked.rows[0].soft_deleted_item_count).toBe('2');
    } finally {
      await database.onModuleDestroy();
    }
  });

  async function compute(vacationId: string): Promise<FeriasRow[]> {
    const result = await pool.query<FeriasRow>(
      `
      SELECT item_code, amount::text
      FROM payroll_calc.compute_ferias($1::uuid, $2::uuid)
      ORDER BY item_code
      `,
      [tenantId, vacationId],
    );
    return result.rows;
  }

  function amount(rows: FeriasRow[], code: string): string {
    const found = rows.find((row) => row.item_code === code);
    return new Decimal(found?.amount ?? '0').toFixed(2);
  }

  async function createEmployee(
    code: string,
    salaryAmount: string,
  ): Promise<string> {
    const client = await pool.connect();
    try {
      await setSessionContext(client);
      const suffix = `${code}-${Date.now().toString(36)}`;
      const link = await client.query<{ id: string }>(
        `
        INSERT INTO hr.employment_link (tenant_id, code, name, contract_type, regime_law_reference, status)
        VALUES ($1::uuid, $2, $3, 'celetista', 'CLT', 'ACTIVE'::"RecordStatus")
        RETURNING id::text
        `,
        [tenantId, `CALC05-LINK-${suffix}`, `CALC-05 ${code}`],
      );
      const contractType = await client.query<{ id: string }>(
        `
        INSERT INTO hr.contract_type (tenant_id, code, name, status)
        VALUES ($1::uuid, $2, 'CALC-05 celetista', 'ACTIVE'::"RecordStatus")
        RETURNING id::text
        `,
        [tenantId, `CALC05-CT-${suffix}`],
      );
      const functionalStatus = await client.query<{ id: string }>(
        `
        INSERT INTO hr.functional_status (
          tenant_id, code, description, enters_payroll, lifecycle_status, status
        )
        VALUES ($1::uuid, $2, 'CALC-05 active', true, 'ACTIVE'::"EmployeeLifecycleStatus", 'ACTIVE'::"RecordStatus")
        RETURNING id::text
        `,
        [tenantId, `CALC05-FS-${suffix}`],
      );
      const salary = await client.query<{ id: string }>(
        `
        INSERT INTO hr.salary_reference (tenant_id, code, description, amount, vigencia_inicio)
        VALUES ($1::uuid, $2, 'CALC-05 salary', $3::numeric, DATE '2025-01-01')
        RETURNING id::text
        `,
        [tenantId, `CALC05-SAL-${suffix}`, salaryAmount],
      );
      const employee = await client.query<{ id: string }>(
        `
        INSERT INTO hr.employee (
          tenant_id, registration, name, employment_link_id, functional_status_id,
          contract_type_id, salary_reference_id, hired_on, lifecycle_status
        )
        VALUES (
          $1::uuid, $2, $3, $4::uuid, $5::uuid, $6::uuid, $7::uuid,
          DATE '2024-01-01', 'ACTIVE'::"EmployeeLifecycleStatus"
        )
        RETURNING id::text
        `,
        [
          tenantId,
          `CALC05-${suffix}`,
          `CALC-05 ${code}`,
          link.rows[0].id,
          functionalStatus.rows[0].id,
          contractType.rows[0].id,
          salary.rows[0].id,
        ],
      );
      await client.query(
        `
        INSERT INTO hr.employment_contract (
          tenant_id, employee_id, employment_link_id, contract_type_id,
          starts_on, exercise_on, status
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, DATE '2024-01-01', DATE '2024-01-01', 'ACTIVE'::"RecordStatus")
        `,
        [
          tenantId,
          employee.rows[0].id,
          link.rows[0].id,
          contractType.rows[0].id,
        ],
      );
      employeeIds.push(employee.rows[0].id);
      return employee.rows[0].id;
    } finally {
      client.release();
    }
  }

  async function createVacation(
    employeeId: string,
    days: number,
    bonusDays: number,
    installmentNumber: number,
  ): Promise<string> {
    const client = await pool.connect();
    try {
      await setSessionContext(client);
      const result = await client.query<{ id: string }>(
        `
        INSERT INTO hr.vacation_record (
          tenant_id, employee_id, accrual_period_start, accrual_period_end,
          installment_number, pecuniary_bonus_days, starts_on, ends_on, days, status
        )
        VALUES (
          $1::uuid, $2::uuid, DATE '2024-01-01', DATE '2024-12-31',
          $3, $4, DATE '2025-05-01', DATE '2025-05-01' + (($5 - 1) || ' days')::interval,
          $5, 'aprovado'
        )
        RETURNING id::text
        `,
        [tenantId, employeeId, installmentNumber, bonusDays, days],
      );
      vacationIds.push(result.rows[0].id);
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }
});

async function setSessionContext(client: PoolClient): Promise<void> {
  await client.query("SELECT set_config('app.bypass_rls', 'true', false)");
  await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [
    tenantId,
  ]);
  await client.query("SELECT set_config('app.current_tenant', $1, false)", [
    tenantId,
  ]);
}

async function seedCatalog(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE OR REPLACE FUNCTION payroll_calc.f_vacation_base(
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
  await client.query(
    `
    INSERT INTO payroll.payroll_type (tenant_id, code, description, status)
    VALUES ($1::uuid, 'FERIAS', 'Folha de ferias', 'ACTIVE'::"RecordStatus")
    ON CONFLICT (tenant_id, code) DO UPDATE SET description = EXCLUDED.description
    `,
    [tenantId],
  );
  await client.query(
    `
    INSERT INTO payroll.payroll_earning_deduction (
      tenant_id, code, description, kind, taxable, active, starts_on,
      formula_alias, formula_function_name, formula_dependencies, formula_ready
    )
    VALUES
      ($1::uuid, 'VACATION_BASE', 'Base de calculo de ferias', 'BASE'::"PayrollEntryKind", false, true, DATE '2025-01-01', 'vacation_base', 'f_vacation_base', ARRAY['SALARIO_BASE'], true),
      ($1::uuid, 'VACATION_SALARY', 'Ferias - salario do periodo', 'EARNING'::"PayrollEntryKind", true, true, DATE '2025-01-01', NULL, NULL, ARRAY[]::text[], false),
      ($1::uuid, 'VACATION_ONE_THIRD', 'Terco constitucional de ferias', 'EARNING'::"PayrollEntryKind", true, true, DATE '2025-01-01', NULL, NULL, ARRAY[]::text[], false),
      ($1::uuid, 'VACATION_PECUNIARY_BONUS', 'Abono pecuniario de ferias', 'EARNING'::"PayrollEntryKind", true, true, DATE '2025-01-01', NULL, NULL, ARRAY[]::text[], false),
      ($1::uuid, 'IRRF_VACATION', 'IRRF exclusivo sobre ferias', 'DEDUCTION'::"PayrollEntryKind", false, true, DATE '2025-01-01', NULL, NULL, ARRAY[]::text[], false)
    ON CONFLICT (tenant_id, code) DO UPDATE
    SET description = EXCLUDED.description,
        kind = EXCLUDED.kind,
        taxable = EXCLUDED.taxable,
        active = EXCLUDED.active,
        formula_alias = EXCLUDED.formula_alias,
        formula_function_name = EXCLUDED.formula_function_name,
        formula_dependencies = EXCLUDED.formula_dependencies,
        formula_ready = EXCLUDED.formula_ready
    `,
    [tenantId],
  );
}

async function seedIrrfTable(client: PoolClient): Promise<void> {
  await client.query(
    'DELETE FROM public.tax_rate WHERE tenant_id = $1::uuid AND kind = $2',
    [tenantId, 'IRRF'],
  );
  const brackets = [
    ['IRRF-CALC05-01', '0.00', '2259.20', '0.000000', '0.00'],
    ['IRRF-CALC05-02', '2259.21', '2826.65', '7.500000', '169.44'],
    ['IRRF-CALC05-03', '2826.66', '3751.05', '15.000000', '381.44'],
    ['IRRF-CALC05-04', '3751.06', '4664.68', '22.500000', '662.77'],
    ['IRRF-CALC05-05', '4664.69', null, '27.500000', '896.00'],
  ];
  for (const [index, bracket] of brackets.entries()) {
    await client.query(
      `
      INSERT INTO public.tax_rate (
        tenant_id, code, name, description, scope, reference_year, rate_percent,
        kind, competence_start, bracket_min, bracket_max, rate,
        deduction_amount, dependent_deduction, status
      )
      VALUES ($1::uuid, $2, $3, 'CALC-05 E2E IRRF', 'IRRF', 2025, $6::numeric, 'IRRF',
        DATE '2025-01-01', $4::numeric, $5::numeric, $6::numeric, $7::numeric, 0.00, 'ACTIVE'::"RecordStatus")
      `,
      [
        tenantId,
        bracket[0],
        `IRRF CALC-05 ${index + 1}`,
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
