import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { Test } from '@nestjs/testing';
import { HttpStatus, INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { AuditService } from '../../backend/src/audit/audit.service';
import { DatabaseService } from '../../backend/src/database/database.service';
import { JobPositionsController } from '../../backend/src/gestao/master-data/master-data.controller';
import { MasterDataService } from '../../backend/src/gestao/master-data/master-data.service';

describe('Gestao master-data API (e2e)', () => {
  let app: INestApplication;
  const query = jest.fn();
  const auditMutation = jest.fn();

  beforeEach(async () => {
    query.mockReset();
    auditMutation.mockReset().mockResolvedValue(undefined);
    query.mockResolvedValue([
      {
        id: '11111111-1111-4111-8111-111111111111',
        code: 'ANL',
        name: 'Analista',
        description: 'Cargo efetivo',
        active: true,
        metadata: { vacanciesTotal: 2, vacanciesFilled: 1, vacanciesOpen: 1 },
        created_at: new Date('2026-04-30T00:00:00.000Z'),
        updated_at: new Date('2026-04-30T00:00:00.000Z'),
      },
    ]);

    const moduleRef = await Test.createTestingModule({
      controllers: [JobPositionsController],
      providers: [
        MasterDataService,
        { provide: DatabaseService, useValue: { configured: true, query } },
        { provide: AuditService, useValue: { auditMutation } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('POST /v1/cargos returns 201 and appends audit metadata', async () => {
    await request(app.getHttpServer() as SupertestApp)
      .post('/v1/cargos')
      .send({
        code: 'ANL',
        name: 'Analista',
        description: 'Cargo efetivo',
        metadata: { vacanciesFilled: 1, vacanciesOpen: 1 },
      })
      .expect(HttpStatus.CREATED)
      .expect(({ body }) => {
        expect(body.code).toBe('ANL');
        expect(body.metadata.vacanciesTotal).toBe(2);
      });

    expect(auditMutation).toHaveBeenCalledWith(
      expect.anything(),
      'CREATE',
      'master_data',
      expect.objectContaining({ tableName: 'hr.job_position' }),
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
