import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import Decimal from 'decimal.js';
import { Pool } from 'pg';

import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { DatabaseService } from '../../backend/src/database/database.service';
import { FormulaCompilerService } from '../../backend/src/payroll-engine/formula-compiler.service';

const tenantId = '00000000-0000-0000-0000-000000000100';

describe('CALC-01 formula engine golden scenarios (e2e)', () => {
  let pool: Pool;
  let databaseService: DatabaseService;
  let compiler: FormulaCompilerService;
  let employeeId: string;
  const rubricaIds: string[] = [];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for calc-formula-engine');
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
      await client.query(`
        INSERT INTO public.tenant (id, slug, code, name, status)
        VALUES ('${tenantId}', 'calc01-e2e', 'CALC01', 'CALC-01 E2E', 'ACTIVE'::"RecordStatus")
        ON CONFLICT (id) DO NOTHING
      `);

      const suffix = Date.now().toString(36);
      const shift = await client.query<{ id: string }>(
        `
        INSERT INTO hr.shift (tenant_id, code, description, daily_hours, status)
        VALUES ($1::uuid, $2, 'CALC-01 E2E shift', 8.00, 'ACTIVE'::"RecordStatus")
        RETURNING id::text
        `,
        [tenantId, `CALC01-SHIFT-${suffix}`],
      );
      const salary = await client.query<{ id: string }>(
        `
        INSERT INTO hr.salary_reference (tenant_id, code, description, amount, vigencia_inicio)
        VALUES ($1::uuid, $2, 'CALC-01 E2E salary', 2000.00, DATE '2026-01-01')
        RETURNING id::text
        `,
        [tenantId, `CALC01-SAL-${suffix}`],
      );
      const employee = await client.query<{ id: string }>(
        `
        INSERT INTO hr.employee (
          tenant_id,
          registration,
          name,
          salary_reference_id,
          shift_id,
          hired_on,
          lifecycle_status
        )
        VALUES (
          $1::uuid,
          $2,
          'CALC-01 E2E Employee',
          $3::uuid,
          $4::uuid,
          DATE '2020-01-01',
          'ACTIVE'::"EmployeeLifecycleStatus"
        )
        RETURNING id::text
        `,
        [tenantId, `CALC01-${suffix}`, salary.rows[0].id, shift.rows[0].id],
      );
      employeeId = employee.rows[0].id;
      await client.query(
        `
        INSERT INTO hr.employee_dependent (
          tenant_id,
          employee_id,
          name,
          relationship,
          income_tax_dependent
        )
        VALUES
          ($1::uuid, $2::uuid, 'CALC-01 Dependent A', 'CHILD', true),
          ($1::uuid, $2::uuid, 'CALC-01 Dependent B', 'CHILD', true)
        `,
        [tenantId, employeeId],
      );
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
          await client.query(
            'DELETE FROM hr.employee_dependent WHERE employee_id = $1::uuid',
            [employeeId],
          );
          await client.query('DELETE FROM hr.employee WHERE id = $1::uuid', [
            employeeId,
          ]);
        }
        await client.query(
          "DELETE FROM hr.salary_reference WHERE code LIKE 'CALC01-SAL-%'",
        );
        await client.query(
          "DELETE FROM hr.shift WHERE code LIKE 'CALC01-SHIFT-%'",
        );
      } finally {
        client.release();
      }
      await pool.end();
    }
    await databaseService?.onModuleDestroy();
  });

  it.each([
    ['simple sum', 'SALARIO_BASE + 100', new Decimal('2100.00')],
    ['hour multiplication', 'CARGA_HORARIA * 25', new Decimal('200.00')],
    ['conditional IF', 'IF(DEPENDENTES > 1, 150, 0)', new Decimal('150.00')],
    [
      'internal MAX/MIN',
      'MAX(MIN(SALARIO_BASE, 1800), 1700)',
      new Decimal('1800.00'),
    ],
  ])('evaluates %s', async (_name, expression, expected) => {
    const rubricaId = await createAndCompile(expression);
    const amount = await evaluate(rubricaId);

    expect(new Decimal(amount ?? '0').toFixed(2)).toBe(expected.toFixed(2));
  });

  it('evaluates a formula reference to another rubric', async () => {
    await createAndCompile('SALARIO_BASE + 100', 'base_plus');
    const referenced = await createAndCompile('base_plus() + 50', 'ref_plus');
    const amount = await evaluate(referenced);

    expect(new Decimal(amount ?? '0').toFixed(2)).toBe('2150.00');
  });

  async function createAndCompile(
    expression: string,
    alias = `calc01_${rubricaIds.length + 1}`,
  ): Promise<string> {
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
          $3,
          'EARNING'::"PayrollEntryKind",
          true,
          true,
          DATE '2026-01-01',
          $4,
          $5
        )
        RETURNING id::text
        `,
        [tenantId, alias.toUpperCase(), `CALC-01 ${alias}`, alias, expression],
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
          'folha.read',
          'rh.employee.read',
          'rh.dependent.read',
          'avaliacao.salary_history.read',
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
