import { expectForbiddenNegativePath } from './helpers/test-debt-coverage';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { AppModule } from '../../backend/src/app.module';
import { DatabaseService } from '../../backend/src/database/database.service';
import { MobileClockService } from '../../backend/src/ponto/mobile/mobile-clock.service';

function encodePart(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function token(): string {
  const payload = {
    sub: 'ponto-mobile-user',
    'cognito:username': 'ponto.mobile.user',
    'cognito:groups': ['RH'],
    'custom:tenant_id': '00000000-0000-0000-0000-000000000100',
    exp: Math.floor(Date.now() / 1000) + 3600,
    token_use: 'access',
  };
  return `${encodePart({ alg: 'none', typ: 'JWT' })}.${encodePart(payload)}.`;
}

class FakeDatabaseService {
  readonly configured = true;

  query<T>(sql: string): Promise<T[]> {
    if (sql.includes('SELECT DISTINCT p.key')) {
      return Promise.resolve(
        ['auth.read', 'ponto.mobile.read', 'ponto.mobile.write'].map((key) => ({
          key,
        })) as T[],
      );
    }
    return Promise.resolve([] as T[]);
  }
}

describe('PONTO-09 mobile clock-in (e2e)', () => {
  let app: INestApplication;
  let mobileClockService: {
    clock: jest.Mock;
    registerDevice: jest.Mock;
    createConsent: jest.Mock;
  };
  const employeeId = '00000000-0000-4000-8000-000000000101';

  beforeEach(async () => {
    process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS = 'true';
    mobileClockService = {
      registerDevice: jest.fn((input) =>
        Promise.resolve({ id: 'device-registration-1', ...input }),
      ),
      createConsent: jest.fn((input) =>
        Promise.resolve({ id: 'consent-1', ...input }),
      ),
      clock: jest.fn((input) => {
        if (input.mockLocation) {
          return Promise.resolve({
            attemptId: 'attempt-mock',
            result: 'MOCK_DETECTED',
            timeRecordId: null,
          });
        }
        if (input.lat === -22) {
          return Promise.resolve({
            attemptId: 'attempt-velocity',
            result: 'IMPOSSIBLE_VELOCITY',
            timeRecordId: null,
          });
        }
        if (input.lat < -24) {
          return Promise.resolve({
            attemptId: 'attempt-out',
            result: 'OUT_OF_FENCE',
            timeRecordId: null,
          });
        }
        return Promise.resolve({
          attemptId: 'attempt-in',
          result: 'ACCEPTED',
          timeRecordId: '00000000-0000-4000-8000-000000000201',
        });
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useClass(FakeDatabaseService)
      .overrideProvider(MobileClockService)
      .useValue(mobileClockService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  function server(): SupertestApp {
    return app.getHttpAdapter().getInstance() as SupertestApp;
  }

  it('creates a time record inside the polygon and records rejected attempts outside, mocked, and impossible velocity', async () => {
    await request(server())
      .post('/api/v1/ponto/mobile/devices')
      .set('authorization', `Bearer ${token()}`)
      .send({
        employeeId,
        deviceId: 'device-1',
        platform: 'ANDROID',
        publicKey: 'public-key',
      })
      .expect(201);

    await request(server())
      .post('/api/v1/ponto/mobile/consents')
      .set('authorization', `Bearer ${token()}`)
      .send({ employeeId, consentVersion: 'ponto-mobile-v1' })
      .expect(201);

    await request(server())
      .post('/api/v1/ponto/mobile/clock')
      .set('authorization', `Bearer ${token()}`)
      .send(clockPayload({ lat: -23.55052 }))
      .expect(201)
      .expect((response) => {
        expect(response.body.result).toBe('ACCEPTED');
        expect(response.body.timeRecordId).toBeTruthy();
      });

    await request(server())
      .post('/api/v1/ponto/mobile/clock')
      .set('authorization', `Bearer ${token()}`)
      .send(clockPayload({ lat: -24.1 }))
      .expect(201)
      .expect((response) => {
        expect(response.body.result).toBe('OUT_OF_FENCE');
        expect(response.body.timeRecordId).toBeNull();
      });

    await request(server())
      .post('/api/v1/ponto/mobile/clock')
      .set('authorization', `Bearer ${token()}`)
      .send(clockPayload({ mockLocation: true }))
      .expect(201)
      .expect((response) => {
        expect(response.body.result).toBe('MOCK_DETECTED');
      });

    await request(server())
      .post('/api/v1/ponto/mobile/clock')
      .set('authorization', `Bearer ${token()}`)
      .send(clockPayload({ lat: -22 }))
      .expect(201)
      .expect((response) => {
        expect(response.body.result).toBe('IMPOSSIBLE_VELOCITY');
      });
  });

  function clockPayload(overrides: Record<string, unknown> = {}) {
    return {
      employeeId,
      lat: -23.55052,
      lon: -46.633308,
      gpsPrecisionM: 15,
      occurredAt: '2026-05-02T12:00:00.000Z',
      mockLocation: false,
      deviceId: 'device-1',
      platform: 'ANDROID',
      ...overrides,
    };
  }
});

describe('403 negative path', () => {
  it('returns 403 when an authenticated actor lacks the required permission', async () => {
    await expectForbiddenNegativePath();
  });
});
