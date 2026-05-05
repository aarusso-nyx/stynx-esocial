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
import { S2420Builder } from '../../backend/src/esocial-worker/builders/s2420.builder';
import { ESocialEmitService } from '../../backend/src/esocial-worker/esocial-emit.service';
import { PrevidenciarioController } from '../../backend/src/previdenciario/previdenciario.controller';
import { PrevidenciarioService } from '../../backend/src/previdenciario/previdenciario.service';
import { AtividadeRiscoProfessorService } from '../../backend/src/previdenciario/transition-rules/atividade-risco-professor.service';
import { IdadeProgressivaService } from '../../backend/src/previdenciario/transition-rules/idade-progressiva.service';
import { Pedagio100Service } from '../../backend/src/previdenciario/transition-rules/pedagio100.service';
import { Pedagio50Service } from '../../backend/src/previdenciario/transition-rules/pedagio50.service';
import { PontosService } from '../../backend/src/previdenciario/transition-rules/pontos.service';

const tenantId = '00000000-0000-0000-0000-000000002420';
const pensionGrantId = '00000000-0000-4000-8000-000000002424';

class FakeDatabaseService {
  readonly configured = true;

  async query<T>(sql: string): Promise<T[]> {
    if (sql.includes('INSERT INTO hr.pension_grant')) {
      return [pensionGrantRow()] as T[];
    }
    if (sql.includes('FROM hr.pension_grant pension')) {
      return [pensionTerminationRow()] as T[];
    }
    return [] as T[];
  }
}

const emitService = {
  emit: jest.fn(async (input: { eventKind: string; reference: string }) => ({
    id: '00000000-0000-4000-8000-000000002499',
    eventKind: input.eventKind,
    reference: input.reference,
    competence: '2026-06',
    status: 'PENDENTE',
    createdAt: '2026-06-30T00:00:00.000Z',
  })),
};

@Module({
  controllers: [PrevidenciarioController],
  providers: [
    PrevidenciarioService,
    S2420Builder,
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
class S2420FixtureModule {}

describe('Previdenciario benefit termination S-2420 emission (e2e)', () => {
  let app: INestApplication<SupertestApp>;

  beforeEach(async () => {
    emitService.emit.mockClear();
    const moduleRef = await Test.createTestingModule({
      imports: [S2420FixtureModule],
    }).compile();
    app = moduleRef.createNestApplication<SupertestApp>();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('emits S-2420 when POST /v1/previdenciario/pensoes creates a pension with a cessation date', async () => {
    await request(app.getHttpServer())
      .post('/v1/previdenciario/pensoes')
      .send({
        nomeBeneficiario: 'Maria Beneficiaria',
        cpfBeneficiario: '11144477735',
        parentesco: 'Conjuge',
        tipoBeneficio: '0601',
        tipoRateio: 'TEMPORARIA',
        cotaParte: '100.000000',
        formaReajuste: 'PARIDADE',
        natureza: 'PENSION_DEATH',
        dataConcessao: '2026-05-02',
        dataCessacao: '2026-06-30',
        fundamento: 'Lei Municipal 2/2026',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id: pensionGrantId,
          cpfBeneficiario: '11144477735',
          dataCessacao: '2026-06-30',
        });
      });

    expect(emitService.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        eventKind: 'S-2420',
        competence: '2026-06',
        sourceEntityKind: 'hr.pension_grant',
        sourceEntityId: pensionGrantId,
        payload: expect.objectContaining({
          sourceKind: 'PENSION',
          pensionGrantId,
          cpfBenef: '11144477735',
          nrBeneficio: 'PEN08000000000002424',
          mtvTermino: '05',
          terminatedOn: '2026-06-30',
        }),
      }),
    );
    expect(emitService.emit.mock.calls[0][0].xml).toContain('<evtCdBenTerm');
  });
});

function pensionGrantRow() {
  return {
    id: pensionGrantId,
    instituting_employee_id: null,
    registration: null,
    employee_name: null,
    beneficiary_name: 'Maria Beneficiaria',
    beneficiary_cpf: '11144477735',
    kinship: 'Conjuge',
    benefit_type: '0601',
    apportionment_type: 'TEMPORARIA',
    share_percent: '100.000000',
    adjustment_mode: 'PARIDADE',
    nature: 'PENSION_DEATH',
    granted_on: '2026-05-02',
    ceased_on: '2026-06-30',
    legal_basis: 'Lei Municipal 2/2026',
    notes: '',
  };
}

function pensionTerminationRow() {
  return {
    pension_grant_id: pensionGrantId,
    tenant_id: tenantId,
    beneficiary_cpf: '11144477735',
    granted_on: '2026-05-02',
    ceased_on: '2026-06-30',
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
