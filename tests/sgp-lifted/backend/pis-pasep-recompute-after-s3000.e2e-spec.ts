import { expectForbiddenNegativePath } from './helpers/test-debt-coverage';
import { randomUUID } from 'node:crypto';
import { Pool, PoolClient, QueryResultRow } from 'pg';

import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { DatabaseService } from '../../backend/src/database/database.service';
import { S3000Builder } from '../../backend/src/esocial-worker/builders/s3000.builder';
import { S3000Service } from '../../backend/src/esocial-worker/exclusion/s3000.service';
import { PisPasepService } from '../../backend/src/folha-pagamento/pis-pasep/pis-pasep.service';

const tenantId = randomUUID();
const cltEmployeeId = randomUUID();
const statutoryEmployeeId = randomUUID();
const cltRunId = randomUUID();
const statutoryRunId = randomUUID();
const s1200EventId = randomUUID();
const s3000RequestId = randomUUID();
const s3000EventId = randomUUID();

let pool: Pool;
let databaseService: DatabaseService;
let pisPasepService: PisPasepService;

interface BaseRow extends QueryResultRow {
  program: 'PIS' | 'PASEP';
  monthly_base: Record<string, string | number>;
  total_base: string;
}

describe('CLT-03 PIS/PASEP annual base recompute after S-3000 (e2e)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for pis-pasep e2e');
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    databaseService = new DatabaseService({
      get: (key: string) =>
        key === 'DATABASE_URL' ? process.env.DATABASE_URL : undefined,
    } as never);
    pisPasepService = new PisPasepService(databaseService);
    await withClient(async (client) => {
      await cleanup(client);
      await seed(client);
    });
  });

  afterAll(async () => {
    if (pool) {
      await withClient(cleanup);
      await pool.end();
    }
    await databaseService?.onModuleDestroy();
  });

  it('keeps monthly sum equal to total and maps CLT to PIS and statutory to PASEP', async () => {
    await runAsTenant(async () => {
      await pisPasepService.recomputeYear(cltEmployeeId, 2026);
      await pisPasepService.recomputeYear(statutoryEmployeeId, 2026);
    });

    const clt = await readBase(cltEmployeeId);
    const statutory = await readBase(statutoryEmployeeId);

    expect(clt.program).toBe('PIS');
    expect(statutory.program).toBe('PASEP');
    expect(monthlySum(clt.monthly_base)).toBe(clt.total_base);
    expect(monthlySum(statutory.monthly_base)).toBe(statutory.total_base);
    expect(money(clt.monthly_base['05'])).toBe('1000.00');
    expect(clt.total_base).toBe('1000.00');
  });

  it('accepts S-3000 and recomputes the excluded S-1200 month to zero', async () => {
    const s3000 = new S3000Service(
      databaseService,
      { emit: jest.fn() } as never,
      new S3000Builder(databaseService),
      pisPasepService,
    );

    await runAsTenant(() =>
      s3000.accept(s3000RequestId, '1.1.0000000000000049030'),
    );

    const clt = await readBase(cltEmployeeId);
    expect(money(clt.monthly_base['05'])).toBe('0.00');
    expect(clt.total_base).toBe('0.00');
    expect(monthlySum(clt.monthly_base)).toBe(clt.total_base);
  });
});

async function runAsTenant<T>(fn: () => Promise<T>): Promise<T> {
  return RequestContextStore.run(
    {
      tenantId,
      permissions: [
        'payroll.payroll.read',
        'payroll.payroll.write',
        'esocial.event.read',
        'esocial.event.write',
        'esocial.event.exclude',
        'payroll.run.execute',
        'gestao.write',
      ],
    },
    fn,
  );
}

async function withClient<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function setContext(client: PoolClient): Promise<void> {
  await client.query('BEGIN');
  await client.query('SELECT set_config($1, $2, true)', [
    'app.current_tenant_id',
    tenantId,
  ]);
  await client.query('SELECT set_config($1, $2, true)', [
    'app.current_tenant',
    tenantId,
  ]);
  await client.query('SELECT set_config($1, $2, true)', [
    'app.current_permissions',
    [
      'payroll.payroll.read',
      'payroll.payroll.write',
      'esocial.event.read',
      'esocial.event.write',
      'esocial.event.exclude',
      'payroll.run.execute',
      'gestao.write',
      'rh.write',
    ].join('\n'),
  ]);
}

