import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { S1210Builder } from './s1210.builder';
import { XsdValidatorService } from '../xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000000100';
const paymentBatchId = '00000000-0000-4000-8000-000000001210';
const payrollRunId = '00000000-0000-4000-8000-000000001200';

describe('S1210Builder', () => {
  const validator = new XsdValidatorService();

  it('builds golden S-1210 XML for fully confirmed payments', async () => {
    const builder = new S1210Builder(
      database([[remittance('3000.00')], paymentDetails()]) as never,
    );

    const records = await builder.build(tenantId, paymentBatchId);

    expect(records).toHaveLength(2);
    expect(normalize(records.map((record) => record.xml).join('\n---\n'))).toBe(
      normalize(golden('s1210-confirmed-payments.golden.xml')),
    );
    for (const record of records) {
      expect(() =>
        validator.assertValid('S-1210', record.xml, { allowUnsigned: true }),
      ).not.toThrow();
    }
  });

  it('emits only confirmed payment details for a partial bank return', async () => {
    const builder = new S1210Builder(
      database([
        [remittance('1000.00')],
        [
          paymentDetail(
            '00000000-0000-4000-8000-000000000001',
            '11122233344',
            '1000.00',
          ),
        ],
      ]) as never,
    );

    const records = await builder.build(tenantId, paymentBatchId);

    expect(records).toHaveLength(1);
    expect(records[0].vrLiq).toBe('1000.00');
  });

  it('blocks S-1210 until BANK-01 confirmation marks the remittance as paid', async () => {
    const builder = new S1210Builder(
      database([[{ ...remittance('3000.00'), status: 'GENERATED' }]]) as never,
    );

    await expect(builder.build(tenantId, paymentBatchId)).rejects.toThrow(
      'status=PAID',
    );
  });
});

function database(results: unknown[][]) {
  let index = 0;
  return {
    query: jest.fn(async () => results[index++] ?? []),
  };
}

function remittance(confirmedTotal: string) {
  return {
    id: paymentBatchId,
    tenant_id: tenantId,
    payroll_run_id: payrollRunId,
    status: 'PAID',
    competence_year: 2026,
    competence_month: 1,
    payment_date: '2026-01-25',
    total_amount: confirmedTotal,
    confirmed_total: confirmedTotal,
  };
}

function paymentDetails() {
  return [
    paymentDetail(
      '00000000-0000-4000-8000-000000000001',
      '11122233344',
      '1000.00',
    ),
    paymentDetail(
      '00000000-0000-4000-8000-000000000002',
      '22233344405',
      '2000.00',
    ),
  ];
}

function paymentDetail(employeeId: string, workerCpf: string, amount: string) {
  return {
    tenant_id: tenantId,
    payment_batch_id: paymentBatchId,
    payroll_run_id: payrollRunId,
    competence_year: 2026,
    competence_month: 1,
    payment_date: '2026-01-25',
    employee_id: employeeId,
    cpf: workerCpf,
    cnpj: '12345678000199',
    amount,
  };
}

function golden(file: string): string {
  return readFileSync(join(__dirname, '__fixtures__', file), 'utf8').trim();
}

function normalize(value: string): string {
  return value.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();
}
