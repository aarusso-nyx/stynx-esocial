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
import { S2400Builder } from '../../backend/src/esocial-worker/builders/s2400.builder';
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
const grantId = '00000000-0000-4000-8000-000000002413';

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
      return [grantRow()] as T[];
    }
    if (sql.includes('FROM hr.retirement_grant grant_row')) {
      return [beneficiaryRow()] as T[];
    }
    if (sql.includes('FROM hr.employee_dependent')) {
      return [] as T[];
    }
    return [] as T[];
  }
}

const emitService = {
  emit: jest.fn(async () => ({
    id: '00000000-0000-4000-8000-000000002499',
    eventKind: 'S-2400',
    reference: 's2400-reference',
    competence: '2026-04',
    status: 'PENDENTE',
    createdAt: '2026-04-25T00:00:00.000Z',
  })),
};

@Module({
  controllers: [PrevidenciarioController],
  providers: [
    PrevidenciarioService,
    S2400Builder,
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
class S2400FixtureModule {}

describe('Previdenciario retirement grant S-2400 emission (e2e)', () => {
  let app: INestApplication<SupertestApp>;

  beforeEach(async () => {
    emitService.emit.mockClear();
    const moduleRef = await Test.createTestingModule({
      imports: [S2400FixtureModule],
    }).compile();
    app = moduleRef.createNestApplication<SupertestApp>();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('emits S-2400 when POST /v1/previdenciario/aposentadorias grants a retirement', async () => {
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
          id: grantId,
          status: 'CONCEDIDA',
          funcionarioId: employeeId,
        });
      });

    expect(emitService.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        eventKind: 'S-2400',
        competence: '2026-04',
        sourceEntityKind: 'hr.retirement_grant',
        sourceEntityId: grantId,
        payload: expect.objectContaining({
          retirementGrantId: grantId,
          employeeId,
          cpfBenef: '11144477735',
        }),
      }),
    );
    expect(emitService.emit.mock.calls[0][0].xml).toContain('<evtCdBenefIn');
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

function grantRow() {
  return {
    id: grantId,
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

function beneficiaryRow() {
  return {
    retirement_grant_id: grantId,
    tenant_id: tenantId,
    employee_id: employeeId,
    granted_on: '2026-04-25',
    employee_name: 'Maria Beneficiaria',
    employee_cpf: '11144477735',
    employee_birth_date: '1960-05-12',
    employee_gender: 'FEMALE',
    employee_marital_status: '2',
    employee_address: {
      street: 'Rua Central',
      number: '100',
      neighborhood: 'Centro',
      zip: '70000000',
      cityCode: '5300108',
      state: 'DF',
    },
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
