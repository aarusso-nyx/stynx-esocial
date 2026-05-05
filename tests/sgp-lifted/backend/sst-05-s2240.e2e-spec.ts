import { BadRequestException } from '@nestjs/common';

import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { ES03Service } from '../../backend/src/esocial-worker/builders/es03.service';
import { S2240Builder } from '../../backend/src/esocial-worker/builders/s2240.builder';
import { XsdValidatorService } from '../../backend/src/esocial-worker/xsd/xsd-validator.service';
import { EpiSignatureMethod } from '../../backend/src/saude/epi/epi.dto';
import { EpiDeliveryService } from '../../backend/src/saude/epi/epi-delivery.service';
import { EnvironmentalExposureService } from '../../backend/src/saude/exposure/environmental-exposure.service';
import { PppService } from '../../backend/src/saude/ppp/ppp.service';

const tenantId = '00000000-0000-0000-0000-000000000100';
const exposureId = '00000000-0000-4000-8000-000000002240';

describe('SST-05 S-2240, EPI, PPP, and CALC-07 flow (e2e)', () => {
  const validator = new XsdValidatorService();

  it('emits noise exposure S-2240 and clears the pending queue on XSD OK', async () => {
    const database = databaseStub([
      [
        {
          tenant_id: tenantId,
          environmental_exposure_id: exposureId,
          trigger_event: 'START',
        },
      ],
      [exposureRow()],
      [{ ca_number: '12345' }],
      [],
    ]);
    const emitService = {
      emit: jest.fn(async (input: { xml: string }) => {
        validator.assertValid('S-2240', input.xml, { allowUnsigned: true });
        return {
          id: '00000000-0000-4000-8000-000000009240',
          eventKind: 'S-2240',
          reference: 'S2240-OK',
          competence: '2026-05',
          status: 'PENDENTE',
          createdAt: '2026-05-02T00:00:00.000Z',
        };
      }),
    };
    const service = new ES03Service(
      database as never,
      emitService as never,
      {} as never,
      {} as never,
      {} as never,
      new S2240Builder(database as never),
      {} as never,
    );

    const result = await withTenant(() =>
      service.emitS2240(exposureId, 'START'),
    );

    expect(result.emitted).toBe(true);
    expect(emitService.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKind: 'S-2240',
        sourceEntityKind: 'saude.environmental_exposure',
        sourceEntityId: exposureId,
      }),
    );
    expect(database.sql()).toContain('DELETE FROM esocial.s2240_pending');
  });

  it('rejects exposure when the PGR is not active at exposure_start', async () => {
    const database = {
      configured: true,
      query: jest.fn(async () => {
        throw new Error(
          'environmental_exposure requires an ACTIVE PGR covering exposure_start',
        );
      }),
    };
    const service = new EnvironmentalExposureService(database as never);

    await expect(
      service.create({
        employeeId: '00000000-0000-4000-8000-000000002200',
        riskManagementProgramId: '00000000-0000-4000-8000-000000002050',
        harmfulAgentCode: '01.01.001',
        agentKind: 'FISICO',
        intensityValue: 88,
        intensityUnit: 'dB(A)',
        exposureStart: '2026-05-02',
      }),
    ).rejects.toThrow('ACTIVE PGR');
  });

  it('rejects unsigned EPI delivery and accepts GovBR evidence', async () => {
    const service = new EpiDeliveryService(
      databaseStub([[epiDeliveryRow()]]) as never,
    );

    await expect(
      service.register({
        employeeId: 'employee-1',
        epiInventoryId: 'epi-1',
        deliveredAt: '2026-05-02T00:00:00.000Z',
        quantity: 1,
        signatureMethod: EpiSignatureMethod.GOVBR,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const accepted = await service.register({
      employeeId: 'employee-1',
      epiInventoryId: 'epi-1',
      deliveredAt: '2026-05-02T00:00:00.000Z',
      quantity: 1,
      signatureMethod: EpiSignatureMethod.GOVBR,
      signatureEvidenceUri: 'govbr://evidences/123',
    });
    expect(accepted.signatureEvidenceUri).toBe('govbr://evidences/123');
  });

  it('generates immutable PPP snapshot with exposures and EPIs', async () => {
    const service = new PppService(
      databaseStub([
        [
          {
            id: 'ppp-1',
            employee_id: 'employee-1',
            period_start: '2026-01-01',
            period_end: '2026-12-31',
            snapshot_json: {
              environmentalExposures: [{ harmfulAgentCode: '01.01.001' }],
              epiDeliveries: [{ caNumber: '12345' }],
            },
            generated_at: '2026-05-02T00:00:00.000Z',
          },
        ],
      ]) as never,
    );

    const record = await service.generate({
      employeeId: 'employee-1',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
    });

    expect(record.snapshotJson).toMatchObject({
      environmentalExposures: [{ harmfulAgentCode: '01.01.001' }],
      epiDeliveries: [{ caNumber: '12345' }],
    });
  });

  it('exposes environmental exposure to CALC-07 insalubrity read contract', async () => {
    const database = databaseStub([
      [
        {
          environmental_exposure_id: exposureId,
          harmful_agent_code: '01.01.001',
          agent_kind: 'FISICO',
          intensity_value: '88.000000',
          intensity_unit: 'dB(A)',
          mitigated_by_epi: false,
          mitigated_by_epc: false,
          special_retirement_eligible: true,
          insalubrity_due: true,
          danger_pay_due: false,
        },
      ],
    ]);
    const service = new EnvironmentalExposureService(database as never);

    const rows = await service.readForPayroll('employee-1', '2026-05-01');

    expect(rows[0]).toMatchObject({
      harmfulAgentCode: '01.01.001',
      insalubrityDue: true,
    });
    expect(database.sql()).toContain('saude.exposure_read_for_payroll');
  });
});

function databaseStub(results: unknown[][]) {
  const sql: string[] = [];
  let index = 0;
  return {
    configured: true,
    query: jest.fn(async (statement: string) => {
      sql.push(statement);
      return results[index++] ?? [];
    }),
    sql: () => sql.join('\n'),
  };
}

function exposureRow() {
  return {
    id: exposureId,
    tenant_id: tenantId,
    employee_id: '00000000-0000-4000-8000-000000002200',
    registration: 'MAT-2240',
    cpf: '11122233344',
    employee_name: 'Servidor Risco',
    cnpj: '12345678000199',
    work_location_name: 'Oficina de maquinas',
    responsible_cpf: '22233344455',
    harmful_agent_code: '01.01.001',
    agent_kind: 'FISICO',
    intensity_value: '88.000000',
    intensity_unit: 'dB(A)',
    exposure_start: '2026-05-02',
    exposure_end: null,
    mitigated_by_epi: true,
    mitigated_by_epc: false,
    special_retirement_eligible: true,
  };
}

function epiDeliveryRow() {
  return {
    id: 'delivery-1',
    employee_id: 'employee-1',
    employee_name: null,
    epi_inventory_id: 'epi-1',
    ca_number: null,
    epi_name: null,
    delivered_at: '2026-05-02T00:00:00.000Z',
    quantity: 1,
    signature_method: EpiSignatureMethod.GOVBR,
    signature_evidence_uri: 'govbr://evidences/123',
    training_done_at: null,
  };
}

function withTenant<T>(callback: () => Promise<T>): Promise<T> {
  return RequestContextStore.run(
    {
      tenantId,
      permissions: [
        'esocial.event.read',
        'esocial.event.write',
        'saude.exposure.read',
        'saude.exposure.write',
        'saude.epi.read',
        'saude.epi.write',
      ],
    },
    callback,
  );
}
