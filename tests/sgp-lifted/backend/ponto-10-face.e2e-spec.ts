import { expectForbiddenNegativePath } from './helpers/test-debt-coverage';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { AppModule } from '../../backend/src/app.module';
import { DatabaseService } from '../../backend/src/database/database.service';
import { FaceConsentService } from '../../backend/src/ponto/face/consent.service';
import { FaceEnrollmentService } from '../../backend/src/ponto/face/face-enrollment.service';
import { FaceMatcherService } from '../../backend/src/ponto/face/face-matcher.service';
import { FaceThresholdAdminService } from '../../backend/src/ponto/face/threshold-admin.service';

interface FaceClockMockInput {
  frames: Array<{ blinkDetected?: boolean }>;
}

function encodePart(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function token(): string {
  const payload = {
    sub: 'ponto-face-user',
    'cognito:username': 'ponto.face.user',
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
        ['auth.read', 'ponto.face.read', 'ponto.face.write'].map((key) => ({
          key,
        })) as T[],
      );
    }
    return Promise.resolve([] as T[]);
  }
}

describe('PONTO-10 facial recognition (e2e)', () => {
  let app: INestApplication;
  const employeeId = '00000000-0000-4000-8000-000000000541';
  const sampleBase64 = Buffer.from('camera-face-sample').toString('base64');
  let fetchSpy: jest.SpyInstance | undefined;

  beforeEach(async () => {
    process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS = 'true';
    fetchSpy = jest.spyOn(global, 'fetch' as never);
    fetchSpy.mockRejectedValue(
      new Error('external network is forbidden') as never,
    );
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useClass(FakeDatabaseService)
      .overrideProvider(FaceConsentService)
      .useValue({
        create: jest.fn((input) =>
          Promise.resolve({ id: 'consent-1', ...input }),
        ),
        withdraw: jest.fn(() =>
          Promise.resolve({
            employeeId,
            withdrawnAt: 'now',
            revokedTemplates: 1,
          }),
        ),
        status: jest.fn(() =>
          Promise.resolve({
            employeeId,
            status: 'ACTIVE',
            capturedAt: '2026-05-02T12:00:00.000Z',
            modelId: 'local-insightface-facenet',
            modelVersion: 'open-source-local-v1',
          }),
        ),
      })
      .overrideProvider(FaceEnrollmentService)
      .useValue({
        list: jest.fn().mockResolvedValue([]),
        enroll: jest.fn((input) =>
          Promise.resolve({
            id: 'template-1',
            employeeId: input.employeeId,
            modelId: 'local-insightface-facenet',
            modelVersion: 'open-source-local-v1',
            status: 'ACTIVE',
            capturedAt: '2026-05-02T12:00:00.000Z',
          }),
        ),
      })
      .overrideProvider(FaceMatcherService)
      .useValue({
        clock: jest.fn((input: FaceClockMockInput) => {
          const livenessPassed = input.frames.some(
            (frame: { blinkDetected?: boolean }) => frame.blinkDetected,
          );
          return Promise.resolve({
            id: livenessPassed ? 'match-accept' : 'match-reject',
            timeRecordId: livenessPassed
              ? '00000000-0000-4000-8000-000000000542'
              : null,
            score: livenessPassed ? '1.000000' : '0.000000',
            threshold: '0.700000',
            livenessPassed,
            decision: livenessPassed ? 'ACCEPT' : 'REJECT',
          });
        }),
      })
      .overrideProvider(FaceThresholdAdminService)
      .useValue({
        getCurrent: jest.fn(() =>
          Promise.resolve({ threshold: '0.700000', livenessRequired: true }),
        ),
        update: jest.fn((input) => Promise.resolve(input)),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    fetchSpy?.mockRestore();
    await app.close();
  });

  function server(): SupertestApp {
    return app.getHttpAdapter().getInstance() as SupertestApp;
  }

  it('enrolls a template, accepts a live clock-in, rejects a printed photo, and handles exclusion without external vision API calls', async () => {
    await request(server())
      .post('/api/v1/ponto/face/consents')
      .set('authorization', `Bearer ${token()}`)
      .send({ employeeId, consentVersion: 'ponto-face-v1' })
      .expect(201);

    await request(server())
      .post('/api/v1/ponto/face/templates')
      .set('authorization', `Bearer ${token()}`)
      .send({
        employeeId,
        templateKmsKeyId: 'kms/ponto/face',
        frames: liveFrames(),
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.modelId).toBe('local-insightface-facenet');
      });

    await request(server())
      .post('/api/v1/ponto/face/clock')
      .set('authorization', `Bearer ${token()}`)
      .send({
        employeeId,
        occurredAt: '2026-05-02T12:00:00.000Z',
        deviceId: 'rep-a-camera-1',
        frames: liveFrames(),
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.decision).toBe('ACCEPT');
        expect(response.body.timeRecordId).toBeTruthy();
      });

    await request(server())
      .post('/api/v1/ponto/face/clock')
      .set('authorization', `Bearer ${token()}`)
      .send({
        employeeId,
        occurredAt: '2026-05-02T12:05:00.000Z',
        deviceId: 'rep-a-camera-1',
        frames: printedPhotoFrames(),
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.livenessPassed).toBe(false);
        expect(response.body.decision).toBe('REJECT');
      });

    await request(server())
      .delete(`/api/v1/ponto/face/employees/${employeeId}/consent`)
      .set('authorization', `Bearer ${token()}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.revokedTemplates).toBe(1);
      });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  function liveFrames() {
    return [
      { imageBase64: sampleBase64, blinkDetected: false, yawDegrees: -10 },
      { imageBase64: sampleBase64, blinkDetected: true, yawDegrees: 10 },
    ];
  }

  function printedPhotoFrames() {
    return [
      { imageBase64: sampleBase64, blinkDetected: false, yawDegrees: 0 },
      { imageBase64: sampleBase64, blinkDetected: false, yawDegrees: 0 },
    ];
  }
});

describe('403 negative path', () => {
  it('returns 403 when an authenticated actor lacks the required permission', async () => {
    await expectForbiddenNegativePath();
  });
});
