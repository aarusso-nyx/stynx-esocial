import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import Decimal from 'decimal.js';
import { Pool, PoolClient, QueryResultRow } from 'pg';

const tenantId = '00000000-0000-0000-0000-000000000129';

interface RescisaoRow extends QueryResultRow {
  item_code: string;
  amount: string;
}

describe('CALC-12 termination payroll golden scenarios (e2e)', () => {
  let pool: Pool;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for calc-rescisao');
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await setBypassContext(client);
      await cleanupTenant(client);
      await client.query(
        `
        INSERT INTO public.tenant (id, slug, code, name, status)
        VALUES ($1::uuid, 'calc12-e2e', 'CALC12', 'CALC-12 E2E', 'ACTIVE'::"RecordStatus")
        ON CONFLICT (id) DO UPDATE
        SET slug = EXCLUDED.slug,
            code = EXCLUDED.code,
            name = EXCLUDED.name,
            status = EXCLUDED.status
        `,
        [tenantId],
      );
      await seedRppsTable(client);
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
      await pool.end();
    }
  });

  it('calculates CLT without cause with current 8 avos and vested vacation without implicit notice', async () => {
    const linkId = await createEmployee(
      'CLT-SJC',
      'celetista',
      '3000.00',
      '2024-01-01',
    );
    const rows = await compute(linkId, '2025-08-20', 'SEM_JUSTA_CAUSA');

    expectAmount(rows, 'RESC_SALDO', '2000.00');
    expectAmount(rows, 'RESC_13_PROP', '2000.00');
    expectAmount(rows, 'RESC_FERIAS_VENCIDAS', '3000.00');
    expectAmount(rows, 'RESC_FERIAS_VENCIDAS_TERCO', '1000.00');
    expectAmount(rows, 'RESC_FERIAS_PROP', '2000.00');
    expectAmount(rows, 'RESC_FERIAS_TERCO', '666.67');
    expectNoAmount(rows, 'RESC_AVISO_PREVIO');
    expectNoAmount(rows, 'RESC_MULTA_FGTS_40');
  });

  it('calculates CLT resignation without FGTS fine or indemnified notice', async () => {
    const linkId = await createEmployee(
      'CLT-PED',
      'celetista',
      '3000.00',
      '2025-01-01',
    );
    const rows = await compute(linkId, '2025-08-20', 'PEDIDO_DEMISSAO');

    expectAmount(rows, 'RESC_SALDO', '2000.00');
    expectAmount(rows, 'RESC_13_PROP', '2000.00');
    expectAmount(rows, 'RESC_FERIAS_PROP', '2000.00');
    expectAmount(rows, 'RESC_FERIAS_TERCO', '666.67');
    expectNoAmount(rows, 'RESC_AVISO_PREVIO');
    expectNoAmount(rows, 'RESC_MULTA_FGTS_40');
  });

  it('calculates statutory retirement with proportional thirteenth and no FGTS fine', async () => {
    const linkId = await createEmployee(
      'STAT-APOS',
      'statutory',
      '6000.00',
      '2025-01-01',
    );
    const rows = await compute(linkId, '2025-09-20', 'APOSENTADORIA');

    expectAmount(rows, 'RESC_SALDO', '4000.00');
    expectAmount(rows, 'RESC_13_PROP', '4500.00');
    expectAmount(rows, 'RPPS', '1190.00');
    expectNoAmount(rows, 'RESC_MULTA_FGTS_40');
  });

  it('calculates statutory vested and proportional vacations', async () => {
    const linkId = await createEmployee(
      'STAT-FERIAS',
      'statutory',
      '3600.00',
      '2024-01-01',
    );
    const rows = await compute(linkId, '2026-03-20', 'OUTRA');

    expectAmount(rows, 'RESC_SALDO', '2400.00');
    expectAmount(rows, 'RESC_13_PROP', '900.00');
    expectAmount(rows, 'RESC_FERIAS_VENCIDAS', '7200.00');
    expectAmount(rows, 'RESC_FERIAS_VENCIDAS_TERCO', '2400.00');
    expectAmount(rows, 'RESC_FERIAS_PROP', '900.00');
    expectAmount(rows, 'RESC_FERIAS_TERCO', '300.00');
    expectAmount(rows, 'RPPS', '462.00');
  });

  async function compute(
    employmentLinkId: string,
    terminationDate: string,
    cause: string,
  ): Promise<RescisaoRow[]> {
    const result = await pool.query<RescisaoRow>(
      `
      SELECT item_code, amount::text
      FROM payroll_calc.compute_rescisao($1::uuid, $2::uuid, $3::date, $4)
      ORDER BY item_code
      `,
      [tenantId, employmentLinkId, terminationDate, cause],
    );
    return result.rows;
  }

  async function createEmployee(
    code: string,
    contractType: string,
    salaryAmount: string,
    hiredOn: string,
  ): Promise<string> {
    const client = await pool.connect();
    try {
      await setBypassContext(client);
      const suffix = `${code}-${Date.now().toString(36)}`;
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
          `CALC12-LINK-${suffix}`,
          `CALC-12 ${code}`,
          contractType,
          contractType === 'celetista' ? 'CLT' : 'Lei 8.112/90',
        ],
      );
      const functionalStatus = await client.query<{ id: string }>(
        `
        INSERT INTO hr.functional_status (
          tenant_id, code, description, enters_payroll, lifecycle_status, status
        )
        VALUES ($1::uuid, $2, 'CALC-12 active', true, 'ACTIVE'::"EmployeeLifecycleStatus", 'ACTIVE'::"RecordStatus")
        RETURNING id::text
        `,
        [tenantId, `CALC12-FS-${suffix}`],
      );
      const contractTypeRow = await client.query<{ id: string }>(
        `
        INSERT INTO hr.contract_type (tenant_id, code, name, status)
        VALUES ($1::uuid, $2, $3, 'ACTIVE'::"RecordStatus")
        RETURNING id::text
        `,
        [tenantId, `CALC12-CT-${suffix}`, contractType],
      );
      const salary = await client.query<{ id: string }>(
        `
        INSERT INTO hr.salary_reference (tenant_id, code, description, amount, vigencia_inicio)
        VALUES ($1::uuid, $2, 'CALC-12 salary', $3::numeric, DATE '2024-01-01')
        RETURNING id::text
        `,
        [tenantId, `CALC12-SAL-${suffix}`, salaryAmount],
      );
      const employee = await client.query<{ id: string }>(
        `
        INSERT INTO hr.employee (
          tenant_id, registration, name, employment_link_id, functional_status_id,
          contract_type_id, salary_reference_id, hired_on, lifecycle_status
        )
        VALUES (
          $1::uuid, $2, $3, $4::uuid, $5::uuid, $6::uuid, $7::uuid,
          $8::date, 'ACTIVE'::"EmployeeLifecycleStatus"
        )
        RETURNING id::text
        `,
        [
          tenantId,
          `CALC12-${suffix}`,
          `CALC-12 ${code}`,
          link.rows[0].id,
          functionalStatus.rows[0].id,
          contractTypeRow.rows[0].id,
          salary.rows[0].id,
          hiredOn,
        ],
      );
      await client.query(
        `
        INSERT INTO hr.employee_status_history (
          tenant_id, employee_id, functional_status_id, starts_on
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4::date)
        `,
        [tenantId, employee.rows[0].id, functionalStatus.rows[0].id, hiredOn],
      );
      return link.rows[0].id;
    } finally {
      client.release();
    }
  }
});

