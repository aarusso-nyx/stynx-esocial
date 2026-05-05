import { expectForbiddenNegativePath } from './helpers/test-debt-coverage';
import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { HourBankAccrualService } from '../../backend/src/ponto/hour-bank/hour-bank-accrual.service';
import { HourBankCompensationService } from '../../backend/src/ponto/hour-bank/hour-bank-compensation.service';
import { HourBankSettlementService } from '../../backend/src/ponto/hour-bank/hour-bank-settlement.service';

describe('PONTO hour-bank golden scenarios (e2e)', () => {
  it('accumulates, compensates, and settles expired positive balance once', async () => {
    let balance = 0;
    const movements: Array<{
      kind: string;
      minutes: number;
      payrollRunId?: string | null;
    }> = [];
    const databaseService = {
      configured: true,
      query: jest.fn(async (sql: string, values: unknown[]) => {
        if (
          values[2] === 'ACCRUAL_POSITIVE' ||
          values[2] === 'ACCRUAL_NEGATIVE'
        ) {
          const minutes = Number(values[3]);
          balance += minutes;
          movements.push({ kind: String(values[2]), minutes });
          return [
            {
              hour_bank_movement_id: randomUUID(),
              hour_bank_id: '00000000-0000-4000-8000-000000000065',
              work_date: values[1],
              kind: values[2],
              minutes,
              source_time_record_ids: [],
              created_at: new Date().toISOString(),
              payroll_run_id: null,
            },
          ];
        }
        if (sql.includes('COMPENSATION')) {
          const minutes = Number(values[2]) * -1;
          balance += minutes;
          movements.push({ kind: 'COMPENSATION', minutes });
          return [
            {
              hour_bank_movement_id: randomUUID(),
              hour_bank_id: values[0],
              work_date: values[1],
              kind: 'COMPENSATION',
              minutes,
              source_time_record_ids: [],
              created_at: new Date().toISOString(),
              payroll_run_id: null,
            },
          ];
        }
        const payrollRunId = String(values[0]);
        const alreadySettled = movements.some(
          (movement) => movement.payrollRunId === payrollRunId,
        );
        if (alreadySettled) {
          return [
            {
              settled_count: '0',
              overtime_minutes: '0',
              deduction_minutes: '0',
            },
          ];
        }
        const overtime = balance > 0 ? balance : 0;
        const deduction = balance < 0 ? Math.abs(balance) : 0;
        movements.push({
          kind: balance > 0 ? 'SETTLEMENT_OVERTIME' : 'SETTLEMENT_DEDUCTION',
          minutes: balance * -1,
          payrollRunId,
        });
        balance = 0;
        return [
          {
            settled_count: '1',
            overtime_minutes: String(overtime),
            deduction_minutes: String(deduction),
          },
        ];
      }),
    };
    const accrual = new HourBankAccrualService(databaseService as never);
    const compensation = new HourBankCompensationService(
      databaseService as never,
    );
    const settlement = new HourBankSettlementService(databaseService as never);
    const employeeId = '00000000-0000-4000-8000-000000000061';
    const hourBankId = '00000000-0000-4000-8000-000000000065';

    for (let index = 0; index < 4; index += 1) {
      await accrual.accrueDay({
        employeeId,
        workDate: `2026-05-0${index + 1}`,
        workedMinutes: 600,
        expectedMinutes: 480,
      });
    }
    expect(balance).toBe(480);

    await compensation.compensate({
      hourBankId,
      workDate: '2026-05-10',
      minutes: 240,
    });
    expect(balance).toBe(240);

    await accrual.accrueDay({
      employeeId,
      workDate: '2026-05-11',
      workedMinutes: 540,
      expectedMinutes: 480,
    });
    expect(balance).toBe(300);

    const first = await settlement.settleExpired({
      payrollRunId: '00000000-0000-4000-8000-000000000063',
    });
    const second = await settlement.settleExpired({
      payrollRunId: '00000000-0000-4000-8000-000000000063',
    });

    expect(first).toMatchObject({ settledCount: 1, overtimeMinutes: 300 });
    expect(second).toMatchObject({ settledCount: 0, overtimeMinutes: 0 });
    expect(balance).toBe(0);
    expect(movements.reduce((sum, movement) => sum + movement.minutes, 0)).toBe(
      0,
    );
  });

  it('blocks compensation without available positive balance', async () => {
    const service = new HourBankCompensationService({
      configured: true,
      query: jest.fn().mockResolvedValue([]),
    } as never);

    await expect(
      service.compensate({
        hourBankId: '00000000-0000-4000-8000-000000000065',
        workDate: '2026-05-10',
        minutes: 240,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('403 negative path', () => {
  it('returns 403 when an authenticated actor lacks the required permission', async () => {
    await expectForbiddenNegativePath();
  });
});
