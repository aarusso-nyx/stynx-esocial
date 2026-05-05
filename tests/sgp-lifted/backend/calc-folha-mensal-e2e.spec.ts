process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS ??= 'true';

import { randomUUID } from 'node:crypto';

import Decimal from 'decimal.js';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResultRow } from 'pg';

import type { AuthenticatedActor } from '../../backend/src/auth/auth.types';
import type { CareerPlanService } from '../../backend/src/avaliacao/career-plan/career-plan.service';
import type { EligibilityService } from '../../backend/src/avaliacao/progression/progression.service';
import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { DatabaseService } from '../../backend/src/database/database.service';
import { FolhaMensalService } from '../../backend/src/folha-pagamento/payroll/folha-mensal.service';
import { PortalService } from '../../backend/src/portal/portal.service';

const tenantId = randomUUID();
const tenantBId = randomUUID();
const tenantSuffix = tenantId.slice(0, 8).toUpperCase();
const tenantBSuffix = tenantBId.slice(0, 8).toUpperCase();
const competence = { year: 2026, month: 5 };

const payrollPermissions = [
  'folha.read',
  'folha.write',
  'folha.rubrica.read',
  'folha.rubrica.write',
  'payroll.formula.read',
  'payroll.formula.write',
  'payroll.run.execute',
  'avaliacao.salary_history.read',
  'portal.paystub.read',
];

interface EmployeeFixture {
  id: string;
  registration: string;
}

interface CountRow extends QueryResultRow {
  visible_count: string;
}

describe('CALC-11 complete monthly payroll orchestration (e2e)', () => {
  let pool: Pool;
  let database: DatabaseService;
  let service: FolhaMensalService;
  let portalService: PortalService;
  const employees: EmployeeFixture[] = [];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for calc-folha-mensal');
    }

    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    database = new DatabaseService(
      new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }),
    );
    service = new FolhaMensalService(database);
    portalService = new PortalService(
      database,
      {} as CareerPlanService,
      {} as EligibilityService,
    );

    const client = await pool.connect();
    try {
      await setBypassContext(client, tenantId);
      await cleanupTenant(client, tenantId);
      await cleanupTenant(client, tenantBId);
      await ensureTenant(
        client,
        tenantId,
        `C11A${tenantSuffix}`,
        `calc11-e2e-${tenantId.slice(0, 8)}`,
      );
      await ensureTenant(
        client,
        tenantBId,
        `C11B${tenantBSuffix}`,
        `calc11b-e2e-${tenantBId.slice(0, 8)}`,
      );

      const fixtures = [
        ['STAT', 'statutory', '3200.00'],
        ['CLT', 'celetista', '4100.00'],
        ['TEMP', 'temporary', '2800.00'],
        ['STAT2', 'statutory', '5500.00'],
        ['CLT2', 'celetista', '1800.00'],
      ] as const;
      for (const [code, contractType, salary] of fixtures) {
        employees.push(
          await createEmployee(client, tenantId, code, contractType, salary),
        );
      }
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (!pool) return;
    const client = await pool.connect();
    try {
      await setBypassContext(client, tenantId);
      await cleanupTenant(client, tenantId);
      await cleanupTenant(client, tenantBId);
    } finally {
      client.release();
      await database?.onModuleDestroy();
      await pool.end();
    }
  });

  it('runs OPEN to CLOSED for five mixed-regime employees and publishes portal paystubs only after GENERATED', async () => {
    const opened = await asPayrollOperator(() =>
      service.openCompetence(competence),
    );
    expect(opened.competenceStatus).toBe('OPEN');
    expect(opened.payrollStatus).toBe('DRAFT');

    const calculated = await asPayrollOperator(() =>
      service.calculate(competence),
    );
    expect(calculated.competenceStatus).toBe('CALCULATED');
    expect(calculated.review).toHaveLength(5);
    assertTotals(calculated.review, calculated.totalNet);
    await expectPortalUnavailable(employees[0]);

    const approved = await asPayrollOperator(() => service.approve(competence));
    expect(approved.competenceStatus).toBe('APPROVED');
    await expectPortalUnavailable(employees[0]);

    const generated = await asPayrollOperator(() =>
      service.generate(competence),
    );
    expect(generated.competenceStatus).toBe('GENERATED');
    expect(generated.payrollStatus).toBe('GENERATED');

    const paystub = await asPortalEmployee(employees[0], () =>
      portalService.getPaystub(actorForEmployee(employees[0]), '2026-05'),
    );
    expect(paystub.competence).toBe('2026-05');
    expect(paystub.lines.length).toBeGreaterThan(0);
    expect(paystub.totals.net).toBe(
      calculated.review.find((row) => row.employeeId === employees[0].id)
        ?.netAmount,
    );

    const crossTenantRows = await RequestContextStore.run(
      {
        tenantId: tenantBId,
        permissions: ['portal.paystub.read'],
        actor: actorForTenant(tenantBId, ['portal.paystub.read']),
      },
      () =>
        database.query<CountRow>(
          `
          SELECT count(*)::text AS visible_count
          FROM portal.v_employee_paystub
          WHERE employee_id = $1::uuid
          `,
          [employees[0].id],
        ),
    );
    expect(crossTenantRows[0]?.visible_count).toBe('0');

    const closed = await asPayrollOperator(() => service.close(competence));
    expect(closed.competenceStatus).toBe('CLOSED');
    expect(closed.payrollStatus).toBe('CLOSED');
  });

  async function expectPortalUnavailable(
    employee: EmployeeFixture,
  ): Promise<void> {
    await expect(
      asPortalEmployee(employee, () =>
        portalService.getPaystub(actorForEmployee(employee), '2026-05'),
      ),
    ).rejects.toThrow(/not available/i);
  }

  function assertTotals(
    rows: {
      totalEarnings: string;
      totalDeductions: string;
      netAmount: string;
    }[],
    totalNet: string,
  ): void {
    const netSum = rows.reduce(
      (sum, row) => sum.plus(new Decimal(row.netAmount)),
      new Decimal(0),
    );
    for (const row of rows) {
      expect(
        new Decimal(row.totalEarnings).minus(row.totalDeductions).toFixed(2),
      ).toBe(new Decimal(row.netAmount).toFixed(2));
    }
    expect(netSum.toFixed(2)).toBe(new Decimal(totalNet).toFixed(2));
  }

  function asPayrollOperator<T>(fn: () => Promise<T>): Promise<T> {
    return RequestContextStore.run(
      {
        tenantId,
        permissions: payrollPermissions,
        actor: actorForTenant(tenantId, payrollPermissions),
      },
      fn,
    );
  }

  function asPortalEmployee<T>(
    employee: EmployeeFixture,
    fn: () => Promise<T>,
  ): Promise<T> {
    return RequestContextStore.run(
      {
        tenantId,
        permissions: ['portal.paystub.read'],
        actor: actorForEmployee(employee),
      },
      fn,
    );
  }
});

