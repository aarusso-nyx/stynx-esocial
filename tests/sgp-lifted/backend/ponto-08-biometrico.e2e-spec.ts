import { expectForbiddenNegativePath } from './helpers/test-debt-coverage';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { AppModule } from '../../backend/src/app.module';
import { DatabaseService } from '../../backend/src/database/database.service';
import { PontoBiometricMatcherService } from '../../backend/src/ponto/biometria/biometric-matcher.service';
import { PontoBiometricConsentService } from '../../backend/src/ponto/biometria/consent.service';
import { TemplateEnrollmentService } from '../../backend/src/ponto/biometria/template-enrollment.service';

function encodePart(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function token(): string {
  const payload = {
    sub: 'ponto-bio-user',
    'cognito:username': 'ponto.bio.user',
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
        [
          'auth.read',
          'ponto.biometric.read',
          'ponto.biometric.write',
          'ponto.rep.write',
          'ponto.timerecord.write',
        ].map((key) => ({ key })) as T[],
      );
    }
    return Promise.resolve([] as T[]);
  }
}

describe('PONTO-08 biometrico (e2e)', () => {
  let app: INestApplication;
  const employeeId = '00000000-0000-4000-8000-000000000101';
  const sampleBase64 = Buffer.alloc(4096, 8).toString('base64');

  beforeEach(async () => {
    process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS = 'true';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useClass(FakeDatabaseService)
      .overrideProvider(PontoBiometricConsentService)
      .useValue({
        create: jest.fn((input) =>
          Promise.resolve({ id: 'consent-1', ...input }),
        ),
        withdraw: jest.fn((id) =>
          Promise.resolve({ employeeId: id, withdrawnAt: 'now' }),
        ),
      })
      .overrideProvider(TemplateEnrollmentService)
      .useValue({
        list: jest.fn().mockResolvedValue([]),
        enroll: jest.fn((input) =>
          Promise.resolve({
            id: 'template-1',
            employeeId: input.employeeId,
            kind: input.kind,
            qualityScore: '0.990000',
            status: 'ACTIVE',
            capturedAt: '2026-05-02T12:00:00.000Z',
          }),
        ),
      })
      .overrideProvider(PontoBiometricMatcherService)
      .useValue({
        match: jest.fn().mockResolvedValue({
          matched: true,
          score: '1.000000',
          threshold: '0.850000',
        }),
      })
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

  it('registers consent, enrolls one fingerprint, and accepts three biometric clock-in matches', async () => {
    await request(server())
      .post('/api/v1/ponto/biometria/consents')
      .set('authorization', `Bearer ${token()}`)
      .send({ employeeId, consentVersion: 'ponto-bio-v1' })
      .expect(201);

    await request(server())
      .post('/api/v1/ponto/biometria/templates')
      .set('authorization', `Bearer ${token()}`)
      .send({
        employeeId,
        kind: 'FINGERPRINT',
        sampleBase64,
        templateKmsKeyId: 'kms/ponto/fingerprint',
        minimumQuality: 0.85,
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.qualityScore).toBe('0.990000');
      });

    for (const timeRecordId of [
      '00000000-0000-4000-8000-000000000201',
      '00000000-0000-4000-8000-000000000202',
      '00000000-0000-4000-8000-000000000203',
    ]) {
      await request(server())
        .post('/api/v1/ponto/biometria/matches')
        .set('authorization', `Bearer ${token()}`)
        .send({
          employeeId,
          timeRecordId,
          kind: 'FINGERPRINT',
          sampleBase64,
          threshold: 0.85,
        })
        .expect(201)
        .expect((response) => {
          expect(response.body.matched).toBe(true);
          expect(Number(response.body.score)).toBeGreaterThanOrEqual(0.85);
        });
    }
  });
});

describe('403 negative path', () => {
  it('returns 403 when an authenticated actor lacks the required permission', async () => {
    await expectForbiddenNegativePath();
  });
});
