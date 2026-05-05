process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS ??= 'true';

import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';

import type { AuthenticatedActor } from '../../backend/src/auth/auth.types';
import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { DatabaseService } from '../../backend/src/database/database.service';

const tenantId = randomUUID();
const tenantSuffix = tenantId.slice(0, 8).toUpperCase();
const validationPermissions = [
  'folha.read',
  'folha.write',
  'folha.rubrica.read',
  'folha.rubrica.write',
];

describe('CALC-11 monthly payroll validation guard', () => {
  let pool: Pool;
  let database: DatabaseService;
  let payrollRunId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for calc-folha-validation');
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    database = new DatabaseService(
      new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }),
    );
    const client = await pool.connect();
    try {
      await setBypassContext(client);
      await cleanupTenant(client);
      await ensureTenant(client);
      payrollRunId = await seedNegativeNetRun(client);
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (!pool) return;
    const client = await pool.connect();
    try {
      await setBypassContext(client);
      await cleanupTenant(client);
    } finally {
      client.release();
      await database?.onModuleDestroy();
      await pool.end();
    }
  });

  it('blocks approval when an employee net amount is negative and ALLOW_NEGATIVE_NET is not enabled', async () => {
    await expect(
      RequestContextStore.run(
        {
          tenantId,
          permissions: validationPermissions,
          actor: actorForTenant(),
        },
        () =>
          database.query(
            `
            SELECT payroll_calc.validate_payroll_run($1::uuid, $2::uuid)
            `,
            [tenantId, payrollRunId],
          ),
      ),
    ).rejects.toThrow(/negative net pay/i);
  });
});

function actorForTenant(): AuthenticatedActor {
  return {
    sub: 'calc11-validation',
    username: 'calc11-validation',
    tenantId,
    groups: [],
    permissions: validationPermissions,
  };
}

async function ensureTenant(client: PoolClient): Promise<void> {
  await client.query(
    `
    INSERT INTO public.tenant (id, slug, code, name, status)
    VALUES (
      $1::uuid,
      $2,
      $3,
      'CALC-11 validation',
      'ACTIVE'::"RecordStatus"
    )
    ON CONFLICT (id) DO UPDATE
    SET slug = EXCLUDED.slug,
        code = EXCLUDED.code,
        name = EXCLUDED.name,
        status = EXCLUDED.status
    `,
    [
      tenantId,
      `calc11-validation-${tenantId.slice(0, 8)}`,
      `C11V${tenantSuffix}`,
    ],
  );
}

