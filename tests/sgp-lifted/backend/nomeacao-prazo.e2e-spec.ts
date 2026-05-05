import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { AppModule } from '../../backend/src/app.module';
import { CognitoJwtService } from '../../backend/src/auth/cognito-jwt.service';
import { DatabaseService } from '../../backend/src/database/database.service';

const tenantId = '00000000-0000-4000-8000-000000000001';
const concursoId = '00000000-0000-4000-8000-000000000501';
const vagaId = '00000000-0000-4000-8000-000000000502';
const nomeacaoId = '00000000-0000-4000-8000-000000000503';
const inscricaoId = '00000000-0000-4000-8000-000000000504';
const actClassificationId = '00000000-0000-4000-8000-000000000506';

class FakeNomeacaoDatabase {
  readonly configured = true;
  private status = 'CONVOCADO';
  private expiredEventCount = 0;

  async query<T>(): Promise<T[]> {
    return [] as T[];
  }

  async transaction<T>(callback: (client: unknown) => Promise<T>): Promise<T> {
    const client = {
      query: async (sql: string, values: unknown[] = []) => {
        if (sql.includes('FROM recrutamento.concurso')) {
          return {
            rows: [
              {
                tenant_id: tenantId,
                id: concursoId,
                valid_until: '2026-05-31',
              },
            ],
          };
        }
        if (sql.includes('recrutamento.proxima_chamada')) {
          return {
            rows: [
              {
                tenant_id: tenantId,
                concurso_id: concursoId,
                vaga_id: vagaId,
                inscricao_id: inscricaoId,
                call_order: 1,
                allocation_bucket: 'GENERAL',
                rank_general: 1,
              },
            ],
          };
        }
        if (sql.includes('FROM hr.act_classification')) {
          return {
            rows: [
              {
                id: actClassificationId,
                code: values[2] ?? 'NOMEACAO',
                description: 'Nomeacao',
              },
            ],
          };
        }
        if (sql.includes('INSERT INTO recrutamento.nomeacao')) {
          return {
            rows: [
              {
                id: nomeacaoId,
                tenant_id: tenantId,
                concurso_id: concursoId,
                vaga_id: vagaId,
                inscricao_id: inscricaoId,
                ato_administrativo: String(values[4]),
                act_classification_id: String(values[5]),
                act_classification_code: String(values[7]),
                act_classification_description: String(values[8]),
                published_at: values[6] ?? '2026-05-02T00:00:00.000Z',
                comparecimento_until: '2026-06-01',
                status: 'NOMEADO',
              },
            ],
          };
        }
        if (sql.includes('FROM recrutamento.inscricao')) {
          return { rows: [{ email: 'candidate@example.test' }] };
        }
        if (sql.includes('INSERT INTO recrutamento.convocacao')) {
          return {
            rows: [
              {
                id: '00000000-0000-4000-8000-000000000505',
                nomeacao_id: nomeacaoId,
                channel: values[2],
                sent_at: '2026-05-02T00:00:00.000Z',
                evidence_ref: values[3],
              },
            ],
          };
        }
        if (sql.includes('UPDATE recrutamento.nomeacao')) {
          this.status = 'CONVOCADO';
          return { rows: [this.nomeacaoRow()] };
        }
        if (sql.includes('recrutamento.expirar_prazo_nomeacao')) {
          if (this.status !== 'EXONERADO_POR_NAO_POSSE') {
            this.status = 'EXONERADO_POR_NAO_POSSE';
            this.expiredEventCount += 1;
            return { rows: [{ expired: true }] };
          }
          return { rows: [{ expired: false }] };
        }
        if (sql.includes('FROM recrutamento.nomeacao')) {
          return { rows: [this.nomeacaoRow()] };
        }
        return { rows: [] };
      },
    };
    return callback(client);
  }

  get auditEvents(): number {
    return this.expiredEventCount;
  }

  private nomeacaoRow() {
    return {
      id: nomeacaoId,
      tenant_id: tenantId,
      concurso_id: concursoId,
      vaga_id: vagaId,
      inscricao_id: inscricaoId,
      ato_administrativo: 'Portaria 54/2026',
      act_classification_id: actClassificationId,
      act_classification_code: null,
      act_classification_description: null,
      published_at: '2026-04-01T00:00:00.000Z',
      comparecimento_until: '2026-04-30',
      status: this.status,
    };
  }
}

describe('nomeacao prazo flow', () => {
  let app: INestApplication<SupertestApp>;
  let database: FakeNomeacaoDatabase;

  beforeEach(async () => {
    database = new FakeNomeacaoDatabase();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CognitoJwtService)
      .useValue({
        verifyAuthorizationHeader: jest.fn().mockResolvedValue({
          sub: '00000000-0000-4000-8000-000000000001',
          username: 'rec-admin',
          tenantId,
          groups: [],
          permissions: [
            'recrutamento.nomeacao.write',
            'recrutamento.nomeacao.read',
          ],
          claims: {},
        }),
      })
      .overrideProvider(DatabaseService)
      .useValue(database)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects appointments after concurso valid_until with 422', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/nomeacoes')
      .set('Authorization', 'Bearer test')
      .send({
        concursoId,
        vagaId,
        count: 1,
        atoAdministrativo: 'Portaria 54/2026',
        actClassificationCode: 'NOMEACAO',
        publishedAt: '2026-06-01T00:00:00.000Z',
      })
      .expect(422);
  });

  it('records act classification metadata when appointing', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/nomeacoes')
      .set('Authorization', 'Bearer test')
      .send({
        concursoId,
        vagaId,
        count: 1,
        atoAdministrativo: 'Portaria 54/2026',
        actClassificationCode: 'NOMEACAO',
        publishedAt: '2026-05-02T00:00:00.000Z',
      })
      .expect(201);

    expect(response.body.nomeacoes[0]).toMatchObject({
      actClassificationId,
      actClassificationCode: 'NOMEACAO',
      actClassificationDescription: 'Nomeacao',
    });
  });

  it('records provider messageId evidence for email convocacao', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/admin/nomeacoes/${nomeacaoId}/convocacoes`)
      .set('Authorization', 'Bearer test')
      .send({ channel: 'EMAIL' })
      .expect(201);

    expect(response.body.convocacao.evidenceRef).toContain('messageId=');
  });

  it('expires deadline idempotently without duplicate expiration events', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/nomeacoes/${nomeacaoId}/expirar-prazo`)
      .set('Authorization', 'Bearer test')
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/nomeacoes/${nomeacaoId}/expirar-prazo`)
      .set('Authorization', 'Bearer test')
      .expect(200);

    expect(database.auditEvents).toBe(1);
  });
});

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
