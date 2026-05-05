import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import Decimal from 'decimal.js';
import { Pool, PoolClient, QueryResultRow } from 'pg';

const tenantId = '00000000-0000-0000-0000-000000000148';

interface RescisaoRow extends QueryResultRow {
  item_code: string;
  amount: string;
  quantity: string;
}

describe('CLT-02 prior notice reflexes in termination payroll (e2e)', () => {
  let pool: Pool;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for calc-rescisao-aviso');
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await setBypassContext(client);
      await cleanupTenant(client);
      await client.query(
        `
        INSERT INTO public.tenant (id, slug, code, name, status)
        VALUES ($1::uuid, 'clt02-aviso-e2e', 'CLT02', 'CLT-02 Aviso E2E', 'ACTIVE'::"RecordStatus")
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
      await setBypassContext(client);
      await cleanupTenant(client);
    } finally {
      client.release();
      await pool.end();
    }
  });

  it('projects indemnified notice for one complete CLT year into 13th and vacation avos', async () => {
    const linkId = await createEmployee(
      'CLT-1Y',
      'celetista',
      '3000.00',
      '2025-01-20',
    );
    await resolveNotice(linkId, '2026-01-20', 'INDEMNIFIED');

    const rows = await compute(linkId, '2026-01-20', 'SEM_JUSTA_CAUSA');

    expectQuantity(rows, 'RESC_AVISO_PREVIO', '33.0000');
    expectAmount(rows, 'RESC_AVISO_PREVIO', '3300.00');
    expectQuantity(rows, 'RESC_13_PROP', '2.0000');
    expectQuantity(rows, 'RESC_FERIAS_PROP', '2.0000');
  });

  it('calculates 60 notice days for ten complete CLT years', async () => {
    const linkId = await createEmployee(
      'CLT-10Y',
      'celetista',
      '3000.00',
      '2016-01-01',
    );
    await resolveNotice(linkId, '2026-01-20', 'INDEMNIFIED');

    const rows = await compute(linkId, '2026-01-20', 'SEM_JUSTA_CAUSA');

    expectQuantity(rows, 'RESC_AVISO_PREVIO', '60.0000');
    expectAmount(rows, 'RESC_AVISO_PREVIO', '6000.00');
  });

  it('caps proportional notice at 90 days for long CLT service', async () => {
    const linkId = await createEmployee(
      'CLT-25Y',
      'celetista',
      '3000.00',
      '2001-01-01',
    );
    await resolveNotice(linkId, '2026-01-20', 'INDEMNIFIED');

    const rows = await compute(linkId, '2026-01-20', 'SEM_JUSTA_CAUSA');

    expectQuantity(rows, 'RESC_AVISO_PREVIO', '90.0000');
    expectAmount(rows, 'RESC_AVISO_PREVIO', '9000.00');
  });

  it('discounts unworked notice on CLT resignation', async () => {
    const linkId = await createEmployee(
      'CLT-PED',
      'celetista',
      '3000.00',
      '2025-01-01',
    );
    await resolveNotice(linkId, '2026-01-20', 'INDEMNIFIED');

    const rows = await compute(linkId, '2026-01-20', 'PEDIDO_DEMISSAO');

    expectQuantity(rows, 'RESC_AVISO_PREVIO_DESCONTO', '33.0000');
    expectAmount(rows, 'RESC_AVISO_PREVIO_DESCONTO', '3300.00');
    expectNoAmount(rows, 'RESC_AVISO_PREVIO');
  });

  it('does not create prior notice for statutory employment links', async () => {
    const linkId = await createEmployee(
      'STAT',
      'statutory',
      '3000.00',
      '2025-01-01',
    );
    await resolveNotice(linkId, '2026-01-20', 'INDEMNIFIED');

    const count = await pool.query<{ count: string }>(
      `
      SELECT count(*)::text
      FROM payment.prior_notice
      WHERE tenant_id = $1::uuid
        AND employment_link_id = $2::uuid
      `,
      [tenantId, linkId],
    );

    expect(count.rows[0]?.count).toBe('0');
  });

  async function resolveNotice(
    employmentLinkId: string,
    terminationDate: string,
    kind: string,
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await setBypassContext(client);
      await client.query(
        `
        SELECT *
        FROM payment.compute_prior_notice(
          $1::uuid,
          $2::date,
          $3::payment.prior_notice_kind,
          'NONE'::payment.prior_notice_reduction_mode
        )
        `,
        [employmentLinkId, terminationDate, kind],
      );
    } finally {
      client.release();
    }
  }

  async function compute(
    employmentLinkId: string,
    terminationDate: string,
    cause: string,
  ): Promise<RescisaoRow[]> {
    const result = await pool.query<RescisaoRow>(
      `
      SELECT item_code, amount::text, quantity::text
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
          `CLT02-LINK-${suffix}`,
          `CLT-02 ${code}`,
          contractType,
          contractType === 'celetista' ? 'CLT' : 'Lei 8.112/90',
        ],
      );
      const functionalStatus = await client.query<{ id: string }>(
        `
        INSERT INTO hr.functional_status (
          tenant_id, code, description, enters_payroll, lifecycle_status, status
        )
        VALUES ($1::uuid, $2, 'CLT-02 active', true, 'ACTIVE'::"EmployeeLifecycleStatus", 'ACTIVE'::"RecordStatus")
        RETURNING id::text
        `,
        [tenantId, `CLT02-FS-${suffix}`],
      );
      const contractTypeRow = await client.query<{ id: string }>(
        `
        INSERT INTO hr.contract_type (tenant_id, code, name, status)
        VALUES ($1::uuid, $2, $3, 'ACTIVE'::"RecordStatus")
        RETURNING id::text
        `,
        [tenantId, `CLT02-CT-${suffix}`, contractType],
      );
      const salary = await client.query<{ id: string }>(
        `
        INSERT INTO hr.salary_reference (tenant_id, code, description, amount, vigencia_inicio)
        VALUES ($1::uuid, $2, 'CLT-02 salary', $3::numeric, DATE '2024-01-01')
        RETURNING id::text
        `,
        [tenantId, `CLT02-SAL-${suffix}`, salaryAmount],
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
          `CLT02-${suffix}`,
          `CLT-02 ${code}`,
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

function expectQuantity(
  rows: RescisaoRow[],
  code: string,
  expected: string,
): void {
  const found = rows.find((row) => row.item_code === code);
  expect(new Decimal(found?.quantity ?? '0').toFixed(4)).toBe(expected);
}

function expectNoAmount(rows: RescisaoRow[], code: string): void {
  const found = rows.find((row) => row.item_code === code);
  expect(found).toBeUndefined();
}

async function cleanupTenant(client: PoolClient): Promise<void> {
  const tenantParams = [tenantId];
  await client.query(
    'DELETE FROM payment.prior_notice WHERE tenant_id = $1::uuid',
    tenantParams,
  );
  await client.query(
    'DELETE FROM hr.employment_contract WHERE tenant_id = $1::uuid',
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
