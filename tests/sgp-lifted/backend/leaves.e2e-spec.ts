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

class FakeLeavesDatabaseService {
  readonly configured = true;

  query<T>(sql: string, values: readonly unknown[] = []): Promise<T[]> {
    if (sql.includes('SELECT DISTINCT p.key')) {
      return Promise.resolve(
        [
          'auth.read',
          'rh.leave.request',
          'rh.leave.approve',
          'rh.leave.read',
        ].map((key) => ({
          key,
        })) as T[],
      );
    }
    if (sql.includes('FROM hr.employee')) {
      return Promise.resolve([
        {
          employee_id: values[0],
          tenant_id: '00000000-0000-0000-0000-000000000100',
        },
      ] as T[]);
    }
    if (sql.includes('FROM public.system_parameter')) {
      return Promise.resolve([] as T[]);
    }
    if (sql.includes('INSERT INTO hr.absence_reason')) {
      return Promise.resolve([{ id: 'reason-1' }] as T[]);
    }
    if (sql.includes('hr.f_validate_leave_eligibility')) {
      return Promise.resolve([{ f_validate_leave_eligibility: true }] as T[]);
    }
    if (sql.includes('INSERT INTO hr.leave_record')) {
      return Promise.resolve([
        this.leaveRow(String(values[9]), Number(values[5]), Boolean(values[6])),
      ] as T[]);
    }
    if (sql.includes('FROM hr.leave_record')) {
      return Promise.resolve([this.leaveRow('maternidade', 120, true)] as T[]);
    }
    if (sql.includes('UPDATE hr.leave_record')) {
      return Promise.resolve([
        this.leaveRow('maternidade', 120, true, '2026-05-02T00:00:00.000Z'),
      ] as T[]);
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
      query: async (sql: string, values: readonly unknown[] = []) => ({
        rows: await this.query(sql, values),
      }),
    });
  }

  private leaveRow(
    reason: string,
    days: number,
    paid: boolean,
    approvedAt: string | null = null,
  ) {
    return {
      id: '00000000-0000-4000-8000-000000000020',
      employee_id: '00000000-0000-4000-8000-000000000001',
      reason,
      starts_on: '2026-05-01',
      ends_on: '2026-08-28',
      days,
      paid,
      status: 'ACTIVE',
      notes: '',
      supporting_document_ref: null,
      requested_at: '2026-05-01T00:00:00.000Z',
      approved_at: approvedAt,
      approved_by: null,
    };
  }
}

describe('General leaves workflow (e2e)', () => {
  let app: INestApplication;
  const originalUnsigned = process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS;

  beforeEach(async () => {
    process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS = 'true';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useClass(FakeLeavesDatabaseService)
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

  it('creates maternity leave requests', async () => {
    await request(server())
      .post('/api/v1/licencas')
      .set('authorization', `Bearer ${token()}`)
      .send({
        employeeId: '00000000-0000-4000-8000-000000000001',
        reason: 'maternidade',
        startsOn: '2026-05-01',
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.days).toBe(120);
        expect(response.body.paid).toBe(true);
      });
  });

  it('creates licenca premio requests through the general leave path', async () => {
    await request(server())
      .post('/api/v1/licencas')
      .set('authorization', `Bearer ${token()}`)
      .send({
        employeeId: '00000000-0000-4000-8000-000000000001',
        reason: 'premio',
        startsOn: '2026-05-01',
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.reason).toBe('premio');
        expect(response.body.days).toBe(90);
        expect(response.body.paid).toBe(true);
      });
  });

  it('approves leave requests', async () => {
    await request(server())
      .post('/api/v1/licencas/00000000-0000-4000-8000-000000000020/aprovar')
      .set('authorization', `Bearer ${token()}`)
      .send({})
      .expect(200)
      .expect((response) => {
        expect(response.body.approvedAt).toBe('2026-05-02T00:00:00.000Z');
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
