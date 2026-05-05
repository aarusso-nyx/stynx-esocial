import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResultRow } from 'pg';

import type { AuthenticatedActor } from '../../backend/src/auth/auth.types';
import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { DatabaseService } from '../../backend/src/database/database.service';
import { FgtsService } from '../../backend/src/folha-pagamento/fgts/fgts.service';
import { RescisaoService } from '../../backend/src/folha-pagamento/rescisao/rescisao.service';

interface GoldenFixture {
  rates: {
    rppsFlatPercent: string;
    fgtsTerminationFinePercent: string;
  };
  vectors: GoldenVector[];
}

interface GoldenVector {
  id: string;
  registration: string;
  contractType: string;
  salary: string;
  hiredOn: string;
  terminationDate: string;
  cause: string;
  fgtsBalance?: string;
}

interface PayrollItemRow extends QueryResultRow {
  vectorId: string;
  employeeRegistration: string;
  code: string;
  kind: 'EARNING' | 'DEDUCTION';
  source: 'CALCULATED';
  competenceYear: number;
  competenceMonth: number;
  quantity: string;
  referenceValue: string;
  amount: string;
  notes: string;
}

const tenantId = '00000000-0000-0000-0000-000000000153';
const fixtureDir = join(__dirname, 'golden', 'rescisao-v01');
const fixture = readFixture<GoldenFixture>('input.json');
const runSuffix = randomUUID().slice(0, 8);

const payrollPermissions = [
  'folha.read',
  'folha.write',
  'payroll.run.execute',
  'payroll.fgts.read',
  'payroll.fgts.write',
  'rh.employee.read',
  'rh.employee.terminate',
  'rh.history.read',
];

describe('R2-53 termination payroll golden monetary fixture (e2e)', () => {
  let pool: Pool;
  let database: DatabaseService;
  let service: RescisaoService;
  const employmentLinks = new Map<string, string>();

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for rescisao golden');
    }

    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    database = new DatabaseService(
      new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }),
    );
    service = new RescisaoService(
      database,
      undefined,
      new FgtsService(database),
    );

    const client = await pool.connect();
    try {
      await setBypassContext(client);
      await cleanupTenant(client);
      await ensureTenant(client);
      await seedTerminationBaseFunction(client);
      await seedRppsTable(client);
      for (const vector of fixture.vectors) {
        const employee = await createEmployee(client, vector);
        employmentLinks.set(vector.id, employee.employmentLinkId);
        if (vector.fgtsBalance) {
          await seedFgtsBalance(client, employee, vector.fgtsBalance);
        }
      }
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

  it('persists byte-equal rescisao employee_payroll_item rows for three termination types', async () => {
    for (const vector of fixture.vectors) {
      const employmentLinkId = employmentLinks.get(vector.id);
      if (!employmentLinkId) {
        throw new Error(`Missing employment link for ${vector.id}`);
      }
      await asPayrollEngine(() =>
        service.run(employmentLinkId, vector.terminationDate, vector.cause),
      );
    }

    const actualRows = await asPayrollEngine(() => loadActualRows());
    const actualBytes = `${JSON.stringify(actualRows, null, 2)}\n`;
    const expectedBytes = readFileSync(
      join(fixtureDir, 'expected-employee-payroll-items.json'),
      'utf8',
    );

    expect(actualBytes).toBe(expectedBytes);
  });

  function asPayrollEngine<T>(fn: () => Promise<T>): Promise<T> {
    return RequestContextStore.run(
      {
        tenantId,
        permissions: payrollPermissions,
        actor: actorForTenant(),
        bypassRls: true,
        bypassRlsReason: 'payroll-engine',
      },
      fn,
    );
  }

  async function loadActualRows(): Promise<PayrollItemRow[]> {
    return database.query<PayrollItemRow>(
      `
      WITH vector_order AS (
        SELECT *
        FROM unnest($1::text[], $2::text[], $3::int[])
          AS vector_order(registration, vector_id, ord)
      )
      SELECT
        vector_order.vector_id AS "vectorId",
        employee.registration AS "employeeRegistration",
        earning.code,
        earning.kind::text AS kind,
        item.source::text AS source,
        item.competence_year AS "competenceYear",
        item.competence_month AS "competenceMonth",
        item.quantity::text AS quantity,
        item.reference_value::text AS "referenceValue",
        item.amount::text AS amount,
        item.notes
      FROM payroll.employee_payroll_item item
      JOIN hr.employee employee ON employee.id = item.employee_id
      JOIN vector_order ON vector_order.registration = employee.registration
      JOIN payroll.payroll_earning_deduction earning
        ON earning.id = item.earning_deduction_id
      WHERE item.tenant_id = $4::uuid
        AND item.deleted_at IS NULL
      ORDER BY
        vector_order.ord,
        CASE earning.code
          WHEN 'RESC_SALDO' THEN 1
          WHEN 'RESC_13_PROP' THEN 2
          WHEN 'RESC_FERIAS_VENCIDAS' THEN 3
          WHEN 'RESC_FERIAS_VENCIDAS_TERCO' THEN 4
          WHEN 'RESC_FERIAS_PROP' THEN 5
          WHEN 'RESC_FERIAS_TERCO' THEN 6
          WHEN 'RESC_AVISO_PREVIO' THEN 7
          WHEN 'RESC_AVISO_PREVIO_DESCONTO' THEN 8
          WHEN 'RPPS' THEN 9
          WHEN 'IRRF_RESCISAO' THEN 10
          WHEN 'RESC_MULTA_FGTS_40' THEN 11
          ELSE 99
        END
      `,
      [
        fixture.vectors.map((vector) => vector.registration),
        fixture.vectors.map((vector) => vector.id),
        fixture.vectors.map((_, index) => index + 1),
        tenantId,
      ],
    );
  }
});

