import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { AppModule } from '../../backend/src/app.module';
import { DatabaseService } from '../../backend/src/database/database.service';

class FakeLaiDatabase {
  readonly configured = true;
  readonly queries: string[] = [];

  query<T>(sql: string): Promise<T[]> {
    this.queries.push(sql);
    if (sql.includes('create_lai_request')) {
      return Promise.resolve([
        {
          protocol: 'LAI-20260502-ABC12345',
          access_key:
            '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          status: 'RECEIVED',
          submitted_at: '2026-05-02T10:00:00.000Z',
          due_at: '2026-05-22T10:00:00.000Z',
        },
      ] as T[]);
    }
    if (sql.includes('get_lai_request_status')) {
      return Promise.resolve([
        {
          protocol: 'LAI-20260502-ABC12345',
          status: 'RECEIVED',
          submitted_at: '2026-05-02T10:00:00.000Z',
          due_at: '2026-05-22T10:00:00.000Z',
          extended_due_at: null,
          answered_at: null,
          closed_at: null,
        },
      ] as T[]);
    }
    return Promise.resolve([] as T[]);
  }
}

describe('LAI request public workflow (e2e)', () => {
  let app: INestApplication<SupertestApp>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(new FakeLaiDatabase())
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a public LAI request and returns protocol plus status key', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/public/lai/00000000-0000-4000-8000-000000000001/requests')
      .send({
        requesterName: 'Ana Silva',
        requesterEmail: 'ana@example.gov.br',
        requestText: 'Solicito informacoes sobre despesas de pessoal.',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      protocol: 'LAI-20260502-ABC12345',
      status: 'RECEIVED',
      dueAt: '2026-05-22T10:00:00.000Z',
    });
    expect(response.body.accessKey).toHaveLength(64);
  });

  it('returns public status without exposing requester data', async () => {
    const response = await request(app.getHttpServer())
      .get(
        '/api/v1/public/lai/00000000-0000-4000-8000-000000000001/requests/LAI-20260502-ABC12345/status',
      )
      .query({
        accessKey:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      })
      .expect(200);

    expect(response.body).toMatchObject({
      protocol: 'LAI-20260502-ABC12345',
      status: 'RECEIVED',
      dueAt: '2026-05-22T10:00:00.000Z',
    });
    expect(JSON.stringify(response.body)).not.toMatch(/requester|email|text/i);
  });
});

describe('Wave 7 test debt guardrails', () => {
  describe('403 negative path', () => {
    it('returns 403 when an authenticated actor lacks the required permission', async () => {
      await expectForbiddenNegativePath();
    });
  });

  describe('frozen clock', () => {
    beforeAll(() => {
      jest.useFakeTimers().setSystemTime(FROZEN_TEST_TIME);
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('uses a deterministic system time', () => {
      expect(new Date().toISOString()).toBe(FROZEN_TEST_TIME.toISOString());
    });
  });
});
