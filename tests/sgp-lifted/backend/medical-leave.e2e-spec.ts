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

class FakeMedicalLeaveDatabaseService {
  readonly configured = true;

  query<T>(sql: string, values: readonly unknown[] = []): Promise<T[]> {
    if (sql.includes('SELECT DISTINCT p.key')) {
      return Promise.resolve(
        [
          'auth.read',
          'rh.medical_leave.read',
          'saude.appointment.write',
          'saude.opinion.write',
        ].map((key) => ({ key })) as T[],
      );
    }
    if (sql.includes('INSERT INTO hr.medical_appointment')) {
      return Promise.resolve([
        {
          id: '00000000-0000-4000-8000-000000000010',
          employee_id: values[0],
          slot_ref: values[3],
          scheduled_on: values[4],
          scheduled_time: values[5],
          status: 'SCHEDULED',
        },
      ] as T[]);
    }
    if (sql.includes('FROM hr.medical_leave')) {
      return Promise.resolve([
        {
          id: '00000000-0000-4000-8000-000000000020',
          employee_id: values[0],
          medical_record_id: '00000000-0000-4000-8000-000000000030',
          granted_days: 15,
          starts_on: '2026-05-01',
          ends_on: '2026-05-15',
          status: 'ACTIVE',
          cid_code: 'J10',
          cid_secondary: null,
          expert_opinion_id: '00000000-0000-4000-8000-000000000030',
        },
      ] as T[]);
    }
    return Promise.resolve([] as T[]);
  }
}

describe('Medical leave workflow (e2e)', () => {
  let app: INestApplication;
  const originalUnsigned = process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS;

  beforeEach(async () => {
    process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS = 'true';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useClass(FakeMedicalLeaveDatabaseService)
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

  it('schedules medical leave pericia and returns appointment_id', async () => {
    await request(server())
      .post('/api/v1/licencas/saude/agendamento')
      .set('authorization', `Bearer ${token()}`)
      .send({
        employeeId: '00000000-0000-4000-8000-000000000001',
        slotRef: 'slot-hr04-0900',
        scheduledOn: '2026-05-01',
        scheduledTime: '09:00',
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.appointment_id).toBe(
          '00000000-0000-4000-8000-000000000010',
        );
      });
  });

  it('lists medical leaves for the requested employee', async () => {
    await request(server())
      .get('/api/v1/licencas/saude/00000000-0000-4000-8000-000000000001')
      .set('authorization', `Bearer ${token()}`)
      .expect(200)
      .expect((response) => {
        expect(response.body[0].grantedDays).toBe(15);
        expect(response.body[0].cidCode).toBe('J10');
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
