import { Pool } from 'pg';

import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { DatabaseService } from '../../backend/src/database/database.service';
import { S2298Builder } from '../../backend/src/esocial-worker/s2298/s2298.builder';
import { S2298Service } from '../../backend/src/esocial-worker/s2298/s2298.service';
import { XsdValidatorService } from '../../backend/src/esocial-worker/xsd/xsd-validator.service';
import { ReintegrationOrderService } from '../../backend/src/folha-pagamento/operations/reintegration/reintegration-order.service';
import { FormulaCompilerService } from '../../backend/src/payroll-engine/formula-compiler.service';

const tenantId = '00000000-0000-0000-0000-000000077010';
const otherTenantId = '00000000-0000-0000-0000-000000077011';
const companyId = '00000000-0000-4000-8000-000000077001';
const branchId = '00000000-0000-4000-8000-000000077002';
const linkId = '00000000-0000-4000-8000-000000077003';
const employeeId = '00000000-0000-4000-8000-000000077004';
const statusId = '00000000-0000-4000-8000-000000077005';
const salaryId = '00000000-0000-4000-8000-000000077006';
const s2299EventId = '00000000-0000-4000-8000-000000077007';
const earningId = '00000000-0000-4000-8000-000000077008';
const emittedEventId = '00000000-0000-4000-8000-000000077009';

describe('Reintegracao retroativa S-2298 golden flow (e2e)', () => {
  let pool: Pool;
  let databaseService: DatabaseService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL is required for reintegracao-retroativa-6m',
      );
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    databaseService = new DatabaseService({
      get: (key: string) =>
        key === 'DATABASE_URL' ? process.env.DATABASE_URL : undefined,
    } as never);
    await seed(pool, databaseService);
  });

  afterAll(async () => {
    await cleanup(pool);
    await databaseService?.onModuleDestroy();
    await pool?.end();
  });

  it('reprocesses six competencies idempotently and emits XSD-valid S-2298', async () => {
    await runAsTenant(async () => {
      const service = new ReintegrationOrderService(databaseService);
      const order = await service.register(linkId, {
        employmentLinkId: linkId,
        reinstatementDate: '2025-11-16',
        decisionDate: '2026-05-01',
        kind: 'JUDICIAL',
        processNumber: '12345678901234567890',
        court: 'TRT',
        originalTerminationEventId: s2299EventId,
      });

      const applied = await service.apply(order.id);
      expect(applied.reprocessedCompetencies).toEqual([
        '2025-11',
        '2025-12',
        '2026-01',
        '2026-02',
        '2026-03',
        '2026-04',
      ]);
      expect(applied.totalPayable).toBe('6000.00');

      const secondApply = await service.apply(order.id);
      expect(secondApply.totalPayable).toBe('6000.00');

      const activeLines = await databaseService.query<{ count: string }>(
        `
        SELECT count(*)::text
        FROM payroll.v_payroll_run_line_active
        WHERE tenant_id = $1::uuid
          AND employee_id = $2::uuid
          AND notes = 'REINSTATEMENT_RETRO'
        `,
        [tenantId, employeeId],
      );
      expect(activeLines[0].count).toBe('6');

      const builder = new S2298Builder(databaseService);
      const built = await builder.build(order.id);
      expect(built.xml).toContain(
        '<nrRecibo>1.2.0000000000000000001</nrRecibo>',
      );
      expect(built.xml).toContain('<dtEfetRetorno>2025-11-16</dtEfetRetorno>');
      expect(() =>
        new XsdValidatorService().assertValid('S-2298', built.xml, {
          allowUnsigned: true,
        }),
      ).not.toThrow();

      const s2298 = new S2298Service(databaseService, builder, {
        transmit: jest.fn(async () => ({
          id: emittedEventId,
          eventKind: 'S-2298',
          reference: built.reference,
          competence: built.competence,
          status: 'PENDENTE',
          createdAt: new Date('2026-05-02T12:00:00.000Z').toISOString(),
        })),
      } as never);
      const emitted = await s2298.emit(order.id);
      expect(emitted.status).toBe('TRANSMITTED');
      expect(emitted.originalS2299Receipt).toBe('1.2.0000000000000000001');
    });
  });
});