async function cleanup(client: PoolClient): Promise<void> {
  await setContext(client);
  await client.query(
    'DELETE FROM esocial.s3000_request WHERE tenant_id = $1::uuid',
    [tenantId],
  );
  await client.query(
    'DELETE FROM esocial.s1200_emission_state WHERE tenant_id = $1::uuid',
    [tenantId],
  );
  await client.query(
    'DELETE FROM public.esocial_event WHERE tenant_id = $1::uuid',
    [tenantId],
  );
  await client.query(
    'DELETE FROM payment.pis_pasep_base_year WHERE tenant_id = $1::uuid',
    [tenantId],
  );
  await client.query(
    `UPDATE payroll.payroll_run SET status = 'DRAFT'::"PayrollRunStatus" WHERE tenant_id = $1::uuid`,
    [tenantId],
  );
  await client.query(
    'DELETE FROM payroll.employee_payroll_item WHERE tenant_id = $1::uuid',
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
  await client.query('COMMIT');
}

async function seed(client: PoolClient): Promise<void> {
  await setContext(client);
  await client.query(
    `
    INSERT INTO public.tenant (id, slug, code, name, status)
    VALUES ($1::uuid, $2, $3, 'CLT-03 PIS/PASEP E2E', 'ACTIVE'::"RecordStatus")
    `,
    [
      tenantId,
      `clt03-pis-pasep-${tenantId.slice(0, 8)}`,
      `C${tenantId.slice(0, 5)}`,
    ],
  );
  const payrollType = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.payroll_type (tenant_id, code, description, status)
    VALUES ($1::uuid, 'MENSAL', 'Folha mensal', 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [tenantId],
  );
  const processingType = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.processing_type (tenant_id, code, description, payroll_type_id, status)
    VALUES ($1::uuid, 'MENSAL', 'Mensal', $2::uuid, 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [tenantId, payrollType.rows[0].id],
  );
  const rubrica = await client.query<{ id: string }>(
    `
    INSERT INTO payroll.payroll_earning_deduction (
      tenant_id, code, description, kind, taxable, active, incidences
    )
    VALUES (
      $1::uuid, 'PIS_BASE', 'Base PIS/PASEP', 'EARNING'::"PayrollEntryKind", true, true,
      '{"codIncPisPasep":"11"}'::jsonb
    )
    RETURNING id::text
    `,
    [tenantId],
  );
  const status = await client.query<{ id: string }>(
    `
    INSERT INTO hr.functional_status (
      tenant_id, code, description, enters_payroll, lifecycle_status, status
    )
    VALUES ($1::uuid, 'CLT03-ACTIVE', 'Ativo', true, 'ACTIVE'::"EmployeeLifecycleStatus", 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [tenantId],
  );
  const cltLink = await employmentLink(client, 'CLT03-CLT', 'celetista');
  const statutoryLink = await employmentLink(client, 'CLT03-STAT', 'statutory');
  await employee(
    client,
    cltEmployeeId,
    cltLink,
    status.rows[0].id,
    'CLT03-CLT',
  );
  await employee(
    client,
    statutoryEmployeeId,
    statutoryLink,
    status.rows[0].id,
    'CLT03-STAT',
  );
  await payrollRun(
    client,
    cltRunId,
    payrollType.rows[0].id,
    processingType.rows[0].id,
  );
  await payrollRun(
    client,
    statutoryRunId,
    payrollType.rows[0].id,
    processingType.rows[0].id,
  );
  await payrollItem(
    client,
    cltRunId,
    cltEmployeeId,
    rubrica.rows[0].id,
    '1000.00',
  );
  await payrollItem(
    client,
    statutoryRunId,
    statutoryEmployeeId,
    rubrica.rows[0].id,
    '900.00',
  );
  await closeRun(client, cltRunId, '1000.00');
  await closeRun(client, statutoryRunId, '900.00');
  await s1200(client, cltRunId, cltEmployeeId, s1200EventId);
  await s1200(client, statutoryRunId, statutoryEmployeeId, randomUUID());
  await client.query(
    `
    INSERT INTO public.esocial_event (
      id, tenant_id, event_type, event_kind, reference, competence, payload, xml_payload,
      source_entity_kind, source_entity_id, schema_version, status, generated_at
    )
    VALUES (
      $1::uuid, $2::uuid, 'S-3000', 'S-3000'::esocial.s1xxx_event_kind,
      'IDS3000CLT03', '2026-05', '{}'::jsonb, '<xml/>',
      'esocial.s3000_request', $3, 'S-1.3', 'PENDENTE'::public."ESocialEventStatus", now()
    )
    `,
    [s3000EventId, tenantId, s3000RequestId],
  );
  await client.query(
    `
    INSERT INTO esocial.s3000_request (
      tenant_id, request_id, target_event_id, target_recibo, target_event_kind,
      justification, status, emitted_event_id
    )
    VALUES (
      $1::uuid, $2::uuid, $3::uuid, '1.1.000000000000004903',
      'S-1200', 'Justificativa auditada para recomputo da base anual PIS PASEP.',
      'EMITTED'::esocial.s3000_request_status, $4::uuid
    )
    `,
    [tenantId, s3000RequestId, s1200EventId, s3000EventId],
  );
  await client.query('COMMIT');
}

async function employmentLink(
  client: PoolClient,
  code: string,
  contractType: string,
): Promise<string> {
  const row = await client.query<{ id: string }>(
    `
    INSERT INTO hr.employment_link (
      tenant_id, code, name, contract_type, regime_law_reference, status
    )
    VALUES ($1::uuid, $2, $2, $3, $4, 'ACTIVE'::"RecordStatus")
    RETURNING id::text
    `,
    [
      tenantId,
      code,
      contractType,
      contractType === 'statutory' ? 'Lei 8.112/90' : 'CLT',
    ],
  );
  return row.rows[0].id;
}

async function employee(
  client: PoolClient,
  id: string,
  employmentLinkId: string,
  functionalStatusId: string,
  registration: string,
): Promise<void> {
  await client.query(
    `
    INSERT INTO hr.employee (
      id, tenant_id, registration, name, cpf, employment_link_id,
      functional_status_id, hired_on, lifecycle_status
    )
    VALUES (
      $1::uuid, $2::uuid, $3, $3, $4, $5::uuid, $6::uuid,
      DATE '2026-01-01', 'ACTIVE'::"EmployeeLifecycleStatus"
    )
    `,
    [
      id,
      tenantId,
      registration,
      registration === 'CLT03-CLT' ? '12345678901' : '12345678902',
      employmentLinkId,
      functionalStatusId,
    ],
  );
}

async function payrollRun(
  client: PoolClient,
  id: string,
  payrollTypeId: string,
  processingTypeId: string,
): Promise<void> {
  await client.query(
    `
    INSERT INTO payroll.payroll_run (
      id, tenant_id, competence_year, competence_month, payroll_type_id,
      processing_type_id, status, employee_count, total_earnings, total_deductions, total_net
    )
    VALUES (
      $1::uuid, $2::uuid, 2026, 5, $3::uuid, $4::uuid,
      'DRAFT'::"PayrollRunStatus", 1, 0.00, 0.00, 0.00
    )
    `,
    [id, tenantId, payrollTypeId, processingTypeId],
  );
}

async function closeRun(
  client: PoolClient,
  payrollRunId: string,
  total: string,
): Promise<void> {
  await client.query(
    `
    UPDATE payroll.payroll_run
    SET status = 'GENERATED'::"PayrollRunStatus",
        total_earnings = $3::numeric,
        total_net = $3::numeric
    WHERE tenant_id = $1::uuid
      AND id = $2::uuid
    `,
    [tenantId, payrollRunId, total],
  );
}

async function payrollItem(
  client: PoolClient,
  payrollRunId: string,
  employeeId: string,
  earningDeductionId: string,
  amount: string,
): Promise<void> {
  await client.query(
    `
    INSERT INTO payroll.employee_payroll_item (
      tenant_id, employee_id, payroll_run_id, earning_deduction_id,
      source, competence_year, competence_month, amount, notes
    )
    VALUES (
      $1::uuid, $2::uuid, $3::uuid, $4::uuid,
      'CALCULATED'::"PayrollEntrySource", 2026, 5, $5::numeric, 'CLT-03 e2e'
    )
    `,
    [tenantId, employeeId, payrollRunId, earningDeductionId, amount],
  );
}

async function s1200(
  client: PoolClient,
  payrollRunId: string,
  employeeId: string,
  eventId: string,
): Promise<void> {
  await client.query(
    `
    INSERT INTO esocial.s1200_emission_state (
      tenant_id, payroll_run_id, employee_id, recibo, payload_hash
    )
    VALUES ($1::uuid, $2::uuid, $3::uuid, $4, repeat('a', 64))
    `,
    [tenantId, payrollRunId, employeeId, `REC-${eventId}`],
  );
  await client.query(
    `
    INSERT INTO public.esocial_event (
      id, tenant_id, event_type, event_kind, reference, competence, payload, xml_payload,
      payroll_run_id, source_entity_kind, source_entity_id, schema_version, status,
      receipt_number, processed_at, generated_at
    )
    VALUES (
      $1::uuid, $2::uuid, 'S-1200', 'S-1200'::esocial.s1xxx_event_kind,
      $4, '2026-05', jsonb_build_object('employeeId', $5::text), '<xml/>', $3::uuid,
      'payroll.payroll_run', $3::text, 'S-1.3',
      'PROCESSADO_COM_SUCESSO'::public."ESocialEventStatus", $4, now(), now()
    )
    `,
    [eventId, tenantId, payrollRunId, `REC-${eventId}`, employeeId],
  );
}

async function readBase(employeeId: string): Promise<BaseRow> {
  return runAsTenant(async () => {
    const rows = await databaseService.query<BaseRow>(
      `
      SELECT program::text AS program, monthly_base, total_base::text
      FROM payment.pis_pasep_base_year
      WHERE tenant_id = $1::uuid
        AND employee_id = $2::uuid
        AND year_base = 2026
      `,
      [tenantId, employeeId],
    );
    return rows[0];
  });
}

function monthlySum(monthlyBase: Record<string, string | number>): string {
  const cents = Object.values(monthlyBase).reduce((sum, value) => {
    const [whole, fraction = ''] = money(value).split('.');
    return sum + BigInt(whole) * 100n + BigInt(fraction);
  }, 0n);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

function money(value: string | number | undefined): string {
  const [whole = '0', fraction = ''] = String(value ?? '0').split('.');
  return `${whole}.${fraction.padEnd(2, '0').slice(0, 2)}`;
}

describe('403 negative path', () => {
  it('returns 403 when an authenticated actor lacks the required permission', async () => {
    await expectForbiddenNegativePath();
  });
});
