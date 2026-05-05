import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { DatabaseService } from '../../backend/src/database/database.service';
import { S2306Builder } from '../../backend/src/esocial-worker/s2306/s2306.builder';
import { S2306Service } from '../../backend/src/esocial-worker/s2306/s2306.service';
import { XsdValidatorService } from '../../backend/src/esocial-worker/xsd/xsd-validator.service';
import { TsvContractService } from '../../backend/src/folha-pagamento/operations/tsv/tsv-contract.service';

const tenantId = '00000000-0000-0000-0000-000000078011';
const otherTenantId = '00000000-0000-0000-0000-000000078012';
const linkId = '00000000-0000-4000-8000-000000078101';
const workLocationId = '00000000-0000-4000-8000-000000078102';
const contractId = '00000000-0000-4000-8000-000000078103';
const employeeId = '00000000-0000-4000-8000-000000078104';
const emittedEventId = '00000000-0000-4000-8000-000000078106';

describe('TS-V contractual change S-2306 golden flow (e2e)', () => {
  let databaseService: DatabaseService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for TS-V S-2306 e2e');
    }
    databaseService = new DatabaseService({
      get: (key: string) =>
        key === 'DATABASE_URL' ? process.env.DATABASE_URL : undefined,
    } as never);
    await seed(databaseService);
  });

  afterAll(async () => {
    await cleanup(databaseService);
    await databaseService?.onModuleDestroy();
  });

  it('records only monthly_amount as a real diff and emits XSD-valid S-2306', async () => {
    await runAsTenant(async () => {
      const tsv = new TsvContractService(databaseService);
      const change = await tsv.update(contractId, {
        effectiveDate: '2026-05-01',
        reason: 'Reajuste de bolsa',
        monthlyAmount: '1500.00',
      });

      expect(change.fieldsChanged).toEqual({ monthly_amount: true });
      expect(change.previousValues).toEqual({ monthly_amount: '1200.00' });
      expect(change.newValues).toEqual({ monthly_amount: '1500.00' });

      const builder = new S2306Builder(databaseService);
      const built = await builder.build(change.id);
      expect(built.xml).toContain('<vrSalFx>1500.00</vrSalFx>');
      expect(built.xml).not.toContain('<cargoFuncao>');
      expect(() =>
        new XsdValidatorService().assertValid('S-2306', built.xml, {
          allowUnsigned: true,
        }),
      ).not.toThrow();

      const service = new S2306Service(databaseService, builder, {
        transmit: jest.fn(async () => ({
          id: emittedEventId,
          eventKind: 'S-2306',
          reference: built.reference,
          competence: built.competence,
          status: 'PENDENTE',
          createdAt: new Date('2026-05-02T12:00:00.000Z').toISOString(),
        })),
      } as never);
      const emitted = await service.emit(change.id);
      expect(emitted.status).toBe('TRANSMITTED');
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
        'rh.employee.write',
      ],
    },
    fn,
  );
}

async function seed(database: DatabaseService): Promise<void> {
  await database.query(
    `
    INSERT INTO public.tenant (id, slug, code, name, status)
    VALUES
      ($1::uuid, 'es11-tenant-a', 'ES11A', 'ES-11 Tenant A', 'ACTIVE'::public."RecordStatus"),
      ($2::uuid, 'es11-tenant-b', 'ES11B', 'ES-11 Tenant B', 'ACTIVE'::public."RecordStatus")
    ON CONFLICT (id) DO NOTHING
    `,
    [tenantId, otherTenantId],
  );

  await runAsTenant(async () => {
    await database.query(
      `
      INSERT INTO hr.employment_link (id, tenant_id, code, name, contract_type, end_date)
      VALUES ($1::uuid, $2::uuid, 'TSV-ES11', 'TS-V ES-11', 'temporary', DATE '2026-12-31')
      ON CONFLICT (tenant_id, code) DO UPDATE
      SET name = EXCLUDED.name,
          contract_type = EXCLUDED.contract_type,
          end_date = EXCLUDED.end_date
      `,
      [linkId, tenantId],
    );
    await database.query(
      `
      INSERT INTO hr.work_location (id, tenant_id, code, name)
      VALUES ($1::uuid, $2::uuid, 'TSV-ES11', 'TS-V ES-11')
      ON CONFLICT (tenant_id, code) DO UPDATE
      SET name = EXCLUDED.name
      `,
      [workLocationId, tenantId],
    );
    await database.query(
      `
      INSERT INTO hr.employee (
        id, tenant_id, registration, name, cpf, employment_link_id, work_location_id, hired_on
      )
      VALUES (
        $1::uuid, $2::uuid, 'TSV-2306', 'Estagiario ES11', '11144477735',
        $3::uuid, $4::uuid, DATE '2026-04-01'
      )
      ON CONFLICT (tenant_id, registration) DO UPDATE
      SET cpf = EXCLUDED.cpf,
          employment_link_id = EXCLUDED.employment_link_id
      `,
      [employeeId, tenantId, linkId, workLocationId],
    );
    await database.query(
      `
      INSERT INTO hr.tsv_contract (
        id, tenant_id, employment_link_id, tsv_category, start_date, role,
        monthly_amount, weekly_hours, workplace_id, education_institution
      )
      VALUES (
        $1::uuid, $2::uuid, $3::uuid, '901', DATE '2026-04-01',
        'Estagiario', 1200.00, 30.000000, $4::uuid, 'Universidade Municipal'
      )
      ON CONFLICT (id) DO UPDATE
      SET monthly_amount = 1200.00,
          weekly_hours = 30.000000,
          role = 'Estagiario'
      `,
      [contractId, tenantId, linkId, workLocationId],
    );
  });
}

async function cleanup(database: DatabaseService): Promise<void> {
  await runAsTenant(async () => {
    const s2306EventTable = await database.query<{ exists: boolean }>(
      "SELECT to_regclass('esocial.s2306_event') IS NOT NULL AS exists",
    );
    if (s2306EventTable[0]?.exists) {
      await database.query(
        'DELETE FROM esocial.s2306_event WHERE tenant_id = $1::uuid',
        [tenantId],
      );
    }
    await database.query(
      'DELETE FROM hr.tsv_contract_change WHERE tenant_id = $1::uuid',
      [tenantId],
    );
    await database.query(
      'DELETE FROM hr.tsv_contract WHERE tenant_id = $1::uuid',
      [tenantId],
    );
    await database.query('DELETE FROM hr.employee WHERE id = $1::uuid', [
      employeeId,
    ]);
    await database.query('DELETE FROM hr.work_location WHERE id = $1::uuid', [
      workLocationId,
    ]);
    await database.query('DELETE FROM hr.employment_link WHERE id = $1::uuid', [
      linkId,
    ]);
  });
}
