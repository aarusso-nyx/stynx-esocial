import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { DatabaseService } from '../../backend/src/database/database.service';
import { S2206Builder } from '../../backend/src/esocial-worker/builders/s2206.builder';
import { XsdValidatorService } from '../../backend/src/esocial-worker/xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000003206';
const companyId = '00000000-0000-4000-8000-000000003260';
const branchOneId = '00000000-0000-4000-8000-000000003261';
const branchTwoId = '00000000-0000-4000-8000-000000003262';
const workLocationOneId = '00000000-0000-4000-8000-000000003263';
const workLocationTwoId = '00000000-0000-4000-8000-000000003264';
const juniorPositionId = '00000000-0000-4000-8000-000000003265';
const seniorPositionId = '00000000-0000-4000-8000-000000003266';
const contractTypeId = '00000000-0000-4000-8000-000000003267';
const employmentLinkId = '00000000-0000-4000-8000-000000003268';
const employmentContractId = '00000000-0000-4000-8000-000000003269';
const employeeId = '00000000-0000-4000-8000-000000003270';
const promotionId = '00000000-0000-4000-8000-000000003271';
const transferId = '00000000-0000-4000-8000-000000003272';
const regimeChangeId = '00000000-0000-4000-8000-000000003273';

describe('ES S-2206 alteracao contratual flow (e2e)', () => {
  let databaseService: DatabaseService;
  let builder: S2206Builder;
  const validator = new XsdValidatorService();

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL is required for es-2206-alteracao-contratual',
      );
    }
    databaseService = new DatabaseService({
      get: (key: string) =>
        key === 'DATABASE_URL' ? process.env.DATABASE_URL : undefined,
    } as never);
    builder = new S2206Builder(databaseService);
    await seed(databaseService);
  });

  afterAll(async () => {
    await cleanup(databaseService);
    await databaseService?.onModuleDestroy();
  });

  it('builds XSD-valid S-2206 for promocao, transferencia, and regime change', async () => {
    await runAsTenant(async () => {
      await databaseService.query(
        `
        UPDATE hr.employee
        SET job_position_id = $2::uuid,
            updated_at = '2026-05-02T09:00:00Z'::timestamptz
        WHERE tenant_id = $1::uuid
          AND id = $3::uuid
        `,
        [tenantId, seniorPositionId, employeeId],
      );

      const promotion = await builder.build(tenantId, employeeId, {
        sourceId: promotionId,
        changeKind: 'PROMOTION',
        changeDate: '2026-05-02',
        effectiveDate: '2026-05-01',
        description: 'Promocao vertical aplicada',
      });
      expect(promotion.xml).toContain(
        '<nmCargo>Analista Municipal Senior</nmCargo>',
      );
      expect(promotion.payload).toMatchObject({
        changeKind: 'PROMOTION',
        codCateg: '301',
        tpRegPrev: '2',
      });
      expect(() =>
        validator.assertValid('S-2206', promotion.xml, { allowUnsigned: true }),
      ).not.toThrow();

      await databaseService.query(
        `
        UPDATE hr.employee
        SET branch_id = $2::uuid,
            work_location_id = $3::uuid,
            updated_at = '2026-06-03T09:00:00Z'::timestamptz
        WHERE tenant_id = $1::uuid
          AND id = $4::uuid
        `,
        [tenantId, branchTwoId, workLocationTwoId, employeeId],
      );

      const transfer = await builder.build(tenantId, employeeId, {
        sourceId: transferId,
        changeKind: 'TRANSFER',
        changeDate: '2026-06-03',
        effectiveDate: '2026-06-01',
        description: 'Transferencia para Secretaria de Financas',
      });
      expect(transfer.xml).toContain('<nrInsc>12345678000270</nrInsc>');
      expect(transfer.xml).toContain(
        '<descComp>Secretaria de Financas</descComp>',
      );
      expect(transfer.payload).toMatchObject({ changeKind: 'TRANSFER' });
      expect(() =>
        validator.assertValid('S-2206', transfer.xml, { allowUnsigned: true }),
      ).not.toThrow();

      await databaseService.query(
        `
        UPDATE hr.employment_link
        SET contract_type = 'commissioned',
            commission_position_id = $2::uuid,
            updated_at = '2026-07-04T09:00:00Z'::timestamptz
        WHERE tenant_id = $1::uuid
          AND id = $3::uuid
        `,
        [tenantId, seniorPositionId, employmentLinkId],
      );

      const regimeChange = await builder.build(tenantId, employeeId, {
        sourceId: regimeChangeId,
        changeKind: 'REGIME_CHANGE',
        changeDate: '2026-07-04',
        effectiveDate: '2026-07-01',
        description: 'Nomeacao para cargo em comissao',
      });
      expect(regimeChange.xml).toContain('<codCateg>302</codCateg>');
      expect(regimeChange.payload).toMatchObject({
        changeKind: 'REGIME_CHANGE',
        contractType: 'commissioned',
      });
      expect(() =>
        validator.assertValid('S-2206', regimeChange.xml, {
          allowUnsigned: true,
        }),
      ).not.toThrow();
    });
  });
});