async function runAsTenant<T>(fn: () => Promise<T>): Promise<T> {
  return RequestContextStore.run(
    {
      tenantId,
      permissions: [
        'hr.employment.read',
        'hr.employment.write',
        'esocial.event.read',
        'esocial.event.write',
        'payroll.formula.read',
        'payroll.formula.write',
        'folha.read',
        'folha.write',
        'payroll.run.execute',
      ],
    },
    fn,
  );
}

async function seed(
  pool: Pool,
  databaseService: DatabaseService,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.bypass_rls', 'true', true)");
    await client.query(
      `
      INSERT INTO public.tenant (id, slug, code, name, status)
      VALUES
        ($1::uuid, 'es10-tenant-a', 'ES10A', 'ES-10 Tenant A', 'ACTIVE'::"RecordStatus"),
        ($2::uuid, 'es10-tenant-b', 'ES10B', 'ES-10 Tenant B', 'ACTIVE'::"RecordStatus")
      ON CONFLICT (id) DO NOTHING
      `,
      [tenantId, otherTenantId],
    );
    await client.query(
      `
      INSERT INTO hr.company (id, tenant_id, code, legal_name, trade_name, cnpj, status)
      VALUES ($1::uuid, $2::uuid, 'ES10-COMP', 'ES-10 Company', 'ES-10', '12345678000199', 'ACTIVE'::"RecordStatus")
      ON CONFLICT (tenant_id, code) DO UPDATE SET cnpj = EXCLUDED.cnpj
      `,
      [companyId, tenantId],
    );
    await client.query(
      `
      INSERT INTO hr.branch (id, tenant_id, company_id, code, name, cnpj, status)
      VALUES ($1::uuid, $2::uuid, $3::uuid, 'ES10-BR', 'ES-10 Branch', '12345678000199', 'ACTIVE'::"RecordStatus")
      ON CONFLICT (tenant_id, code) DO UPDATE SET company_id = EXCLUDED.company_id
      `,
      [branchId, tenantId, companyId],
    );
    await client.query(
      `
      INSERT INTO hr.functional_status (
        id,
        tenant_id,
        code,
        description,
        enters_payroll,
        lifecycle_status,
        status
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        'ES10-ACTIVE',
        'ES-10 Active',
        true,
        'ACTIVE'::"EmployeeLifecycleStatus",
        'ACTIVE'::"RecordStatus"
      )
      ON CONFLICT (tenant_id, code) DO UPDATE
      SET lifecycle_status = EXCLUDED.lifecycle_status
      `,
      [statusId, tenantId],
    );
    await client.query(
      `
      INSERT INTO hr.salary_reference (id, tenant_id, code, description, amount, vigencia_inicio)
      VALUES ($1::uuid, $2::uuid, 'ES10-SAL', 'ES-10 Salary', 2000.00, DATE '2025-01-01')
      ON CONFLICT (tenant_id, code) DO UPDATE SET amount = EXCLUDED.amount
      `,
      [salaryId, tenantId],
    );
    await client.query(
      `
      INSERT INTO hr.employment_link (
        id,
        tenant_id,
        code,
        name,
        contract_type,
        end_date,
        functional_status_id,
        status
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        'ES10-LINK',
        'ES-10 Link',
        'statutory',
        DATE '2025-11-15',
        $3::uuid,
        'ACTIVE'::"RecordStatus"
      )
      ON CONFLICT (tenant_id, code) DO UPDATE
      SET end_date = EXCLUDED.end_date,
          functional_status_id = EXCLUDED.functional_status_id
      `,
      [linkId, tenantId, statusId],
    );
    await client.query(
      `
      INSERT INTO hr.employee (
        id,
        tenant_id,
        registration,
        name,
        cpf,
        branch_id,
        salary_reference_id,
        functional_status_id,
        employment_link_id,
        hired_on,
        terminated_on,
        lifecycle_status
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        'ES10-2298',
        'Servidor Reintegracao ES10',
        '11122233344',
        $3::uuid,
        $4::uuid,
        $5::uuid,
        $6::uuid,
        DATE '2024-01-01',
        DATE '2025-11-15',
        'TERMINATED'::"EmployeeLifecycleStatus"
      )
      ON CONFLICT (tenant_id, registration) DO UPDATE
      SET terminated_on = EXCLUDED.terminated_on,
          lifecycle_status = EXCLUDED.lifecycle_status,
          employment_link_id = EXCLUDED.employment_link_id,
          salary_reference_id = EXCLUDED.salary_reference_id
      `,
      [employeeId, tenantId, branchId, salaryId, statusId, linkId],
    );
    await client.query(
      `
      INSERT INTO public.esocial_event (
        id,
        tenant_id,
        event_type,
        event_kind,
        reference,
        receipt_number,
        competence,
        payload,
        xml_payload,
        schema_version,
        status,
        source_entity_kind,
        source_entity_id
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        'S-2299',
        'S-2299'::esocial.s1xxx_event_kind,
        'ID0000000000000000000000000000000001',
        '1.2.0000000000000000001',
        '2025-11',
        $3::jsonb,
        '<xml/>',
        'S-1.3',
        'PROCESSADO_COM_SUCESSO'::"ESocialEventStatus",
        'employment_link',
        $4
      )
      ON CONFLICT (id) DO UPDATE
      SET receipt_number = EXCLUDED.receipt_number,
          source_entity_id = EXCLUDED.source_entity_id
      `,
      [
        s2299EventId,
        tenantId,
        JSON.stringify({ employmentLinkId: linkId }),
        linkId,
      ],
    );
    await client.query(
      `
      INSERT INTO payroll.payroll_earning_deduction (
        id,
        tenant_id,
        code,
        description,
        kind,
        formula_alias,
        formula_expression,
        active
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        'ES10_REINTEGRATION_RETRO',
        'ES-10 reintegration retro salary difference',
        'EARNING'::"PayrollEntryKind",
        'es10_reintegration_retro',
        'SALARIO_BASE / 2',
        true
      )
      ON CONFLICT (tenant_id, code) DO UPDATE
      SET formula_alias = EXCLUDED.formula_alias,
          formula_expression = EXCLUDED.formula_expression,
          active = true
      `,
      [earningId, tenantId],
    );
  } finally {
    client.release();
  }

  await runAsTenant(async () => {
    await new FormulaCompilerService(databaseService).compileEarningDeduction(
      earningId,
    );
  });
}

