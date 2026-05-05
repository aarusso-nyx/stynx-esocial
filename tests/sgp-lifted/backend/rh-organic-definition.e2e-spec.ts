import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { AppModule } from '../../backend/src/app.module';
import { CognitoJwtService } from '../../backend/src/auth/cognito-jwt.service';
import { DatabaseService } from '../../backend/src/database/database.service';

const organicDefinitionId = '00000000-0000-4000-8000-000000000751';
const workLocationId = '00000000-0000-4000-8000-000000000752';
const jobPositionId = '00000000-0000-4000-8000-000000000753';

class FakeOrganicDefinitionDatabase {
  readonly configured = true;
  readonly queries: Array<{ sql: string; values: readonly unknown[] }> = [];

  async query<T>(sql: string, values: readonly unknown[] = []): Promise<T[]> {
    this.queries.push({ sql, values });
    if (sql.includes('count(*)::text AS total')) {
      return [{ total: '1' }] as T[];
    }
    if (sql.includes('INSERT INTO hr.organic_definition')) {
      return [{ id: organicDefinitionId }] as T[];
    }
    if (sql.includes('FROM hr.organic_definition od')) {
      return [
        {
          id: organicDefinitionId,
          code: 'ORG-EDU-ANL',
          name: 'Analistas da Educacao',
          description: 'Quadro autorizado',
          work_location_id: workLocationId,
          work_location_code: 'EDU',
          work_location_name: 'Secretaria de Educacao',
          job_position_id: jobPositionId,
          job_position_code: 'ANL',
          job_position_name: 'Analista',
          vacancies_total: 5,
          vacancies_filled: 2,
          vacancies_open: 3,
          effective_from: '2026-01-01',
          effective_to: null,
          status: 'ACTIVE',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      ] as T[];
    }
    return [] as T[];
  }
}

describe('rh organic definition flow', () => {
  let app: INestApplication<SupertestApp>;
  let database: FakeOrganicDefinitionDatabase;

  beforeEach(async () => {
    database = new FakeOrganicDefinitionDatabase();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CognitoJwtService)
      .useValue({
        verifyAuthorizationHeader: jest.fn().mockResolvedValue({
          sub: '00000000-0000-4000-8000-000000000001',
          username: 'rh-admin',
          tenantId: '00000000-0000-4000-8000-000000000001',
          groups: [],
          permissions: ['rh.read', 'rh.write'],
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

  it('creates and lists organic definitions linking lotacao, cargo, and vagas', async () => {
    const payload = {
      code: 'ORG-EDU-ANL',
      name: 'Analistas da Educacao',
      description: 'Quadro autorizado',
      workLocationId,
      jobPositionId,
      vacanciesTotal: 5,
      vacanciesFilled: 2,
      effectiveFrom: '2026-01-01',
    };

    const created = await request(app.getHttpServer())
      .post('/api/v1/rh/organic-definitions')
      .set('Authorization', 'Bearer test')
      .send(payload)
      .expect(201);

    expect(created.body).toMatchObject({
      id: organicDefinitionId,
      workLocationId,
      jobPositionId,
      vacanciesTotal: 5,
      vacanciesOpen: 3,
    });
    expect(database.queries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sql: expect.stringContaining('INSERT INTO hr.organic_definition'),
          values: expect.arrayContaining([5, 2, 3]),
        }),
      ]),
    );

    const list = await request(app.getHttpServer())
      .get('/api/v1/rh/organic-definitions?search=educacao')
      .set('Authorization', 'Bearer test')
      .expect(200);

    expect(list.body.items[0]).toMatchObject({
      code: 'ORG-EDU-ANL',
      workLocationCode: 'EDU',
      jobPositionCode: 'ANL',
    });
  });
});
