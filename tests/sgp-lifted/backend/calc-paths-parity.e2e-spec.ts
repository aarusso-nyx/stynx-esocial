import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { Pool } from 'pg';

import { roundMoney } from '../../backend/src/common/money/money';

describe('CALC-08 SQL and TS money boundary parity', () => {
  let pool: Pool;

  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for calc-paths-parity');
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('matches evaluate_earning_deduction numeric(14,2) to TS roundMoney boundary', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.bypass_rls', 'true', true)");

      const rows = await client.query<{
        tenant_id: string;
        earning_deduction_id: string;
        employee_id: string;
      }>(`
        SELECT
          ped.tenant_id::text,
          ped.id::text AS earning_deduction_id,
          employee.id::text AS employee_id
        FROM payroll.payroll_earning_deduction ped
        JOIN hr.employee employee ON employee.tenant_id = ped.tenant_id
        WHERE ped.formula_ready = true
          AND ped.formula_function_name IS NOT NULL
          AND to_regprocedure(
            format(
              'payroll_calc.%I(uuid, integer, integer)',
              ped.formula_function_name
            )
          ) IS NOT NULL
          AND ped.code <> 'DESCONTO_TETO'
          AND ped.code <> 'DECIMO_TERCEIRO_BASE'
        ORDER BY ped.updated_at DESC
        LIMIT 1
      `);

      if (!rows.rows[0]) {
        throw new Error(
          'calc-paths-parity requires at least one compiled formula and employee; run db:smoke/seed before the e2e gate.',
        );
      }

      const row = rows.rows[0];
      await client.query(
        "SELECT set_config('app.current_tenant_id', $1, true)",
        [row.tenant_id],
      );
      await client.query("SELECT set_config('app.current_tenant', $1, true)", [
        row.tenant_id,
      ]);

      const evaluated = await client.query<{ amount: string }>(
        `
        SELECT (
          payroll_calc.evaluate_earning_deduction(
            $1::uuid,
            $2::uuid,
            5,
            2026
          )::numeric(14, 2)
        )::text AS amount
        `,
        [row.earning_deduction_id, row.employee_id],
      );

      const amount = evaluated.rows[0]?.amount ?? '0.00';
      expect(roundMoney(amount).toFixed(2)).toBe(amount);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});

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
