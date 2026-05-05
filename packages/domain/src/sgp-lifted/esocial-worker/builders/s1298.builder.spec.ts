import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { S1298Builder } from './s1298.builder';
import { XsdValidatorService } from '../xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000001298';

describe('S1298Builder', () => {
  const validator = new XsdValidatorService();

  it('blocks reopening unless S-1299 is accepted with a receipt', async () => {
    const builder = new S1298Builder(
      database([
        [{ status: 'EMITTED', recibo: null, accepted_at: null }],
      ]) as never,
    );

    await expect(builder.build(tenantId, '2026-01')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ESOCIAL_S1298_CLOSURE_NOT_ACCEPTED',
      }),
    });
  });

  it('builds XSD-valid evtReabreEvPer after accepted S-1299 closure', async () => {
    const builder = new S1298Builder(
      database([
        [
          {
            status: 'ACCEPTED',
            recibo: '1.1.0000000000000001299',
            accepted_at: '2026-05-02T12:30:00.000Z',
          },
        ],
        [{ cnpj: '12.345.678/0001-99' }],
      ]) as never,
    );

    const record = await builder.build(tenantId, '2026-01');

    expect(record.xml).toBe(golden('s1298.golden.xml'));
    expect(record.payload).toMatchObject({
      reopenedFromS1299Receipt: '1.1.0000000000000001299',
    });
    expect(() =>
      validator.assertValid('S-1298', record.xml, { allowUnsigned: true }),
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
