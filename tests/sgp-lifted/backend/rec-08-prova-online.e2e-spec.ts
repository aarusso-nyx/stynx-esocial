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
const applicationId = '00000000-0000-4000-8000-000000000821';
const provaId = '00000000-0000-4000-8000-000000000822';
const candidatoId = '00000000-0000-4000-8000-000000000823';
const sessionId = '00000000-0000-4000-8000-000000000824';
const rescheduledId = '00000000-0000-4000-8000-000000000825';

class FakeRec08Database {
  readonly configured = true;
  sessionStatus = 'SCHEDULED';
  severeEvents = 0;
  auditEvents = 0;

  async query<T>(sql: string, values: unknown[] = []): Promise<T[]> {
    if (sql.includes('sgp_append_audit_event')) {
      this.auditEvents += 1;
      return [] as T[];
    }
    if (sql.includes('INSERT INTO recrutamento.proctoring_event')) {
      if (values[2] === 'SCREEN_SHARE_LOST' && values[3] === 'SEVERE') {
        this.severeEvents += 1;
      }
      return [{ id: 'event', severity: values[3] }] as T[];
    }
    if (sql.includes('UPDATE recrutamento.online_exam_session')) {
      this.sessionStatus = 'SUBMITTED';
      return [
        {
          id: sessionId,
          application_id: applicationId,
          prova_id: provaId,
          started_at: new Date('2026-05-02T12:00:00.000Z'),
          ended_at: new Date('2026-05-02T13:00:00.000Z'),
          status: 'SUBMITTED',
        },
      ] as T[];
    }
    if (sql.includes('INSERT INTO recrutamento.proctoring_artifact')) {
      return [
        {
          id: 'artifact',
          retention_until: new Date('2031-04-01T00:00:00.000Z'),
        },
      ] as T[];
    }
    return [] as T[];
  }

  async transaction<T>(
    callback: (client: { query: jest.Mock }) => Promise<T>,
  ): Promise<T> {
    const client = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM recrutamento.inscricao')) {
          return {
            rows: [
              {
                tenant_id: tenantId,
                concurso_id: '00000000-0000-4000-8000-000000000826',
                candidato_id: candidatoId,
              },
            ],
          };
        }
        if (sql.includes('FROM recrutamento.prova')) {
          return { rows: [{ ok: 1 }] };
        }
        if (sql.includes('INSERT INTO recrutamento.biometric_match_attempt')) {
          return { rows: [] };
        }
        if (sql.includes('FROM recrutamento.candidate_biometric')) {
          const sampleBase64 = Buffer.from('candidate-face').toString('base64');
          return {
            rows: [
              {
                template_cipher: encryptTemplate(
                  extractBiometricTemplate('FACE', sampleBase64).template,
                  'kms/rec-08/a',
                ),
                template_kms_key_id: 'kms/rec-08/a',
              },
            ],
          };
        }
        if (sql.includes('WITH voided AS')) {
          this.sessionStatus = 'VOIDED';
          return {
            rows: [
              {
                voided_id: sessionId,
                rescheduled_id: rescheduledId,
              },
            ],
          };
        }
        if (sql.includes('INSERT INTO recrutamento.online_exam_session')) {
          this.sessionStatus = 'IN_PROGRESS';
          return {
            rows: [
              {
                id: sessionId,
                application_id: applicationId,
                prova_id: provaId,
                started_at: new Date('2026-05-02T12:00:00.000Z'),
                ended_at: null,
                status: 'IN_PROGRESS',
              },
            ],
          };
        }
        return { rows: [] };
      }),
    };
    return callback(client);
  }
}

describe('REC-08 prova online com proctoring', () => {
  let app: INestApplication<SupertestApp>;
  let database: FakeRec08Database;

  beforeEach(async () => {
    database = new FakeRec08Database();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CognitoJwtService)
      .useValue({
        verifyAuthorizationHeader: jest.fn(async () => ({
          sub: 'reviewer',
          username: 'reviewer',
          tenantId,
          groups: [],
          permissions: [
            'recrutamento.exam.write',
            'recrutamento.exam.read',
            'recrutamento.exam.review',
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

  it('schedules, starts, flags screen-share loss, voids, and reschedules', async () => {
    const auth = { Authorization: 'Bearer fake' };
    await request(app.getHttpServer())
      .post('/api/v1/recrutamento/prova-online/sessions')
      .set(auth)
      .send(startPayload())
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/recrutamento/prova-online/sessions/${sessionId}/events`)
      .set(auth)
      .send({ kind: 'SCREEN_SHARE_LOST', evidenceRef: 'webrtc://lost' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/recrutamento/prova-online/sessions/${sessionId}/submit`)
      .set(auth)
      .send({})
      .expect(201);

    const review = await request(app.getHttpServer())
      .post(
        `/api/v1/recrutamento/prova-online/review/sessions/${sessionId}/void`,
      )
      .set(auth)
      .send({ reason: 'Screen-share interrompido durante a prova.' })
      .expect(201);

    expect(database.severeEvents).toBe(1);
    expect(database.sessionStatus).toBe('VOIDED');
    expect(review.body.rescheduledSessionId).toBe(rescheduledId);
  });

  it('blocks denied camera constraint and records audit evidence', async () => {
    const auth = { Authorization: 'Bearer fake' };
    await request(app.getHttpServer())
      .post('/api/v1/recrutamento/prova-online/sessions')
      .set(auth)
      .send({
        ...startPayload(),
        mediaConstraints: {
          camera: false,
          microphone: true,
          screenShare: true,
        },
      })
      .expect(403);

    expect(database.auditEvents).toBeGreaterThanOrEqual(1);
    expect(database.sessionStatus).toBe('SCHEDULED');
  });
});

function startPayload() {
  return {
    applicationId,
    provaId,
    candidatoId,
    recordingConsentAccepted: true,
    mediaConstraints: {
      camera: true,
      microphone: true,
      screenShare: true,
    },
    biometricSampleBase64: Buffer.from('candidate-face').toString('base64'),
    biometricKind: 'FACE',
    browserFingerprint: 'fp-1',
    ipAddress: '127.0.0.1',
    userAgent: 'supertest',
  };
}

describe('403 negative path', () => {
  it('returns 403 when an authenticated actor lacks the required permission', async () => {
    await expectForbiddenNegativePath();
  });
});
