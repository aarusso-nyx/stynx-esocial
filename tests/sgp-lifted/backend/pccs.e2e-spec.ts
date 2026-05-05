import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { CareerPlanController } from '../../backend/src/avaliacao/career-plan/career-plan.controller';
import { CareerPlanService } from '../../backend/src/avaliacao/career-plan/career-plan.service';

describe('PCCS career plan API contract (e2e)', () => {
  it('cadastra PCCS, vincula cargo, and exposes the progression trail contract', async () => {
    const service = {
      create: jest.fn().mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        name: 'PCCS Municipal',
        jobPositionIds: ['22222222-2222-4222-8222-222222222222'],
      }),
      trail: jest.fn().mockResolvedValue({
        careerPlanId: '11111111-1111-4111-8111-111111111111',
        current: { classNumber: 1, referenceNumber: 1 },
        steps: [{ classNumber: 1, referenceNumber: 1 }],
      }),
    } as unknown as CareerPlanService;
    const controller = new CareerPlanController(service);

    await expect(
      controller.create({
        name: 'PCCS Municipal',
        institutingLaw: 'Lei 1/2026',
        startsOn: '2026-01-01',
        classCount: 2,
        referenceCount: 3,
        progressionRule: '# Progressao',
        jobPositionIds: ['22222222-2222-4222-8222-222222222222'],
        salaryRangeId: '33333333-3333-4333-8333-333333333333',
      }),
    ).resolves.toMatchObject({ name: 'PCCS Municipal' });

    await expect(
      controller.trail('11111111-1111-4111-8111-111111111111', {
        employeeId: '44444444-4444-4444-8444-444444444444',
      }),
    ).resolves.toMatchObject({
      current: { classNumber: 1, referenceNumber: 1 },
    });
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
