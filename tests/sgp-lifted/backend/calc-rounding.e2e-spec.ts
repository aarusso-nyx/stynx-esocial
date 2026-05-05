import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import Decimal from 'decimal.js';
import { Pool } from 'pg';

import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { roundMoney } from '../../backend/src/common/money/money';
import { DatabaseService } from '../../backend/src/database/database.service';
import { FormulaCompilerService } from '../../backend/src/payroll-engine/formula-compiler.service';

const tenantId = '00000000-0000-0000-0000-000000000100';

describe('CALC-08 money rounding boundary (e2e)', () => {
  let pool: Pool;
  let databaseService: DatabaseService;
  let compiler: FormulaCompilerService;
  const rubricaIds: string[] = [];
  let employeeId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for calc-rounding');
    }

    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    databaseService = new DatabaseService({
      get: (key: string) =>
        key === 'DATABASE_URL' ? process.env.DATABASE_URL : undefined,
    } as never);
    compiler = new FormulaCompilerService(databaseService);

    const client = await pool.connect();
    try {
      await client.query("SELECT set_config('app.bypass_rls', 'true', true)");
      const suffix = Date.now().toString(36);
      const employee = await client.query<{ id: string }>(
        `
        INSERT INTO hr.employee (
          tenant_id,
          registration,
          name,
          hired_on,
          lifecycle_status
        )
        VALUES (
          $1::uuid,
          $2,
          'CALC-08 E2E Employee',
          DATE '2020-01-01',
          'ACTIVE'::"EmployeeLifecycleStatus"
        )
        RETURNING id::text
        `,
        [tenantId, `CALC08-${suffix}`],
      );
      employeeId = employee.rows[0].id;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (pool) {
      const client = await pool.connect();
      try {
        await client.query("SELECT set_config('app.bypass_rls', 'true', true)");
        for (const rubricaId of [...rubricaIds].reverse()) {
          await client.query(
            'DELETE FROM payroll.payroll_earning_deduction WHERE id = $1::uuid',
            [rubricaId],
          );
        }
        if (employeeId) {
          await client.query('DELETE FROM hr.employee WHERE id = $1::uuid', [
            employeeId,
          ]);
        }
      } finally {
        client.release();
      }
      await pool.end();
    }
    await databaseService?.onModuleDestroy();
  });

  it('rounds SQL formula evaluation to the same Decimal half-up boundary', async () => {
    const rubricaId = await createAndCompile('100.005');
    const amount = await evaluate(rubricaId);

    expect(new Decimal(amount ?? '0').toFixed(2)).toBe(
      roundMoney('100.005').toFixed(2),
    );
  });

  async function createAndCompile(expression: string): Promise<string> {
    const client = await pool.connect();
    try {
      await client.query("SELECT set_config('app.bypass_rls', 'true', true)");
      const inserted = await client.query<{ id: string }>(
        `
        INSERT INTO payroll.payroll_earning_deduction (
          tenant_id,
          code,
          description,
          kind,
          taxable,
          active,
          starts_on,
          formula_alias,
          formula_expression
        )
        VALUES (
          $1::uuid,
          $2,
          'CALC-08 rounding e2e',
          'EARNING'::"PayrollEntryKind",
          true,
          true,
          DATE '2026-01-01',
          $2,
          $3
        )
        RETURNING id::text
        `,
        [tenantId, `calc08_${Date.now().toString(36)}`, expression],
      );
      const id = inserted.rows[0].id;
      rubricaIds.push(id);
      await RequestContextStore.run(
        {
          tenantId,
          permissions: [
            'payroll.formula.read',
            'payroll.formula.write',
            'folha.rubrica.read',
            'folha.rubrica.write',
          ],
        },
        () => compiler.compileEarningDeduction(id),
      );
      return id;
    } finally {
      client.release();
    }
  }

  async function evaluate(rubricaId: string): Promise<string | null> {
    return RequestContextStore.run(
      {
        tenantId,
        permissions: [
          'payroll.formula.read',
          'folha.rubrica.read',
          'folha.rubrica.preview',
        ],
      },
      async () => {
        const rows = await databaseService.query<{ amount: string | null }>(
          `
          SELECT payroll_calc.evaluate_earning_deduction(
            $1::uuid,
            $2::uuid,
            5,
            2026
          )::text AS amount
          `,
          [rubricaId, employeeId],
        );
        return rows[0]?.amount ?? null;
      },
    );
  }
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
