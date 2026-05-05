import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { S1040Builder } from './s1040.builder';

const tenantId = '00000000-0000-0000-0000-000000000100';
const competence = '2026-01';

describe('S1040Builder', () => {
  it('builds a function table event matching the golden XML', async () => {
    const builder = new S1040Builder(
      database([
        {
          id: '00000000-0000-4000-8000-000000000040',
          code: 'FUNC01',
          name: 'Funcao comissionada',
          cnpj: '12345678000199',
        },
      ]) as never,
    );

    const [record] = await builder.build(tenantId, competence);
    const golden = readFileSync(
      join(__dirname, '__fixtures__', 's1040.golden.xml'),
      'utf8',
    ).trim();

    expect(record).toMatchObject({
      id: '00000000-0000-4000-8000-000000000040',
      sourceEntityKind: 'hr.job_function',
      reference: 'ID0325914454601838420334528994168810',
      competence,
      payload: { code: 'FUNC01' },
    });
    expect(record.xml).toBe(golden);
  });
});

function database(rows: unknown[]) {
  return {
    query: jest.fn(async () => rows),
  };
}
