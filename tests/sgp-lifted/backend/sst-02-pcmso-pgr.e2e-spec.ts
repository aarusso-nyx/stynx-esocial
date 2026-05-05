import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { AppModule } from '../../backend/src/app.module';
import { DatabaseService } from '../../backend/src/database/database.service';
import { HealthProgramService } from '../../backend/src/saude/program/health-program.service';
import { RiskManagementProgramService } from '../../backend/src/saude/program/risk-management-program.service';

function encodePart(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function token(): string {
  const payload = {
    sub: 'sst02-user',
    'cognito:username': 'sst02.user',
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
        ['auth.read', 'saude.program.read', 'saude.program.write'].map(
          (key) => ({
            key,
          }),
        ) as T[],
      );
    }
    return Promise.resolve([] as T[]);
  }
}

describe('SST-02 PCMSO/PGR flow (e2e)', () => {
  let app: INestApplication;
  const pcmso = {
    id: '00000000-0000-4000-8000-000000067001',
    workLocationId: '00000000-0000-4000-8000-000000067101',
    workLocationName: 'Sede',
    validFrom: '2026-01-01',
    validUntil: '2026-12-31',
    responsibleDoctorCrm: 'CRM-1',
    responsibleDoctorName: 'Dra PCMSO',
    status: 'DRAFT',
  };
  const pgr = {
    id: '00000000-0000-4000-8000-000000067002',
    workLocationId: pcmso.workLocationId,
    workLocationName: 'Sede',
    validFrom: '2026-01-01',
    validUntil: '2026-12-31',
    responsibleEngineerId: null,
    riskSnapshot: [],
    status: 'DRAFT',
  };

  beforeEach(async () => {
    process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS = 'true';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useClass(FakeDatabaseService)
      .overrideProvider(HealthProgramService)
      .useValue({
        create: jest.fn().mockResolvedValue(pcmso),
        activate: jest.fn().mockResolvedValue({ ...pcmso, status: 'ACTIVE' }),
        addRequiredExam: jest.fn().mockResolvedValue({
          id: '00000000-0000-4000-8000-000000067003',
          health_program_id: pcmso.id,
          medical_exam_id: '00000000-0000-4000-8000-000000067004',
        }),
        list: jest.fn().mockResolvedValue([{ ...pcmso, status: 'ACTIVE' }]),
      })
      .overrideProvider(RiskManagementProgramService)
      .useValue({
        create: jest.fn().mockResolvedValue(pgr),
        activate: jest.fn().mockResolvedValue({ ...pgr, status: 'ACTIVE' }),
        list: jest.fn().mockResolvedValue([{ ...pgr, status: 'ACTIVE' }]),
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

  it('creates and activates PGR and PCMSO, then links a periodic exam', async () => {
    await request(server())
      .post('/api/v1/saude/programas/pgr')
      .set('authorization', `Bearer ${token()}`)
      .send({
        workLocationId: pgr.workLocationId,
        validFrom: pgr.validFrom,
        validUntil: pgr.validUntil,
      })
      .expect(201)
      .expect((response) => expect(response.body.status).toBe('DRAFT'));

    await request(server())
      .patch(`/api/v1/saude/programas/pgr/${pgr.id}/ativar`)
      .set('authorization', `Bearer ${token()}`)
      .expect(200)
      .expect((response) => expect(response.body.status).toBe('ACTIVE'));

    await request(server())
      .post('/api/v1/saude/programas/pcmso')
      .set('authorization', `Bearer ${token()}`)
      .send({
        workLocationId: pcmso.workLocationId,
        validFrom: pcmso.validFrom,
        validUntil: pcmso.validUntil,
        responsibleDoctorCrm: pcmso.responsibleDoctorCrm,
        responsibleDoctorName: pcmso.responsibleDoctorName,
      })
      .expect(201);

    await request(server())
      .patch(`/api/v1/saude/programas/pcmso/${pcmso.id}/ativar`)
      .set('authorization', `Bearer ${token()}`)
      .expect(200)
      .expect((response) => expect(response.body.status).toBe('ACTIVE'));

    await request(server())
      .post(`/api/v1/saude/programas/pcmso/${pcmso.id}/exames`)
      .set('authorization', `Bearer ${token()}`)
      .send({
        medicalExamId: '00000000-0000-4000-8000-000000067004',
        periodicityMonthsOverride: 12,
      })
      .expect(201);
  });
});
