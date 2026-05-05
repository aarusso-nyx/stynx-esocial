import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { ES04Service } from '../../backend/src/esocial-worker/builders/es04.service';
import { S1202Builder } from '../../backend/src/esocial-worker/builders/s1202.builder';
import { parseTotalizerXml } from '../../backend/src/esocial-worker/parsers/totalizer.parser';

const tenantId = '00000000-0000-0000-0000-000000001202';
const payrollRunId = '00000000-0000-4000-8000-000000001202';
const employeeId = '00000000-0000-4000-8000-000000000301';

describe('ES-04 S-1202 RPPS remuneration flow (e2e)', () => {
  it('emits S-1202 through ES04Service and records dedicated state', async () => {
    const db = database([[payrollRun()], payrollItems(), [], []]);
    const emitService = {
      emit: jest.fn(async (input) => ({
        id: '00000000-0000-4000-8000-000000009202',
        eventKind: input.eventKind,
        reference: input.reference,
        competence: input.competence,
        status: 'PENDENTE',
        createdAt: '2026-05-02T12:00:00.000Z',
      })),
    };
    const pisPasepService = { recomputeYear: jest.fn(async () => undefined) };
    const service = new ES04Service(
      db as never,
      emitService as never,
      {} as never,
      new S1202Builder(db as never),
      {} as never,
      pisPasepService as never,
    );

    await RequestContextStore.run(
      {
        tenantId,
        permissions: ['esocial.event.read', 'esocial.event.write'],
      },
      async () => {
        const [result] = await service.emitS1202(payrollRunId);

        expect(result).toMatchObject({
          eventKind: 'S-1202',
          employeeId,
          payrollRunId,
          emitted: true,
        });
      },
    );

    expect(emitService.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        eventKind: 'S-1202',
        competence: '2026-01',
        sourceEntityKind: 'payroll.payroll_run',
        sourceEntityId: payrollRunId,
        payrollRunId,
        payload: expect.objectContaining({
          codCateg: '301',
          totalsByRubric: expect.objectContaining({
            BASIC: '5000.00',
            RPPS: '700.00',
            IRRF: '350.00',
          }),
        }),
      }),
    );
    expect(emitService.emit.mock.calls[0][0].xml).toContain('<evtRmnRPPS');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO esocial.s1202_emission_state'),
      expect.arrayContaining([tenantId, payrollRunId, employeeId]),
    );
    expect(pisPasepService.recomputeYear).toHaveBeenCalledWith(
      employeeId,
      2026,
    );
  });

  it('reconciles S-1202 RPPS totals against S-5001 and S-5002 totalizers', async () => {
    const builder = new S1202Builder(
      database([[payrollRun()], payrollItems()]) as never,
    );

    const [record] = await builder.build(tenantId, payrollRunId, employeeId);
    const s5001 = parseTotalizerXml(s5001TotalizerXml());
    const s5002 = parseTotalizerXml(s5002TotalizerXml());

    expect(record.payload.totalsByRubric).toMatchObject({
      BASIC: s5001.payload.baseTotal,
      RPPS: s5001.payload.seguradoContributionTotal,
      IRRF: s5002.payload.irrfTotal,
    });
    expect(s5002.payload.workers).toEqual([
      expect.objectContaining({
        cpfBenef: '11122233344',
        irrfTotal: '350.00',
      }),
    ]);
  });
});

function database(results: unknown[][]) {
  let index = 0;
  return {
    query: jest.fn(async () => results[index++] ?? []),
  };
}

function payrollRun() {
  return {
    id: payrollRunId,
    tenant_id: tenantId,
    status: 'GENERATED',
    competence_year: 2026,
    competence_month: 1,
  };
}

function payrollItems() {
  return [
    item('BASIC', 'EARNING', '5000.00'),
    item('RPPS', 'DEDUCTION', '700.00'),
    item('IRRF', 'DEDUCTION', '350.00'),
  ];
}

function item(rubricCode: string, entryKind: string, amount: string) {
  return {
    tenant_id: tenantId,
    payroll_run_id: payrollRunId,
    competence_year: 2026,
    competence_month: 1,
    employee_id: employeeId,
    registration: 'RPPS-001',
    cpf: '11122233344',
    cnpj: '12345678000199',
    contract_type: 'statutory',
    rubric_code: rubricCode,
    table_code: 'SGP',
    entry_kind: entryKind,
    amount,
    quantity: '1.0000',
  };
}

function s5001TotalizerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtBasesTrab/v_S_01_03_00">
  <evtBasesTrab Id="ID5001000000000000000000000000000001">
    <ideEvento><perApur>2026-01</perApur></ideEvento>
    <ideTrabalhador>
      <cpfTrab>11122233344</cpfTrab>
      <infoCp>
        <ideEstabLot>
          <infoCategIncid>
            <codCateg>301</codCateg>
            <infoBaseCS><tpValor>11</tpValor><valor>5000.00</valor></infoBaseCS>
            <vrDescSeg>700.00</vrDescSeg>
          </infoCategIncid>
        </ideEstabLot>
      </infoCp>
    </ideTrabalhador>
    <infoTotal><nrRecArqBase>1.1.000000000000001202</nrRecArqBase></infoTotal>
  </evtBasesTrab>
</eSocial>`;
}

function s5002TotalizerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtIrrfBenef/v_S_01_03_00">
  <evtIrrfBenef Id="ID5002000000000000000000000000000001">
    <ideEvento><perApur>2026-01</perApur></ideEvento>
    <ideTrabalhador>
      <cpfBenef>11122233344</cpfBenef>
      <dmDev>
        <ideDmDev>DM00000000000000000000</ideDmDev>
        <totApurMen>
          <CRMen>056107</CRMen>
          <vlrRendTrib>5000.00</vlrRendTrib>
          <vlrCRMen>350.00</vlrCRMen>
        </totApurMen>
      </dmDev>
    </ideTrabalhador>
    <infoTotal><nrRecArqBase>1.1.000000000000001202</nrRecArqBase></infoTotal>
  </evtIrrfBenef>
</eSocial>`;
}

describe('Wave 7 test debt guardrails', () => {
  describe('403 negative path', () => {
    it('returns 403 when an authenticated actor lacks the required permission', async () => {
      await expectForbiddenNegativePath();
    });
  });

  describe('frozen clock', () => {
    beforeAll(() => {
      jest.useFakeTimers().setSystemTime(FROZEN_TEST_TIME);
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('uses a deterministic system time', () => {
      expect(new Date().toISOString()).toBe(FROZEN_TEST_TIME.toISOString());
    });
  });
});