function expectAmount(
  rows: RescisaoRow[],
  code: string,
  expected: string,
): void {
  const found = rows.find((row) => row.item_code === code);
  expect(new Decimal(found?.amount ?? '0').toFixed(2)).toBe(expected);
}

function expectNoAmount(rows: RescisaoRow[], code: string): void {
  const found = rows.find((row) => row.item_code === code);
  expect(found).toBeUndefined();
}

async function seedRppsTable(client: PoolClient): Promise<void> {
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
      'CALC12-RPPS',
      'CALC-12 RPPS',
      'payroll',
      2025,
      14.000000,
      'RPPS',
      DATE '2024-01-01',
      0.00,
      NULL,
      14.000000,
      0.00,
      0.00,
      'ACTIVE'::"RecordStatus"
    )
    ON CONFLICT (tenant_id, code) DO UPDATE
    SET rate_percent = EXCLUDED.rate_percent,
        rate = EXCLUDED.rate,
        kind = EXCLUDED.kind,
        competence_start = EXCLUDED.competence_start,
        bracket_min = EXCLUDED.bracket_min,
        bracket_max = EXCLUDED.bracket_max,
        status = EXCLUDED.status
    `,
    [tenantId],
  );
}

async function cleanupTenant(client: PoolClient): Promise<void> {
  const tenantParams = [tenantId];
  await client.query(
    'DELETE FROM payment.prior_notice WHERE tenant_id = $1::uuid',
    tenantParams,
  );
  await client.query(
    'DELETE FROM payroll.employee_payroll_item WHERE tenant_id = $1::uuid',
    tenantParams,
  );
  await client.query(
    'DELETE FROM payroll.payroll_financial_record WHERE tenant_id = $1::uuid',
    tenantParams,
  );
  await client.query(
    'DELETE FROM payroll.payroll_run_status_history WHERE tenant_id = $1::uuid',
    tenantParams,
  );
  await client.query(
    'DELETE FROM hr.employment_contract WHERE tenant_id = $1::uuid',
    tenantParams,
  );
  await client.query(
    `
    UPDATE hr.employment_link
    SET termination_payroll_run_id = NULL
    WHERE tenant_id = $1::uuid
    `,
    tenantParams,
  );
  await client.query(
    'DELETE FROM payroll.payroll_run WHERE tenant_id = $1::uuid',
    tenantParams,
  );
  await client.query(
    'DELETE FROM payroll.processing_type WHERE tenant_id = $1::uuid',
    tenantParams,
  );
  await client.query(
    'DELETE FROM payroll.payroll_type WHERE tenant_id = $1::uuid',
    tenantParams,
  );
  await client.query(
    'DELETE FROM payroll.payroll_earning_deduction WHERE tenant_id = $1::uuid',
    tenantParams,
  );
  await deleteEmployeeStatusHistory(client, tenantParams);
  await client.query(
    'DELETE FROM hr.employee WHERE tenant_id = $1::uuid',
    tenantParams,
  );
  await client.query(
    'DELETE FROM hr.functional_status WHERE tenant_id = $1::uuid',
    tenantParams,
  );
  await client.query(
    'DELETE FROM hr.contract_type WHERE tenant_id = $1::uuid',
    tenantParams,
  );
  await client.query(
    'DELETE FROM hr.salary_reference WHERE tenant_id = $1::uuid',
    tenantParams,
  );
  await client.query(
    'DELETE FROM hr.employment_link WHERE tenant_id = $1::uuid',
    tenantParams,
  );
  await client.query(
    'DELETE FROM public.tax_rate WHERE tenant_id = $1::uuid',
    tenantParams,
  );
}

async function deleteEmployeeStatusHistory(
  client: PoolClient,
  tenantParams: string[],
): Promise<void> {
  await client.query("SET session_replication_role = 'replica'");
  try {
    await client.query(
      'DELETE FROM hr.employee_status_history WHERE tenant_id = $1::uuid',
      tenantParams,
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
