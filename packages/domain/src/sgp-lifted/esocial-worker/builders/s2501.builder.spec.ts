import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { S2501Builder, S2501BuildInput } from './s2501.builder';
import { XsdValidatorService } from '../xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000000100';

describe('S2501Builder', () => {
  const validator = new XsdValidatorService();

  it('builds golden S-2501 XML for labour-court tax facts', () => {
    const record = new S2501Builder().build(fixtureInput());

    expect(Buffer.from(`${record.xml}\n`, 'utf8')).toEqual(
      readFileSync(join(__dirname, '__fixtures__', 's2501.golden.xml')),
    );
    expect(() =>
      validator.assertValid('S-2501', record.xml, { allowUnsigned: true }),
    ).not.toThrow();
    expect(record.payload).toMatchObject({
      processNumber: '000000000000001',
      paymentPeriod: '2026-01',
      workerCount: 2,
      contributionTotal: '770.00',
      irrfTotal: '362.50',
    });
  });

  it('rejects workers without tax facts', () => {
    expect(() =>
      new S2501Builder().build({
        ...fixtureInput(),
        workers: [{ cpf: '11122233344' }],
      }),
    ).toThrow('calcTrib or infoCRIRRF');
  });
});

function fixtureInput(): S2501BuildInput {
  return {
    tenantId,
    employerRegistration: '12345678000199',
    processNumber: '000000000000001',
    paymentPeriod: '2026-01',
    sequenceNumber: 1,
    observation: 'Acordo homologado com recolhimento previdenciario e IRRF.',
    workers: [
      {
        cpf: '11122233344',
        calcTrib: [
          {
            referencePeriod: '2025-12',
            monthlyBase: '5000.00',
            thirteenthBase: '1000.00',
            contributions: [
              { revenueCode: '113851', amount: '550.00' },
              { revenueCode: '164621', amount: '110.00' },
            ],
          },
        ],
        irrf: [{ revenueCode: '593656', amount: '250.00' }],
      },
      {
        cpf: '22233344405',
        calcTrib: [
          {
            referencePeriod: '2026-01',
            monthlyBase: '1000.00',
            thirteenthBase: '0.00',
            contributions: [{ revenueCode: '113851', amount: '110.00' }],
          },
        ],
        irrf: [
          {
            revenueCode: '056152',
            amount: '75.00',
            thirteenthAmount: '37.50',
          },
        ],
      },
    ],
  };
}
