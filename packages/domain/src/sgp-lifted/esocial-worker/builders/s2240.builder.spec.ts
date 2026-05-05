import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { S2240Builder } from './s2240.builder';
import { XsdValidatorService } from '../xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000000100';

describe('S-2240 builder', () => {
  const validator = new XsdValidatorService();

  it.each([
    ['START', 's2240-noise-start.golden.xml', null],
    ['CHANGE', 's2240-noise-change.golden.xml', '92.000000'],
    ['END', 's2240-noise-end.golden.xml', '88.000000'],
  ] as const)(
    'builds XSD-valid %s XML',
    async (triggerEvent, goldenFile, intensity) => {
      const exposureId = `00000000-0000-4000-8000-00000000224${triggerEvent.length}`;
      const builder = new S2240Builder(
        database([
          [
            {
              tenant_id: tenantId,
              environmental_exposure_id: exposureId,
              trigger_event: triggerEvent,
            },
          ],
          [
            exposureRow(
              exposureId,
              intensity ?? '88.000000',
              triggerEvent === 'END',
            ),
          ],
          [{ ca_number: '12345' }],
        ]) as never,
      );

      const record = await builder.buildPending(
        tenantId,
        exposureId,
        triggerEvent,
      );
      expect(record.xml).toBe(golden(goldenFile));
      expect(record.payload).toMatchObject({ workEnvironmentCode: 'AMB01' });
      expect(() =>
        validator.assertValid('S-2240', record.xml, { allowUnsigned: true }),
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

function exposureRow(id: string, intensityValue: string, ended: boolean) {
  return {
    id,
    tenant_id: tenantId,
    employee_id: '00000000-0000-4000-8000-000000002200',
    registration: 'MAT-2240',
    cpf: '11122233344',
    employee_name: 'Servidor Risco',
    cnpj: '12345678000199',
    work_environment_code: 'AMB01',
    work_location_name: 'Oficina de maquinas',
    responsible_cpf: '22233344455',
    harmful_agent_code: '01.01.001',
    agent_kind: 'FISICO',
    intensity_value: intensityValue,
    intensity_unit: 'dB(A)',
    exposure_start: '2026-05-02',
    exposure_end: ended ? '2026-06-02' : null,
    mitigated_by_epi: true,
    mitigated_by_epc: false,
    special_retirement_eligible: true,
  };
}

function golden(file: string): string {
  return readFileSync(join(__dirname, '__fixtures__', file), 'utf8').trim();
}
