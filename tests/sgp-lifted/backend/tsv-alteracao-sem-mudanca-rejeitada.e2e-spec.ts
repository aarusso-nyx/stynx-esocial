import { BadRequestException } from '@nestjs/common';

import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { TsvContractService } from '../../backend/src/folha-pagamento/operations/tsv/tsv-contract.service';

describe('TS-V no-op contractual change rejection', () => {
  it('rejects patches without a real field diff using a typed error', async () => {
    const service = new TsvContractService({
      transaction: async (callback: (client: unknown) => Promise<unknown>) =>
        callback({
          query: jest.fn(async (sql: string) => {
            if (sql.includes('FROM hr.tsv_contract')) {
              return {
                rows: [
                  {
                    id: 'contract',
                    tenant_id: 'tenant',
                    start_date: '2026-04-01',
                    role: 'Estagiario',
                    monthly_amount: '1200.00',
                    weekly_hours: '30.000000',
                    workplace_id: 'workplace',
                    supervisor_employee_id: null,
                    education_institution: null,
                    internship_plan_uri: null,
                  },
                ],
              };
            }
            return { rows: [] };
          }),
        }),
    } as never);

    await RequestContextStore.run(
      {
        tenantId: '00000000-0000-0000-0000-000000078099',
        permissions: ['hr.employment.write'],
      },
      async () => {
        await expect(
          service.update('contract', {
            effectiveDate: '2026-05-01',
            reason: 'Sem alteracao',
            monthlyAmount: '1200.00',
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
      },
    );
  });
});
