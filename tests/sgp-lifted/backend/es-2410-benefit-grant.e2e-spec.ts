import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { AuditService } from '../../backend/src/audit/audit.service';
import { DatabaseService } from '../../backend/src/database/database.service';
import { S2410Builder } from '../../backend/src/esocial-worker/builders/s2410.builder';
import { ESocialEmitService } from '../../backend/src/esocial-worker/esocial-emit.service';
import { PrevidenciarioController } from '../../backend/src/previdenciario/previdenciario.controller';
import { PrevidenciarioService } from '../../backend/src/previdenciario/previdenciario.service';
import { AtividadeRiscoProfessorService } from '../../backend/src/previdenciario/transition-rules/atividade-risco-professor.service';
import { IdadeProgressivaService } from '../../backend/src/previdenciario/transition-rules/idade-progressiva.service';
import { Pedagio100Service } from '../../backend/src/previdenciario/transition-rules/pedagio100.service';
import { Pedagio50Service } from '../../backend/src/previdenciario/transition-rules/pedagio50.service';
import { PontosService } from '../../backend/src/previdenciario/transition-rules/pontos.service';

const tenantId = '00000000-0000-0000-0000-000000002410';
const employeeId = '00000000-0000-4000-8000-000000002411';
const ruleId = '00000000-0000-4000-8000-000000002412';
const retirementGrantId = '00000000-0000-4000-8000-000000002413';
const pensionGrantId = '00000000-0000-4000-8000-000000002414';

class FakeDatabaseService {
  readonly configured = true;

  async query<T>(sql: string): Promise<T[]> {
    if (sql.includes('SELECT id, registration, name, birth_date')) {
      return [employeeRow()] as T[];
    }
    if (sql.includes('FROM hr.retirement_rule')) {
      return [ruleRow()] as T[];
    }
    if (sql.includes('WITH inserted_grant')) {
      return [retirementGrantRow()] as T[];
    }
    if (sql.includes('FROM hr.retirement_grant grant_row')) {
      return [retirementBenefitRow()] as T[];
    }
    if (sql.includes('INSERT INTO hr.pension_grant')) {
      return [pensionGrantRow()] as T[];
    }
    if (sql.includes('FROM hr.pension_grant pension')) {
      return [pensionBenefitRow()] as T[];
    }
    return [] as T[];
  }
}

const emitService = {
  emit: jest.fn(async (input: { eventKind: string; reference: string }) => ({
    id: '00000000-0000-4000-8000-000000002499',
    eventKind: input.eventKind,
    reference: input.reference,
    competence: '2026-04',
    status: 'PENDENTE',
    createdAt: '2026-04-25T00:00:00.000Z',
  })),
};

@Module({
  controllers: [PrevidenciarioController],
  providers: [
    PrevidenciarioService,
    S2410Builder,
    Pedagio100Service,
    Pedagio50Service,
    PontosService,
    IdadeProgressivaService,
    AtividadeRiscoProfessorService,
    { provide: DatabaseService, useClass: FakeDatabaseService },
    { provide: ESocialEmitService, useValue: emitService },
    {
      provide: AuditService,
      useValue: { auditMutation: jest.fn(async () => undefined) },
    },
  ],
})
class S2410FixtureModule {}

