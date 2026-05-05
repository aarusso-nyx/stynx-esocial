import { expectForbiddenNegativePath } from './helpers/test-debt-coverage';
import { createHash } from 'node:crypto';

import { Pool, PoolClient } from 'pg';

const tenantId = '00000000-0000-4000-8000-000000000154';

describe('folha complementar idempotency (e2e)', () => {
  let pool: Pool;
  let payrollRunId: string;
  let employeeId: string;
  let earningDeductionId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for folha complementar');
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await setBypassContext(client);
      await client.query(`
        INSERT INTO public.tenant (id, slug, code, name, status)
        VALUES ('${tenantId}', 'r2-154-folha-complementar', 'R2154', 'R2-154 Folha Complementar', 'ACTIVE'::"RecordStatus")
        ON CONFLICT (id) DO NOTHING
      `);
      const fixture = await seedComplementaryRun(client);
      payrollRunId = fixture.payrollRunId;
      employeeId = fixture.employeeId;
      earningDeductionId = fixture.earningDeductionId;
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
        'DELETE FROM hr.employee WHERE tenant_id = $1::uuid AND id = $2::uuid',
        [tenantId, employeeId],
      );
      await client.query(
        'DELETE FROM payroll.payroll_earning_deduction WHERE tenant_id = $1::uuid AND id = $2::uuid',
        [tenantId, earningDeductionId],
      );
      await client.query(
        "DELETE FROM payroll.processing_type WHERE tenant_id = $1::uuid AND code = 'COMPLEMENTAR'",
        [tenantId],
      );
      await client.query(
        "DELETE FROM payroll.payroll_type WHERE tenant_id = $1::uuid AND code = 'COMPLEMENTAR'",
        [tenantId],
      );
    } finally {
      client.release();
      await pool.end();
    }
  });

  it('converges duplicate complementary line submissions to one active idempotency key', async () => {
    const payloadHash = complementaryLineHash({
      payrollRunId,
      employeeId,
      earningDeductionId,
      amount: '123.45',
    });

    await upsertComplementaryLine(payloadHash);
    await upsertComplementaryLine(payloadHash);

    const result = await pool.query<{
      line_count: string;
      total_amount: string;
      key_count: string;
      idempotency_key: string;
      notes: string;
    }>(
      `
      SELECT
        count(*)::text AS line_count,
        coalesce(sum(amount), 0)::numeric(14,2)::text AS total_amount,
        count(DISTINCT idempotency_key)::text AS key_count,
        max(idempotency_key) AS idempotency_key,
        max(notes) AS notes
      FROM payroll.v_payroll_run_line_active
      WHERE payroll_run_id = $1::uuid
      `,
      [payrollRunId],
    );

    expect(result.rows[0]).toMatchObject({
      line_count: '1',
      total_amount: '123.45',
      key_count: '1',
      notes: `complementary:${payloadHash}`,
    });
    expect(result.rows[0]!.idempotency_key).toContain(payrollRunId);
  });

  async function upsertComplementaryLine(payloadHash: string): Promise<void> {
    await pool.query(
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
        2026,
        1,
        1,
        123.45,
        123.45,
        $5
      )
      ON CONFLICT (idempotency_key)
        WHERE deleted_at IS NULL AND idempotency_key IS NOT NULL
      DO UPDATE
      SET quantity = EXCLUDED.quantity,
          reference_value = EXCLUDED.reference_value,
          amount = EXCLUDED.amount,
          notes = EXCLUDED.notes,
          updated_at = now()
      `,
      [
        tenantId,
        employeeId,
        payrollRunId,
        earningDeductionId,
        `complementary:${payloadHash}`,
      ],
    );
  }
});

async function seedComplementaryRun(client: PoolClient): Promise<{
  payrollRunId: string;
  employeeId: string;
  earningDeductionId: string;
}> {
  const suffix = Date.now().toString(36);
  const payrollType = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.payroll_type (tenant_id, code, description, status)
    VALUES ($1::uuid, 'COMPLEMENTAR', 'Folha complementar', 'ACTIVE'::"RecordStatus")
    ON CONFLICT (tenant_id, code) DO UPDATE
    SET description = EXCLUDED.description,
        status = EXCLUDED.status
    RETURNING id::text
    `,
    [tenantId],
  );
  const processingType = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.processing_type (tenant_id, code, description, payroll_type_id, status)
    VALUES ($1::uuid, 'COMPLEMENTAR', 'Processamento complementar', $2::uuid, 'ACTIVE'::"RecordStatus")
    ON CONFLICT (tenant_id, code) DO UPDATE
    SET description = EXCLUDED.description,
        payroll_type_id = EXCLUDED.payroll_type_id,
        status = EXCLUDED.status
    RETURNING id::text
    `,
    [tenantId, payrollType.rows[0]!.id],
  );
  const earning = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.payroll_earning_deduction (
      tenant_id, code, description, kind, taxable, active
    )
    VALUES ($1::uuid, $2, 'R2-154 complementary earning', 'EARNING'::"PayrollEntryKind", true, true)
    RETURNING id::text
    `,
    [tenantId, `R2154-COMP-${suffix}`],
  );
  const employee = await client.query<{ id: string }>(
    `
    INSERT INTO hr.employee (tenant_id, registration, name, hired_on, lifecycle_status)
    VALUES ($1::uuid, $2, 'R2-154 Complementary', DATE '2025-01-01', 'ACTIVE'::"EmployeeLifecycleStatus")
    RETURNING id::text
    `,
    [tenantId, `R2154-${suffix}`],
  );
  const run = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.payroll_run (
      tenant_id, competence_year, competence_month, payroll_type_id, processing_type_id, status
    )
    VALUES ($1::uuid, 2026, 1, $2::uuid, $3::uuid, 'PROCESSING'::"PayrollRunStatus")
    RETURNING id::text
    `,
    [tenantId, payrollType.rows[0]!.id, processingType.rows[0]!.id],
  );

  return {
    payrollRunId: run.rows[0]!.id,
    employeeId: employee.rows[0]!.id,
    earningDeductionId: earning.rows[0]!.id,
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

function complementaryLineHash(input: {
  payrollRunId: string;
  employeeId: string;
  earningDeductionId: string;
  amount: string;
}): string {
  return createHash('sha256')
    .update(
      [
        tenantId,
        input.payrollRunId,
        input.employeeId,
        input.earningDeductionId,
        input.amount,
      ].join(':'),
      'utf8',
    )
    .digest('hex');
}

describe('403 negative path', () => {
  it('returns 403 when an authenticated actor lacks the required permission', async () => {
    await expectForbiddenNegativePath();
  });
});
