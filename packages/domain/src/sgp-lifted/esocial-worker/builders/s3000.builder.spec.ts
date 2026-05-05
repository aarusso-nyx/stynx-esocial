import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { S3000Builder } from './s3000.builder';
import { XsdValidatorService } from '../xsd/xsd-validator.service';

describe('S3000Builder', () => {
  it('builds XSD-valid evtExclusao referencing the original receipt', async () => {
    const database = {
      query: jest.fn().mockResolvedValue([
        {
          request_id: '00000000-0000-4000-8000-000000003600',
          tenant_id: '00000000-0000-0000-0000-000000003600',
          target_event_id: '00000000-0000-4000-8000-000000003601',
          target_recibo: '1.1.0000000000000000000',
          target_event_kind: 'S-2200',
          justification:
            'Justificativa operacional completa para retratacao do evento aceito.',
          target_competence: '2026-05',
          source_entity_kind: 'employee',
          source_entity_id: '00000000-0000-4000-8000-000000003602',
          cnpj: '12.345.678/0001-99',
          cpf: '111.222.333-44',
        },
      ]),
    };
    const builder = new S3000Builder(database as never);
    const record = await builder.buildRequest(
      '00000000-0000-0000-0000-000000003600',
      '00000000-0000-4000-8000-000000003600',
    );

    expect(record.xml).toBe(golden('s3000.golden.xml'));
    expect(() =>
      new XsdValidatorService().assertValid('S-3000', record.xml, {
        allowUnsigned: true,
      }),
    ).not.toThrow();
  });
});

function golden(name: string): string {
  return readFileSync(join(__dirname, '__fixtures__', name), 'utf8').trim();
}
