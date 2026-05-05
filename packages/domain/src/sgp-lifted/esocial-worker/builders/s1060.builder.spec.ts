import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { S1060Builder } from './s1060.builder';

const tenantId = '00000000-0000-0000-0000-000000000100';
const competence = '2026-01';

describe('S-1060 builder', () => {
  it('builds a golden ambiente XML from active work locations', async () => {
    const builder = new S1060Builder(
      database([
        [
          {
            id: '00000000-0000-4000-8000-000000001060',
            code: 'AMB01',
            name: 'Oficina de maquinas',
            description: 'Setor de manutencao com exposicao controlada',
            branch_cnpj: '12345678000199',
            company_cnpj: '12345678000199',
          },
        ],
      ]) as never,
    );

    const [record] = await builder.build(tenantId, competence);

    expect(record.xml).toBe(golden('s1060.golden.xml'));
    expect(record).toMatchObject({
      sourceEntityKind: 'hr.work_location',
      payload: {
        workEnvironmentCode: 'AMB01',
        workLocationId: '00000000-0000-4000-8000-000000001060',
      },
    });
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