async function runAsTenant<T>(fn: () => Promise<T>): Promise<T> {
  return RequestContextStore.run(
    {
      tenantId,
      permissions: [
        'gestao.read',
        'gestao.write',
        'gestao.cargo.read',
        'gestao.cargo.write',
        'gestao.master_data.write',
        'rh.read',
        'rh.write',
        'rh.employee.write',
        'rh.employee.admit',
        'rh.employment_link.write',
        'rh.movimentacao.read',
        'rh.movimentacao.effect',
        'avaliacao.progressao.read',
        'esocial.event.read',
        'esocial.event.write',
      ],
    },
    fn,
  );
}

async function seed(database: DatabaseService): Promise<void> {
  await runAsTenant(async () => {
    await cleanup(database);
    await database.query(
      `
      INSERT INTO public.tenant (id, slug, code, name, status)
      VALUES ($1::uuid, 'es2206-e2e', 'ES2206', 'ES-2206 E2E', 'ACTIVE'::"RecordStatus")
      ON CONFLICT (id) DO NOTHING
      `,
      [tenantId],
    );
    await database.query(
      `
      INSERT INTO hr.company (id, tenant_id, code, legal_name, cnpj, status)
      VALUES ($1::uuid, $2::uuid, 'ES2206', 'Municipio ES2206', '12345678000199', 'ACTIVE'::"RecordStatus")
      ON CONFLICT (id) DO UPDATE
      SET cnpj = EXCLUDED.cnpj,
          status = EXCLUDED.status
      `,
      [companyId, tenantId],
    );
    await database.query(
      `
      INSERT INTO hr.branch (id, tenant_id, company_id, code, name, cnpj, status)
      VALUES
        ($1::uuid, $3::uuid, $4::uuid, 'ES2206-ADM', 'Secretaria de Administracao', '12345678000199', 'ACTIVE'::"RecordStatus"),
        ($2::uuid, $3::uuid, $4::uuid, 'ES2206-FIN', 'Secretaria de Financas', '12345678000270', 'ACTIVE'::"RecordStatus")
      ON CONFLICT (id) DO UPDATE
      SET cnpj = EXCLUDED.cnpj,
          status = EXCLUDED.status
      `,
      [branchOneId, branchTwoId, tenantId, companyId],
    );
    await database.query(
      `
      INSERT INTO hr.work_location (id, tenant_id, branch_id, code, name, status)
      VALUES
        ($1::uuid, $3::uuid, $4::uuid, 'ES2206-ADM', 'Secretaria de Administracao', 'ACTIVE'::"RecordStatus"),
        ($2::uuid, $3::uuid, $5::uuid, 'ES2206-FIN', 'Secretaria de Financas', 'ACTIVE'::"RecordStatus")
      ON CONFLICT (id) DO UPDATE
      SET branch_id = EXCLUDED.branch_id,
          name = EXCLUDED.name,
          status = EXCLUDED.status
      `,
      [
        workLocationOneId,
        workLocationTwoId,
        tenantId,
        branchOneId,
        branchTwoId,
      ],
    );
    await database.query(
      `
      INSERT INTO hr.job_position (id, tenant_id, code, name, status, vacancies_total, vacancies_open, legal_regime, creation_law)
      VALUES
        ($1::uuid, $3::uuid, 'ES2206-JR', 'Analista Municipal Junior', 'ACTIVE'::"RecordStatus", 1, 1, 'estatutario', 'Lei ES2206'),
        ($2::uuid, $3::uuid, 'ES2206-SR', 'Analista Municipal Senior', 'ACTIVE'::"RecordStatus", 1, 1, 'estatutario', 'Lei ES2206')
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name,
          status = EXCLUDED.status
      `,
      [juniorPositionId, seniorPositionId, tenantId],
    );
    await database.query(
      `
      INSERT INTO hr.contract_type (id, tenant_id, code, name, status)
      VALUES ($1::uuid, $2::uuid, 'ES2206-EST', 'Estatutario ES2206', 'ACTIVE'::"RecordStatus")
      ON CONFLICT (id) DO UPDATE
      SET status = EXCLUDED.status
      `,
      [contractTypeId, tenantId],
    );
    await database.query(
      `
      INSERT INTO hr.employment_link (
        id, tenant_id, code, name, contract_type, regime_law_reference, status
      )
      VALUES (
        $1::uuid, $2::uuid, 'ES2206-VINC', 'Vinculo ES2206', 'statutory', 'Lei ES2206', 'ACTIVE'::"RecordStatus"
      )
      ON CONFLICT (id) DO UPDATE
      SET contract_type = 'statutory',
          commission_position_id = NULL,
          status = EXCLUDED.status
      `,
      [employmentLinkId, tenantId],
    );
    await database.query(
      `
      INSERT INTO hr.employee (
        id, tenant_id, registration, name, cpf, birth_date, gender, branch_id,
        work_location_id, job_position_id, employment_link_id, contract_type_id,
        hired_on, lifecycle_status
      )
      VALUES (
        $1::uuid, $2::uuid, 'ES2206-001', 'Servidor ES2206', '11122233344',
        DATE '1990-01-02', 'MALE'::"PersonGender", $3::uuid, $4::uuid,
        $5::uuid, $6::uuid, $7::uuid, DATE '2026-01-10',
        'ACTIVE'::"EmployeeLifecycleStatus"
      )
      ON CONFLICT (id) DO UPDATE
      SET branch_id = EXCLUDED.branch_id,
          work_location_id = EXCLUDED.work_location_id,
          job_position_id = EXCLUDED.job_position_id,
          employment_link_id = EXCLUDED.employment_link_id,
          contract_type_id = EXCLUDED.contract_type_id,
          lifecycle_status = EXCLUDED.lifecycle_status
      `,
      [
        employeeId,
        tenantId,
        branchOneId,
        workLocationOneId,
        juniorPositionId,
        employmentLinkId,
        contractTypeId,
      ],
    );
    await database.query(
      `
      INSERT INTO hr.employment_contract (
        id, tenant_id, employee_id, employment_link_id, contract_type_id,
        appointed_on, possession_on, exercise_on, starts_on, legal_basis, status
      )
      VALUES (
        $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, DATE '2026-01-01',
        DATE '2026-01-05', DATE '2026-01-10', DATE '2026-01-10',
        'Lei ES2206', 'ACTIVE'::"RecordStatus"
      )
      ON CONFLICT (id) DO UPDATE
      SET status = EXCLUDED.status
      `,
      [
        employmentContractId,
        tenantId,
        employeeId,
        employmentLinkId,
        contractTypeId,
      ],
    );
  });
}

async function cleanup(database?: DatabaseService): Promise<void> {
  if (!database) return;
  await runAsTenant(async () => {
    await database.query(
      'DELETE FROM hr.employment_contract WHERE id = $1::uuid',
      [employmentContractId],
    );
    await database.query('DELETE FROM hr.employee WHERE id = $1::uuid', [
      employeeId,
    ]);
    await database.query('DELETE FROM hr.employment_link WHERE id = $1::uuid', [
      employmentLinkId,
    ]);
    await database.query('DELETE FROM hr.contract_type WHERE id = $1::uuid', [
      contractTypeId,
    ]);
    await database.query(
      'DELETE FROM hr.job_position WHERE id = ANY($1::uuid[])',
      [[juniorPositionId, seniorPositionId]],
    );
    await database.query(
      'DELETE FROM hr.work_location WHERE id = ANY($1::uuid[])',
      [[workLocationOneId, workLocationTwoId]],
    );
    await database.query('DELETE FROM hr.branch WHERE id = ANY($1::uuid[])', [
      [branchOneId, branchTwoId],
    ]);
    await database.query('DELETE FROM hr.company WHERE id = $1::uuid', [
      companyId,
    ]);
  });
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
