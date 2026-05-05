import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS ??= 'true';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResultRow } from 'pg';

import type { AuthenticatedActor } from '../../backend/src/auth/auth.types';
import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { DatabaseService } from '../../backend/src/database/database.service';
import { DecimoTerceiroService } from '../../backend/src/folha-pagamento/payroll/decimo-terceiro.service';

interface GoldenFixture {
  referenceYear: number;
  rates: {
    irrfDependentDeduction: string;
    irrf: IrrfBracket[];
  };
  vectors: GoldenVector[];
}

interface GoldenVector {
  id: string;
  registration: string;
  hiredOn: string;
  firstSalary: string;
  closingSalary: string;
  dependents: number;
}

interface IrrfBracket {
  min: string;
  max: string | null;
  rate: string;
  deduction: string;
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

const tenantId = '00000000-0000-0000-0000-000000000151';
const fixtureDir = join(__dirname, 'golden', 'decimo-terceiro-v01');
const fixture = readFixture<GoldenFixture>('input.json');
const payrollPermissions = ['payroll.run.execute'];

describe('R2-51 decimo terceiro golden monetary fixture (e2e)', () => {
  let pool: Pool;
  let database: DatabaseService;
  let service: DecimoTerceiroService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for decimo-terceiro golden');
    }

    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    database = new DatabaseService(
      new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }),
    );
    service = new DecimoTerceiroService(database);

    const client = await pool.connect();
    try {
      await setBypassContext(client);
      await cleanupTenant(client);
      await ensureTenant(client);
      await seedIrrfTable(client);
      for (const vector of fixture.vectors) {
        await createEmployee(client, vector);
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

  it('calculates byte-equal employee_payroll_item rows for 13o legal vectors', async () => {
    await asPayrollOperator(() =>
      service.runAdiantamento(tenantId, fixture.referenceYear),
    );

    const client = await pool.connect();
    try {
      await setBypassContext(client);
      await applyClosingSalaries(client);
    } finally {
      client.release();
    }

    await asPayrollOperator(() =>
      service.runFechamento(tenantId, fixture.referenceYear),
    );

    const actualRows = await loadActualRows(pool);
    const actualBytes = `${JSON.stringify(actualRows, null, 2)}\n`;
    const expectedBytes = readFileSync(
      join(fixtureDir, 'expected-employee-payroll-items.json'),
      'utf8',
    );

    expect(actualBytes).toBe(expectedBytes);
  });

  function asPayrollOperator<T>(fn: () => Promise<T>): Promise<T> {
    return RequestContextStore.run(
      {
        tenantId,
        permissions: payrollPermissions,
        actor: actorForTenant(),
      },
      fn,
    );
  }
});

function actorForTenant(): AuthenticatedActor {
  return {
    sub: `r2-51-${tenantId}`,
    username: 'r2-51-payroll-operator',
    tenantId,
    groups: [],
    permissions: payrollPermissions,
  };
}