function actorForEmployee(employee: EmployeeFixture): AuthenticatedActor {
  return {
    sub: `calc11-${employee.registration}`,
    username: employee.registration,
    tenantId,
    groups: [],
    permissions: ['portal.paystub.read'],
  };
}

function actorForTenant(
  currentTenantId: string,
  permissions: string[],
): AuthenticatedActor {
  return {
    sub: `calc11-${currentTenantId}`,
    username: 'calc11-operator',
    tenantId: currentTenantId,
    groups: [],
    permissions,
  };
}

async function ensureTenant(
  client: PoolClient,
  currentTenantId: string,
  code: string,
  slug: string,
): Promise<void> {
  await client.query(
    `
    INSERT INTO public.tenant (id, slug, code, name, status)
    VALUES ($1::uuid, $2, $3, $4, 'ACTIVE'::"RecordStatus")
    ON CONFLICT (id) DO UPDATE
    SET slug = EXCLUDED.slug,
        code = EXCLUDED.code,
        name = EXCLUDED.name,
        status = EXCLUDED.status
    `,
    [currentTenantId, slug, code, `${code} E2E`],
  );
}

async function createEmployee(
  client: PoolClient,
  currentTenantId: string,
  code: string,
  contractType: string,
  salaryAmount: string,
): Promise<EmployeeFixture> {
  const suffix = `CALC11-${code}`;
  const link = await client.query<{ id: string }>(
    `
    INSERT INTO hr.employment_link (
      tenant_id, code, name, contract_type, end_date, regime_law_reference, status
    )
    VALUES ($1::uuid, $2, $3, $4, $5::date, $6, 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [
      currentTenantId,
      `${suffix}-LINK`,
      `${suffix} employment link`,
      contractType,
      contractType === 'temporary' ? '2026-12-31' : null,
      `Regime ${contractType}`,
    ],
  );
  const contract = await client.query<{ id: string }>(
    `
    INSERT INTO hr.contract_type (tenant_id, code, name, status)
    VALUES ($1::uuid, $2, $3, 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [currentTenantId, `${suffix}-CT`, `${suffix} contract`],
  );
  const functionalStatus = await client.query<{ id: string }>(
    `
    INSERT INTO hr.functional_status (
      tenant_id, code, description, enters_payroll, lifecycle_status, status
    )
    VALUES ($1::uuid, $2, $3, true, 'ACTIVE'::"EmployeeLifecycleStatus", 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [currentTenantId, `${suffix}-FS`, `${suffix} active`],
  );
  const shift = await client.query<{ id: string }>(
    `
    INSERT INTO hr.shift (tenant_id, code, description, daily_hours, status)
    VALUES ($1::uuid, $2, $3, 8.00, 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [currentTenantId, `${suffix}-SHIFT`, `${suffix} shift`],
  );
  const salary = await client.query<{ id: string }>(
    `
    INSERT INTO hr.salary_reference (
      tenant_id, code, description, amount, vigencia_inicio
    )
    VALUES ($1::uuid, $2, $3, $4::numeric, DATE '2026-01-01')
    RETURNING id::text
    `,
    [currentTenantId, `${suffix}-SAL`, `${suffix} salary`, salaryAmount],
  );
  const registration = `${suffix}-REG`;
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
      lifecycle_status
    )
    VALUES (
      $1::uuid, $2, $3, $4, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9::uuid,
      DATE '2024-01-01', 'ACTIVE'::"EmployeeLifecycleStatus"
    )
    RETURNING id::text
    `,
    [
      currentTenantId,
      registration,
      `${suffix} employee`,
      `${registration.toLowerCase()}@example.test`,
      link.rows[0].id,
      functionalStatus.rows[0].id,
      contract.rows[0].id,
      salary.rows[0].id,
      shift.rows[0].id,
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
      DATE '2024-01-01', DATE '2024-01-01', 'ACTIVE'::"RecordStatus"
    )
    `,
    [
      currentTenantId,
      employee.rows[0].id,
      link.rows[0].id,
      contract.rows[0].id,
    ],
  );
  return { id: employee.rows[0].id, registration };
}

