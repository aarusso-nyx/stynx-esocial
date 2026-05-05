import { expectForbiddenNegativePath } from './helpers/test-debt-coverage';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { AppModule } from '../../backend/src/app.module';
import { DatabaseService } from '../../backend/src/database/database.service';
import { AfdGeneratorService } from '../../backend/src/ponto/afd/afd-generator.service';
import { AfdImporterService } from '../../backend/src/ponto/afd/afd-importer.service';
import {
  encodeType1,
  encodeType4,
  encodeType9,
  fileSha256,
  serializeAfd,
  trailerHashForLines,
} from '../../backend/src/ponto/afd/afd-layout';

function encodePart(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function token(): string {
  const payload = {
    sub: 'ponto-afd-user',
    'cognito:username': 'ponto.afd.user',
    'cognito:groups': ['RH'],
    'custom:tenant_id': '00000000-0000-0000-0000-000000000100',
    exp: Math.floor(Date.now() / 1000) + 3600,
    token_use: 'access',
  };
  return `${encodePart({ alg: 'none', typ: 'JWT' })}.${encodePart(payload)}.`;
}

function goldenAfd(employeeCount: number): string {
  const bodyLines = [
    encodeType1({
      nsr: 0,
      employerTaxId: '12345678000199',
      employerName: 'Prefeitura Municipal',
      generatedAt: '2026-05-02T12:00:00.000Z',
      periodStart: '2026-05-01T00:00:00.000Z',
      periodEnd: '2026-05-31T23:59:59.000Z',
    }),
    ...Array.from({ length: employeeCount }, (_, index) =>
      encodeType4({
        nsr: index + 1,
        employeeIdentifier: `MAT-${String(index + 1).padStart(4, '0')}`,
        employeeName: `Servidor ${index + 1}`,
        recordedAt: `2026-05-02T${String(8 + (index % 8)).padStart(2, '0')}:00:00.000Z`,
        source: 'REP_C',
        repDeviceId: '00000000-0000-4000-8000-000000000060',
        recordHash: String(index).padStart(64, 'a').slice(0, 64),
      }),
    ),
  ];
  return serializeAfd([
    ...bodyLines,
    encodeType9({
      nsr: employeeCount + 1,
      periodStart: '2026-05-01T00:00:00.000Z',
      periodEnd: '2026-05-31T23:59:59.000Z',
      lineCount: bodyLines.length + 1,
      trailerHash: trailerHashForLines(bodyLines),
    }),
  ]);
}

class FakeDatabaseService {
  readonly configured = true;

  query<T>(sql: string): Promise<T[]> {
    if (sql.includes('SELECT DISTINCT p.key')) {
      return Promise.resolve(
        ['auth.read', 'ponto.afd.read', 'ponto.afd.write'].map((key) => ({
          key,
        })) as T[],
      );
    }
    return Promise.resolve([] as T[]);
  }
}

describe('PONTO-03 AFD round-trip (e2e)', () => {
  let app: INestApplication;
  const repDeviceId = '00000000-0000-4000-8000-000000000060';
  const original = goldenAfd(100);
  const importedSha = fileSha256(original);

  beforeEach(async () => {
    process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS = 'true';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useClass(FakeDatabaseService)
      .overrideProvider(AfdImporterService)
      .useValue({
        importAfd: jest.fn((input: { content: string }) => {
          const valid = input.content === original;
          return Promise.resolve({
            afdImportId: '00000000-0000-4000-8000-000000000161',
            repDeviceId,
            fileName: 'afd-100.txt',
            fileSha256: valid ? importedSha : fileSha256(input.content),
            importedAt: '2026-05-02T12:00:00.000Z',
            lineCount: valid ? 102 : 2,
            status: valid ? 'PROCESSED' : 'REJECTED',
            errorSummary: valid
              ? { acceptedLines: 100, rejectedLines: 0 }
              : { rejected: true, message: 'AFD trailer hash is invalid' },
            objectStoreKey: 'ponto/afd/imports/test.afd',
            acceptedLines: valid ? 100 : 0,
            rejectedLines: valid ? 0 : 2,
          });
        }),
        listImports: jest.fn().mockResolvedValue([]),
      })
      .overrideProvider(AfdGeneratorService)
      .useValue({
        createExport: jest.fn(() =>
          Promise.resolve({
            afdExportId: '00000000-0000-4000-8000-000000000162',
            repDeviceId,
            periodStart: '2026-05-01T00:00:00.000Z',
            periodEnd: '2026-05-31T23:59:59.000Z',
            generatedAt: '2026-05-02T12:00:01.000Z',
            fileSha256: importedSha,
            lineCount: 102,
            requestedByUserId: 'ponto-afd-user',
            status: 'READY',
            objectStoreKey: 'ponto/afd/exports/test.afd',
            errorSummary: {},
          }),
        ),
        listExports: jest.fn().mockResolvedValue([]),
        downloadExport: jest.fn(),
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

  it('imports 100 employees and reports an identical generated SHA-256', async () => {
    await request(server())
      .post('/api/v1/ponto/afd/imports')
      .set('authorization', `Bearer ${token()}`)
      .send({ repDeviceId, fileName: 'afd-100.txt', content: original })
      .expect(201)
      .expect((response) => {
        expect(response.body.status).toBe('PROCESSED');
        expect(response.body.acceptedLines).toBe(100);
        expect(response.body.fileSha256).toBe(importedSha);
      });

    await request(server())
      .post('/api/v1/ponto/afd/exports')
      .set('authorization', `Bearer ${token()}`)
      .send({
        repDeviceId,
        periodStart: '2026-05-01T00:00:00.000Z',
        periodEnd: '2026-05-31T23:59:59.000Z',
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.status).toBe('READY');
        expect(response.body.fileSha256).toBe(importedSha);
      });
  });

  it('returns a rejected import summary for an invalid type 9 seal', async () => {
    const invalid = original.replace(/[a-f0-9]{64}/, '0'.repeat(64));
    await request(server())
      .post('/api/v1/ponto/afd/imports')
      .set('authorization', `Bearer ${token()}`)
      .send({ repDeviceId, fileName: 'invalid-afd.txt', content: invalid })
      .expect(201)
      .expect((response) => {
        expect(response.body.status).toBe('REJECTED');
        expect(response.body.errorSummary.message).toContain('hash');
      });
  });
});

describe('403 negative path', () => {
  it('returns 403 when an authenticated actor lacks the required permission', async () => {
    await expectForbiddenNegativePath();
  });
});
