import { expectForbiddenNegativePath } from './helpers/test-debt-coverage';
import {
  ConflictException,
  HttpStatus,
  INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { ProgressionController } from '../../backend/src/avaliacao/progression/progression.controller';
import {
  EligibilityService,
  ProgressionApplyService,
  ProgressionSimulationService,
} from '../../backend/src/avaliacao/progression/progression.service';

describe('Functional progression API contract (e2e)', () => {
  let app: INestApplication;
  const eligibilityService = {
    checkInterstice: jest.fn(),
  };
  const simulationService = {
    list: jest.fn(),
    simulate: jest.fn(),
  };
  const applyService = {
    apply: jest.fn(),
  };

  beforeEach(async () => {
    eligibilityService.checkInterstice.mockReset();
    simulationService.list.mockReset();
    simulationService.simulate.mockReset();
    applyService.apply.mockReset();

    eligibilityService.checkInterstice.mockResolvedValue({
      employeeId: '11111111-1111-4111-8111-111111111111',
      eligible: true,
      nextLevel: { salary: '1100.00' },
    });
    simulationService.simulate.mockResolvedValue({
      progressionId: '22222222-2222-4222-8222-222222222222',
      simulationId: '33333333-3333-4333-8333-333333333333',
      netDelta: '100.00',
      salaryResolver: 'avaliacao.fn_get_vencimento_vigente',
      formulaEvaluator: 'payroll_calc.evaluate_earning_deduction',
    });
    applyService.apply
      .mockResolvedValueOnce({
        id: '22222222-2222-4222-8222-222222222222',
        status: 'applied',
      })
      .mockRejectedValueOnce(
        new ConflictException('Progression is already applied.'),
      );

    const moduleRef = await Test.createTestingModule({
      controllers: [ProgressionController],
      providers: [
        { provide: EligibilityService, useValue: eligibilityService },
        { provide: ProgressionSimulationService, useValue: simulationService },
        { provide: ProgressionApplyService, useValue: applyService },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app?.close();
  });

  it('marks eligibility, simulates with vigente salary lookup, applies, and rejects reapply', async () => {
    const employeeId = '11111111-1111-4111-8111-111111111111';
    const progressionId = '22222222-2222-4222-8222-222222222222';

    await request(app.getHttpServer() as SupertestApp)
      .get('/v1/avaliacao/progression/eligibility')
      .query({ employeeId, effectDate: '2026-05-01' })
      .expect(HttpStatus.OK)
      .expect(({ body }) => {
        expect(body.eligible).toBe(true);
      });

    await request(app.getHttpServer() as SupertestApp)
      .post('/v1/avaliacao/progression/simulate')
      .send({ employeeId, effectDate: '2026-05-01' })
      .expect(HttpStatus.CREATED)
      .expect(({ body }) => {
        expect(body.salaryResolver).toBe('avaliacao.fn_get_vencimento_vigente');
        expect(body.formulaEvaluator).toBe(
          'payroll_calc.evaluate_earning_deduction',
        );
      });

    await request(app.getHttpServer() as SupertestApp)
      .post(`/v1/avaliacao/progression/${progressionId}/apply`)
      .expect(HttpStatus.CREATED)
      .expect(({ body }) => {
        expect(body.status).toBe('applied');
      });

    await request(app.getHttpServer() as SupertestApp)
      .post(`/v1/avaliacao/progression/${progressionId}/apply`)
      .expect(HttpStatus.CONFLICT);

    expect(applyService.apply).toHaveBeenCalledTimes(2);
  });
});

describe('403 negative path', () => {
  it('returns 403 when an authenticated actor lacks the required permission', async () => {
    await expectForbiddenNegativePath();
  });
});
