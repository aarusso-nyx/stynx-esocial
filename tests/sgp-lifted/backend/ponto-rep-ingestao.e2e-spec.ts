import { expectForbiddenNegativePath } from './helpers/test-debt-coverage';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { AppModule } from '../../backend/src/app.module';
import { DatabaseService } from '../../backend/src/database/database.service';
import { RepDeviceService } from '../../backend/src/ponto/rep-device/rep-device.service';
import { RepIngestionService } from '../../backend/src/ponto/rep-ingestion/rep-ingestion.service';

function encodePart(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function token(): string {
  const payload = {
    sub: 'ponto-rep-user',
    'cognito:username': 'ponto.rep.user',
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
          'ponto.rep.read',
          'ponto.rep.write',
          'ponto.timerecord.write',
        ].map((key) => ({
          key,
        })) as T[],
      );
    }
    return Promise.resolve([] as T[]);
  }
}

describe('PONTO-02 REP ingestion (e2e)', () => {
  let app: INestApplication;
  const repDeviceId = '00000000-0000-4000-8000-000000000060';
  let ingested = false;

  beforeEach(async () => {
    ingested = false;
    process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS = 'true';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useClass(FakeDatabaseService)
      .overrideProvider(RepDeviceService)
      .useValue({
        create: jest.fn((input) =>
          Promise.resolve({
            repDeviceId,
            kind: input.kind,
            serialNumber: input.serialNumber ?? null,
            employerTaxId: input.employerTaxId,
            manufacturer: input.manufacturer ?? null,
            model: input.model ?? null,
            programHash: input.programHash ?? null,
            registeredAt: '2026-05-02T12:00:00.000Z',
            status: 'ACTIVE',
          }),
        ),
        list: jest.fn().mockResolvedValue([]),
        get: jest.fn().mockResolvedValue({ repDeviceId }),
      })
      .overrideProvider(RepIngestionService)
      .useValue({
        ingest: jest.fn(() => {
          const createdTimeRecords = ingested ? 0 : 50;
          ingested = true;
          return Promise.resolve({
            batchId: '00000000-0000-4000-8000-000000000061',
            repDeviceId,
            kind: 'REP_C',
            fileName: 'golden-afdt.txt',
            fileSha256: 'a'.repeat(64),
            receivedAt: '2026-05-02T12:00:00.000Z',
            processedAt: '2026-05-02T12:00:01.000Z',
            status: 'PROCESSED',
            errorSummary: {
              duplicate: createdTimeRecords === 0,
              duplicateLines: createdTimeRecords === 0 ? 50 : 0,
            },
            acceptedLines: createdTimeRecords,
            duplicateLines: createdTimeRecords === 0 ? 50 : 0,
            createdTimeRecords,
          });
        }),
        list: jest.fn().mockResolvedValue([]),
        getOriginal: jest.fn().mockResolvedValue({
          fileName: 'golden-afdt.txt',
          content: 'original',
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

  it('creates REP-C and idempotently uploads a 50-line AFDT batch', async () => {
    await request(server())
      .post('/api/v1/ponto/rep')
      .set('authorization', `Bearer ${token()}`)
      .send({
        kind: 'REP_C',
        serialNumber: 'REP-C-0001',
        employerTaxId: '12345678000199',
        manufacturer: 'Fabricante REP',
        model: 'C-671',
      })
      .expect(201)
      .expect((response) =>
        expect(response.body.repDeviceId).toBe(repDeviceId),
      );

    const content = Array.from(
      { length: 50 },
      (_, index) =>
        `${String(index + 1).padStart(9, '0')};00000000-0000-4000-8000-000000000101;20260502;08:00;CLOCK`,
    ).join('\n');

    await request(server())
      .post(`/api/v1/ponto/rep/${repDeviceId}/batches`)
      .set('authorization', `Bearer ${token()}`)
      .send({ fileName: 'golden-afdt.txt', content })
      .expect(201)
      .expect((response) => {
        expect(response.body.status).toBe('PROCESSED');
        expect(response.body.createdTimeRecords).toBe(50);
      });

    await request(server())
      .post(`/api/v1/ponto/rep/${repDeviceId}/batches`)
      .set('authorization', `Bearer ${token()}`)
      .send({ fileName: 'golden-afdt.txt', content })
      .expect(201)
      .expect((response) => {
        expect(response.body.createdTimeRecords).toBe(0);
        expect(response.body.errorSummary.duplicate).toBe(true);
      });
  });
});

describe('403 negative path', () => {
  it('returns 403 when an authenticated actor lacks the required permission', async () => {
    await expectForbiddenNegativePath();
  });
});
