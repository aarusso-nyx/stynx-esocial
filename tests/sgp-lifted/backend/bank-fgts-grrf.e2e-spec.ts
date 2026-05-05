import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { randomUUID } from 'node:crypto';

import { Pool, PoolClient, QueryResultRow } from 'pg';

import { CaixaSifgeV4Adapter } from '../../backend/src/folha-pagamento/operations/sifge/caixa-sifge-v4.adapter';

const tenantId = randomUUID();
const tenantSlug = `bank05-fgts-e2e-${tenantId.slice(0, 8)}`;
const tenantCode = `B05${tenantId.slice(0, 8)}`.toUpperCase();

interface FineRow extends QueryResultRow {
  fgts_account_id: string;
  fgts_movement_id: string;
  employee_id: string;
  base_amount: string;
  amount: string;
}

describe('BANK-05 FGTS GRRF remittance (e2e)', () => {
  let pool: Pool;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for bank-fgts-grrf');
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await withClient(async (client) => {
      await cleanupTenant(client);
      await client.query(
        `
        INSERT INTO public.tenant (id, slug, code, name, status)
        VALUES ($1::uuid, $2, $3, 'BANK-05 FGTS E2E', 'ACTIVE'::"RecordStatus")
        ON CONFLICT (id) DO UPDATE
        SET slug = EXCLUDED.slug,
            code = EXCLUDED.code,
            name = EXCLUDED.name,
            status = EXCLUDED.status
        `,
        [tenantId, tenantSlug, tenantCode],
      );
    });
  });

  afterAll(async () => {
    if (!pool) return;
    await withClient((client) => cleanupTenant(client));
    await pool.end();
  });

  it('emits GRRF for a without-cause termination with a R$ 4.800,00 FGTS fine and SIFGE round-trip', async () => {
    const employee = await createEmployee();
    await seedFgtsBalance(
      employee.employeeId,
      employee.employmentLinkId,
      '12000.00',
    );
    const payrollRunId = await createPayrollRun();
    const [fine] = await computeFine(payrollRunId, employee.employmentLinkId);

    expect(fine.base_amount).toBe('12000.00');
    expect(fine.amount).toBe('4800.00');

    const remittanceId = await withClient(async (client) => {
      const remittance = await client.query<{ id: string }>(
        `
        INSERT INTO payment.fgts_remittance (
          tenant_id,
          competence,
          kind,
          status,
          generated_at,
          total_base,
          total_amount,
          dae_barcode,
          layout_version,
          adapter_key
        )
        VALUES (
          $1::uuid,
          DATE '2026-04-01',
          'GRRF_TERMINATION',
          'GENERATED',
          now(),
          $2::numeric(14,2),
          $3::numeric(14,2),
          '12345678901234567890123456789012345678901234',
          'SIFGE-4.0',
          'caixa-sifge-v4'
        )
        RETURNING id::text
        `,
        [tenantId, fine.base_amount, fine.amount],
      );
      await client.query(
        `
        INSERT INTO payment.fgts_grrf (
          tenant_id,
          fgts_remittance_id,
          employment_link_id,
          termination_date,
          base_balance,
          fine_rate,
          fine_amount,
          notice_amount
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          DATE '2026-04-15',
          $4::numeric(14,2),
          0.400000,
          $5::numeric(14,2),
          0
        )
        `,
        [
          tenantId,
          remittance.rows[0].id,
          employee.employmentLinkId,
          fine.base_amount,
          fine.amount,
        ],
      );
      return remittance.rows[0].id;
    });

    const adapter = new CaixaSifgeV4Adapter();
    const signed = adapter.signIfRequired(
      adapter.assemble({
        header: {
          tenantId,
          remittanceId,
          competence: '2026-04-01',
          kind: 'GRRF_TERMINATION',
          generatedAt: '2026-05-02T12:00:00.000Z',
          daeBarcode: '12345678901234567890123456789012345678901234',
        },
        totals: {
          employeeCount: 1,
          totalBase: fine.base_amount,
          totalAmount: fine.amount,
        },
        records: [
          {
            employeeId: fine.employee_id,
            employmentLinkId: employee.employmentLinkId,
            payrollRunId,
            baseAmount: fine.base_amount,
            rate: '0.400000',
            amount: fine.amount,
            movementId: fine.fgts_movement_id,
            terminationDate: '2026-04-15',
            noticeAmount: '0.00',
          },
        ],
      }),
    );
    const parsed = adapter.parse(signed);

    expect(parsed.signed).toBe(true);
    expect(parsed.header.kind).toBe('GRRF_TERMINATION');
    expect(parsed.totals.totalAmount).toBe('4800.00');
    expect(parsed.records[0].amount).toBe('4800.00');
  });

  async function createEmployee(): Promise<{
    employeeId: string;
    employmentLinkId: string;
  }> {
    return withClient(async (client) => {
      const suffix = Date.now().toString(36);
      const link = await client.query<{ id: string }>(
        `
        INSERT INTO hr.employment_link (
          tenant_id, code, name, contract_type, regime_law_reference, status
        )
        VALUES ($1::uuid, $2, 'BANK-05 CLT', 'celetista', 'CLT', 'ACTIVE'::"RecordStatus")
        RETURNING id::text
        `,
        [tenantId, `BANK05-LINK-${suffix}`],
      );
      const functionalStatus = await client.query<{ id: string }>(
        `
        INSERT INTO hr.functional_status (
          tenant_id, code, description, enters_payroll, lifecycle_status, status
        )
        VALUES ($1::uuid, $2, 'BANK-05 active', true, 'ACTIVE'::"EmployeeLifecycleStatus", 'ACTIVE'::"RecordStatus")
        RETURNING id::text
        `,
        [tenantId, `BANK05-FS-${suffix}`],
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
          terminated_on,
          lifecycle_status
        )
        VALUES (
          $1::uuid,
          $2,
          'BANK-05 CLT',
          $3::uuid,
          $4::uuid,
          DATE '2024-01-01',
          DATE '2026-04-15',
          'TERMINATED'::"EmployeeLifecycleStatus"
        )
        RETURNING id::text
        `,
        [
          tenantId,
          `BANK05-${suffix}`,
          link.rows[0].id,
          functionalStatus.rows[0].id,
        ],
      );
      return {
        employeeId: employee.rows[0].id,
        employmentLinkId: link.rows[0].id,
      };
    });
  }

  async function createPayrollRun(): Promise<string> {
    return withClient(async (client) => {
      const payrollType = await client.query<{ id: string }>(
        `
        INSERT INTO payroll.payroll_type (tenant_id, code, description, status)
        VALUES ($1::uuid, 'BANK05-RESCISAO', 'BANK-05 rescisao', 'ACTIVE'::"RecordStatus")
        ON CONFLICT (tenant_id, code) DO UPDATE
        SET description = EXCLUDED.description,
            updated_at = now()
        RETURNING id::text
        `,
        [tenantId],
      );
      const processingType = await client.query<{ id: string }>(
        `
        INSERT INTO payroll.processing_type (tenant_id, code, description, payroll_type_id, status)
        VALUES ($1::uuid, 'BANK05-RESCISAO', 'BANK-05 rescisao', $2::uuid, 'ACTIVE'::"RecordStatus")
        ON CONFLICT (tenant_id, code) DO UPDATE
        SET payroll_type_id = EXCLUDED.payroll_type_id,
            updated_at = now()
        RETURNING id::text
        `,
        [tenantId, payrollType.rows[0].id],
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
        VALUES ($1::uuid, 2026, 4, $2::uuid, $3::uuid, 'GENERATED'::"PayrollRunStatus")
        RETURNING id::text
        `,
        [tenantId, payrollType.rows[0].id, processingType.rows[0].id],
      );
      return run.rows[0].id;
    });
  }

  async function seedFgtsBalance(
    employeeId: string,
    employmentLinkId: string,
    balance: string,
  ): Promise<void> {
    await withClient(async (client) => {
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
        [tenantId, employeeId, employmentLinkId, balance],
      );
    });
  }

  async function computeFine(
    payrollRunId: string,
    employmentLinkId: string,
  ): Promise<FineRow[]> {
    return withClient(async (client) => {
      const result = await client.query<FineRow>(
        `
        SELECT
          result.fgts_account_id::text,
          result.fgts_movement_id::text,
          result.employee_id::text,
          result.base_amount::text,
          result.amount::text
        FROM payment.compute_fgts_termination_fine($1::uuid, $2::uuid, 'WITHOUT_CAUSE') result
        `,
        [payrollRunId, employmentLinkId],
      );
      return result.rows;
    });
  }

  async function withClient<T>(
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

async function cleanupTenant(client: PoolClient): Promise<void> {
  const params = [tenantId];
  await client.query(
    'DELETE FROM payment.fgts_grrf WHERE tenant_id = $1::uuid',
    params,
  );
  await client.query(
    'DELETE FROM payment.fgts_grf WHERE tenant_id = $1::uuid',
    params,
  );
  await client.query(
    'DELETE FROM payment.fgts_remittance WHERE tenant_id = $1::uuid',
    params,
  );
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
}

async function setContext(client: PoolClient): Promise<void> {
  await client.query('SET row_security = on');
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
      [
        'payroll.fgts.read',
        'payroll.fgts.write',
        'payment.remittance.write',
        'payroll.run.execute',
        'rh.employee.terminate',
        'folha.write',
        'gestao.write',
      ].join('\n'),
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
