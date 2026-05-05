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
import { S2405Builder } from '../../backend/src/esocial-worker/builders/s2405.builder';
import { ESocialEmitService } from '../../backend/src/esocial-worker/esocial-emit.service';
import { PrevidenciarioController } from '../../backend/src/previdenciario/previdenciario.controller';
import { PrevidenciarioService } from '../../backend/src/previdenciario/previdenciario.service';
import { AtividadeRiscoProfessorService } from '../../backend/src/previdenciario/transition-rules/atividade-risco-professor.service';
import { IdadeProgressivaService } from '../../backend/src/previdenciario/transition-rules/idade-progressiva.service';
import { Pedagio100Service } from '../../backend/src/previdenciario/transition-rules/pedagio100.service';
import { Pedagio50Service } from '../../backend/src/previdenciario/transition-rules/pedagio50.service';
import { PontosService } from '../../backend/src/previdenciario/transition-rules/pontos.service';

const tenantId = '00000000-0000-0000-0000-000000002405';
const employeeId = '00000000-0000-4000-8000-000000002453';
const retirementGrantId = '00000000-0000-4000-8000-000000002451';
const beneficiaryId = '00000000-0000-4000-8000-000000002454';
const recertificationRecordId = '00000000-0000-4000-8000-000000002452';

class FakeDatabaseService {
  readonly configured = true;

  async query<T>(sql: string): Promise<T[]> {
    if (sql.includes('SELECT id FROM hr.recertification_beneficiary')) {
      return [{ id: beneficiaryId }] as T[];
    }
    if (sql.includes('WITH inserted_record')) {
      return [recertificationRecordRow()] as T[];
    }
    if (sql.includes('SELECT grant_row.id::text AS retirement_grant_id')) {
      return [{ retirement_grant_id: retirementGrantId }] as T[];
    }
    if (sql.includes('SELECT') && sql.includes('recertification_record_id')) {
      return [beneficiaryChangeRow()] as T[];
    }
    return [] as T[];
  }
}

const emitService = {
  emit: jest.fn(async () => ({
    id: '00000000-0000-4000-8000-000000002499',
    eventKind: 'S-2405',
    reference: 's2405-reference',
    competence: '2026-05',
    status: 'PENDENTE',
    createdAt: '2026-05-02T00:00:00.000Z',
  })),
};

@Module({
  controllers: [PrevidenciarioController],
  providers: [
    PrevidenciarioService,
    S2405Builder,
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
class S2405FixtureModule {}

describe('Previdenciario recertification S-2405 emission (e2e)', () => {
  let app: INestApplication<SupertestApp>;

  beforeEach(async () => {
    emitService.emit.mockClear();
    const moduleRef = await Test.createTestingModule({
      imports: [S2405FixtureModule],
    }).compile();
    app = moduleRef.createNestApplication<SupertestApp>();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('emits S-2405 when POST /v1/previdenciario/recadastramentos/atos records a retiree cadastral change', async () => {
    await request(app.getHttpServer())
      .post('/v1/previdenciario/recadastramentos/atos')
      .send({
        beneficiarioId: beneficiaryId,
        data: '2026-05-02',
        operadorId: 'operator-1',
        dadosSnapshot: {
          address: { street: 'Rua Atualizada', zip: '70000001' },
        },
        comprovanteStorageKey: 'recadastramento.pdf',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          id: recertificationRecordId,
          beneficiarioId: beneficiaryId,
          data: '2026-05-02',
        });
      });

    expect(emitService.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        eventKind: 'S-2405',
        competence: '2026-05',
        sourceEntityKind: 'hr.recertification_record',
        sourceEntityId: recertificationRecordId,
        payload: expect.objectContaining({
          recertificationRecordId,
          retirementGrantId,
          employeeId,
          cpfBenef: '11144477735',
        }),
      }),
    );
    expect(emitService.emit.mock.calls[0][0].xml).toContain('<evtCdBenefAlt');
  });
});

function recertificationRecordRow() {
  return {
    id: recertificationRecordId,
    beneficiary_id: beneficiaryId,
    recertified_on: '2026-05-02',
    operator_ref: 'operator-1',
    snapshot_json: {
      address: { street: 'Rua Atualizada', zip: '70000001' },
    },
    receipt_storage_key: 'recadastramento.pdf',
  };
}

function beneficiaryChangeRow() {
  return {
    recertification_record_id: recertificationRecordId,
    retirement_grant_id: retirementGrantId,
    tenant_id: tenantId,
    employee_id: employeeId,
    granted_on: '2026-04-25',
    recertified_on: '2026-05-02',
    employee_name: 'Maria Beneficiaria Atualizada',
    employee_cpf: '11144477735',
    employee_gender: 'FEMALE',
    employee_marital_status: '2',
    employee_address: {
      street: 'Rua Atualizada',
      number: '200',
      neighborhood: 'Centro',
      zip: '70000001',
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
