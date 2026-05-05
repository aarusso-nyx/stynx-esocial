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

class FakeVacationDatabaseService {
  readonly configured = true;

  query<T>(sql: string, values: readonly unknown[] = []): Promise<T[]> {
    if (sql.includes('SELECT DISTINCT p.key')) {
      return Promise.resolve(
        [
          'auth.read',
          'rh.vacation.read',
          'rh.vacation.request',
          'rh.vacation.approve',
        ].map((key) => ({ key })) as T[],
      );
    }
    if (sql.includes('hr.f_calculate_vacation_balance')) {
      return Promise.resolve([
        {
          employee_id: values[0],
          accrual_period_start: '2025-01-01',
          accrual_period_end: '2025-12-31',
          accrued_days: 30,
          used_days: 0,
          pecuniary_bonus_days: 0,
          available_days: 30,
        },
      ] as T[]);
    }
    if (sql.includes('UPDATE hr.vacation_record')) {
      return Promise.resolve([
        {
          id: values[0],
          employee_id: '00000000-0000-4000-8000-000000000001',
          accrual_period_start: '2025-01-01',
          accrual_period_end: '2025-12-31',
          installment_number: 1,
          pecuniary_bonus_days: 0,
          starts_on: '2026-01-01',
          ends_on: '2026-01-30',
          days: 30,
          status: values[1],
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-02T00:00:00.000Z',
        },
      ] as T[]);
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
    values: readonly unknown[] = [],
  ): Promise<{ rows: T[] }> {
    if (sql.includes('FROM hr.employee employee')) {
      return Promise.resolve({
        rows: [
          {
            employee_id: values[0],
            tenant_id: '00000000-0000-0000-0000-000000000100',
            contract_type: 'statutory',
          },
        ] as T[],
      });
    }
    if (sql.includes('INSERT INTO hr.vacation_record')) {
      return Promise.resolve({
        rows: [
          {
            id: '00000000-0000-4000-8000-000000000090',
            employee_id: values[1],
            accrual_period_start: values[3],
            accrual_period_end: values[4],
            installment_number: values[5],
            pecuniary_bonus_days: values[6],
            starts_on: values[7],
            ends_on: values[8],
            days: values[9],
            status: 'programado',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ] as T[],
      });
    }
    return Promise.resolve({ rows: [] as T[] });
  }
}

describe('Vacation workflow (e2e)', () => {
  let app: INestApplication;
  const originalUnsigned = process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS;

  beforeEach(async () => {
    process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS = 'true';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useClass(FakeVacationDatabaseService)
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

  it('returns a 30 day balance after a complete accrual period', async () => {
    await request(server())
      .get('/api/v1/ferias/saldo/00000000-0000-4000-8000-000000000001')
      .set('authorization', `Bearer ${token()}`)
      .expect(200)
      .expect((response) => {
        expect(response.body[0].availableDays).toBe(30);
      });
  });

  it('rejects vacation schedules with four installments', async () => {
    await request(server())
      .post('/api/v1/ferias/programacao')
      .set('authorization', `Bearer ${token()}`)
      .send({
        employeeId: '00000000-0000-4000-8000-000000000001',
        accrualPeriodStart: '2025-01-01',
        accrualPeriodEnd: '2025-12-31',
        installments: [
          { startsOn: '2026-01-01', endsOn: '2026-01-05' },
          { startsOn: '2026-02-01', endsOn: '2026-02-05' },
          { startsOn: '2026-03-01', endsOn: '2026-03-05' },
          { startsOn: '2026-04-01', endsOn: '2026-04-05' },
        ],
      })
      .expect(400);
  });

  it('rejects pecuniary bonus above ten days', async () => {
    await request(server())
      .post('/api/v1/ferias/programacao')
      .set('authorization', `Bearer ${token()}`)
      .send({
        employeeId: '00000000-0000-4000-8000-000000000001',
        accrualPeriodStart: '2025-01-01',
        accrualPeriodEnd: '2025-12-31',
        pecuniaryBonusDays: 11,
        installments: [{ startsOn: '2026-01-01', endsOn: '2026-01-30' }],
      })
      .expect(400);
  });

  it('approves a scheduled vacation record', async () => {
    await request(server())
      .post(
        '/api/v1/ferias/programacao/00000000-0000-4000-8000-000000000090/aprovar',
      )
      .set('authorization', `Bearer ${token()}`)
      .send({})
      .expect(201)
      .expect((response) => {
        expect(response.body.status).toBe('aprovado');
      });
  });
});