function actorForTenant(): AuthenticatedActor {
  return {
    sub: `r2-53-${tenantId}`,
    username: 'r2-53-rescisao-operator',
    tenantId,
    groups: [],
    permissions: payrollPermissions,
  };
}

async function ensureTenant(client: PoolClient): Promise<void> {
  await client.query(
    `
    INSERT INTO public.tenant (id, slug, code, name, status)
    VALUES ($1::uuid, 'r2-53-rescisao-golden', 'R253', 'R2-53 rescisao golden', 'ACTIVE'::"RecordStatus")
    ON CONFLICT (id) DO UPDATE
    SET slug = EXCLUDED.slug,
        code = EXCLUDED.code,
        name = EXCLUDED.name,
        status = EXCLUDED.status
    `,
    [tenantId],
  );
}

async function seedTerminationBaseFunction(client: PoolClient): Promise<void> {
  await client.query(
    `
    CREATE OR REPLACE FUNCTION payroll_calc.f_termination_base(
      p_employee_id uuid,
      p_month integer,
      p_year integer
    ) RETURNS numeric
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = payroll_calc, hr, payroll, public, pg_catalog
    AS $$
      SELECT round(
        payroll_calc.base_salary(p_employee_id, make_date(p_year, p_month, 1)),
        2
      )::numeric(14, 2);
    $$;
    `,
  );
}

async function seedRppsTable(client: PoolClient): Promise<void> {
  await client.query('DELETE FROM public.tax_rate WHERE tenant_id = $1::uuid', [
    tenantId,
  ]);
  await client.query(
    `
    INSERT INTO public.tax_rate (
      tenant_id,
      code,
      name,
      scope,
      reference_year,
      rate_percent,
      kind,
      competence_start,
      bracket_min,
      bracket_max,
      rate,
      deduction_amount,
      dependent_deduction,
      status
    )
    VALUES (
      $1::uuid,
      'R253-RPPS',
      'R2-53 RPPS',
      'RPPS',
      2025,
      $2::numeric,
      'RPPS',
      DATE '2025-01-01',
      0.00,
      NULL,
      $2::numeric,
      0.00,
      0.00,
      'ACTIVE'::"RecordStatus"
    )
    `,
    [tenantId, fixture.rates.rppsFlatPercent],
  );
}

