import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { DatabaseService } from '../../backend/src/database/database.service';
import { ReintegrationOrderService } from '../../backend/src/folha-pagamento/operations/reintegration/reintegration-order.service';

describe('Reintegracao future date validation (e2e)', () => {
  it('rejects future reinstatementDate with a typed error', async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for reintegracao-data-futura');
    }
    const databaseService = new DatabaseService({
      get: (key: string) =>
        key === 'DATABASE_URL' ? process.env.DATABASE_URL : undefined,
    } as never);
    const service = new ReintegrationOrderService(databaseService);

    await RequestContextStore.run(
      {
        tenantId: '00000000-0000-0000-0000-000000077010',
        permissions: ['hr.employment.write', 'esocial.event.read'],
      },
      async () => {
        await expect(
          service.register('00000000-0000-4000-8000-000000077003', {
            employmentLinkId: '00000000-0000-4000-8000-000000077003',
            reinstatementDate: '2999-01-01',
            decisionDate: '2026-05-01',
            kind: 'JUDICIAL',
            processNumber: '12345678901234567890',
          }),
        ).rejects.toMatchObject({
          response: {
            code: 'REINTEGRATION_FUTURE_DATE',
          },
        });
      },
    );

    await databaseService.onModuleDestroy();
  });
});