async function cleanup(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.bypass_rls', 'true', true)");
    await client.query(
      'DELETE FROM esocial.s2298_event WHERE tenant_id = $1::uuid',
      [tenantId],
    );
    await client.query(
      'DELETE FROM hr.reintegration_order WHERE tenant_id = $1::uuid',
      [tenantId],
    );
    await client.query(
      "UPDATE payroll.payroll_run SET status = 'DRAFT'::\"PayrollRunStatus\" WHERE tenant_id = $1::uuid AND cause = 'REINSTATEMENT_RETRO'",
      [tenantId],
    );
    await client.query(
      "DELETE FROM payroll.employee_payroll_item WHERE tenant_id = $1::uuid AND notes = 'REINSTATEMENT_RETRO'",
      [tenantId],
    );
    await client.query(
      "DELETE FROM payroll.payroll_financial_record WHERE tenant_id = $1::uuid AND metadata->>'cause' = 'REINSTATEMENT_RETRO'",
      [tenantId],
    );
    await client.query(
      "DELETE FROM payroll.payroll_run_status_history WHERE tenant_id = $1::uuid AND metadata->>'cause' = 'REINSTATEMENT_RETRO'",
      [tenantId],
    );
    await client.query(
      "DELETE FROM payroll.payroll_run WHERE tenant_id = $1::uuid AND cause = 'REINSTATEMENT_RETRO'",
      [tenantId],
    );
    await client.query(
      "DELETE FROM payroll.processing_type WHERE tenant_id = $1::uuid AND code = 'REINSTATEMENT_RETRO'",
      [tenantId],
    );
    await client.query(
      "DELETE FROM payroll.payroll_type WHERE tenant_id = $1::uuid AND code = 'REINSTATEMENT_RETRO'",
      [tenantId],
    );
    await client.query(
      'DELETE FROM payroll.payroll_earning_deduction WHERE id = $1::uuid',
      [earningId],
    );
    await client.query('DELETE FROM public.esocial_event WHERE id = $1::uuid', [
      s2299EventId,
    ]);
  } finally {
    client.release();
  }
}
