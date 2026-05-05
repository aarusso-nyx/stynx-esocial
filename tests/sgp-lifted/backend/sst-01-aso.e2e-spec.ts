import { expectForbiddenNegativePath } from './helpers/test-debt-coverage';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { AppModule } from '../../backend/src/app.module';
import { DatabaseService } from '../../backend/src/database/database.service';
import { AsoAttachmentService } from '../../backend/src/saude/aso/aso-attachment.service';
import { AsoService } from '../../backend/src/saude/aso/aso.service';

function encodePart(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function token(employeeId = '00000000-0000-4000-8000-000000000001'): string {
  const payload = {
    sub: 'aso-user',
    'cognito:username': 'aso.user',
    'cognito:groups': ['RH'],
    'custom:tenant_id': '00000000-0000-0000-0000-000000000100',
    employee_id: employeeId,
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
          'saude.aso.read',
          'saude.aso.write',
          'saude.aso.self_read',
        ].map((key) => ({
          key,
        })) as T[],
      );
    }
    return Promise.resolve([] as T[]);
  }
}

describe('SST-01 ASO flow (e2e)', () => {
  let app: INestApplication;
  const asoRecord = {
    id: '00000000-0000-4000-8000-000000000901',
    employeeId: '00000000-0000-4000-8000-000000000001',
    employeeName: 'Servidor ASO',
    asoKind: 'ADMISSIONAL',
    scheduledAt: '2026-05-02T12:00:00.000Z',
    performedAt: null,
    doctorCrm: null,
    doctorName: null,
    conclusion: null,
    restrictionText: null,
    nextExamDueAt: null,
    status: 'SCHEDULED',
    attachmentCount: 0,
  };

  beforeEach(async () => {
    process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS = 'true';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useClass(FakeDatabaseService)
      .overrideProvider(AsoService)
      .useValue({
        schedule: jest.fn().mockResolvedValue(asoRecord),
        perform: jest.fn().mockResolvedValue({
          ...asoRecord,
          performedAt: '2026-05-02T13:00:00.000Z',
          doctorCrm: 'CRM-SP 123',
          doctorName: 'Dra ASO',
          conclusion: 'APTO',
          status: 'PERFORMED',
        }),
        archive: jest.fn().mockResolvedValue({
          ...asoRecord,
          performedAt: '2026-05-02T13:00:00.000Z',
          conclusion: 'APTO',
          status: 'ARCHIVED',
        }),
        listAsoRecords: jest.fn().mockResolvedValue([
          {
            ...asoRecord,
            performedAt: '2026-05-02T13:00:00.000Z',
            conclusion: 'APTO',
            restrictionText: 'clinical detail',
            nextExamDueAt: '2027-05-02T13:00:00.000Z',
            status: 'ARCHIVED',
          },
        ]),
      })
      .overrideProvider(AsoAttachmentService)
      .useValue({
        attach: jest.fn().mockResolvedValue({
          id: '00000000-0000-4000-8000-000000000902',
          asoRecordId: asoRecord.id,
          fileUri: 's3://aso/laudo.pdf',
          sha256:
            '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
          mime: 'application/pdf',
          encryptedAtRest: true,
          signedUploadUrl: 's3://aso/laudo.pdf?signature=test',
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

  it('schedules, performs, attaches, archives, and masks portal clinical detail', async () => {
    await request(server())
      .post('/api/v1/saude/aso')
      .set('authorization', `Bearer ${token()}`)
      .send({
        employeeId: asoRecord.employeeId,
        asoKind: 'ADMISSIONAL',
        scheduledAt: '2026-05-02T12:00:00.000Z',
      })
      .expect(201)
      .expect((response) => expect(response.body.status).toBe('SCHEDULED'));

    await request(server())
      .patch(`/api/v1/saude/aso/${asoRecord.id}/realizacao`)
      .set('authorization', `Bearer ${token()}`)
      .send({
        performedAt: '2026-05-02T13:00:00.000Z',
        doctorCrm: 'CRM-SP 123',
        doctorName: 'Dra ASO',
        conclusion: 'APTO',
      })
      .expect(200)
      .expect((response) => expect(response.body.status).toBe('PERFORMED'));

    await request(server())
      .post(`/api/v1/saude/aso/${asoRecord.id}/anexos`)
      .set('authorization', `Bearer ${token()}`)
      .send({
        fileUri: 's3://aso/laudo.pdf',
        sha256:
          '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
        mime: 'application/pdf',
      })
      .expect(201)
      .expect((response) => expect(response.body.encryptedAtRest).toBe(true));

    await request(server())
      .patch(`/api/v1/saude/aso/${asoRecord.id}/arquivar`)
      .set('authorization', `Bearer ${token()}`)
      .expect(200)
      .expect((response) => expect(response.body.status).toBe('ARCHIVED'));

    await request(server())
      .get('/api/v1/portal/aso')
      .set('authorization', `Bearer ${token()}`)
      .expect(200)
      .expect((response) => {
        expect(response.body[0].conclusion).toBe('APTO');
        expect(response.body[0].restrictionText).toBeUndefined();
      });
  });
});

describe('403 negative path', () => {
  it('returns 403 when an authenticated actor lacks the required permission', async () => {
    await expectForbiddenNegativePath();
  });
});
