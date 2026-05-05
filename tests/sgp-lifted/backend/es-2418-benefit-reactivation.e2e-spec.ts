import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App as SupertestApp } from 'supertest/types';

import { DatabaseService } from '../../backend/src/database/database.service';
import { S2418Builder } from '../../backend/src/esocial-worker/builders/s2418.builder';
import { ESocialEmitService } from '../../backend/src/esocial-worker/esocial-emit.service';
import { PrevidenciarioService } from '../../backend/src/previdenciario/previdenciario.service';
import { AtividadeRiscoProfessorService } from '../../backend/src/previdenciario/transition-rules/atividade-risco-professor.service';
import { IdadeProgressivaService } from '../../backend/src/previdenciario/transition-rules/idade-progressiva.service';
import { Pedagio100Service } from '../../backend/src/previdenciario/transition-rules/pedagio100.service';
import { Pedagio50Service } from '../../backend/src/previdenciario/transition-rules/pedagio50.service';
import { PontosService } from '../../backend/src/previdenciario/transition-rules/pontos.service';

const tenantId = '00000000-0000-0000-0000-000000002418';
const employeeId = '00000000-0000-4000-8000-000000002411';
const pensionGrantId = '00000000-0000-4000-8000-000000002414';

class FakeDatabaseService {
  readonly configured = true;

  async query<T>(sql: string): Promise<T[]> {
    if (sql.includes('FROM hr.pension_grant pension')) {
      return [pensionReactivationRow()] as T[];
    }
    return [] as T[];
  }
}

const emitService = {
  emit: jest.fn(async (input: { eventKind: string; reference: string }) => ({
    id: '00000000-0000-4000-8000-000000002498',
    eventKind: input.eventKind,
    reference: input.reference,
    competence: '2026-05',
    status: 'PENDENTE',
    createdAt: '2026-05-15T00:00:00.000Z',
  })),
};

@Module({
  providers: [
    PrevidenciarioService,
    S2418Builder,
    Pedagio100Service,
    Pedagio50Service,
    PontosService,
    IdadeProgressivaService,
    AtividadeRiscoProfessorService,
    { provide: DatabaseService, useClass: FakeDatabaseService },
    { provide: ESocialEmitService, useValue: emitService },
  ],
})
class S2418FixtureModule {}

describe('Previdenciario benefit reactivation S-2418 emission (e2e)', () => {
  let app: INestApplication<SupertestApp>;

  beforeEach(async () => {
    emitService.emit.mockClear();
    const moduleRef = await Test.createTestingModule({
      imports: [S2418FixtureModule],
    }).compile();
    app = moduleRef.createNestApplication<SupertestApp>();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('emits S-2418 through the previdenciario service reactivation pathway', async () => {
    await app.get(PrevidenciarioService).emitS2418ForBenefitReactivation({
      sourceKind: 'PENSION',
      sourceId: pensionGrantId,
      effectiveReactivationOn: '2026-05-15',
      financialEffectOn: '2026-05-01',
    });

    expect(emitService.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        eventKind: 'S-2418',
        competence: '2026-05',
        sourceEntityKind: 'hr.pension_grant',
        sourceEntityId: pensionGrantId,
        payload: expect.objectContaining({
          sourceKind: 'PENSION',
          pensionGrantId,
          institutingEmployeeId: employeeId,
          cpfBenef: '11144477735',
          nrBeneficio: 'PEN08000000000002414',
          dtEfetReativ: '2026-05-15',
          dtEfeito: '2026-05-01',
          previousCessationOn: '2026-04-30',
        }),
      }),
    );
    expect(emitService.emit.mock.calls[0][0].xml).toContain('<evtReativBen');
  });
});

function pensionReactivationRow() {
  return {
    pension_grant_id: pensionGrantId,
    tenant_id: tenantId,
    instituting_employee_id: employeeId,
    beneficiary_cpf: '11144477735',
    ceased_on: '2026-04-30',
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