async function seedNegativeNetRun(client: PoolClient): Promise<string> {
  const employeeId = await createEmployee(client);
  const payrollType = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.payroll_type (tenant_id, code, description, status)
    VALUES ($1::uuid, 'CALC11V', 'CALC-11 validation type', 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [tenantId],
  );
  const processingType = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.processing_type (
      tenant_id, code, description, payroll_type_id, status
    )
    VALUES (
      $1::uuid, 'CALC11V', 'CALC-11 validation processing',
      $2::uuid, 'ACTIVE'::"RecordStatus"
    )
    RETURNING id::text
    `,
    [tenantId, payrollType.rows[0].id],
  );
  const earning = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.payroll_earning_deduction (
      tenant_id, code, description, kind, taxable, active, starts_on
    )
    VALUES (
      $1::uuid, 'CALC11V_EARN', 'Validation earning',
      'EARNING'::"PayrollEntryKind", true, true, DATE '2026-01-01'
    )
    RETURNING id::text
    `,
    [tenantId],
  );
  const deduction = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.payroll_earning_deduction (
      tenant_id, code, description, kind, taxable, active, starts_on
    )
    VALUES (
      $1::uuid, 'CALC11V_DED', 'Validation deduction',
      'DEDUCTION'::"PayrollEntryKind", false, true, DATE '2026-01-01'
    )
    RETURNING id::text
    `,
    [tenantId],
  );
  const run = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.payroll_run (
      tenant_id,
      competence_year,
      competence_month,
      payroll_type_id,
      processing_type_id,
      status,
      employee_count,
      total_earnings,
      total_deductions,
      total_net
    )
    VALUES (
      $1::uuid, 2026, 5, $2::uuid, $3::uuid,
      'GENERATED'::"PayrollRunStatus", 1, 100.00, 150.00, 0.00
    )
    RETURNING id::text
    `,
    [tenantId, payrollType.rows[0].id, processingType.rows[0].id],
  );
  await client.query(
    `
    INSERT INTO payroll.employee_payroll_item (
      tenant_id, employee_id, payroll_run_id, earning_deduction_id, source,
      competence_year, competence_month, amount, notes
    )
    VALUES
      ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'CALCULATED'::"PayrollEntrySource", 2026, 5, 100.00, 'validation earning'),
      ($1::uuid, $2::uuid, $3::uuid, $5::uuid, 'CALCULATED'::"PayrollEntrySource", 2026, 5, 150.00, 'validation deduction')
    `,
    [
      tenantId,
      employeeId,
      run.rows[0].id,
      earning.rows[0].id,
      deduction.rows[0].id,
    ],
  );
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
    VALUES ($1::uuid, $2::uuid, $3::uuid, 2026, 5, 100.00, 150.00, 0.00, '{"origin":"calc11-validation"}'::jsonb)
    `,
    [tenantId, employeeId, run.rows[0].id],
  );
  return run.rows[0].id;
}

async function createEmployee(client: PoolClient): Promise<string> {
  const link = await client.query<{ id: string }>(
    `
    INSERT INTO hr.employment_link (tenant_id, code, name, status)
    VALUES ($1::uuid, 'CALC11V-LINK', 'CALC-11 validation link', 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [tenantId],
  );
  const contract = await client.query<{ id: string }>(
    `
    INSERT INTO hr.contract_type (tenant_id, code, name, status)
    VALUES ($1::uuid, 'CALC11V-CT', 'CALC-11 validation contract', 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [tenantId],
  );
  const status = await client.query<{ id: string }>(
    `
    INSERT INTO hr.functional_status (
      tenant_id, code, description, enters_payroll, lifecycle_status, status
    )
    VALUES ($1::uuid, 'CALC11V-FS', 'CALC-11 validation active', true, 'ACTIVE'::"EmployeeLifecycleStatus", 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [tenantId],
  );
  const employee = await client.query<{ id: string }>(
    `
    INSERT INTO hr.employee (
      tenant_id, registration, name, employment_link_id, contract_type_id,
      functional_status_id, hired_on, lifecycle_status
    )
    VALUES (
      $1::uuid, 'CALC11V-REG', 'CALC-11 validation employee',
      $2::uuid, $3::uuid, $4::uuid, DATE '2024-01-01',
      'ACTIVE'::"EmployeeLifecycleStatus"
    )
    RETURNING id::text
    `,
    [tenantId, link.rows[0].id, contract.rows[0].id, status.rows[0].id],
  );
  return employee.rows[0].id;
}

async function cleanupTenant(client: PoolClient): Promise<void> {
  await client.query(
    'DELETE FROM payroll.employee_payroll_item WHERE tenant_id = $1::uuid',
    [tenantId],
  );
  await client.query(
    'DELETE FROM payroll.payroll_financial_record WHERE tenant_id = $1::uuid',
    [tenantId],
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
    'DELETE FROM payroll.payroll_earning_deduction WHERE tenant_id = $1::uuid',
    [tenantId],
  );
  await client.query(
    'DELETE FROM payroll.processing_type WHERE tenant_id = $1::uuid',
    [tenantId],
  );
  await client.query(
    'DELETE FROM payroll.payroll_type WHERE tenant_id = $1::uuid',
    [tenantId],
  );
  await client.query(
    'DELETE FROM hr.employment_contract WHERE tenant_id = $1::uuid',
    [tenantId],
  );
  await client.query(
    'DELETE FROM public.system_parameter WHERE tenant_id = $1::uuid',
    [tenantId],
  );
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
