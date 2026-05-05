import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { AppModule } from '../../backend/src/app.module';
import { DatabaseService } from '../../backend/src/database/database.service';

function encodePart(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function token(): string {
  const payload = {
    sub: 'rh-user',
    'cognito:username': 'rh.user',
    'cognito:groups': ['RH'],
    'custom:tenant_id': '00000000-0000-0000-0000-000000000100',
    exp: Math.floor(Date.now() / 1000) + 3600,
    token_use: 'access',
  };
  return `${encodePart({ alg: 'none', typ: 'JWT' })}.${encodePart(payload)}.`;
}

class FakeRhVinculosDatabaseService {
  readonly configured = true;

  query<T>(sql: string): Promise<T[]> {
    if (sql.includes('SELECT DISTINCT p.key')) {
      return Promise.resolve(
        [
          'auth.read',
          'rh.employee.read',
          'rh.employee.write',
          'rh.employment_link.write',
        ].map((key) => ({ key })) as T[],
      );
    }
    return Promise.resolve([] as T[]);
  }

  async transaction<T>(
    callback: (client: {
      query: <R>(
        sql: string,
        values?: readonly unknown[],
      ) => Promise<{ rows: R[] }>;
    }) => Promise<T>,
  ): Promise<T> {
    return callback({ query: this.clientQuery.bind(this) });
  }

  private clientQuery<T>(
    sql: string,
    _values: readonly unknown[] = [],
  ): Promise<{ rows: T[] }> {
    if (sql.includes('FROM hr.employee') && sql.includes('FOR UPDATE')) {
      return Promise.resolve({
        rows: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            tenant_id: '00000000-0000-0000-0000-000000000100',
            registration: 'MAT-001',
            name: 'Servidor',
            functional_status_id: '00000000-0000-4000-8000-000000000010',
            version: 0,
          },
        ] as T[],
      });
    }
    if (sql.includes('INSERT INTO hr.contract_type')) {
      return Promise.resolve({
        rows: [{ id: '00000000-0000-4000-8000-000000000020' }] as T[],
      });
    }
    if (sql.includes('INSERT INTO hr.employment_link')) {
      return Promise.resolve({
        rows: [
          { id: '00000000-0000-4000-8000-000000000030', version: 0 },
        ] as T[],
      });
    }
    if (sql.includes('WITH closed_contracts AS')) {
      return Promise.resolve({
        rows: [
          {
            employee_id: '00000000-0000-4000-8000-000000000001',
            employment_link_id: '00000000-0000-4000-8000-000000000030',
            employment_contract_id: '00000000-0000-4000-8000-000000000040',
            contract_type: 'temporary',
            effective_on: '2026-05-01',
            end_date: '2026-11-01',
            status_history_id: '00000000-0000-4000-8000-000000000050',
            audit_event_id: '00000000-0000-4000-8000-000000000060',
            employee_version: 1,
            employment_link_version: 0,
          },
        ] as T[],
      });
    }
    return Promise.resolve({ rows: [] as T[] });
  }
}

describe('RH vinculos legal regime (e2e)', () => {
  let app: INestApplication;
  const originalUnsigned = process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS;

  beforeEach(async () => {
    process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS = 'true';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useClass(FakeRhVinculosDatabaseService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    if (originalUnsigned === undefined)
      delete process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS;
    else process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS = originalUnsigned;
  });

  function server(): SupertestApp {
    return app.getHttpAdapter().getInstance() as SupertestApp;
  }

  it('rejects temporary legal regime without end date', async () => {
    await request(server())
      .post(
        '/api/v1/funcionarios/00000000-0000-4000-8000-000000000001/vinculos',
      )
      .set('authorization', `Bearer ${token()}`)
      .set('if-match', '"0"')
      .send({
        contractType: 'temporary',
        effectiveOn: '2026-05-01',
      })
      .expect(400);
  });

  it('creates status history and audit references for a regime change', async () => {
    await request(server())
      .post(
        '/api/v1/funcionarios/00000000-0000-4000-8000-000000000001/vinculos',
      )
      .set('authorization', `Bearer ${token()}`)
      .set('if-match', '"0"')
      .send({
        contractType: 'temporary',
        effectiveOn: '2026-05-01',
        endDate: '2026-11-01',
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.statusHistoryId).toBe(
          '00000000-0000-4000-8000-000000000050',
        );
        expect(response.body.auditEventId).toBe(
          '00000000-0000-4000-8000-000000000060',
        );
      });
  });
});
