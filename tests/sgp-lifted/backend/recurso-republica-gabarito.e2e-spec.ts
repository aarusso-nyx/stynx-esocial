import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { AppModule } from '../../backend/src/app.module';
import { CognitoJwtService } from '../../backend/src/auth/cognito-jwt.service';
import { DatabaseService } from '../../backend/src/database/database.service';

class FakeAvaliacaoDatabase {
  readonly configured = true;

  constructor(private readonly deadline: 'open' | 'closed' = 'open') {}

  async query<T>() {
    return [] as T[];
  }

  async transaction<T>(callback: (client: unknown) => Promise<T>): Promise<T> {
    const client = {
      query: async (sql: string) => {
        if (sql.includes('UPDATE recrutamento.gabarito')) {
          return { rows: [] };
        }
        if (sql.includes('INSERT INTO recrutamento.gabarito')) {
          return {
            rows: [
              {
                id: '00000000-0000-4000-8000-000000000301',
                prova_id: '00000000-0000-4000-8000-000000000302',
                version: 2,
                status: 'FINAL',
                published_at: '2026-05-02T03:00:00.000Z',
                answers: { '1': 'B' },
              },
            ],
          };
        }
        if (sql.includes('recrutamento.recompute_notas')) {
          return {
            rows: Array.from({ length: 12 }, (_, index) => ({
              inscricao_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
              old_weighted_score: '0.000000',
              new_weighted_score: '1.000000',
            })),
          };
        }
        if (sql.includes('SELECT i.tenant_id::text')) {
          return {
            rows: [
              {
                tenant_id: '00000000-0000-4000-8000-000000000001',
                deadline:
                  this.deadline === 'open'
                    ? new Date(Date.now() + 86_400_000)
                    : new Date(Date.now() - 86_400_000),
              },
            ],
          };
        }
        if (sql.includes('INSERT INTO recrutamento.recurso')) {
          return {
            rows: [
              {
                id: '00000000-0000-4000-8000-000000000401',
                inscricao_id: '00000000-0000-4000-8000-000000000402',
                prova_id: '00000000-0000-4000-8000-000000000302',
                questao_id: '00000000-0000-4000-8000-000000000303',
                reason: 'Erro grosseiro no gabarito preliminar.',
                status: 'OPEN',
                parecer: null,
                decided_at: null,
              },
            ],
          };
        }
        return { rows: [] };
      },
    };
    return callback(client);
  }
}

describe('REC-03 answer key republication and resources', () => {
  async function createApp(deadline: 'open' | 'closed') {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CognitoJwtService)
      .useValue({
        verifyAuthorizationHeader: jest.fn().mockResolvedValue({
          sub: '00000000-0000-4000-8000-000000000001',
          username: 'rec-admin',
          tenantId: '00000000-0000-4000-8000-000000000001',
          groups: [],
          permissions: [
            'recrutamento.avaliacao.read',
            'recrutamento.avaliacao.write',
          ],
          claims: {},
        }),
      })
      .overrideProvider(DatabaseService)
      .useValue(new FakeAvaliacaoDatabase(deadline))
      .compile();

    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    return app as INestApplication<SupertestApp>;
  }

  it('republica gabarito definitivo and reports twelve changed candidate notes', async () => {
    const app = await createApp('open');
    try {
      const response = await request(app.getHttpServer())
        .post(
          '/api/v1/recrutamento/avaliacao/provas/00000000-0000-4000-8000-000000000302/gabaritos',
        )
        .set('Authorization', 'Bearer test')
        .send({ status: 'FINAL', answers: { '1': 'B' } })
        .expect(201);

      expect(response.body.version).toBe(2);
      expect(response.body.changedNotas).toHaveLength(12);
    } finally {
      await app.close();
    }
  });

  it('accepts public resources only while the edital resource deadline is open', async () => {
    const openApp = await createApp('open');
    try {
      await request(openApp.getHttpServer())
        .post(
          '/api/v1/publico/inscricoes/00000000-0000-4000-8000-000000000402/recursos',
        )
        .query({ token: 'candidate-token' })
        .send({
          provaId: '00000000-0000-4000-8000-000000000302',
          questaoId: '00000000-0000-4000-8000-000000000303',
          reason: 'Erro grosseiro no gabarito preliminar.',
        })
        .expect(201);
    } finally {
      await openApp.close();
    }

    const closedApp = await createApp('closed');
    try {
      await request(closedApp.getHttpServer())
        .post(
          '/api/v1/publico/inscricoes/00000000-0000-4000-8000-000000000402/recursos',
        )
        .query({ token: 'candidate-token' })
        .send({
          provaId: '00000000-0000-4000-8000-000000000302',
          questaoId: '00000000-0000-4000-8000-000000000303',
          reason: 'Recurso intempestivo.',
        })
        .expect(422);
    } finally {
      await closedApp.close();
    }
  });
});
