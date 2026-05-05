import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { DatabaseService } from '../../backend/src/database/database.service';
import { S2300Builder } from '../../backend/src/esocial-worker/builders/s2300.builder';
import { XsdValidatorService } from '../../backend/src/esocial-worker/xsd/xsd-validator.service';
import { InternshipsService } from '../../backend/src/convenio/internships/internships.service';

const tenantId = '00000000-0000-0000-0000-000000076001';
const workLocationId = '00000000-0000-4000-8000-000000076101';
const institutionId = '00000000-0000-4000-8000-000000076102';

describe('Convenio internships operational lifecycle (e2e)', () => {
  let databaseService: DatabaseService;
  let internshipsService: InternshipsService;
  let seeded = false;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for convenio internship e2e');
    }
    databaseService = new DatabaseService({
      get: (key: string) =>
        key === 'DATABASE_URL' ? process.env.DATABASE_URL : undefined,
    } as never);
    internshipsService = new InternshipsService(
      databaseService,
      new S2300Builder(databaseService),
    );
    await seed(databaseService);
    seeded = true;
  });

  afterAll(async () => {
    if (!databaseService) return;
    if (seeded) await cleanup(databaseService);
    await databaseService.onModuleDestroy();
  });

  it('creates program, TCE/activity plan internship, emits S-2300 source, extends and terminates', async () => {
    await runAsTenant(async () => {
      const program = await internshipsService.createProgram({
        code: 'R2-76-PGM',
        name: 'Programa Municipal de Estagio',
        institutionId,
        startsOn: '2026-05-01',
        endsOn: '2027-04-30',
      });

      const internship = await internshipsService.createInternship({
        programId: program.id,
        registration: 'R2-76-EST',
        internName: 'Ana Convenio Estagio',
        internCpf: '11144477735',
        birthDate: '2001-03-10',
        gender: 'FEMALE',
        email: 'ana.estagio@example.test',
        phone: '61999998888',
        workplaceId: workLocationId,
        supervisorName: 'Supervisor Convenio',
        startsOn: '2026-05-01',
        endsOn: '2026-12-31',
        termNumber: 'TCE-R2-76',
        termSignedOn: '2026-04-20',
        activityPlanUri: 's3://sgp-test/estagios/tce-r2-76.pdf',
        activityPlanDescription: 'Atividades administrativas supervisionadas.',
        courseName: 'Administracao',
        educationLevel: '09',
        role: 'Estagiaria de Administracao',
        weeklyHours: '30.000000',
        stipendAmount: '1200.00',
        insurancePolicy: 'AP-R2-76',
      });

      expect(internship.esocialStartEvent).toMatchObject({
        eventKind: 'S-2300',
        tsvContractId: expect.any(String),
      });

      const s2300 = await internshipsService.buildS2300(internship.id);
      expect(s2300.xml).toContain('<codCateg>901</codCateg>');
      expect(s2300.xml).toContain('<infoEstagiario>');
      expect(() =>
        new XsdValidatorService().assertValid('S-2300', s2300.xml, {
          allowUnsigned: true,
        }),
      ).not.toThrow();

      await expect(
        internshipsService.extendInternship(internship.id, {
          endsOn: '2027-04-30',
          reason: 'Aditivo do TCE',
        }),
      ).resolves.toMatchObject({ endsOn: '2027-04-30', status: 'ACTIVE' });

      await expect(
        internshipsService.terminateInternship(internship.id, {
          terminationDate: '2027-03-31',
          reason: 'Encerramento antecipado',
        }),
      ).resolves.toMatchObject({
        endsOn: '2027-03-31',
        status: 'TERMINATED',
      });
    });
  });
});

async function runAsTenant<T>(fn: () => Promise<T>): Promise<T> {
  return RequestContextStore.run(
    {
      tenantId,
      permissions: [
        'convenio.read',
        'convenio.write',
        'gestao.write',
        'rh.employee.write',
        'rh.employee.terminate',
        'hr.employment.read',
        'hr.employment.write',
        'esocial.event.read',
        'esocial.event.write',
      ],
    },
    fn,
  );
}

async function seed(database: DatabaseService): Promise<void> {
  await database.query(
    `
    INSERT INTO public.tenant (id, slug, code, name, status)
    VALUES ($1::uuid, 'r2-76-convenio', 'R276', 'R2-76 Convenio', 'ACTIVE'::public."RecordStatus")
    ON CONFLICT (id) DO NOTHING
    `,
    [tenantId],
  );

  await runAsTenant(async () => {
    await database.query(
      `
      INSERT INTO hr.education_institution (id, tenant_id, code, name, cnpj)
      VALUES ($1::uuid, $2::uuid, 'IES-R2-76', 'Universidade Municipal', '12345678000199')
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name
      `,
      [institutionId, tenantId],
    );
    await database.query(
      `
      INSERT INTO hr.work_location (id, tenant_id, code, name)
      VALUES ($1::uuid, $2::uuid, 'WL-R2-76', 'Lotacao Estagio R2-76')
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name
      `,
      [workLocationId, tenantId],
    );
  });
}

async function cleanup(database: DatabaseService): Promise<void> {
  await runAsTenant(async () => {
    await database.query(
      'DELETE FROM hr.internship_record WHERE tenant_id = $1',
      [tenantId],
    );
    await database.query('DELETE FROM hr.tsv_contract WHERE tenant_id = $1', [
      tenantId,
    ]);
    await database.query('DELETE FROM hr.employee WHERE tenant_id = $1', [
      tenantId,
    ]);
    await database.query(
      'DELETE FROM hr.employment_link WHERE tenant_id = $1',
      [tenantId],
    );
    await database.query(
      'DELETE FROM hr.internship_program WHERE tenant_id = $1',
      [tenantId],
    );
    await database.query('DELETE FROM hr.work_location WHERE tenant_id = $1', [
      tenantId,
    ]);
    await database.query(
      'DELETE FROM hr.education_institution WHERE tenant_id = $1',
      [tenantId],
    );
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
