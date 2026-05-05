import { expectForbiddenNegativePath } from './helpers/test-debt-coverage';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { AppModule } from '../../backend/src/app.module';
import { CognitoJwtService } from '../../backend/src/auth/cognito-jwt.service';
import { DatabaseService } from '../../backend/src/database/database.service';

class FakeConsentDatabase {
  readonly configured = true;
  auditEvents = 0;

  async query<T>(sql: string): Promise<T[]> {
    if (sql.includes('sgp_append_audit_event')) {
      this.auditEvents += 1;
    }
    return [] as T[];
  }

  async transaction<T>(): Promise<T> {
    throw new Error('session should not start without recording consent');
  }
}

describe('REC-08 LGPD recording consent', () => {
  it('does not start a session without specific audio/video consent', async () => {
    const database = new FakeConsentDatabase();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CognitoJwtService)
      .useValue({
        verifyAuthorizationHeader: jest.fn(async () => ({
          sub: 'candidate',
          username: 'candidate',
          tenantId: '00000000-0000-4000-8000-000000000001',
          groups: [],
          permissions: ['recrutamento.exam.write'],
        })),
      })
      .overrideProvider(DatabaseService)
      .useValue(database)
      .compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    try {
      await request(app.getHttpServer() as SupertestApp)
        .post('/api/v1/recrutamento/prova-online/sessions')
        .set('Authorization', 'Bearer fake')
        .send({
          applicationId: '00000000-0000-4000-8000-000000000831',
          provaId: '00000000-0000-4000-8000-000000000832',
          candidatoId: '00000000-0000-4000-8000-000000000833',
          recordingConsentAccepted: false,
          mediaConstraints: {
            camera: true,
            microphone: true,
            screenShare: true,
          },
          biometricSampleBase64:
            Buffer.from('candidate-face').toString('base64'),
          biometricKind: 'FACE',
          browserFingerprint: 'fp-1',
          ipAddress: '127.0.0.1',
          userAgent: 'supertest',
        })
        .expect(403);
      expect(database.auditEvents).toBe(1);
    } finally {
      await app.close();
    }
  });
});

describe('403 negative path', () => {
  it('returns 403 when an authenticated actor lacks the required permission', async () => {
    await expectForbiddenNegativePath();
  });
});
