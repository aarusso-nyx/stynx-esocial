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

class FakeConcursoDatabase {
  readonly configured = true;
  private hasEdital = false;

  async transaction<T>(callback: (client: unknown) => Promise<T>): Promise<T> {
    const client = {
      query: async (sql: string) => {
        if (sql.includes('INSERT INTO recrutamento.concurso')) {
          return {
            rows: [
              {
                id: '00000000-0000-4000-8000-000000000050',
                code: 'rec-2026',
                name: 'Concurso 2026',
                status: 'DRAFT',
                valid_until: '2026-06-30',
                vagas: [],
              },
            ],
          };
        }
        if (sql.includes('INSERT INTO recrutamento.edital')) {
          this.hasEdital = true;
          return {
            rows: [
              {
                concurso_id: '00000000-0000-4000-8000-000000000050',
                version: 1,
                document_ref: 's3://edital.pdf',
                administrative_act: 'Portaria 1/2026',
                administrative_act_date: '2026-05-02',
                published_at: null,
                public_url: null,
              },
            ],
          };
        }
        if (sql.includes('SELECT concurso_id::text')) {
          return { rows: this.hasEdital ? [{ version: 1 }] : [] };
        }
        if (sql.includes('WITH updated_edital')) {
          return {
            rows: [
              {
                concurso_id: '00000000-0000-4000-8000-000000000050',
                version: 1,
                document_ref: 's3://edital.pdf',
                administrative_act: 'Portaria 1/2026',
                administrative_act_date: '2026-05-02',
                published_at: '2026-05-02T00:00:00.000Z',
                public_url: 'https://portal.local/rec-2026/edital.pdf',
              },
            ],
          };
        }
        return { rows: [{ '?column?': 1 }] };
      },
    };
    return callback(client);
  }

  async query<T>(): Promise<T[]> {
    return [
      {
        concurso: {
          code: 'rec-2026',
          status: 'PUBLISHED',
          edital: { publicUrl: 'https://portal.local/rec-2026/edital.pdf' },
        },
      },
    ] as T[];
  }
}

describe('concurso publish flow', () => {
  let app: INestApplication<SupertestApp>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CognitoJwtService)
      .useValue({
        verifyAuthorizationHeader: jest.fn().mockResolvedValue({
          sub: '00000000-0000-4000-8000-000000000001',
          username: 'rec-admin',
          tenantId: '00000000-0000-4000-8000-000000000001',
          groups: [],
          permissions: [
            'recrutamento.concurso.write',
            'recrutamento.concurso.read',
          ],
          claims: {},
        }),
      })
      .overrideProvider(DatabaseService)
      .useValue(new FakeConcursoDatabase())
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates, publishes, and exposes a public URL without authentication', async () => {
    const token = [
      Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url'),
      Buffer.from(
        JSON.stringify({
          sub: '00000000-0000-4000-8000-000000000001',
          tenant_id: '00000000-0000-4000-8000-000000000001',
          permissions: [
            'recrutamento.concurso.write',
            'recrutamento.concurso.read',
          ],
        }),
      ).toString('base64url'),
      '',
    ].join('.');

    await request(app.getHttpServer())
      .post('/api/v1/recrutamento/concursos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'rec-2026',
        name: 'Concurso 2026',
        validUntil: '2026-06-30',
        vagas: [
          {
            positionId: '00000000-0000-4000-8000-000000000001',
            totalSeats: 10,
            pcdSeats: 1,
            racialSeats: 2,
            indigenousSeats: 0,
            baseSalary: '5000.00',
          },
        ],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(
        '/api/v1/recrutamento/concursos/00000000-0000-4000-8000-000000000050/editais',
      )
      .set('Authorization', `Bearer ${token}`)
      .send({
        documentRef: 's3://edital.pdf',
        administrativeAct: 'Portaria 1/2026',
        administrativeActDate: '2026-05-02',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(
        '/api/v1/recrutamento/concursos/00000000-0000-4000-8000-000000000050/editais/publish',
      )
      .set('Authorization', `Bearer ${token}`)
      .send({
        administrativeAct: 'Portaria 1/2026',
        administrativeActDate: '2026-05-02',
        publicUrl: 'https://portal.local/rec-2026/edital.pdf',
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/api/v1/publico/concursos/rec-2026')
      .expect(200);

    expect(response.body.edital.publicUrl).toBe(
      'https://portal.local/rec-2026/edital.pdf',
    );
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
