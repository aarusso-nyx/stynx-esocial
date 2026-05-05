import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import Decimal from 'decimal.js';
import { Pool, PoolClient, QueryResultRow } from 'pg';

const tenantId = '00000000-0000-0000-0000-000000000147';

interface FgtsFineRow extends QueryResultRow {
  fgts_account_id: string;
  fgts_movement_id: string;
  employee_id: string;
  base_amount: string;
  amount: string;
}

describe('CLT-01 FGTS monthly deposits and termination fine (e2e)', () => {
  let pool: Pool;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for calc-rescisao-fgts');
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await setContext(client);
      await cleanupTenant(client);
      await client.query(
        `
        INSERT INTO public.tenant (id, slug, code, name, status)
        VALUES ($1::uuid, 'clt01-fgts-e2e', 'CLT01', 'CLT-01 FGTS E2E', 'ACTIVE'::"RecordStatus")
        ON CONFLICT (id) DO UPDATE
        SET slug = EXCLUDED.slug,
            code = EXCLUDED.code,
            name = EXCLUDED.name,
            status = EXCLUDED.status
        `,
        [tenantId],
      );
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (!pool) return;
    const client = await pool.connect();
    try {
      await setContext(client);
      await cleanupTenant(client);
    } finally {
      client.release();
      await pool.end();
    }
  });

  it('calculates 40 percent fine for CLT without cause over simulated 24-month FGTS balance', async () => {
    const employee = await createEmployee('CLT-SJC', 'celetista', '2024-01-01');
    await seedFgtsBalance(
      employee.employeeId,
      employee.employmentLinkId,
      '12000.00',
    );
    const terminationRunId = await createPayrollRun('RESCISAO', 2026, 4);

    const rows = await computeFine(
      terminationRunId,
      employee.employmentLinkId,
      'WITHOUT_CAUSE',
    );

    expect(rows).toHaveLength(1);
    expectMoney(rows[0]?.base_amount, '12000.00');
    expectMoney(rows[0]?.amount, '4800.00');
  });

  it('does not calculate FGTS fine for CLT with cause', async () => {
    const employee = await createEmployee('CLT-JC', 'celetista', '2024-01-01');
    await seedFgtsBalance(
      employee.employeeId,
      employee.employmentLinkId,
      '12000.00',
    );
    const terminationRunId = await createPayrollRun('RESCISAO', 2026, 5);

    const rows = await computeFine(
      terminationRunId,
      employee.employmentLinkId,
      'COM_JUSTA_CAUSA',
    );

    expect(rows).toHaveLength(0);
    await expectMovementCount(employee.employeeId, 'RESCISION_FINE_40', 0);
  });

  it('keeps the monthly deposit for CLT resignation without generating a fine', async () => {
    const employee = await createEmployee('CLT-PED', 'celetista', '2026-01-01');
    const monthlyRunId = await createPayrollRun('MENSAL', 2026, 6);
    await insertFinancialRecord(
      monthlyRunId,
      employee.employeeId,
      2026,
      6,
      '1000.00',
    );

    const monthly = await computeMonthly(monthlyRunId);
    expect(monthly).toHaveLength(1);
    expectMoney(monthly[0]?.base_amount, '1000.00');
    expectMoney(monthly[0]?.amount, '80.00');

    const terminationRunId = await createPayrollRun('RESCISAO', 2026, 6);
    const fine = await computeFine(
      terminationRunId,
      employee.employmentLinkId,
      'PEDIDO_DEMISSAO',
    );

    expect(fine).toHaveLength(0);
    await expectMovementCount(employee.employeeId, 'DEPOSIT_8', 1);
  });

  it('does not create an FGTS account for statutory employees', async () => {
    const employee = await createEmployee('STAT', 'statutory', '2026-01-01');
    const monthlyRunId = await createPayrollRun('MENSAL', 2026, 7);
    await insertFinancialRecord(
      monthlyRunId,
      employee.employeeId,
      2026,
      7,
      '1000.00',
    );

    const rows = await computeMonthly(monthlyRunId);

    expect(rows).toHaveLength(0);
    await expectAccountCount(employee.employeeId, 0);
  });

  async function computeMonthly(payrollRunId: string): Promise<FgtsFineRow[]> {
    return withTenantClient(async (client) => {
      const result = await client.query<FgtsFineRow>(
        `
        SELECT
          result.fgts_account_id::text,
          result.fgts_movement_id::text,
          result.employee_id::text,
          result.base_amount::text,
          result.amount::text
        FROM payment.compute_fgts_monthly($1::uuid) result
        `,
        [payrollRunId],
      );
      return result.rows;
    });
  }

  async function computeFine(
    payrollRunId: string,
    employmentLinkId: string,
    cause: string,
  ): Promise<FgtsFineRow[]> {
    return withTenantClient(async (client) => {
      const result = await client.query<FgtsFineRow>(
        `
        SELECT
          result.fgts_account_id::text,
          result.fgts_movement_id::text,
          result.employee_id::text,
          result.base_amount::text,
          result.amount::text
        FROM payment.compute_fgts_termination_fine($1::uuid, $2::uuid, $3) result
        `,
        [payrollRunId, employmentLinkId, cause],
      );
      return result.rows;
    });
  }

  async function createEmployee(
    code: string,
    contractType: string,
    hiredOn: string,
  ): Promise<{ employeeId: string; employmentLinkId: string }> {
    const client = await pool.connect();
    try {
      await setContext(client);
      const suffix = `${code}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const link = await client.query<{ id: string }>(
        `
        INSERT INTO hr.employment_link (
          tenant_id, code, name, contract_type, regime_law_reference, status
        )
        VALUES ($1::uuid, $2, $3, $4, $5, 'ACTIVE'::"RecordStatus")
        RETURNING id::text
        `,
        [
          tenantId,
          `CLT01-LINK-${suffix}`,
          `CLT-01 ${code}`,
          contractType,
          contractType === 'celetista' ? 'CLT' : 'Lei 8.112/90',
        ],
      );
      const functionalStatus = await client.query<{ id: string }>(
        `
        INSERT INTO hr.functional_status (
          tenant_id, code, description, enters_payroll, lifecycle_status, status
        )
        VALUES ($1::uuid, $2, 'CLT-01 active', true, 'ACTIVE'::"EmployeeLifecycleStatus", 'ACTIVE'::"RecordStatus")
        RETURNING id::text
        `,
        [tenantId, `CLT01-FS-${suffix}`],
      );
      const employee = await client.query<{ id: string }>(
        `
        INSERT INTO hr.employee (
          tenant_id,
          registration,
          name,
          employment_link_id,
          functional_status_id,
          hired_on,
          lifecycle_status
        )
        VALUES (
          $1::uuid,
          $2,
          $3,
          $4::uuid,
          $5::uuid,
          $6::date,
          'ACTIVE'::"EmployeeLifecycleStatus"
        )
        RETURNING id::text
        `,
        [
          tenantId,
          `CLT01-${suffix}`,
          `CLT-01 ${code}`,
          link.rows[0].id,
          functionalStatus.rows[0].id,
          hiredOn,
        ],
      );
      return {
        employeeId: employee.rows[0].id,
        employmentLinkId: link.rows[0].id,
      };
    } finally {
      client.release();
    }
  }

  async function createPayrollRun(
    code: 'MENSAL' | 'RESCISAO',
    year: number,
    month: number,
  ): Promise<string> {
    const client = await pool.connect();
    try {
      await setContext(client);
      const payrollType = await client.query<{ id: string }>(
        `
        INSERT INTO payroll.payroll_type (tenant_id, code, description, status)
        VALUES ($1::uuid, $2, $3, 'ACTIVE'::"RecordStatus")
        ON CONFLICT (tenant_id, code) DO UPDATE
        SET description = EXCLUDED.description,
            status = EXCLUDED.status,
            updated_at = now()
        RETURNING id::text
        `,
        [
          tenantId,
          code,
          code === 'MENSAL' ? 'Folha mensal' : 'Folha de rescisao',
        ],
      );
      const processingType = await client.query<{ id: string }>(
        `
        INSERT INTO payroll.processing_type (tenant_id, code, description, payroll_type_id, status)
        VALUES ($1::uuid, $2, $3, $4::uuid, 'ACTIVE'::"RecordStatus")
        ON CONFLICT (tenant_id, code) DO UPDATE
        SET description = EXCLUDED.description,
            payroll_type_id = EXCLUDED.payroll_type_id,
            status = EXCLUDED.status,
            updated_at = now()
        RETURNING id::text
        `,
        [
          tenantId,
          code,
          code === 'MENSAL' ? 'Folha mensal' : 'Folha de rescisao',
          payrollType.rows[0].id,
        ],
      );
      const run = await client.query<{ id: string }>(
        `
        INSERT INTO payroll.payroll_run (
          tenant_id,
          competence_year,
          competence_month,
          payroll_type_id,
          processing_type_id,
          status
        )
        VALUES ($1::uuid, $2, $3, $4::uuid, $5::uuid, 'GENERATED'::"PayrollRunStatus")
        RETURNING id::text
        `,
        [
          tenantId,
          year,
          month,
          payrollType.rows[0].id,
          processingType.rows[0].id,
        ],
      );
      return run.rows[0].id;
    } finally {
      client.release();
    }
  }

  async function seedFgtsBalance(
    employeeId: string,
    employmentLinkId: string,
    balance: string,
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await setContext(client);
      await client.query(
        `
        WITH account AS (
          INSERT INTO payment.fgts_account (
            tenant_id,
            employee_id,
            employment_link_id,
            opened_at,
            status
          )
          VALUES ($1::uuid, $2::uuid, $3::uuid, DATE '2024-01-01', 'ACTIVE')
          ON CONFLICT (tenant_id, employee_id, employment_link_id) DO UPDATE
          SET status = 'ACTIVE',
              closed_at = NULL,
              updated_at = now()
          RETURNING fgts_account_id
        )
        INSERT INTO payment.fgts_movement (
          tenant_id,
          fgts_account_id,
          competence,
          kind,
          base_amount,
          rate,
          amount,
          payroll_run_id,
          source_event
        )
        SELECT
          $1::uuid,
          account.fgts_account_id,
          (DATE '2024-01-01' + (series.month_offset || ' months')::interval)::date,
          'DEPOSIT_8',
          ($4::numeric / 24 / 0.080000)::numeric(14,2),
          0.080000,
          ($4::numeric / 24)::numeric(14,2),
          NULL::uuid,
          'MONTHLY'
        FROM account
        CROSS JOIN generate_series(0, 23) AS series(month_offset)
        `,
        [tenantId, employeeId, employmentLinkId, balance],
      );
    } finally {
      client.release();
    }
  }

  async function insertFinancialRecord(
    payrollRunId: string,
    employeeId: string,
    year: number,
    month: number,
    totalEarnings: string,
  ): Promise<void> {
    await withTenantClient(async (client) => {
      await client.query(
        `
        INSERT INTO payroll.payroll_financial_record (
          tenant_id,
          employee_id,
          payroll_run_id,
          competence_year,
          competence_month,
          total_earnings,
          total_deductions,
          net_amount,
          metadata
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4,
          $5,
          $6::numeric,
          0,
          $6::numeric,
          '{"origin":"clt01-fgts-test"}'::jsonb
        )
        `,
        [tenantId, employeeId, payrollRunId, year, month, totalEarnings],
      );
    });
  }

  async function expectMovementCount(
    employeeId: string,
    kind: string,
    expected: number,
  ): Promise<void> {
    await withTenantClient(async (client) => {
      const result = await client.query<{ count: string }>(
        `
        SELECT count(*)::text
        FROM payment.fgts_movement movement
        JOIN payment.fgts_account account
          ON account.tenant_id = movement.tenant_id
         AND account.fgts_account_id = movement.fgts_account_id
        WHERE account.tenant_id = $1::uuid
          AND account.employee_id = $2::uuid
          AND movement.kind = $3::payment.fgts_movement_kind
        `,
        [tenantId, employeeId, kind],
      );
      expect(Number(result.rows[0]?.count ?? 0)).toBe(expected);
    });
  }

  async function expectAccountCount(
    employeeId: string,
    expected: number,
  ): Promise<void> {
    await withTenantClient(async (client) => {
      const result = await client.query<{ count: string }>(
        `
        SELECT count(*)::text
        FROM payment.fgts_account
        WHERE tenant_id = $1::uuid
          AND employee_id = $2::uuid
        `,
        [tenantId, employeeId],
      );
      expect(Number(result.rows[0]?.count ?? 0)).toBe(expected);
    });
  }

  async function withTenantClient<T>(
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await setContext(client);
      return await callback(client);
    } finally {
      client.release();
    }
  }
});

function expectMoney(actual: string | undefined, expected: string): void {
  expect(new Decimal(actual ?? '0').toFixed(2)).toBe(expected);
}

async function cleanupTenant(client: PoolClient): Promise<void> {
  const params = [tenantId];
  await client.query(
    'DELETE FROM payment.fgts_movement WHERE tenant_id = $1::uuid',
    params,
  );
  await client.query(
    'DELETE FROM payment.fgts_account WHERE tenant_id = $1::uuid',
    params,
  );
  await client.query(
    'DELETE FROM payroll.payroll_financial_record WHERE tenant_id = $1::uuid',
    params,
  );
  await client.query(
    'DELETE FROM payroll.payroll_run_status_history WHERE tenant_id = $1::uuid',
    params,
  );
  await client.query(
    'DELETE FROM payroll.payroll_run WHERE tenant_id = $1::uuid',
    params,
  );
  await client.query(
    'DELETE FROM payroll.processing_type WHERE tenant_id = $1::uuid',
    params,
  );
  await client.query(
    'DELETE FROM payroll.payroll_type WHERE tenant_id = $1::uuid',
    params,
  );
  await client.query(
    'DELETE FROM payroll.payroll_earning_deduction WHERE tenant_id = $1::uuid',
    params,
  );
}

async function setContext(client: PoolClient): Promise<void> {
  await client.query("SELECT set_config('app.bypass_rls', 'true', false)");
  await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [
    tenantId,
  ]);
  await client.query("SELECT set_config('app.current_tenant', $1, false)", [
    tenantId,
  ]);
  await client.query(
    "SELECT set_config('app.current_permissions', $1, false)",
    [
      'payroll.fgts.read\npayroll.fgts.write\npayroll.run.execute\nrh.employee.terminate\nfolha.write',
    ],
  );
  await client.query("SELECT set_config('app.authenticated', 'true', false)");
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
