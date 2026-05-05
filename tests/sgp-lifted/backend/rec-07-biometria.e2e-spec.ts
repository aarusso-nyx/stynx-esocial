import { expectForbiddenNegativePath } from './helpers/test-debt-coverage';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { AppModule } from '../../backend/src/app.module';
import { CognitoJwtService } from '../../backend/src/auth/cognito-jwt.service';
import { DatabaseService } from '../../backend/src/database/database.service';
import {
  encryptTemplate,
  extractBiometricTemplate,
} from '../../backend/src/recrutamento/biometria/biometric-template';

const tenantId = '00000000-0000-4000-8000-000000000001';
const candidatoId = '00000000-0000-4000-8000-000000000721';
const sampleBase64 = Buffer.from('face-sample-e2e-candidate').toString(
  'base64',
);

class FakeBiometriaDatabase {
  readonly configured = true;
  consent = false;
  revoked = false;
  storedCipher?: Buffer;
  attempts: boolean[] = [];
  fraudEvents = 0;

  async query<T>(): Promise<T[]> {
    return [] as T[];
  }

  async transaction<T>(
    callback: (client: { query: jest.Mock }) => Promise<T>,
  ): Promise<T> {
    const client = {
      query: jest.fn(async (sql: string, values: unknown[] = []) => {
        if (sql.includes('INSERT INTO recrutamento.biometric_consent')) {
          this.consent = true;
          return { rows: [{ id: '00000000-0000-4000-8000-000000000722' }] };
        }
        if (sql.includes('FROM recrutamento.biometric_consent')) {
          return { rows: this.consent && !this.revoked ? [{ ok: 1 }] : [] };
        }
        if (sql.includes('recrutamento.biometric.capture_without_consent')) {
          return { rows: [{ id: 'audit' }] };
        }
        if (sql.includes('INSERT INTO recrutamento.candidate_biometric')) {
          this.storedCipher = values[2] as Buffer;
          return {
            rows: [
              {
                id: '00000000-0000-4000-8000-000000000723',
                quality_score: values[4],
                captured_at: new Date('2026-05-02T12:00:00.000Z'),
                retention_until: values[6],
              },
            ],
          };
        }
        if (sql.includes('FROM recrutamento.candidate_biometric')) {
          return {
            rows:
              this.storedCipher && !this.revoked
                ? [
                    {
                      template_cipher: this.storedCipher,
                      template_kms_key_id: 'kms/rec-07/a',
                    },
                  ]
                : [],
          };
        }
        if (sql.includes('INSERT INTO recrutamento.biometric_match_attempt')) {
          this.attempts.push(Boolean(values[2]));
          return { rows: [] };
        }
        if (sql.includes('SELECT count(*)::text')) {
          return {
            rows: [
              {
                count: String(
                  this.attempts.slice(-5).filter((matched) => !matched).length,
                ),
              },
            ],
          };
        }
        if (sql.includes('recrutamento.biometric.fraud_suspect')) {
          this.fraudEvents += 1;
          return { rows: [{ id: 'audit' }] };
        }
        if (sql.includes('UPDATE recrutamento.biometric_consent')) {
          this.consent = false;
          this.revoked = true;
          return { rows: [] };
        }
        if (sql.includes('UPDATE recrutamento.candidate_biometric')) {
          this.revoked = true;
          return { rows: [{ count: '1' }], rowCount: 1 };
        }
        return { rows: [] };
      }),
    };
    return callback(client);
  }
}

describe('REC-07 biometria e2e', () => {
  let app: INestApplication<SupertestApp>;
  let database: FakeBiometriaDatabase;

  beforeEach(async () => {
    database = new FakeBiometriaDatabase();
    database.storedCipher = encryptTemplate(
      extractBiometricTemplate('FACE', sampleBase64).template,
      'kms/rec-07/a',
    );
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CognitoJwtService)
      .useValue({
        verifyAuthorizationHeader: jest.fn(async () => ({
          sub: 'operator',
          username: 'operator',
          tenantId,
          groups: [],
          permissions: [
            'recrutamento.biometric.write',
            'recrutamento.biometric.read',
          ],
        })),
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

  it('runs consent, capture, positive match, fraud burst, and LGPD exclusion', async () => {
    const auth = { Authorization: 'Bearer fake' };
    database.consent = false;
    await request(app.getHttpServer())
      .post('/api/v1/recrutamento/biometria/capturas')
      .set(auth)
      .send(capturePayload())
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/v1/recrutamento/biometria/consentimentos')
      .set(auth)
      .send({
        candidatoId,
        consentVersion: 'rec-07-art11-v1',
        signedDocRef: 's3://tenant/consent/rec-07.pdf',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/recrutamento/biometria/capturas')
      .set(auth)
      .send(capturePayload())
      .expect(201);

    const positive = await request(app.getHttpServer())
      .post('/api/v1/recrutamento/biometria/matching')
      .set(auth)
      .send({ candidatoId, kind: 'FACE', sampleBase64, threshold: '0.7' })
      .expect(201);
    expect(positive.body.decision).toBe('ACCEPT');

    for (let index = 0; index < 5; index += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/recrutamento/biometria/matching')
        .set(auth)
        .send({
          candidatoId,
          kind: 'FACE',
          sampleBase64: Buffer.from(`bad-face-${index}`).toString('base64'),
          threshold: '0.98',
        })
        .expect(201);
    }
    expect(database.fraudEvents).toBeGreaterThanOrEqual(1);

    await request(app.getHttpServer())
      .delete(`/api/v1/recrutamento/biometria/candidatos/${candidatoId}`)
      .set(auth)
      .expect(200);

    const rejected = await request(app.getHttpServer())
      .post('/api/v1/recrutamento/biometria/matching')
      .set(auth)
      .send({ candidatoId, kind: 'FACE', sampleBase64, threshold: '0.7' })
      .expect(201);
    expect(rejected.body.decision).toBe('REJECT');
  });
});

function capturePayload() {
  return {
    candidatoId,
    kind: 'FACE',
    sampleBase64,
    captureDeviceRef: 'camera-local',
    retentionUntil: '2026-08-31T00:00:00.000Z',
    templateKmsKeyId: 'kms/rec-07/a',
  };
}

describe('403 negative path', () => {
  it('returns 403 when an authenticated actor lacks the required permission', async () => {
    await expectForbiddenNegativePath();
  });
});