async function createEmployee(
  client: PoolClient,
  vector: GoldenVector,
): Promise<{ employeeId: string; employmentLinkId: string }> {
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
      `R253-LINK-${runSuffix}-${vector.id}`,
      `R2-53 ${vector.id} link`,
      vector.contractType,
      vector.contractType === 'celetista' ? 'CLT' : 'Lei 8.112/90',
    ],
  );
  const functionalStatus = await client.query<{ id: string }>(
    `
    INSERT INTO hr.functional_status (
      tenant_id, code, description, enters_payroll, lifecycle_status, status
    )
    VALUES ($1::uuid, $2, $3, true, 'ACTIVE'::"EmployeeLifecycleStatus", 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [
      tenantId,
      `R253-FS-${runSuffix}-${vector.id}`,
      `R2-53 ${vector.id} active`,
    ],
  );
  const contractType = await client.query<{ id: string }>(
    `
    INSERT INTO hr.contract_type (tenant_id, code, name, status)
    VALUES ($1::uuid, $2, $3, 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [
      tenantId,
      `R253-CT-${runSuffix}-${vector.id}`,
      `R2-53 ${vector.id} contract`,
    ],
  );
  const salary = await client.query<{ id: string }>(
    `
    INSERT INTO hr.salary_reference (
      tenant_id, code, description, amount, vigencia_inicio
    )
    VALUES ($1::uuid, $2, $3, $4::numeric, DATE '2024-01-01')
    RETURNING id::text
    `,
    [
      tenantId,
      `R253-SAL-${runSuffix}-${vector.id}`,
      `R2-53 ${vector.id} salary`,
      vector.salary,
    ],
  );
  const employee = await client.query<{ id: string }>(
    `
    INSERT INTO hr.employee (
      tenant_id,
      registration,
      name,
      employment_link_id,
      functional_status_id,
      contract_type_id,
      salary_reference_id,
      hired_on,
      lifecycle_status
    )
    VALUES (
      $1::uuid, $2, $3, $4::uuid, $5::uuid, $6::uuid, $7::uuid,
      $8::date, 'ACTIVE'::"EmployeeLifecycleStatus"
    )
    RETURNING id::text
    `,
    [
      tenantId,
      vector.registration,
      `R2-53 ${vector.id}`,
      link.rows[0].id,
      functionalStatus.rows[0].id,
      contractType.rows[0].id,
      salary.rows[0].id,
      vector.hiredOn,
    ],
  );
  await client.query(
    `
    INSERT INTO hr.employment_contract (
      tenant_id, employee_id, employment_link_id, contract_type_id,
      starts_on, exercise_on, status
    )
    VALUES (
      $1::uuid, $2::uuid, $3::uuid, $4::uuid,
      $5::date, $5::date, 'ACTIVE'::"RecordStatus"
    )
    `,
    [
      tenantId,
      employee.rows[0].id,
      link.rows[0].id,
      contractType.rows[0].id,
      vector.hiredOn,
    ],
  );
  await client.query(
    `
    INSERT INTO hr.employee_status_history (
      tenant_id, employee_id, functional_status_id, starts_on
    )
    VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date)
    `,
    [
      tenantId,
      employee.rows[0].id,
      functionalStatus.rows[0].id,
      vector.hiredOn,
    ],
  );
  return {
    employeeId: employee.rows[0].id,
    employmentLinkId: link.rows[0].id,
  };
}

async function seedFgtsBalance(
  client: PoolClient,
  employee: { employeeId: string; employmentLinkId: string },
  balance: string,
): Promise<void> {
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
    [tenantId, employee.employeeId, employee.employmentLinkId, balance],
  );
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
    'DELETE FROM payment.prior_notice WHERE tenant_id = $1::uuid',
    params,
  );
  await client.query(
    'DELETE FROM payroll.employee_payroll_item WHERE tenant_id = $1::uuid',
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
    'DELETE FROM payroll.payroll_run_work_location WHERE tenant_id = $1::uuid',
    params,
  );
  await client.query(
    `
    UPDATE hr.employment_link
    SET termination_payroll_run_id = NULL
    WHERE tenant_id = $1::uuid
    `,
    params,
  );
  await client.query(
    'DELETE FROM payroll.payroll_run WHERE tenant_id = $1::uuid',
    params,
  );
  await client.query(
    'DELETE FROM payroll.payroll_type_earning WHERE tenant_id = $1::uuid',
    params,
  );
  await client.query(
    'DELETE FROM payroll.payroll_earning_deduction WHERE tenant_id = $1::uuid',
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
    'DELETE FROM hr.employment_contract WHERE tenant_id = $1::uuid',
    params,
  );
  await deleteEmployeeStatusHistory(client, params);
  await client.query(
    'DELETE FROM hr.employee WHERE tenant_id = $1::uuid',
    params,
  );
  await client.query(
    'DELETE FROM hr.functional_status WHERE tenant_id = $1::uuid',
    params,
  );
  await client.query(
    'DELETE FROM hr.contract_type WHERE tenant_id = $1::uuid',
    params,
  );
  await client.query(
    'DELETE FROM hr.salary_reference WHERE tenant_id = $1::uuid',
    params,
  );
  await client.query(
    'DELETE FROM hr.employment_link WHERE tenant_id = $1::uuid',
    params,
  );
  await client.query('DELETE FROM public.tax_rate WHERE tenant_id = $1::uuid', [
    tenantId,
  ]);
}

async function deleteEmployeeStatusHistory(
  client: PoolClient,
  params: string[],
): Promise<void> {
  await client.query("SET session_replication_role = 'replica'");
  try {
    await client.query(
      'DELETE FROM hr.employee_status_history WHERE tenant_id = $1::uuid',
      params,
    );
  } finally {
    await client.query("SET session_replication_role = 'origin'");
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

function readFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixtureDir, name), 'utf8')) as T;
}
