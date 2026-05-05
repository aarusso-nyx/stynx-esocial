import { SalaryHistoryController } from '../../backend/src/avaliacao/salary-history/salary-history.controller';
import { SalaryHistoryService } from '../../backend/src/avaliacao/salary-history/salary-history.service';

describe('Salary history API contract (e2e)', () => {
  it('applies mass adjustment and exposes a read-only timeline contract', async () => {
    const service = {
      applyMassAdjustment: jest.fn().mockResolvedValue({
        affectedCount: 1,
        affectedLevels: [
          {
            salaryRangeLevelId: '11111111-1111-4111-8111-111111111111',
            baseSalary: '1100.00',
          },
        ],
      }),
      timeline: jest.fn().mockResolvedValue([
        {
          salaryRangeLevelId: '11111111-1111-4111-8111-111111111111',
          vigenciaInicio: '2025-03-01',
          vigenciaFim: null,
          vencimentoBasico: '1100.00',
        },
      ]),
    } as unknown as SalaryHistoryService;
    const controller = new SalaryHistoryController(service);

    await expect(
      controller.massAdjustment({
        percentual: '10.000000',
        vigenciaInicio: '2025-03-01',
        leiReferencia: 'LC 001/2025',
        escopo: { salaryRangeId: '22222222-2222-4222-8222-222222222222' },
      }),
    ).resolves.toMatchObject({ affectedCount: 1 });

    await expect(
      controller.timeline('11111111-1111-4111-8111-111111111111'),
    ).resolves.toEqual([
      expect.objectContaining({ vencimentoBasico: '1100.00' }),
    ]);
  });
});