async function cleanupTenant(
  client: PoolClient,
  currentTenantId: string,
): Promise<void> {
  await client.query(
    'DELETE FROM payroll.employee_payroll_item WHERE tenant_id = $1::uuid',
    [currentTenantId],
  );
  await client.query(
    'DELETE FROM payroll.payroll_financial_record WHERE tenant_id = $1::uuid',
    [currentTenantId],
  );
  await client.query(
    `
    DELETE FROM payroll.payroll_run_status_history history
    USING payroll.payroll_run run
    WHERE history.payroll_run_id = run.id
      AND run.tenant_id = $1::uuid
    `,
    [currentTenantId],
  );
  await client.query(
    'DELETE FROM payroll.payroll_run_work_location WHERE tenant_id = $1::uuid',
    [currentTenantId],
  );
  await client.query(
    'DELETE FROM payroll.payroll_run WHERE tenant_id = $1::uuid',
    [currentTenantId],
  );
  await client.query(
    'DELETE FROM payroll.payroll_type_earning WHERE tenant_id = $1::uuid',
    [currentTenantId],
  );
  await client.query(
    'DELETE FROM payroll.payroll_earning_deduction WHERE tenant_id = $1::uuid',
    [currentTenantId],
  );
  await client.query(
    'DELETE FROM payroll.processing_type WHERE tenant_id = $1::uuid',
    [currentTenantId],
  );
  await client.query(
    'DELETE FROM payroll.payroll_type WHERE tenant_id = $1::uuid',
    [currentTenantId],
  );
  await client.query(
    'DELETE FROM hr.competence_period WHERE tenant_id = $1::uuid',
    [currentTenantId],
  );
  await client.query(
    'DELETE FROM public.system_parameter WHERE tenant_id = $1::uuid',
    [currentTenantId],
  );
}

async function setBypassContext(
  client: PoolClient,
  currentTenantId: string,
): Promise<void> {
  await client.query("SELECT set_config('app.bypass_rls', 'true', false)");
  await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [
    currentTenantId,
  ]);
  await client.query("SELECT set_config('app.current_tenant', $1, false)", [
    currentTenantId,
  ]);
}
