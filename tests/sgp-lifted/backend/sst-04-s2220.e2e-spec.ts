import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { ES03Service } from '../../backend/src/esocial-worker/builders/es03.service';
import { S2220Builder } from '../../backend/src/esocial-worker/builders/s2220.builder';
import { XsdValidatorService } from '../../backend/src/esocial-worker/xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000000100';
const asoRecordId = '00000000-0000-4000-8000-000000002220';

describe('SST-04 S-2220 flow (e2e)', () => {
  const validator = new XsdValidatorService();

  it('emits archived ASO S-2220 and clears the pending queue on XSD OK', async () => {
    const database = databaseStub([
      [{ tenant_id: tenantId, aso_record_id: asoRecordId }],
      [asoRow()],
      [],
      [],
      [],
    ]);
    const emitService = {
      emit: jest.fn(async (input: { xml: string }) => {
        validator.assertValid('S-2220', input.xml, { allowUnsigned: true });
        return {
          id: '00000000-0000-4000-8000-000000009999',
          eventKind: 'S-2220',
          reference: 'S2220-OK',
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
      new S2220Builder(database as never),
      {} as never,
      {} as never,
    );

    const result = await withTenant(() => service.emitS2220(asoRecordId));

    expect(result.emitted).toBe(true);
    expect(emitService.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKind: 'S-2220',
        sourceEntityKind: 'saude.aso_record',
        sourceEntityId: asoRecordId,
      }),
    );
    expect(database.sql()).toContain('UPDATE saude.aso_record');
    expect(database.sql()).toContain('DELETE FROM esocial.s2220_pending');
  });

  it('keeps invalid ASO pending with last_error for manual retry', async () => {
    const database = databaseStub([
      [{ tenant_id: tenantId, aso_record_id: asoRecordId }],
      [{ ...asoRow(), doctor_crm: null }],
      [],
      [],
    ]);
    const emitService = {
      emit: jest.fn((input: { xml: string }) => {
        validator.assertValid('S-2220', input.xml, { allowUnsigned: true });
      }),
    };
    const service = new ES03Service(
      database as never,
      emitService as never,
      {} as never,
      {} as never,
      new S2220Builder(database as never),
      {} as never,
      {} as never,
    );

    const result = await withTenant(() => service.emitS2220(asoRecordId));

    expect(result.emitted).toBe(false);
    expect(result.lastError).toContain('failed XSD validation');
    expect(database.sql()).toContain('last_error = $3');
    expect(database.sql()).not.toContain('DELETE FROM esocial.s2220_pending');
  });

  it('lists ASO rows without s2220_event_id as highlighted pending queue rows', async () => {
    const database = databaseStub([
      [
        {
          id: asoRecordId,
          event_kind: 'S-2220',
          source_id: asoRecordId,
          employee_name: 'Servidor ASO',
          status: 'PENDING',
          enqueued_at: '2026-05-02T00:00:00.000Z',
          receipt: null,
          blocked_reason: null,
          last_error: 'crm missing',
          aso_record_id: asoRecordId,
        },
      ],
    ]);
    const service = new ES03Service(
      database as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const rows = await withTenant(() => service.listStatus());

    expect(rows[0]).toMatchObject({
      eventKind: 'S-2220',
      status: 'PENDING',
      receipt: null,
      lastError: 'crm missing',
      asoRecordId,
    });
  });
});

function databaseStub(results: unknown[][]) {
  const sql: string[] = [];
  let index = 0;
  return {
    query: jest.fn(async (statement: string) => {
      sql.push(statement);
      return results[index++] ?? [];
    }),
    sql: () => sql.join('\n'),
  };
}

function asoRow() {
  return {
    id: asoRecordId,
    tenant_id: tenantId,
    employee_id: '00000000-0000-4000-8000-000000002200',
    registration: 'MAT-2220',
    cpf: '11122233344',
    aso_kind: 'ADMISSIONAL',
    performed_at: '2026-05-02',
    scheduled_at: '2026-05-01',
    doctor_crm: 'CRM-SP 12345',
    doctor_name: 'Dra Monitoramento',
    conclusion: 'APTO',
    cnpj: '12345678000199',
  };
}

function withTenant<T>(callback: () => Promise<T>): Promise<T> {
  return RequestContextStore.run(
    {
      tenantId,
      permissions: ['esocial.event.read', 'esocial.event.write'],
    },
    callback,
  );
}
