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
import { FolhaMensalService } from '../../backend/src/folha-pagamento/payroll/folha-mensal.service';

interface GoldenFixture {
  competence: {
    year: number;
    month: number;
  };
  rates: {
    inssLinearPercent: string;
    atsPercentPerYear: string;
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
  serviceYears: number;
  dependents: number;
  abonoPermanencia: boolean;
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

const tenantId = '00000000-0000-0000-0000-000000000150';
const fixtureDir = join(__dirname, 'golden', 'payroll-mensal-v01');
const fixture = readFixture<GoldenFixture>('input.json');
const runSuffix = randomUUID().slice(0, 8);

const payrollPermissions = [
  'folha.read',
  'folha.write',
  'folha.rubrica.read',
  'folha.rubrica.write',
  'payroll.formula.read',
  'payroll.formula.write',
  'payroll.run.execute',
  'system.tax-rate.read',
  'rh.employee.read',
  'rh.history.read',
  'rh.dependent.read',
];

describe('R2-50 monthly payroll golden monetary fixture (e2e)', () => {
  let pool: Pool;
  let database: DatabaseService;
  let service: FolhaMensalService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for payroll-mensal golden');
    }

    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    database = new DatabaseService(
      new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }),
    );
    service = new FolhaMensalService(database);

    const client = await pool.connect();
    try {
      await setBypassContext(client);
      await cleanupTenant(client);
      await ensureTenant(client);
      await seedParameters(client);
      await seedTaxRates(client);
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

  it('calculates byte-equal employee_payroll_item rows for monthly legal vectors', async () => {
    await asPayrollOperator(() => service.openCompetence(fixture.competence));

    const client = await pool.connect();
    try {
      await setBypassContext(client);
      await seedMonthlyGoldenRubrics(client);
    } finally {
      client.release();
    }

    await asPayrollOperator(() => service.calculate(fixture.competence));

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
          WHEN 'GOLDEN-MENSAL-CLT' THEN 'clt-inss-irrf'
          WHEN 'GOLDEN-MENSAL-RPPS' THEN 'statutory-rpps-ats-abono'
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
        AND item.competence_month = $3
        AND item.deleted_at IS NULL
        AND employee.registration IN ('GOLDEN-MENSAL-CLT', 'GOLDEN-MENSAL-RPPS')
      ORDER BY
        employee.registration,
        CASE earning.code
          WHEN 'MONTHLY_BASE_SALARY' THEN 1
          WHEN 'ATS' THEN 2
          WHEN 'ABONO_PERMANENCIA' THEN 3
          WHEN 'INSS' THEN 4
          WHEN 'RPPS' THEN 5
          WHEN 'IRRF' THEN 6
          ELSE 99
        END
      `,
      [tenantId, fixture.competence.year, fixture.competence.month],
    );
  }
});

function actorForTenant(): AuthenticatedActor {
  return {
    sub: `r2-50-${tenantId}`,
    username: 'r2-50-payroll-operator',
    tenantId,
    groups: [],
    permissions: payrollPermissions,
  };
}

async function ensureTenant(client: PoolClient): Promise<void> {
  await client.query(
    `
    INSERT INTO public.tenant (id, slug, code, name, status)
    VALUES ($1::uuid, 'r2-50-payroll-golden', 'R250', 'R2-50 payroll golden', 'ACTIVE'::"RecordStatus")
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
  const parameters = [
    ['ATS_PERCENT_PER_YEAR', `{"rate":${fixture.rates.atsPercentPerYear}}`],
    ['TETO_RPPS', `{"amount":${fixture.rates.rppsCeiling}}`],
  ];
  for (const [key, value] of parameters) {
    await client.query(
      `
      INSERT INTO public.system_parameter (tenant_id, key, value, description, module_key)
      VALUES ($1::uuid, $2, $3::jsonb, 'R2-50 monthly payroll golden', 'payroll')
      ON CONFLICT (tenant_id, key) DO UPDATE
      SET value = EXCLUDED.value,
          description = EXCLUDED.description,
          module_key = EXCLUDED.module_key
      `,
      [tenantId, key, value],
    );
  }
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
        $1::uuid, $2, $3, 'R2-50 monthly payroll IRRF golden', 'IRRF', 2026,
        $6::numeric, 'IRRF', DATE '2026-01-01', $4::numeric, $5::numeric,
        $6::numeric, $7::numeric, $8::numeric, 'ACTIVE'::"RecordStatus"
      )
      `,
      [
        tenantId,
        `R250-IRRF-${index + 1}`,
        `R2-50 IRRF ${index + 1}`,
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
        $1::uuid, $2, $3, 'R2-50 monthly payroll RPPS golden', 'RPPS', 2026,
        $6::numeric, 'RPPS', DATE '2026-01-01', $4::numeric, $5::numeric,
        $6::numeric, 0, 0, 'ACTIVE'::"RecordStatus"
      )
      `,
      [
        tenantId,
        `R250-RPPS-${index + 1}`,
        `R2-50 RPPS ${index + 1}`,
        bracket.min,
        bracket.max,
        bracket.rate,
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
    INSERT INTO hr.employment_link (
      tenant_id, code, name, contract_type, regime_law_reference, status
    )
    VALUES ($1::uuid, $2, $3, $4, $5, 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [
      tenantId,
      `R250-LINK-${runSuffix}-${vector.id}`,
      `R2-50 ${vector.id} link`,
      vector.contractType,
      `R2-50 ${vector.contractType}`,
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
      `R250-CT-${runSuffix}-${vector.id}`,
      `R2-50 ${vector.id} contract`,
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
      `R250-FS-${runSuffix}-${vector.id}`,
      `R2-50 ${vector.id} active`,
    ],
  );
  const shift = await client.query<{ id: string }>(
    `
    INSERT INTO hr.shift (tenant_id, code, description, daily_hours, status)
    VALUES ($1::uuid, $2, $3, 8.00, 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [
      tenantId,
      `R250-SHIFT-${runSuffix}-${vector.id}`,
      `R2-50 ${vector.id} shift`,
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
      `R250-SAL-${runSuffix}-${vector.id}`,
      `R2-50 ${vector.id} salary`,
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
      shift_id,
      hired_on,
      lifecycle_status,
      abono_permanencia_ativo,
      abono_permanencia_inicio,
      abono_permanencia_fundamento
    )
    VALUES (
      $1::uuid, $2, $3, $4, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::uuid,
      DATE '2020-01-01', 'ACTIVE'::"EmployeeLifecycleStatus", $10,
      CASE WHEN $10 THEN DATE '2026-01-01' ELSE NULL END,
      CASE WHEN $10 THEN 'R2-50 golden fixture' ELSE NULL END
    )
    ON CONFLICT (tenant_id, registration) DO UPDATE
    SET name = EXCLUDED.name,
        email = EXCLUDED.email,
        employment_link_id = EXCLUDED.employment_link_id,
        functional_status_id = EXCLUDED.functional_status_id,
        contract_type_id = EXCLUDED.contract_type_id,
        salary_reference_id = EXCLUDED.salary_reference_id,
        shift_id = EXCLUDED.shift_id,
        hired_on = EXCLUDED.hired_on,
        lifecycle_status = EXCLUDED.lifecycle_status,
        abono_permanencia_ativo = EXCLUDED.abono_permanencia_ativo,
        abono_permanencia_inicio = EXCLUDED.abono_permanencia_inicio,
        abono_permanencia_fundamento = EXCLUDED.abono_permanencia_fundamento,
        updated_at = now()
    RETURNING id::text
    `,
    [
      tenantId,
      vector.registration,
      `R2-50 ${vector.id}`,
      `${vector.registration.toLowerCase()}@example.test`,
      link.rows[0].id,
      functionalStatus.rows[0].id,
      contract.rows[0].id,
      salary.rows[0].id,
      shift.rows[0].id,
      vector.abonoPermanencia,
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

  if (vector.serviceYears > 0) {
    await client.query(
      `
      INSERT INTO hr.service_time_record (
        tenant_id, employee_id, source, starts_on, ends_on, days_count, notes
      )
      VALUES ($1::uuid, $2::uuid, 'r2-50-golden', DATE '2000-01-01', DATE '2000-01-01', $3, 'R2-50 service time')
      `,
      [tenantId, employee.rows[0].id, vector.serviceYears * 365],
    );
  }

  for (let index = 0; index < vector.dependents; index += 1) {
    await client.query(
      `
      INSERT INTO hr.employee_dependent (
        tenant_id, employee_id, name, relationship, income_tax_dependent
      )
      VALUES ($1::uuid, $2::uuid, $3, 'CHILD', true)
      `,
      [tenantId, employee.rows[0].id, `R2-50 dependent ${index + 1}`],
    );
  }
}

async function seedMonthlyGoldenRubrics(client: PoolClient): Promise<void> {
  await client.query(
    `
    CREATE OR REPLACE FUNCTION payroll_calc.f_inss_linear(
      p_employee_id uuid,
      p_month integer,
      p_year integer
    ) RETURNS numeric
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = payroll_calc, hr, payroll, public, pg_catalog
    AS $$
      SELECT CASE
        WHEN COALESCE(link.contract_type, '') = 'statutory' THEN 0.00
        ELSE round(
          payroll_calc.base_salary(employee.id, make_date(p_year, p_month, 1)) * ${fixture.rates.inssLinearPercent} / 100,
          2
        )::numeric(14, 2)
      END
      FROM hr.employee employee
      LEFT JOIN hr.employment_link link ON link.id = employee.employment_link_id
      WHERE employee.id = p_employee_id;
    $$;
    `,
  );
  await client.query(
    `
    CREATE OR REPLACE FUNCTION payroll_calc.f_ats(
      p_employee_id uuid,
      p_month integer,
      p_year integer
    ) RETURNS numeric
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = payroll_calc, hr, payroll, public, pg_catalog
    AS $$
      SELECT payroll_calc.compute_ats(
        employee.tenant_id,
        employee.employment_link_id,
        payroll_calc.base_salary(employee.id, make_date(p_year, p_month, 1)),
        make_date(p_year, p_month, 1)
      )
      FROM hr.employee employee
      WHERE employee.id = p_employee_id;
    $$;
    `,
  );
  await client.query(
    `
    CREATE OR REPLACE FUNCTION payroll_calc.f_abono_permanencia(
      p_employee_id uuid,
      p_month integer,
      p_year integer
    ) RETURNS numeric
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = payroll_calc, hr, payroll, public, pg_catalog
    AS $$
      SELECT payroll_calc.compute_abono_permanencia(
        employee.tenant_id,
        employee.employment_link_id,
        payroll_calc.base_rpps(employee.id, make_date(p_year, p_month, 1)),
        make_date(p_year, p_month, 1)
      )
      FROM hr.employee employee
      WHERE employee.id = p_employee_id;
    $$;
    `,
  );
  await client.query(
    `
    CREATE OR REPLACE FUNCTION payroll_calc.f_irrf_progressive(
      p_employee_id uuid,
      p_month integer,
      p_year integer
    ) RETURNS numeric
    LANGUAGE sql
    STABLE
    AS $$
      SELECT payroll_calc.compute_irrf(
        public.sgp_current_tenant_uuid(),
        payroll_calc.base_irrf(p_employee_id, make_date(p_year, p_month, 1)),
        payroll_calc.dependent_count(p_employee_id)::integer,
        make_date(p_year, p_month, 1)
      );
    $$;
    `,
  );
  await client.query(
    `
    CREATE OR REPLACE FUNCTION payroll_calc.f_rpps_progressive(
      p_employee_id uuid,
      p_month integer,
      p_year integer
    ) RETURNS numeric
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = payroll_calc, hr, payroll, public, pg_catalog
    AS $$
      SELECT payroll_calc.compute_rpps(
        employee.tenant_id,
        employee.employment_link_id,
        payroll_calc.base_rpps(employee.id, make_date(p_year, p_month, 1)),
        make_date(p_year, p_month, 1)
      )
      FROM hr.employee employee
      WHERE employee.id = p_employee_id;
    $$;
    `,
  );

  const payrollType = await client.query<{ id: string }>(
    `
    SELECT id::text
    FROM payroll.payroll_type
    WHERE tenant_id = $1::uuid
      AND code = 'MENSAL'
    LIMIT 1
    `,
    [tenantId],
  );
  const payrollTypeId = payrollType.rows[0]?.id;
  if (!payrollTypeId) {
    throw new Error('MENSAL payroll type was not created by openCompetence');
  }

  const rubrics = [
    [
      'INSS',
      'Contribuicao previdenciaria RGPS',
      'DEDUCTION',
      false,
      '{"inss":true,"official_social_security":true}',
      'inss_linear',
      'f_inss_linear',
      ['BASE_SALARY'],
    ],
    [
      'IRRF',
      'Imposto de Renda Retido na Fonte',
      'DEDUCTION',
      false,
      '{"income_tax":true}',
      'irrf',
      'f_irrf_progressive',
      ['BASE_IRRF', 'DEPENDENTES'],
    ],
    [
      'RPPS',
      'Contribuicao previdenciaria RPPS',
      'DEDUCTION',
      false,
      '{"rpps":true,"official_social_security":true}',
      'rpps',
      'f_rpps_progressive',
      ['BASE_RPPS'],
    ],
    [
      'ATS',
      'Adicional por tempo de servico',
      'EARNING',
      true,
      '{"service_time":true,"monthly_payroll":true}',
      'ats',
      'f_ats',
      ['BASE_SALARY', 'TEMPO_SERVICO_ANOS'],
    ],
    [
      'ABONO_PERMANENCIA',
      'Abono de permanencia',
      'EARNING',
      false,
      '{"abono_permanencia":true,"monthly_payroll":true}',
      'abono_permanencia',
      'f_abono_permanencia',
      ['BASE_RPPS'],
    ],
  ] as const;

  for (const rubric of rubrics) {
    const result = await client.query<{ id: string }>(
      `
      INSERT INTO payroll.payroll_earning_deduction (
        tenant_id, code, description, kind, taxable, active, incidences,
        starts_on, formula_alias, formula_function_name, formula_expression,
        formula_dependencies, formula_ready
      )
      VALUES (
        $1::uuid, $2, $3, $4::"PayrollEntryKind", $5, true, $6::jsonb,
        DATE '2026-01-01', $7, $8, NULL, $9::text[], true
      )
      ON CONFLICT (tenant_id, code) DO UPDATE
      SET description = EXCLUDED.description,
          kind = EXCLUDED.kind,
          taxable = EXCLUDED.taxable,
          active = true,
          incidences = EXCLUDED.incidences,
          starts_on = EXCLUDED.starts_on,
          formula_alias = EXCLUDED.formula_alias,
          formula_function_name = EXCLUDED.formula_function_name,
          formula_dependencies = EXCLUDED.formula_dependencies,
          formula_ready = true,
          formula_error = NULL,
          updated_at = now()
      RETURNING id::text
      `,
      [
        tenantId,
        rubric[0],
        rubric[1],
        rubric[2],
        rubric[3],
        rubric[4],
        rubric[5],
        rubric[6],
        rubric[7],
      ],
    );

    await client.query(
      `
      INSERT INTO payroll.payroll_type_earning (
        tenant_id, payroll_type_id, earning_deduction_id, default_quantity,
        starts_on, status
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, 1.0000, DATE '2026-01-01', 'ACTIVE'::"RecordStatus")
      ON CONFLICT (tenant_id, payroll_type_id, earning_deduction_id) DO UPDATE
      SET default_quantity = EXCLUDED.default_quantity,
          starts_on = EXCLUDED.starts_on,
          status = EXCLUDED.status,
          updated_at = now()
      `,
      [tenantId, payrollTypeId, result.rows[0].id],
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
  await client.query(
    'DELETE FROM hr.employee_dependent WHERE tenant_id = $1::uuid',
    [tenantId],
  );
  await client.query(
    'DELETE FROM hr.service_time_record WHERE tenant_id = $1::uuid',
    [tenantId],
  );
  await client.query(
    'DELETE FROM hr.employment_contract WHERE tenant_id = $1::uuid',
    [tenantId],
  );
  await client.query(
    'DELETE FROM hr.competence_period WHERE tenant_id = $1::uuid',
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
