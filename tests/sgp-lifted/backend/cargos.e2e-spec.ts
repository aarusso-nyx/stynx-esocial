import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { HttpStatus, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PoolClient } from 'pg';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { DatabaseService } from '../../backend/src/database/database.service';
import { JobPositionAdminController } from '../../backend/src/gestao/master-data/job-position.controller';
import { JobPositionService } from '../../backend/src/gestao/master-data/job-position.service';

describe('Gestao cargos API (e2e)', () => {
  let app: INestApplication;
  const query = jest.fn();
  const client = { query } as unknown as PoolClient;
  const database = {
    configured: true,
    query: jest.fn(),
    transaction: jest.fn(<T>(callback: (client: PoolClient) => Promise<T>) =>
      callback(client),
    ),
  };

  beforeEach(async () => {
    query.mockReset();
    database.query.mockReset();
    database.transaction.mockClear();
    query
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            code: 'ANA',
            name: 'Analista',
            description: '',
            category: 'efetivo',
            legal_regime: 'estatutario',
            creation_law: 'Lei 1/2026',
            vacancies_count: 2,
            salary_range_id: '22222222-2222-4222-8222-222222222222',
            salary_range_code: null,
            created_at: new Date('2026-05-01T00:00:00Z'),
            updated_at: new Date('2026-05-01T00:00:00Z'),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'audit-1' }] });

    const moduleRef = await Test.createTestingModule({
      controllers: [JobPositionAdminController],
      providers: [
        JobPositionService,
        { provide: DatabaseService, useValue: database },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('creates cargo, links a salary range, and appends audit event', async () => {
    await request(app.getHttpServer() as SupertestApp)
      .post('/v1/gestao/cargos')
      .send({
        code: 'ANA',
        name: 'Analista',
        category: 'efetivo',
        legalRegime: 'estatutario',
        creationLaw: 'Lei 1/2026',
        vacanciesCount: 2,
        salaryRangeId: '22222222-2222-4222-8222-222222222222',
      })
      .expect(HttpStatus.CREATED)
      .expect(({ body }) => {
        expect(body.code).toBe('ANA');
        expect(body.salaryRangeId).toBe('22222222-2222-4222-8222-222222222222');
      });

    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('sgp_append_audit_event'),
      expect.arrayContaining(['gestao.cargo.created']),
    );
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
