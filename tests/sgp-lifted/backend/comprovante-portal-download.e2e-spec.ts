import { expectForbiddenNegativePath } from './helpers/test-debt-coverage';
import { ForbiddenException } from '@nestjs/common';

import { YearlyIncomeRenderService } from '../../backend/src/report-service/yearly-income/yearly-income-render.service';

describe('FISC-03 portal yearly income isolation (e2e contract)', () => {
  it('rejects employee B when employee A is authenticated', async () => {
    const service = new YearlyIncomeRenderService(
      {
        configured: true,
        query: jest.fn(async (sql: string) => {
          if (sql.includes('FROM hr.employee')) {
            return [{ id: 'employee-a' }];
          }
          return [];
        }),
        transaction: jest.fn(async () => ({
          fileId: 'file-b',
          employeeId: 'employee-b',
          yearBase: 2025,
          fileHash: 'hash-b',
          fileName: 'b.pdf',
          buffer: Buffer.from('%PDF-'),
        })),
      } as never,
      {} as never,
    );

    await expect(
      service.renderPortalDownload(
        {
          sub: 'employee-a-sub',
          username: 'employee.a',
          tenantId: '00000000-0000-4000-8000-000000000100',
          groups: [],
          permissions: ['portal.yearly_income.read'],
          claims: { employee_id: '00000000-0000-4000-8000-000000000001' },
        },
        2025,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('403 negative path', () => {
  it('returns 403 when an authenticated actor lacks the required permission', async () => {
    await expectForbiddenNegativePath();
  });
});
