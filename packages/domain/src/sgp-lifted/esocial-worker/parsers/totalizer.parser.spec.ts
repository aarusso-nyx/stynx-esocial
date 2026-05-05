import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseTotalizerXml, TotalizerParser } from './totalizer.parser';

const tenantId = '00000000-0000-0000-0000-000000005000';

describe('TotalizerParser', () => {
  it.each([
    ['s5001-totalizer.golden.xml', 'S-5001'],
    ['s5002-totalizer.golden.xml', 'S-5002'],
    ['s5011-totalizer.golden.xml', 'S-5011'],
    ['s5012-totalizer.golden.xml', 'S-5012'],
    ['s5013-totalizer.golden.xml', 'S-5013'],
  ] as const)('parses %s as %s', (file, kind) => {
    const parsed = parseTotalizerXml(golden(file));

    expect(parsed.kind).toBe(kind);
    expect(parsed.competence).toBe('2026-01');
    expect(parsed.sourceEventRecibo).toBe('1.1.0000000000000001299');
  });

  it('extracts S-5002 IRRF totals for S-1210 reconciliation', () => {
    const parsed = parseTotalizerXml(golden('s5002-totalizer.golden.xml'));

    expect(parsed.payload).toMatchObject({
      kind: 'S-5002',
      eventElement: 'evtIrrfBenef',
      employer: {
        registrationType: '1',
        registrationNumber: '12345678000199',
      },
      irrfTotal: '4200.00',
      taxableIncomeTotal: '60000.00',
      officialPensionTotal: '7000.00',
      workers: [
        {
          cpfBenef: '11122233344',
          irrfTotal: '4200.00',
          demonstratives: [
            {
              perRef: '2026-01',
              ideDmDev: 'DM-2025-IRRF',
              paymentType: '5',
              paymentDate: '2026-01-31',
              categoryCode: '000',
              irrfTotal: '4200.00',
              incomeRows: [
                {
                  infoType: '11',
                  amount: '60000.00',
                },
                {
                  infoType: '41',
                  amount: '7000.00',
                },
                {
                  infoType: '79',
                  amount: '150.00',
                  incomeDescription: 'ISENCAO-OUTROS',
                },
              ],
              monthlyRows: [
                {
                  revenueCode: '056107',
                  taxableIncome: '60000.00',
                  officialPension: '7000.00',
                  irrf: '4200.00',
                  irrfMonthly: '4200.00',
                  otherExempt: '150.00',
                  incomeDescription: 'ISENCAO-OUTROS',
                },
              ],
              dailyRows: [
                {
                  day: '20',
                  revenueCode: '047301',
                  taxationForm: '10',
                  foreignResidenceCountry: '840',
                  paidAmount: '90.00',
                  irrf: '0.00',
                },
              ],
            },
          ],
        },
      ],
    });
    expect(parsed.payload.irrfTotal).toBe(
      sumS1210AnnualIrrf('s1210-irrf-annual.golden.json'),
    );
  });

  it('extracts S-5002 previous-month adjustment details', () => {
    const parsed = parseTotalizerXml(
      golden('s5002-totalizer-retro.golden.xml'),
    );

    expect(parsed).toMatchObject({
      kind: 'S-5002',
      competence: '2026-02',
      sourceEventRecibo: '1.1.0000000000000001210',
    });
    expect(parsed.payload).toMatchObject({
      irrfTotal: '125.00',
      retroactiveAdjustments: [
        {
          perRefAjuste: '2026-01',
          nrRec1210Orig: '1.1.0000000000000001100',
        },
      ],
      workers: [
        {
          cpfBenef: '11122233344',
          demonstratives: [
            {
              perRef: '2026-01',
              ideDmDev: 'DM-RETRO-IRRF',
              paymentType: '1',
              paymentDate: '2026-02-05',
              categoryCode: '101',
              monthlyRows: [
                {
                  revenueCode: '056107',
                  taxableIncome: '3000.00',
                  officialPension: '330.00',
                  irrf: '125.00',
                },
              ],
            },
          ],
          complementaryInfo: [
            {
              medicalReportDate: '2026-01-10',
              previousPeriodAdjustment: {
                perRefAjuste: '2026-01',
                nrRec1210Orig: '1.1.0000000000000001100',
              },
              dependents: [
                {
                  cpfDep: '22233344455',
                  depIrrf: 'S',
                  birthDate: '2015-04-03',
                  name: 'DEPENDENTE RETRO',
                },
              ],
              revenueDetails: [
                {
                  revenueType: '056107',
                  dependentDeductions: [
                    {
                      incomeType: '11',
                      cpfDep: '22233344455',
                      amount: '189.59',
                    },
                  ],
                  alimony: [
                    {
                      incomeType: '11',
                      cpfDep: '33344455566',
                      amount: '250.00',
                    },
                  ],
                  complementaryPension: [
                    {
                      pensionType: '1',
                      entityCnpj: '11222333000181',
                      monthlyDeduction: '300.00',
                    },
                  ],
                  retentionProcesses: [
                    {
                      processType: '1',
                      processNumber: '12345678901234567',
                      suspensionCode: '9001',
                      values: [
                        {
                          assessmentType: '1',
                          notWithheldAmount: '10.00',
                          judicialDeposit: '20.00',
                          currentYearCompensation: '30.00',
                          previousYearCompensation: '40.00',
                          suspendedIncome: '500.00',
                          suspendedDeductions: [
                            {
                              deductionType: '5',
                              amount: '20.00',
                              beneficiaries: [
                                {
                                  cpfDep: '33344455566',
                                  amount: '15.00',
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
              healthPlans: [
                {
                  operatorCnpj: '55666777000155',
                  ansRegistry: '123456',
                  holderAmount: '88.00',
                  dependents: [
                    {
                      cpfDep: '22233344455',
                      amount: '44.00',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it.each([
    [
      's5002-totalizer.golden.xml',
      [
        'ID5002000000000000000000000000000001',
        '1.1.0000000000000001299',
        '2026-01',
        '1',
        '12345678000199',
        '11122233344',
        'DM-2025-IRRF',
        '5',
        '2026-01-31',
        '000',
        '11',
        '60000.00',
        '41',
        '7000.00',
        '79',
        '150.00',
        'ISENCAO-OUTROS',
        '056107',
        '4200.00',
        '20',
        '047301',
        '10',
        '840',
        '90.00',
        '0.00',
      ],
    ],
    [
      's5002-totalizer-retro.golden.xml',
      [
        'ID5002000000000000000000000000000002',
        '1.1.0000000000000001210',
        '2026-02',
        '1',
        '12345678000199',
        '11122233344',
        '2026-01',
        'DM-RETRO-IRRF',
        '2026-02-05',
        '101',
        '056107',
        '3000.00',
        '330.00',
        '125.00',
        '2026-01-10',
        '1.1.0000000000000001100',
        '22233344455',
        'S',
        '2015-04-03',
        'DEPENDENTE RETRO',
        '03',
        'Filho',
        '11',
        '189.59',
        '33344455566',
        '250.00',
        '11222333000181',
        '300.00',
        '40.00',
        '12345678901234567',
        '9001',
        '10.00',
        '20.00',
        '30.00',
        '500.00',
        '15.00',
        '55666777000155',
        '123456',
        '88.00',
        '44.00',
        '0.00',
      ],
    ],
  ] as const)(
    'keeps all S-5002 sample scalar fields in the mapped payload for %s',
    (file, expectedScalars) => {
      const xml = golden(file);
      const parsed = parseTotalizerXml(xml);
      const payloadValues = scalarPayloadValues(parsed.payload, ['rawXml']);

      expect(parsed.payload.rawXml).toBe(xml);
      for (const value of expectedScalars) {
        expect(payloadValues).toContain(value);
      }
    },
  );

  it('extracts S-5012 consolidated IRRF totals reconciled with S-5002', () => {
    const s5002 = parseTotalizerXml(golden('s5002-totalizer.golden.xml'));
    const s5012Xml = golden('s5012-totalizer.golden.xml');
    const s5012 = parseTotalizerXml(s5012Xml);

    expect(s5012.payload).toMatchObject({
      kind: 'S-5012',
      eventElement: 'evtIrrf',
      employer: {
        registrationType: '1',
        registrationNumber: '12345678000199',
      },
      sourceEventRecibo: '1.1.0000000000000001299',
      informationIndicator: '1',
      irrfTotal: '4200.00',
      monthlyIrrfTotal: '4200.00',
      dailyIrrfTotal: '0.00',
      monthlyRows: [
        {
          revenueCode: '056107',
          irrf: '4200.00',
        },
      ],
      items: [
        {
          debitCode: '056107',
          baseAmount: '0.00',
          amount: '4200.00',
          period: 'MONTHLY',
          day: null,
        },
      ],
    });
    expect(s5012.payload.rawXml).toBe(s5012Xml);
    expect(s5012.payload.irrfTotal).toBe(s5002.payload.irrfTotal);
  });

  it('rejects malformed, unsupported, and incomplete totalizer XML', () => {
    expect(() => parseTotalizerXml('<eSocial><evtIrrf>')).toThrow(
      /Invalid eSocial totalizer XML/,
    );
    expect(() =>
      parseTotalizerXml(
        [
          '<eSocial>',
          '  <evtNaoTotalizador>',
          '    <perApur>2026-01</perApur>',
          '    <nrRecibo>1.1.unsupported</nrRecibo>',
          '  </evtNaoTotalizador>',
          '</eSocial>',
        ].join(''),
      ),
    ).toThrow(/Unsupported eSocial totalizer kind/);
    expect(() =>
      parseTotalizerXml(
        [
          '<eSocial>',
          '  <evtIrrf>',
          '    <nrRecibo>1.1.no-competence</nrRecibo>',
          '  </evtIrrf>',
          '</eSocial>',
        ].join(''),
      ),
    ).toThrow(/missing perApur/);
    expect(() =>
      parseTotalizerXml(
        [
          '<eSocial>',
          '  <evtIrrf>',
          '    <perApur>2026-01</perApur>',
          '  </evtIrrf>',
          '</eSocial>',
        ].join(''),
      ),
    ).toThrow(/missing source event receipt/);
  });

  it('handles S-5012 optional groups and default debit codes', () => {
    const noInfo = parseTotalizerXml(
      [
        '<eSocial>',
        '  <evtIrrf>',
        '    <ideEvento><perApur>2026-01</perApur></ideEvento>',
        '    <nrRecibo>1.1.no-info</nrRecibo>',
        '  </evtIrrf>',
        '</eSocial>',
      ].join(''),
    );

    expect(noInfo.payload).toMatchObject({
      kind: 'S-5012',
      employer: {
        registrationType: null,
        registrationNumber: null,
      },
      sourceEventRecibo: null,
      informationIndicator: null,
      monthlyRows: [],
      dailyRows: [],
      items: [],
      irrfTotal: '0.00',
    });

    const missingRevenue = parseTotalizerXml(
      [
        '<eSocial>',
        '  <evtIrrf>',
        '    <ideEvento><perApur>2026-01</perApur></ideEvento>',
        '    <nrRecibo>1.1.default-debit</nrRecibo>',
        '    <infoIRRF>',
        '      <infoCRMen><vrCRMen>12,34</vrCRMen></infoCRMen>',
        '    </infoIRRF>',
        '  </evtIrrf>',
        '</eSocial>',
      ].join(''),
    );

    expect(missingRevenue.payload.items).toEqual([
      {
        debitCode: 'IRRF',
        baseAmount: '0.00',
        amount: '12.34',
        period: 'MONTHLY',
        day: null,
      },
    ]);
  });

  it('persists totalizers with the source S-1299 receipt', async () => {
    const database = {
      transaction: jest.fn(async (callback: (client: unknown) => unknown) =>
        callback({
          query: jest
            .fn()
            .mockResolvedValueOnce({
              rows: [
                {
                  tenant_id: tenantId,
                  competence: new Date('2026-01-01T00:00:00.000Z'),
                  kind: 'S-5011',
                  source_event_recibo: '1.1.0000000000000001299',
                  payload: '{"stored":true}',
                  received_at: new Date('2026-05-02T12:00:00.000Z'),
                },
              ],
            })
            .mockResolvedValueOnce({ rows: [] }),
        }),
      ),
    };
    const parser = new TotalizerParser(database as never);

    const result = await parser.ingest(
      tenantId,
      golden('s5011-totalizer.golden.xml'),
      new Date('2026-05-02T12:00:00.000Z'),
    );

    expect(result.kind).toBe('S-5011');
    expect(result.competence).toBe('2026-01');
    expect(result.payload).toEqual({ stored: true });
    expect(result.sourceEventRecibo).toBe('1.1.0000000000000001299');
  });
});

function golden(file: string): string {
  return readFileSync(join(__dirname, '__fixtures__', file), 'utf8').trim();
}

function sumS1210AnnualIrrf(file: string): string {
  const fixture = JSON.parse(
    readFileSync(
      join(
        __dirname,
        '..',
        '..',
        'report-service',
        'yearly-income',
        '__fixtures__',
        file,
      ),
      'utf8',
    ),
  ) as { competences: Array<{ irrfTotal: string }> };
  const cents = fixture.competences.reduce(
    (sum, competence) => sum + moneyToCents(competence.irrfTotal),
    0n,
  );
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

function moneyToCents(value: string): bigint {
  const [reais, cents = ''] = value.split('.');
  return BigInt(reais) * 100n + BigInt(cents.padEnd(2, '0').slice(0, 2));
}

function scalarPayloadValues(
  value: unknown,
  omittedKeys: string[] = [],
): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value))
    return value.flatMap((item) => scalarPayloadValues(item));
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, nestedValue]) =>
        omittedKeys.includes(key) ? [] : scalarPayloadValues(nestedValue),
    );
  }
  return [String(value)];
}
