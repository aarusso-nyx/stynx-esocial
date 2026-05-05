import { parseTotalizerXml } from '../../backend/src/esocial-worker/parsers/totalizer.parser';

interface MonthlyRow {
  revenueCode: string | null;
  irrf: string;
}

interface S5002Demonstrative {
  monthlyRows: MonthlyRow[];
}

interface S5002Worker {
  demonstratives: S5002Demonstrative[];
}

interface S5002Payload {
  workers: S5002Worker[];
  irrfTotal: string;
}

interface S5012Payload {
  monthlyRows: MonthlyRow[];
  monthlyIrrfTotal: string;
  irrfTotal: string;
}

describe('eSocial totalizer reconciliation (e2e)', () => {
  it('reconciles S-5012 monthly IRRF aggregates with S-5002 worker rows by revenue code', () => {
    const s5002 = parseTotalizerXml(s5002TwoWorkerXml());
    const s5012 = parseTotalizerXml(s5012MonthlyXml());
    const s5002Payload = s5002.payload as unknown as S5002Payload;
    const s5012Payload = s5012.payload as unknown as S5012Payload;

    expect(s5002.kind).toBe('S-5002');
    expect(s5012.kind).toBe('S-5012');
    expect(s5012Payload.monthlyRows).toEqual([
      {
        revenueCode: '056107',
        irrf: '4200.00',
      },
    ]);

    for (const monthlyRow of s5012Payload.monthlyRows) {
      expect(monthlyRow.irrf).toBe(
        sumS5002MonthlyRowsByRevenueCode(s5002Payload, monthlyRow.revenueCode),
      );
    }
    expect(s5012Payload.monthlyIrrfTotal).toBe(
      sumS5002MonthlyRows(s5002Payload),
    );
    expect(s5012Payload.irrfTotal).toBe(s5002Payload.irrfTotal);
  });
});

function sumS5002MonthlyRowsByRevenueCode(
  payload: S5002Payload,
  revenueCode: string | null,
): string {
  const cents = allS5002MonthlyRows(payload)
    .filter((row) => row.revenueCode === revenueCode)
    .reduce((sum, row) => sum + moneyToCents(row.irrf), 0n);
  return centsToMoney(cents);
}

function sumS5002MonthlyRows(payload: S5002Payload): string {
  const cents = allS5002MonthlyRows(payload).reduce(
    (sum, row) => sum + moneyToCents(row.irrf),
    0n,
  );
  return centsToMoney(cents);
}

function allS5002MonthlyRows(payload: S5002Payload): MonthlyRow[] {
  return payload.workers.flatMap((worker) =>
    worker.demonstratives.flatMap((demonstrative) => demonstrative.monthlyRows),
  );
}

function moneyToCents(value: string): bigint {
  const [reais, cents = ''] = value.split('.');
  return BigInt(reais) * 100n + BigInt(cents.padEnd(2, '0').slice(0, 2));
}

function centsToMoney(value: bigint): string {
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
}

function s5002TwoWorkerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtIrrfBenef/v_S_01_03_00">
  <evtIrrfBenef Id="ID5002000000000000000000000000000013">
    <ideEvento>
      <nrRecArqBase>1.1.0000000000000001299</nrRecArqBase>
      <perApur>2026-01</perApur>
    </ideEvento>
    <ideEmpregador>
      <tpInsc>1</tpInsc>
      <nrInsc>12345678000199</nrInsc>
    </ideEmpregador>
    <ideTrabalhador>
      <cpfBenef>11122233344</cpfBenef>
      <dmDev>
        <perRef>2026-01</perRef>
        <ideDmDev>DM-IRRF-001</ideDmDev>
        <tpPgto>5</tpPgto>
        <dtPgto>2026-01-31</dtPgto>
        <codCateg>000</codCateg>
        <totApurMen>
          <CRMen>056107</CRMen>
          <vlrRendTrib>20000.00</vlrRendTrib>
          <vlrRendTrib13>0.00</vlrRendTrib13>
          <vlrPrevOficial>2200.00</vlrPrevOficial>
          <vlrPrevOficial13>0.00</vlrPrevOficial13>
          <vlrCRMen>1200.10</vlrCRMen>
          <vlrCR13Men>0.00</vlrCR13Men>
        </totApurMen>
      </dmDev>
    </ideTrabalhador>
    <ideTrabalhador>
      <cpfBenef>55566677788</cpfBenef>
      <dmDev>
        <perRef>2026-01</perRef>
        <ideDmDev>DM-IRRF-002</ideDmDev>
        <tpPgto>5</tpPgto>
        <dtPgto>2026-01-31</dtPgto>
        <codCateg>000</codCateg>
        <totApurMen>
          <CRMen>056107</CRMen>
          <vlrRendTrib>40000.00</vlrRendTrib>
          <vlrRendTrib13>0.00</vlrRendTrib13>
          <vlrPrevOficial>4800.00</vlrPrevOficial>
          <vlrPrevOficial13>0.00</vlrPrevOficial13>
          <vlrCRMen>2999.90</vlrCRMen>
          <vlrCR13Men>0.00</vlrCR13Men>
        </totApurMen>
      </dmDev>
    </ideTrabalhador>
  </evtIrrfBenef>
</eSocial>`;
}

function s5012MonthlyXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtIrrf/v_S_01_03_00">
  <evtIrrf Id="ID5012000000000000000000000000000013">
    <ideEvento>
      <perApur>2026-01</perApur>
    </ideEvento>
    <ideEmpregador>
      <tpInsc>1</tpInsc>
      <nrInsc>12345678000199</nrInsc>
    </ideEmpregador>
    <infoIRRF>
      <nrRecArqBase>1.1.0000000000000001299</nrRecArqBase>
      <indExistInfo>1</indExistInfo>
      <infoCRMen>
        <CRMen>056107</CRMen>
        <vrCRMen>4200.00</vrCRMen>
      </infoCRMen>
    </infoIRRF>
  </evtIrrf>
</eSocial>`;
}