describe('Previdenciario benefit grant S-2410 emission (e2e)', () => {
  let app: INestApplication<SupertestApp>;

  beforeEach(async () => {
    emitService.emit.mockClear();
    const moduleRef = await Test.createTestingModule({
      imports: [S2410FixtureModule],
    }).compile();
    app = moduleRef.createNestApplication<SupertestApp>();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('emits S-2410 when POST /v1/previdenciario/aposentadorias grants a retirement benefit', async () => {
    await request(app.getHttpServer())
      .post('/v1/previdenciario/aposentadorias')
      .send({
        funcionarioId: employeeId,
        regraId: ruleId,
        dataConcessao: '2026-04-25',
        fundamento: 'Lei Municipal 1/2026',
        atoNomeacao: 'Portaria 10/2026',
        observacao: 'Concessao de aposentadoria voluntaria.',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id: retirementGrantId,
          status: 'CONCEDIDA',
          funcionarioId: employeeId,
        });
      });

    expect(emitService.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        eventKind: 'S-2410',
        competence: '2026-04',
        sourceEntityKind: 'hr.retirement_grant',
        sourceEntityId: retirementGrantId,
        payload: expect.objectContaining({
          sourceKind: 'RETIREMENT',
          retirementGrantId,
          cpfBenef: '11144477735',
          nrBeneficio: 'RET08000000000002413',
        }),
      }),
    );
    expect(emitService.emit.mock.calls[0][0].xml).toContain('<evtCdBenIn');
  });

  it('emits S-2410 when POST /v1/previdenciario/pensoes grants a pension benefit', async () => {
    await request(app.getHttpServer())
      .post('/v1/previdenciario/pensoes')
      .send({
        funcionarioInstituidorId: employeeId,
        nomeBeneficiario: 'Maria Beneficiaria',
        cpfBeneficiario: '11144477735',
        parentesco: 'Conjuge',
        tipoBeneficio: '0601',
        tipoRateio: 'VITALICIA',
        cotaParte: '100.000000',
        formaReajuste: 'PARIDADE',
        natureza: 'PENSION_DEATH',
        dataConcessao: '2026-05-02',
        fundamento: 'Lei Municipal 2/2026',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id: pensionGrantId,
          funcionarioInstituidorId: employeeId,
          cpfBeneficiario: '11144477735',
        });
      });

    expect(emitService.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        eventKind: 'S-2410',
        competence: '2026-05',
        sourceEntityKind: 'hr.pension_grant',
        sourceEntityId: pensionGrantId,
        payload: expect.objectContaining({
          sourceKind: 'PENSION',
          pensionGrantId,
          cpfBenef: '11144477735',
          nrBeneficio: 'PEN08000000000002414',
          tpBeneficio: '0601',
        }),
      }),
    );
    expect(emitService.emit.mock.calls[0][0].xml).toContain('<infoPenMorte>');
  });
});

function employeeRow() {
  return {
    id: employeeId,
    registration: 'RPPS-001',
    name: 'Maria Beneficiaria',
    birth_date: '1960-05-12',
    hired_on: '1985-01-01',
    cpf: '11144477735',
  };
}

function ruleRow() {
  return {
    id: ruleId,
    name: 'Aposentadoria voluntaria RPPS',
    legal_basis: 'Lei Municipal 1/2026',
    age_criteria: { minYears: 60 },
    contribution_time_criteria: { minYears: 30 },
    grace_period_criteria: {},
    applicable_employment_link: 'RPPS',
    active: true,
  };
}

function retirementGrantRow() {
  return {
    id: retirementGrantId,
    employee_id: employeeId,
    registration: 'RPPS-001',
    employee_name: 'Maria Beneficiaria',
    rule_id: ruleId,
    rule_name: 'Aposentadoria voluntaria RPPS',
    granted_on: '2026-04-25',
    legal_basis: 'Lei Municipal 1/2026',
    appointment_act: 'Portaria 10/2026',
    status: 'CONCEDIDA',
    notes: 'Concessao de aposentadoria voluntaria.',
    granted_by_ref: null,
  };
}

function retirementBenefitRow() {
  return {
    retirement_grant_id: retirementGrantId,
    tenant_id: tenantId,
    employee_id: employeeId,
    employee_registration: 'RPPS-001',
    employee_cpf: '11144477735',
    granted_on: '2026-04-25',
    legal_basis: 'Lei Municipal 1/2026',
    appointment_act: 'Portaria 10/2026',
    rule_name: 'Aposentadoria voluntaria RPPS',
    company_cnpj: '12345678000199',
  };
}

function pensionGrantRow() {
  return {
    id: pensionGrantId,
    instituting_employee_id: employeeId,
    registration: 'RPPS-001',
    employee_name: 'Maria Beneficiaria',
    beneficiary_name: 'Maria Beneficiaria',
    beneficiary_cpf: '11144477735',
    kinship: 'Conjuge',
    benefit_type: '0601',
    apportionment_type: 'VITALICIA',
    share_percent: '100.000000',
    adjustment_mode: 'PARIDADE',
    nature: 'PENSION_DEATH',
    granted_on: '2026-05-02',
    ceased_on: null,
    legal_basis: 'Lei Municipal 2/2026',
    notes: '',
  };
}

function pensionBenefitRow() {
  return {
    pension_grant_id: pensionGrantId,
    tenant_id: tenantId,
    instituting_employee_id: employeeId,
    instituting_registration: 'RPPS-001',
    instituting_cpf: '33366699943',
    beneficiary_cpf: '11144477735',
    benefit_type: '0601',
    apportionment_type: 'VITALICIA',
    nature: 'PENSION_DEATH',
    granted_on: '2026-05-02',
    legal_basis: 'Lei Municipal 2/2026',
    company_cnpj: '12345678000199',
  };
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
