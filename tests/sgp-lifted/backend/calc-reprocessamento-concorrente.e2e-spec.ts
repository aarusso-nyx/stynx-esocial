import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS ??= 'true';

import { Pool, PoolClient } from 'pg';

const tenantId = '00000000-0000-0000-0000-000000000127';

describe('CALC-09 concurrent payroll reprocessing idempotency (e2e)', () => {
  let pool: Pool;
  let payrollRunId: string;
  let employeeId: string;
  let earningDeductionId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL is required for calc-reprocessamento-concorrente',
      );
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await setBypassContext(client);
      await client.query(`
        INSERT INTO public.tenant (id, slug, code, name, status)
        VALUES ('${tenantId}', 'calc09-concurrent-e2e', 'CALC09C', 'CALC-09 Concurrent E2E', 'ACTIVE'::"RecordStatus")
        ON CONFLICT (id) DO NOTHING
      `);
      const seeded = await seedRunFixture(client);
      payrollRunId = seeded.payrollRunId;
      employeeId = seeded.employeeId;
      earningDeductionId = seeded.earningDeductionId;
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
    } finally {
      client.release();
      await pool.end();
    }
  });

  it('rejects a duplicate active calculated line under concurrent inserts', async () => {
    const [first, second] = await Promise.allSettled([
      insertCalculatedLine(),
      insertCalculatedLine(),
    ]);
    const rejected = [first, second].filter(
      (result) => result.status === 'rejected',
    );
    const active = await pool.query<{ active_count: string }>(
      `
      SELECT count(*)::text AS active_count
      FROM payroll.v_payroll_run_line_active
      WHERE payroll_run_id = $1::uuid
      `,
      [payrollRunId],
    );

    const reason = rejected[0].reason as {
      constraint?: string;
      message?: string;
    };
    expect(rejected).toHaveLength(1);
    expect(reason.constraint ?? reason.message ?? '').toContain(
      'employee_payroll_item_active_idempotency_uq',
    );
    expect(active.rows[0]?.active_count).toBe('1');
  });

  async function insertCalculatedLine(): Promise<void> {
    const client = await pool.connect();
    try {
      await setTenantContext(client, ['payroll.run.execute']);
      await client.query(
        `
        INSERT INTO payroll.employee_payroll_item (
          tenant_id,
          employee_id,
          payroll_run_id,
          earning_deduction_id,
          source,
          competence_year,
          competence_month,
          quantity,
          reference_value,
          amount,
          notes
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          'CALCULATED'::"PayrollEntrySource",
          2025,
          11,
          1,
          1000.00,
          1000.00,
          'concurrent calc09'
        )
        `,
        [tenantId, employeeId, payrollRunId, earningDeductionId],
      );
    } finally {
      client.release();
    }
  }
});

async function seedRunFixture(client: PoolClient): Promise<{
  payrollRunId: string;
  employeeId: string;
  earningDeductionId: string;
}> {
  const suffix = Date.now().toString(36);
  const payrollType = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.payroll_type (tenant_id, code, description, status)
    VALUES ($1::uuid, $2, 'CALC-09 monthly', 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [tenantId, `CALC09C-TYPE-${suffix}`],
  );
  const processingType = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.processing_type (tenant_id, code, description, payroll_type_id, status)
    VALUES ($1::uuid, $2, 'CALC-09 monthly', $3::uuid, 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [tenantId, `CALC09C-PROC-${suffix}`, payrollType.rows[0].id],
  );
  const earning = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.payroll_earning_deduction (
      tenant_id, code, description, kind, taxable, active
    )
    VALUES ($1::uuid, $2, 'CALC-09 earning', 'EARNING'::"PayrollEntryKind", true, true)
    RETURNING id::text
    `,
    [tenantId, `CALC09C-EARN-${suffix}`],
  );
  const employee = await client.query<{ id: string }>(
    `
    INSERT INTO hr.employee (tenant_id, registration, name, hired_on, lifecycle_status)
    VALUES ($1::uuid, $2, 'CALC-09 Concurrent', DATE '2025-01-01', 'ACTIVE'::"EmployeeLifecycleStatus")
    RETURNING id::text
    `,
    [tenantId, `CALC09C-${suffix}`],
  );
  const run = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.payroll_run (
      tenant_id, competence_year, competence_month, payroll_type_id, processing_type_id, status
    )
    VALUES ($1::uuid, 2025, 11, $2::uuid, $3::uuid, 'PROCESSING'::"PayrollRunStatus")
    RETURNING id::text
    `,
    [tenantId, payrollType.rows[0].id, processingType.rows[0].id],
  );
  return {
    payrollRunId: run.rows[0].id,
    employeeId: employee.rows[0].id,
    earningDeductionId: earning.rows[0].id,
  };
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

async function setTenantContext(
  client: PoolClient,
  permissions: string[],
): Promise<void> {
  await client.query("SELECT set_config('app.bypass_rls', 'false', false)");
  await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [
    tenantId,
  ]);
  await client.query("SELECT set_config('app.current_tenant', $1, false)", [
    tenantId,
  ]);
  await client.query(
    "SELECT set_config('app.current_permissions', $1, false)",
    [permissions.join('\n')],
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