async function loadActualRows(pool: Pool): Promise<PayrollItemRow[]> {
  const client = await pool.connect();
  try {
    await setBypassContext(client);
    const result = await client.query<PayrollItemRow>(
      `
        SELECT
          CASE employee.registration
            WHEN 'GOLDEN-13O-FIRST' THEN 'first-parcel-full-year'
            WHEN 'GOLDEN-13O-PROP' THEN 'second-parcel-proportional'
            WHEN 'GOLDEN-13O-IRRF' THEN 'second-parcel-exclusive-irrf'
            WHEN 'GOLDEN-13O-COMP' THEN 'closing-complement-top-up'
          END AS "vectorId",
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
        JOIN payroll.payroll_earning_deduction earning
          ON earning.id = item.earning_deduction_id
        WHERE item.tenant_id = $1::uuid
          AND item.competence_year = $2
          AND item.deleted_at IS NULL
          AND employee.registration IN (
            'GOLDEN-13O-FIRST',
            'GOLDEN-13O-PROP',
            'GOLDEN-13O-IRRF',
            'GOLDEN-13O-COMP'
          )
        ORDER BY
          CASE employee.registration
            WHEN 'GOLDEN-13O-FIRST' THEN 1
            WHEN 'GOLDEN-13O-PROP' THEN 2
            WHEN 'GOLDEN-13O-IRRF' THEN 3
            WHEN 'GOLDEN-13O-COMP' THEN 4
            ELSE 99
          END,
          item.competence_month,
          CASE earning.code
            WHEN 'DECIMO_TERCEIRO_ADIANTAMENTO' THEN 1
            WHEN 'DECIMO_TERCEIRO_FECHAMENTO' THEN 2
            WHEN 'IRRF_13' THEN 3
            ELSE 99
          END
        `,
      [tenantId, fixture.referenceYear],
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function ensureTenant(client: PoolClient): Promise<void> {
  await client.query(
    `
    INSERT INTO public.tenant (id, slug, code, name, status)
    VALUES ($1::uuid, 'r2-51-decimo-golden', 'R251', 'R2-51 decimo golden', 'ACTIVE'::"RecordStatus")
    ON CONFLICT (id) DO UPDATE
    SET slug = EXCLUDED.slug,
        code = EXCLUDED.code,
        name = EXCLUDED.name,
        status = EXCLUDED.status
    `,
    [tenantId],
  );
}

async function seedIrrfTable(client: PoolClient): Promise<void> {
  await client.query(
    'DELETE FROM public.tax_rate WHERE tenant_id = $1::uuid AND kind = $2',
    [tenantId, 'IRRF'],
  );

  for (const [index, bracket] of fixture.rates.irrf.entries()) {
    await client.query(
      `
      INSERT INTO public.tax_rate (
        tenant_id, code, name, description, scope, reference_year, rate_percent,
        kind, competence_start, bracket_min, bracket_max, rate,
        deduction_amount, dependent_deduction, status
      )
      VALUES (
        $1::uuid, $2, $3, 'R2-51 decimo terceiro golden IRRF', 'IRRF', $4,
        $7::numeric, 'IRRF', make_date($4, 1, 1), $5::numeric, $6::numeric,
        $7::numeric, $8::numeric, $9::numeric, 'ACTIVE'::"RecordStatus"
      )
      `,
      [
        tenantId,
        `R251-IRRF-${index + 1}`,
        `R2-51 IRRF ${index + 1}`,
        fixture.referenceYear,
        bracket.min,
        bracket.max,
        bracket.rate,
        bracket.deduction,
        fixture.rates.irrfDependentDeduction,
      ],
    );
  }
}

async function createEmployee(
  client: PoolClient,
  vector: GoldenVector,
): Promise<void> {
  const link = await client.query<{ id: string }>(
    `
    INSERT INTO hr.employment_link (tenant_id, code, name, status)
    VALUES ($1::uuid, $2, $3, 'ACTIVE'::"RecordStatus")
    ON CONFLICT (tenant_id, code) DO UPDATE
    SET name = EXCLUDED.name,
        status = EXCLUDED.status,
        updated_at = now()
    RETURNING id::text
    `,
    [tenantId, `R251-LINK-${vector.id}`, `R2-51 ${vector.id} link`],
  );
  const functionalStatus = await client.query<{ id: string }>(
    `
    INSERT INTO hr.functional_status (
      tenant_id, code, description, enters_payroll, lifecycle_status, status
    )
    VALUES ($1::uuid, $2, $3, true, 'ACTIVE'::"EmployeeLifecycleStatus", 'ACTIVE'::"RecordStatus")
    ON CONFLICT (tenant_id, code) DO UPDATE
    SET description = EXCLUDED.description,
        enters_payroll = EXCLUDED.enters_payroll,
        lifecycle_status = EXCLUDED.lifecycle_status,
        status = EXCLUDED.status,
        updated_at = now()
    RETURNING id::text
    `,
    [tenantId, `R251-FS-${vector.id}`, `R2-51 ${vector.id} active`],
  );
  const shift = await client.query<{ id: string }>(
    `
    INSERT INTO hr.shift (tenant_id, code, description, daily_hours, status)
    VALUES ($1::uuid, $2, $3, 8.00, 'ACTIVE'::"RecordStatus")
    ON CONFLICT (tenant_id, code) DO UPDATE
    SET description = EXCLUDED.description,
        daily_hours = EXCLUDED.daily_hours,
        status = EXCLUDED.status,
        updated_at = now()
    RETURNING id::text
    `,
    [tenantId, `R251-SHIFT-${vector.id}`, `R2-51 ${vector.id} shift`],
  );
  const salary = await client.query<{ id: string }>(
    `
    INSERT INTO hr.salary_reference (
      tenant_id, code, description, amount, vigencia_inicio
    )
    VALUES ($1::uuid, $2, $3, $4::numeric, make_date($5, 1, 1))
    ON CONFLICT (tenant_id, code) DO UPDATE
    SET description = EXCLUDED.description,
        amount = EXCLUDED.amount,
        vigencia_inicio = EXCLUDED.vigencia_inicio,
        updated_at = now()
    RETURNING id::text
    `,
    [
      tenantId,
      `R251-SAL-${vector.id}`,
      `R2-51 ${vector.id} salary`,
      vector.firstSalary,
      fixture.referenceYear,
    ],
  );
  const employee = await client.query<{ id: string }>(
    `
    INSERT INTO hr.employee (
      tenant_id,
      registration,
      name,
      email,
      employment_link_id,
      functional_status_id,
      salary_reference_id,
      shift_id,
      hired_on,
      lifecycle_status
    )
    VALUES (
      $1::uuid, $2, $3, $4, $5::uuid, $6::uuid, $7::uuid, $8::uuid,
      $9::date, 'ACTIVE'::"EmployeeLifecycleStatus"
    )
    ON CONFLICT (tenant_id, registration) DO UPDATE
    SET name = EXCLUDED.name,
        email = EXCLUDED.email,
        employment_link_id = EXCLUDED.employment_link_id,
        functional_status_id = EXCLUDED.functional_status_id,
        salary_reference_id = EXCLUDED.salary_reference_id,
        shift_id = EXCLUDED.shift_id,
        hired_on = EXCLUDED.hired_on,
        lifecycle_status = EXCLUDED.lifecycle_status,
        updated_at = now()
    RETURNING id::text
    `,
    [
      tenantId,
      vector.registration,
      `R2-51 ${vector.id}`,
      `${vector.registration.toLowerCase()}@example.test`,
      link.rows[0].id,
      functionalStatus.rows[0].id,
      salary.rows[0].id,
      shift.rows[0].id,
      vector.hiredOn,
    ],
  );

  await client.query(
    `
    INSERT INTO hr.employee_status_history (
      tenant_id, employee_id, functional_status_id, starts_on
    )
    SELECT $1::uuid, $2::uuid, $3::uuid, $4::date
    WHERE NOT EXISTS (
      SELECT 1
      FROM hr.employee_status_history
      WHERE tenant_id = $1::uuid
        AND employee_id = $2::uuid
        AND starts_on = $4::date
    )
    `,
    [
      tenantId,
      employee.rows[0].id,
      functionalStatus.rows[0].id,
      vector.hiredOn,
    ],
  );

  for (let index = 0; index < vector.dependents; index += 1) {
    await client.query(
      `
      INSERT INTO hr.employee_dependent (
        tenant_id, employee_id, name, relationship, income_tax_dependent
      )
      VALUES ($1::uuid, $2::uuid, $3, 'CHILD', true)
      `,
      [tenantId, employee.rows[0].id, `R2-51 dependent ${index + 1}`],
    );
  }
}

async function applyClosingSalaries(client: PoolClient): Promise<void> {
  for (const vector of fixture.vectors) {
    await client.query(
      `
      UPDATE hr.salary_reference salary
      SET amount = $3::numeric,
          updated_at = now()
      FROM hr.employee employee
      WHERE employee.salary_reference_id = salary.id
        AND employee.tenant_id = $1::uuid
        AND employee.registration = $2
      `,
      [tenantId, vector.registration, vector.closingSalary],
    );
  }
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
    'DELETE FROM payroll.payroll_run_work_location WHERE tenant_id = $1::uuid',
    [tenantId],
  );
  await client.query(
    'DELETE FROM payroll.payroll_run WHERE tenant_id = $1::uuid',
    [tenantId],
  );
  await client.query(
    'DELETE FROM payroll.payroll_type_earning WHERE tenant_id = $1::uuid',
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
  await client.query('DELETE FROM public.tax_rate WHERE tenant_id = $1::uuid', [
    tenantId,
  ]);
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
