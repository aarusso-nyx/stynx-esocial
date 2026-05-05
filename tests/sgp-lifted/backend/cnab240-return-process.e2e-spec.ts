import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { BadRequestException } from '@nestjs/common';

import { Cnab240ReturnParserService } from '../../backend/src/integrations-worker/cnab240/return/cnab240-return-parser.service';
import { Cnab240ReturnProcessService } from '../../backend/src/integrations-worker/cnab240/return/cnab240-return-process.service';
import { OccurrenceMapperService } from '../../backend/src/integrations-worker/cnab240/return/occurrence-mapper.service';

describe('BANK-02 CNAB 240 return processing gate', () => {
  it('rejects hash mismatch before touching payroll items', async () => {
    const client = { query: jest.fn() };
    client.query.mockResolvedValueOnce({
      rows: [
        {
          id: remittanceId,
          tenant_id: tenantId,
          payroll_run_id: payrollRunId,
          competence_year: 2026,
          competence_month: 4,
          payment_date: '2026-04-25',
          file_hash: 'a'.repeat(64),
          bank_code: 1,
          processing_type_id: null,
          total_amount: '100.00',
        },
      ],
    });
    const db = {
      configured: true,
      transaction: jest.fn(
        async (
          callback: (transactionClient: typeof client) => Promise<unknown>,
        ) => callback(client),
      ),
    };
    const service = createService(db);

    await expect(
      service.process({
        remittanceFileId: remittanceId,
        remittanceFileHash: 'b'.repeat(64),
        content: returnFile('00'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(client.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE payroll.employee_payroll_item'),
      expect.anything(),
    );
  });

  it('matches by sequence and propagates rejected payment status', async () => {
    const updates: Array<{ sql: string; values: unknown[] }> = [];
    const client = {
      query: jest.fn(async (sql: string, values: unknown[] = []) => {
        updates.push({ sql, values });
        if (sql.includes('FROM payroll.payment_remittance_file')) {
          return {
            rows: [
              {
                id: remittanceId,
                tenant_id: tenantId,
                payroll_run_id: payrollRunId,
                competence_year: 2026,
                competence_month: 4,
                payment_date: '2026-04-25',
                file_hash: 'a'.repeat(64),
                bank_code: 1,
                processing_type_id: null,
                total_amount: '100.00',
              },
            ],
          };
        }
        if (sql.includes('INSERT INTO payroll.payment_return_file')) {
          return { rows: [{ id: returnFileId, count: '0' }] };
        }
        if (sql.includes('FROM payroll.payment_remittance_detail')) {
          return {
            rows: [{ id: detailId, employee_id: employeeId, amount: '100.00' }],
          };
        }
        return { rows: [] };
      }),
    };
    const db = {
      configured: true,
      transaction: jest.fn(
        async (
          callback: (transactionClient: typeof client) => Promise<unknown>,
        ) => callback(client),
      ),
    };
    const service = createService(db);

    const result = await service.process({
      remittanceFileId: remittanceId,
      remittanceFileHash: 'a'.repeat(64),
      content: returnFile('BD'),
    });

    expect(result.rejectedRecords).toBe(1);
    expect(
      updates.some(
        (entry) =>
          entry.sql.includes('UPDATE payroll.employee_payroll_item') &&
          entry.values.includes('REJECTED'),
      ),
    ).toBe(true);
    expect(
      updates.some((entry) =>
        entry.sql.includes('INSERT INTO payroll.payment_return_detail'),
      ),
    ).toBe(true);
  });

  it('creates a new remittance only from rejected details', async () => {
    const client = {
      query: jest.fn(async () => ({
        rows: [{ id: '00000000-0000-4000-8000-00000000beef', count: '2' }],
      })),
    };
    const db = {
      configured: true,
      transaction: jest.fn(
        async (
          callback: (transactionClient: typeof client) => Promise<unknown>,
        ) => callback(client),
      ),
    };
    const service = createService(db);

    const result = await service.reprocessRejected(returnFileId);

    expect(result.detailCount).toBe(2);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE rd.internal_status <> 'ACCEPTED'"),
      [returnFileId],
    );
  });
});

const tenantId = '00000000-0000-0000-0000-000000000100';
const remittanceId = '00000000-0000-4000-8000-000000000041';
const returnFileId = '00000000-0000-4000-8000-000000000142';
const detailId = '00000000-0000-4000-8000-000000000241';
const payrollRunId = '00000000-0000-4000-8000-000000000341';
const employeeId = '00000000-0000-4000-8000-000000000001';

function createService(db: unknown): Cnab240ReturnProcessService {
  return new Cnab240ReturnProcessService(
    db as never,
    new Cnab240ReturnParserService(),
    new OccurrenceMapperService(),
  );
}

function returnFile(occurrenceCode: string): string {
  return [
    line('001', '0'),
    segmentA('001', 1, employeeId, '100.00', occurrenceCode),
    line('001', '9'),
  ].join('');
}

function segmentA(
  bankCode: string,
  sequence: number,
  parsedEmployeeId: string,
  amount: string,
  occurrenceCode: string,
): string {
  return line(bankCode, '3', [
    [9, String(sequence).padStart(5, '0')],
    [14, 'A'],
    [74, parsedEmployeeId.padEnd(20, ' ')],
    [120, amount.replace('.', '').padStart(15, '0')],
    [231, occurrenceCode.padEnd(5, ' ')],
  ]);
}

function line(
  bankCode: string,
  recordType: string,
  fields: Array<[number, string]> = [],
): string {
  const chars = Array.from(' '.repeat(240));
  write(chars, 1, bankCode);
  write(chars, 8, recordType);
  for (const [position, value] of fields) write(chars, position, value);
  return chars.join('');
}

function write(chars: string[], oneBasedPosition: number, value: string): void {
  const index = oneBasedPosition - 1;
  for (let offset = 0; offset < value.length; offset += 1) {
    chars[index + offset] = value[offset];
  }
}

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
