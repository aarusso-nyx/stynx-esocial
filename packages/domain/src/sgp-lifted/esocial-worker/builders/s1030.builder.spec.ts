import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { S1030Builder } from './s1030.builder';

const tenantId = '00000000-0000-0000-0000-000000000100';
const competence = '2026-01';

describe('S1030Builder', () => {
  it('builds a public job-position table event matching the golden XML', async () => {
    const builder = new S1030Builder(
      database([
        {
          id: '00000000-0000-4000-8000-000000000030',
          code: 'ANL',
          name: 'Analista Administrativo',
          creation_law: 'Lei 1/2026',
          legal_regime: 'estatutario',
          cbo_code: '252105',
          cnpj: '12345678000199',
        },
      ]) as never,
    );

    const [record] = await builder.build(tenantId, competence);
    const golden = readFileSync(
      join(__dirname, '__fixtures__', 's1030.golden.xml'),
      'utf8',
    ).trim();

    expect(record).toMatchObject({
      id: '00000000-0000-4000-8000-000000000030',
      sourceEntityKind: 'hr.job_position',
      reference: 'ID4671535046235302951345051415472563',
      competence,
      payload: {
        code: 'ANL',
        cboCode: '252105',
        legalRegime: 'estatutario',
      },
    });
    expect(record.xml).toBe(golden);
  });
});

function database(rows: unknown[]) {
  return {
    query: jest.fn(async () => rows),
  };
}
