import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { S1000Builder } from './s1000.builder';
import { S1005Builder } from './s1005.builder';
import { S1010Builder } from './s1010.builder';
import { S1020Builder } from './s1020.builder';
import { S1050Builder } from './s1050.builder';
import { S1070Builder } from './s1070.builder';
import { XsdValidatorService } from '../xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000000100';
const competence = '2026-01';

describe('S-1xxx builders', () => {
  const validator = new XsdValidatorService();

  it.each([
    [
      'S-1000',
      's1000.golden.xml',
      new S1000Builder(
        database([
          [
            {
              id: '00000000-0000-4000-8000-000000000001',
              cnpj: '12345678000199',
            },
          ],
        ]) as never,
      ),
    ],
    [
      'S-1005',
      's1005.golden.xml',
      new S1005Builder(
        database([
          [
            {
              id: '00000000-0000-4000-8000-000000000005',
              cnpj: '12345678000199',
              company_cnpj: '12345678000199',
            },
          ],
        ]) as never,
      ),
    ],
    [
      'S-1010',
      's1010.golden.xml',
      new S1010Builder(
        database([
          [
            {
              id: '00000000-0000-4000-8000-000000000010',
              code: 'BASE',
              description: 'Rubrica base',
              kind: 'EARNING',
              esocial_code: '1000',
              cnpj: '12345678000199',
            },
          ],
        ]) as never,
      ),
    ],
    [
      'S-1020',
      's1020.golden.xml',
      new S1020Builder(
        database([
          [
            {
              id: '00000000-0000-4000-8000-000000000020',
              code: 'LOT01',
              cnpj: '12345678000199',
              fpas_code: '582',
            },
          ],
        ]) as never,
      ),
    ],
    [
      'S-1050',
      's1050.golden.xml',
      new S1050Builder(
        database([
          [
            {
              id: '00000000-0000-4000-8000-000000000050',
              code: 'JORN01',
              description: 'Jornada padrao',
              daily_hours: '8.00',
              cnpj: '12345678000199',
            },
          ],
        ]) as never,
      ),
    ],
    [
      'S-1070',
      's1070.golden.xml',
      new S1070Builder(
        database([
          [
            {
              id: '00000000-0000-4000-8000-000000000070',
              process_number: '12345678901234567',
              subject: 'Processo administrativo',
              cnpj: '12345678000199',
            },
          ],
        ]) as never,
      ),
    ],
  ])(
    '%s matches the committed golden XML and validates against XSD',
    async (eventKind, fixture, builder) => {
      const [record] = await builder.build(tenantId, competence);
      const golden = readFileSync(
        join(__dirname, '__fixtures__', fixture),
        'utf8',
      ).trim();

      expect(record.xml).toBe(golden);
      expect(() =>
        validator.assertValid(eventKind, record.xml, { allowUnsigned: true }),
      ).not.toThrow();
    },
  );
});

function database(results: unknown[][]) {
  let index = 0;
  return {
    query: jest.fn(async () => results[index++] ?? []),
  };
}
