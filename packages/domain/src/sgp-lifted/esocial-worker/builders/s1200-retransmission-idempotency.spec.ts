import { RequestContextStore } from '../../common/request-context/request-context.store';
import { ES04Service } from './es04.service';

const tenantId = '00000000-0000-4000-8000-000000001540';
const payrollRunId = '00000000-0000-4000-8000-000000001200';
const employeeId = '00000000-0000-4000-8000-000000000001';
const xml =
  '<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtRemun/v_S_01_03_00"><evtRemun Id="ID154"/></eSocial>';

describe('S-1200 retransmission idempotency', () => {
  it('deduplicates a retransmission when the S-1.3 payload hash is unchanged', async () => {
    let storedPayloadHash: string | null = null;
    const query = jest.fn(async (sql: string, values: unknown[]) => {
      if (sql.includes('SELECT payload_hash')) {
        expect(values).toEqual([tenantId, payrollRunId, employeeId]);
        return storedPayloadHash ? [{ payload_hash: storedPayloadHash }] : [];
      }
      if (sql.includes('INSERT INTO esocial.s1200_emission_state')) {
        storedPayloadHash = String(values[4]);
      }
      return [];
    });
    const emit = jest.fn(async (input) => ({
      id: 'event-1',
      eventKind: input.eventKind,
      reference: 'REC-S1200',
      competence: input.competence,
      status: 'PENDENTE',
      createdAt: '2026-05-03T00:00:00.000Z',
    }));
    const service = new ES04Service(
      { query } as never,
      { emit } as never,
      {
        build: jest.fn(async () => [
          {
            tenantId,
            payrollRunId,
            employeeId,
            xml,
            reference: 'ID154',
            competence: '2026-01',
            ideDmDev: 'DMDEV154',
            payload: { layoutVersion: 'S-1.3' },
          },
        ]),
      } as never,
      { build: jest.fn() } as never,
      { build: jest.fn() } as never,
      { recomputeYear: jest.fn(async () => undefined) } as never,
    );

    const first = await runAsTenant(() => service.emitS1200(payrollRunId));
    const second = await runAsTenant(() => service.emitS1200(payrollRunId));

    expect(first).toMatchObject([
      { eventKind: 'S-1200', emitted: true, employeeId, payrollRunId },
    ]);
    expect(second).toEqual([
      {
        eventKind: 'S-1200',
        employeeId,
        payrollRunId,
        xmlHash: first[0]!.xmlHash,
        emitted: false,
        blockedReason: 'payload_hash_unchanged',
      },
    ]);
    expect(storedPayloadHash).toBe(first[0]!.xmlHash);
    expect(emit).toHaveBeenCalledTimes(1);
  });
});

function runAsTenant<T>(handler: () => Promise<T>): Promise<T> {
  return RequestContextStore.run(
    {
      tenantId,
      permissions: ['esocial.event.write', 'folha.write'],
      actor: { tenantId, sub: 'r2-154', username: 'r2-154' },
    },
    handler,
  );
}
