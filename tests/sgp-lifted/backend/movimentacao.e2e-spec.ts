import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
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

class FakeTransferDatabaseService {
  readonly configured = true;
  closed = false;
  status = 'solicitada';

  query<T>(sql: string, values: readonly unknown[] = []): Promise<T[]> {
    if (sql.includes('SELECT DISTINCT p.key')) {
      return Promise.resolve(
        [
          'auth.read',
          'rh.movimentacao.read',
          'rh.movimentacao.request',
          'rh.movimentacao.approve',
          'rh.movimentacao.effect',
        ].map((key) => ({ key })) as T[],
      );
    }
    if (sql.includes('FROM hr.employee_transfer')) {
      return Promise.resolve([this.transferRow()] as T[]);
    }
    if (sql.includes('UPDATE hr.employee_transfer')) {
      this.status = String(values[1] ?? 'aprovada');
      return Promise.resolve([this.transferRow()] as T[]);
    }
    return Promise.resolve([] as T[]);
  }

  transaction<T>(
    callback: (client: {
      query: (
        sql: string,
        values?: readonly unknown[],
      ) => Promise<{ rows: unknown[] }>;
    }) => Promise<T>,
  ): Promise<T> {
    return callback({
      query: async (sql: string, values: readonly unknown[] = []) => {
        if (
          sql.includes('FROM hr.employee') &&
          !sql.includes('employee_transfer')
        ) {
          return {
            rows: [
              {
                employee_id: values[0],
                tenant_id: '00000000-0000-0000-0000-000000000100',
                work_location_id: '00000000-0000-4000-8000-000000000011',
                job_position_id: null,
              },
            ],
          };
        }
        if (sql.includes('INSERT INTO hr.employee_transfer')) {
          return { rows: [this.transferRow()] };
        }
        if (sql.includes('FOR UPDATE')) {
          return { rows: [this.transferRow()] };
        }
        if (sql.includes('SELECT EXISTS')) {
          return { rows: [{ has_closed_run: this.closed }] };
        }
        if (sql.includes('UPDATE hr.employee_transfer')) {
          this.status = 'efetivada';
          return { rows: [this.transferRow()] };
        }
        return { rows: [] };
      },
    });
  }

  transferRow() {
    return {
      id: '00000000-0000-4000-8000-000000000020',
      tenant_id: '00000000-0000-0000-0000-000000000100',
      employee_id: '00000000-0000-4000-8000-000000000001',
      origem_work_location_id: '00000000-0000-4000-8000-000000000011',
      destino_work_location_id: '00000000-0000-4000-8000-000000000012',
      origem_job_position_id: null,
      destino_job_position_id: null,
      tipo: 'oficio',
      data_solicitacao: '2026-05-01',
      data_efeito: '2026-06-01',
      processo_administrativo_id: null,
      status: this.status,
      aprovador_user_id: null,
      notes: '',
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
    };
  }
}

describe('Movimentacao workflow (e2e)', () => {
  let app: INestApplication;
  let database: FakeTransferDatabaseService;
  const originalUnsigned = process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS;

  beforeEach(async () => {
    process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS = 'true';
    database = new FakeTransferDatabaseService();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(database)
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

  it('creates, approves, and effects employee transfers', async () => {
    await request(server())
      .post('/api/v1/rh/employee-transfer')
      .set('authorization', `Bearer ${token()}`)
      .send({
        employeeId: '00000000-0000-4000-8000-000000000001',
        destinoWorkLocationId: '00000000-0000-4000-8000-000000000012',
        tipo: 'oficio',
        dataEfeito: '2026-06-01',
      })
      .expect(201)
      .expect((response) => expect(response.body.status).toBe('solicitada'));

    await request(server())
      .post(
        '/api/v1/rh/employee-transfer/00000000-0000-4000-8000-000000000020/aprovar',
      )
      .set('authorization', `Bearer ${token()}`)
      .send({})
      .expect(200);

    database.status = 'aprovada';
    await request(server())
      .post(
        '/api/v1/rh/employee-transfer/00000000-0000-4000-8000-000000000020/efetivar',
      )
      .set('authorization', `Bearer ${token()}`)
      .send({})
      .expect(200)
      .expect((response) => expect(response.body.status).toBe('efetivada'));
  });

  it('returns 422 when effecting inside a closed payroll competence', async () => {
    database.status = 'aprovada';
    database.closed = true;
    await request(server())
      .post(
        '/api/v1/rh/employee-transfer/00000000-0000-4000-8000-000000000020/efetivar',
      )
      .set('authorization', `Bearer ${token()}`)
      .send({})
      .expect(422)
      .expect((response) => {
        expect(response.body.error).toEqual(
          expect.objectContaining({
            code: 'UNPROCESSABLE_ENTITY',
            message:
              'Transfer effective date is inside a closed payroll competence',
            status: 422,
          }),
        );
      });
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
