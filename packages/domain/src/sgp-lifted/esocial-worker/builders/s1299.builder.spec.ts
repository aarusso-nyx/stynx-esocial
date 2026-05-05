import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { S1299Builder } from './s1299.builder';
import { XsdValidatorService } from '../xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000001299';

describe('S1299Builder', () => {
  const validator = new XsdValidatorService();

  it('blocks closure while S-1200/S-1210 receipts are pending', async () => {
    const builder = new S1299Builder(
      database([
        [
          {
            event_kind: 'S-1200',
            payroll_run_id: '00000000-0000-4000-8000-000000001200',
            payment_batch_id: null,
            employee_id: '00000000-0000-4000-8000-000000000001',
            reason: 'missing_s1200_receipt',
          },
        ],
      ]) as never,
    );

    await expect(builder.build(tenantId, '2026-01')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ESOCIAL_S1299_PERIODICS_PENDING',
      }),
    });
  });

  it('builds XSD-valid evtFechaEvPer when the pending view is empty', async () => {
    const builder = new S1299Builder(
      database([
        [],
        [{ cnpj: '12.345.678/0001-99' }],
        [{ remuneration_count: '2', payment_count: '2' }],
      ]) as never,
    );

    const record = await builder.build(tenantId, '2026-01');

    expect(record.xml).toBe(golden('s1299.golden.xml'));
    expect(() =>
      validator.assertValid('S-1299', record.xml, { allowUnsigned: true }),
    ).not.toThrow();
  });
});

function database(results: unknown[][]) {
  let index = 0;
  return {
    query: jest.fn(async () => results[index++] ?? []),
  };
}

function golden(file: string): string {
  return readFileSync(join(__dirname, '__fixtures__', file), 'utf8').trim();
}
