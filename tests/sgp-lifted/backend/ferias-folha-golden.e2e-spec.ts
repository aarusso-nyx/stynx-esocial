import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResultRow } from 'pg';

import type { AuthenticatedActor } from '../../backend/src/auth/auth.types';
import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { DatabaseService } from '../../backend/src/database/database.service';
import { FeriasPayrollService } from '../../backend/src/folha-pagamento/payroll/ferias-payroll.service';

interface GoldenFixture {
  competence: {
    year: number;
    month: number;
  };
  rates: {
    rppsCeiling: string;
    irrfDependentDeduction: string;
    irrf: IrrfBracket[];
    rpps: RppsBracket[];
  };
  vectors: GoldenVector[];
}

interface GoldenVector {
  id: string;
  registration: string;
  contractType: string;
  salary: string;
  vacationDays: number;
  pecuniaryBonusDays: number;
  installmentNumber: number;
  startsOn: string;
  dependents: number;
}

interface IrrfBracket {
  min: string;
  max: string | null;
  rate: string;
  deduction: string;
}

interface RppsBracket {
  min: string;
  max: string | null;
  rate: string;
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

const tenantId = '00000000-0000-0000-0000-000000000152';
const fixtureDir = join(__dirname, 'golden', 'ferias-folha-v01');
const fixture = readFixture<GoldenFixture>('input.json');
const runSuffix = randomUUID().slice(0, 8);

const payrollPermissions = [
  'folha.read',
  'folha.write',
  'folha.rubrica.read',
  'folha.rubrica.write',
  'payroll.run.execute',
  'rh.employee.read',
  'rh.history.read',
  'rh.dependent.read',
  'rh.vacation.read',
  'rh.vacation.payout',
  'system.tax-rate.read',
];

describe('R2-52 ferias folha golden monetary fixture (e2e)', () => {
  let pool: Pool;
  let database: DatabaseService;
  let service: FeriasPayrollService;
  const vacationIds = new Map<string, string>();

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for ferias-folha golden');
    }

    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    database = new DatabaseService(
      new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }),
    );
    service = new FeriasPayrollService(database);

    const client = await pool.connect();
    try {
      await setBypassContext(client);
      await cleanupTenant(client);
      await ensureTenant(client);
      await seedParameters(client);
      await seedTaxRates(client);
      await seedFeriasRubrics(client);
      for (const vector of fixture.vectors) {
        const vacationId = await createEmployeeWithVacation(client, vector);
        vacationIds.set(vector.id, vacationId);
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

  it('calculates byte-equal employee_payroll_item rows for vacation one-third and pecuniary bonus', async () => {
    for (const vector of fixture.vectors) {
      const vacationId = vacationIds.get(vector.id);
      if (!vacationId) throw new Error(`Vacation id missing for ${vector.id}`);
      await asPayrollOperator(() => service.run(vacationId));
    }

    const actualRows = await asPayrollOperator(() => loadActualRows());
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

  async function loadActualRows(): Promise<PayrollItemRow[]> {
    return database.query<PayrollItemRow>(
      `
      SELECT
        CASE employee.registration
          WHEN 'GOLDEN-FERIAS-ABONO' THEN 'statutory-20-days-abono'
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
        regexp_replace(
          item.notes,
          'vacation_record_id=[0-9a-f-]+',
          'vacation_record_id=<fixture>'
        ) AS notes
      FROM payroll.employee_payroll_item item
      JOIN hr.employee employee ON employee.id = item.employee_id
      JOIN payroll.payroll_earning_deduction earning
        ON earning.id = item.earning_deduction_id
      WHERE item.tenant_id = $1::uuid
        AND item.competence_year = $2
        AND item.competence_month = $3
        AND item.deleted_at IS NULL
        AND employee.registration IN ('GOLDEN-FERIAS-ABONO')
      ORDER BY
        employee.registration,
        CASE earning.code
          WHEN 'VACATION_SALARY' THEN 1
          WHEN 'VACATION_ONE_THIRD' THEN 2
          WHEN 'VACATION_PECUNIARY_BONUS' THEN 3
          WHEN 'RPPS' THEN 4
          WHEN 'IRRF_VACATION' THEN 5
          ELSE 99
        END
      `,
      [tenantId, fixture.competence.year, fixture.competence.month],
    );
  }
});

function actorForTenant(): AuthenticatedActor {
  return {
    sub: `r2-52-${tenantId}`,
    username: 'r2-52-payroll-operator',
    tenantId,
    groups: [],
    permissions: payrollPermissions,
  };
}

async function ensureTenant(client: PoolClient): Promise<void> {
  await client.query(
    `
    INSERT INTO public.tenant (id, slug, code, name, status)
    VALUES ($1::uuid, 'r2-52-ferias-golden', 'R252', 'R2-52 ferias golden', 'ACTIVE'::"RecordStatus")
    ON CONFLICT (id) DO UPDATE
    SET slug = EXCLUDED.slug,
        code = EXCLUDED.code,
        name = EXCLUDED.name,
        status = EXCLUDED.status
    `,
    [tenantId],
  );
}

async function seedParameters(client: PoolClient): Promise<void> {
  await client.query(
    `
    INSERT INTO public.system_parameter (tenant_id, key, value, description, module_key)
    VALUES ($1::uuid, 'TETO_RPPS', $2::jsonb, 'R2-52 ferias golden', 'payroll')
    ON CONFLICT (tenant_id, key) DO UPDATE
    SET value = EXCLUDED.value,
        description = EXCLUDED.description,
        module_key = EXCLUDED.module_key
    `,
    [tenantId, `{"amount":${fixture.rates.rppsCeiling}}`],
  );
}

async function seedTaxRates(client: PoolClient): Promise<void> {
  await client.query('DELETE FROM public.tax_rate WHERE tenant_id = $1::uuid', [
    tenantId,
  ]);

  for (const [index, bracket] of fixture.rates.irrf.entries()) {
    await client.query(
      `
      INSERT INTO public.tax_rate (
        tenant_id, code, name, description, scope, reference_year, rate_percent,
        kind, competence_start, bracket_min, bracket_max, rate,
        deduction_amount, dependent_deduction, status
      )
      VALUES (
        $1::uuid, $2, $3, 'R2-52 ferias payroll IRRF golden', 'IRRF', 2026,
        $6::numeric, 'IRRF', DATE '2026-01-01', $4::numeric, $5::numeric,
        $6::numeric, $7::numeric, $8::numeric, 'ACTIVE'::"RecordStatus"
      )
      `,
      [
        tenantId,
        `R252-IRRF-${index + 1}`,
        `R2-52 IRRF ${index + 1}`,
        bracket.min,
        bracket.max,
        bracket.rate,
        bracket.deduction,
        fixture.rates.irrfDependentDeduction,
      ],
    );
  }

  for (const [index, bracket] of fixture.rates.rpps.entries()) {
    await client.query(
      `
      INSERT INTO public.tax_rate (
        tenant_id, code, name, description, scope, reference_year, rate_percent,
        kind, competence_start, bracket_min, bracket_max, rate,
        deduction_amount, dependent_deduction, status
      )
      VALUES (
        $1::uuid, $2, $3, 'R2-52 ferias payroll RPPS golden', 'RPPS', 2026,
        $6::numeric, 'RPPS', DATE '2026-01-01', $4::numeric, $5::numeric,
        $6::numeric, 0, 0, 'ACTIVE'::"RecordStatus"
      )
      `,
      [
        tenantId,
        `R252-RPPS-${index + 1}`,
        `R2-52 RPPS ${index + 1}`,
        bracket.min,
        bracket.max,
        bracket.rate,
      ],
    );
  }
}

async function seedFeriasRubrics(client: PoolClient): Promise<void> {
  const rubrics = [
    [
      'VACATION_SALARY',
      'Vacation salary for the period',
      'EARNING',
      true,
      '{"vacation":true,"income_tax":true}',
    ],
    [
      'VACATION_ONE_THIRD',
      'Constitutional vacation one-third',
      'EARNING',
      true,
      '{"vacation":true,"income_tax":true}',
    ],
    [
      'VACATION_PECUNIARY_BONUS',
      'Vacation pecuniary bonus',
      'EARNING',
      true,
      '{"vacation":true,"income_tax":true}',
    ],
    [
      'RPPS',
      'RPPS social security contribution',
      'DEDUCTION',
      false,
      '{"rpps":true,"official_social_security":true}',
    ],
    [
      'IRRF_VACATION',
      'Exclusive vacation income tax',
      'DEDUCTION',
      false,
      '{"income_tax":true,"vacation":true}',
    ],
  ] as const;

  for (const rubric of rubrics) {
    await client.query(
      `
      INSERT INTO payroll.payroll_earning_deduction (
        tenant_id, code, description, kind, taxable, active, incidences,
        starts_on, formula_dependencies, formula_ready
      )
      VALUES (
        $1::uuid, $2, $3, $4::"PayrollEntryKind", $5, true, $6::jsonb,
        DATE '2026-01-01', ARRAY[]::text[], false
      )
      ON CONFLICT (tenant_id, code) DO UPDATE
      SET description = EXCLUDED.description,
          kind = EXCLUDED.kind,
          taxable = EXCLUDED.taxable,
          active = true,
          incidences = EXCLUDED.incidences,
          starts_on = EXCLUDED.starts_on,
          formula_alias = NULL,
          formula_function_name = NULL,
          formula_expression = NULL,
          formula_dependencies = EXCLUDED.formula_dependencies,
          formula_ready = false,
          formula_error = NULL,
          updated_at = now()
      `,
      [tenantId, rubric[0], rubric[1], rubric[2], rubric[3], rubric[4]],
    );
  }
}

async function createEmployeeWithVacation(
  client: PoolClient,
  vector: GoldenVector,
): Promise<string> {
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
      `R252-LINK-${runSuffix}-${vector.id}`,
      `R2-52 ${vector.id} link`,
      vector.contractType,
      `R2-52 ${vector.contractType}`,
    ],
  );
  const contract = await client.query<{ id: string }>(
    `
    INSERT INTO hr.contract_type (tenant_id, code, name, status)
    VALUES ($1::uuid, $2, $3, 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [
      tenantId,
      `R252-CT-${runSuffix}-${vector.id}`,
      `R2-52 ${vector.id} contract`,
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
      `R252-FS-${runSuffix}-${vector.id}`,
      `R2-52 ${vector.id} active`,
    ],
  );
  const salary = await client.query<{ id: string }>(
    `
    INSERT INTO hr.salary_reference (
      tenant_id, code, description, amount, vigencia_inicio
    )
    VALUES ($1::uuid, $2, $3, $4::numeric, DATE '2026-01-01')
    RETURNING id::text
    `,
    [
      tenantId,
      `R252-SAL-${runSuffix}-${vector.id}`,
      `R2-52 ${vector.id} salary`,
      vector.salary,
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
      contract_type_id,
      salary_reference_id,
      hired_on,
      lifecycle_status
    )
    VALUES (
      $1::uuid, $2, $3, $4, $5::uuid, $6::uuid, $7::uuid, $8::uuid,
      DATE '2020-01-01', 'ACTIVE'::"EmployeeLifecycleStatus"
    )
    ON CONFLICT (tenant_id, registration) DO UPDATE
    SET name = EXCLUDED.name,
        email = EXCLUDED.email,
        employment_link_id = EXCLUDED.employment_link_id,
        functional_status_id = EXCLUDED.functional_status_id,
        contract_type_id = EXCLUDED.contract_type_id,
        salary_reference_id = EXCLUDED.salary_reference_id,
        hired_on = EXCLUDED.hired_on,
        lifecycle_status = EXCLUDED.lifecycle_status,
        updated_at = now()
    RETURNING id::text
    `,
    [
      tenantId,
      vector.registration,
      `R2-52 ${vector.id}`,
      `${vector.registration.toLowerCase()}@example.test`,
      link.rows[0].id,
      functionalStatus.rows[0].id,
      contract.rows[0].id,
      salary.rows[0].id,
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
      DATE '2020-01-01', DATE '2020-01-01', 'ACTIVE'::"RecordStatus"
    )
    `,
    [tenantId, employee.rows[0].id, link.rows[0].id, contract.rows[0].id],
  );

  for (let index = 0; index < vector.dependents; index += 1) {
    await client.query(
      `
      INSERT INTO hr.employee_dependent (
        tenant_id, employee_id, name, relationship, income_tax_dependent
      )
      VALUES ($1::uuid, $2::uuid, $3, 'CHILD', true)
      `,
      [tenantId, employee.rows[0].id, `R2-52 dependent ${index + 1}`],
    );
  }

  const vacation = await client.query<{ id: string }>(
    `
    INSERT INTO hr.vacation_record (
      tenant_id, employee_id, accrual_period_start, accrual_period_end,
      installment_number, pecuniary_bonus_days, starts_on, ends_on, days, status
    )
    VALUES (
      $1::uuid,
      $2::uuid,
      DATE '2025-07-01',
      DATE '2026-06-30',
      $3,
      $4,
      $5::date,
      $5::date + (($6 - 1) || ' days')::interval,
      $6,
      'aprovado'
    )
    RETURNING id::text
    `,
    [
      tenantId,
      employee.rows[0].id,
      vector.installmentNumber,
      vector.pecuniaryBonusDays,
      vector.startsOn,
      vector.vacationDays,
    ],
  );
  return vacation.rows[0].id;
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
    'DELETE FROM hr.vacation_record WHERE tenant_id = $1::uuid',
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
    'DELETE FROM hr.employee_dependent WHERE tenant_id = $1::uuid',
    [tenantId],
  );
  await client.query(
    'DELETE FROM hr.employment_contract WHERE tenant_id = $1::uuid',
    [tenantId],
  );
  await client.query('DELETE FROM public.tax_rate WHERE tenant_id = $1::uuid', [
    tenantId,
  ]);
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
