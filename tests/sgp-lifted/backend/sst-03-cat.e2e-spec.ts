import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { ES03Service } from '../../backend/src/esocial-worker/builders/es03.service';
import { S2210Builder } from '../../backend/src/esocial-worker/builders/s2210.builder';
import { XsdValidatorService } from '../../backend/src/esocial-worker/xsd/xsd-validator.service';

const tenantId = '00000000-0000-0000-0000-000000000100';
const catEmissionId = '00000000-0000-4000-8000-000000002210';
const workAccidentId = '00000000-0000-4000-8000-000000002200';

describe('SST-03 CAT S-2210 flow (e2e)', () => {
  const validator = new XsdValidatorService();

  it('emits S-2210 for initial, reopening, and death CAT pending records', async () => {
    for (const catKind of ['INICIAL', 'REABERTURA', 'OBITO'] as const) {
      const currentCatEmissionId = catId(catKind);
      const database = databaseStub([
        [{ tenant_id: tenantId, cat_emission_id: currentCatEmissionId }],
        [catRow(currentCatEmissionId, catKind)],
        [],
        [],
      ]);
      const emitService = {
        emit: jest.fn(async (input: { xml: string }) => {
          validator.assertValid('S-2210', input.xml, { allowUnsigned: true });
          return {
            id: '00000000-0000-4000-8000-000000009210',
            eventKind: 'S-2210',
            reference: 'S2210-OK',
            competence: '2026-05',
            status: 'PENDENTE',
            createdAt: '2026-05-02T00:00:00.000Z',
          };
        }),
      };
      const service = new ES03Service(
        database as never,
        emitService as never,
        new S2210Builder(database as never),
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );

      const result = await withTenant(() =>
        service.emitS2210(currentCatEmissionId),
      );

      expect(result.emitted).toBe(true);
      expect(emitService.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          eventKind: 'S-2210',
          sourceEntityKind: 'saude.cat_emission',
          sourceEntityId: currentCatEmissionId,
        }),
      );
      expect(database.sql()).toContain('UPDATE saude.cat_emission');
      expect(database.sql()).toContain('DELETE FROM esocial.s2210_pending');
    }
  });

  it('keeps state machine and fatal close guards in canonical SQL', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../database/sql/40-saude-functions.sql'),
      'utf8',
    );

    expect(sql).toContain('invalid work_accident status transition');
    expect(sql).toContain(
      'fatal work_accident requires OBITO CAT before closing',
    );
    expect(sql).toContain(
      "OLD.status = 'REGISTRADO'::saude.work_accident_status",
    );
    expect(sql).toContain(
      "NEW.status = 'COMUNICADO'::saude.work_accident_status",
    );
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

function catId(catKind: string): string {
  if (catKind === 'REABERTURA') return '00000000-0000-4000-8000-000000002211';
  if (catKind === 'OBITO') return '00000000-0000-4000-8000-000000002212';
  return catEmissionId;
}

function catRow(
  currentCatEmissionId: string,
  catKind: 'INICIAL' | 'REABERTURA' | 'OBITO',
) {
  return {
    cat_emission_id: currentCatEmissionId,
    tenant_id: tenantId,
    work_accident_id: workAccidentId,
    employee_id: '00000000-0000-4000-8000-000000002201',
    registration: 'MAT-2210',
    cpf: '11122233344',
    cnpj: '12345678000199',
    accident_at: '2026-05-01T10:30:00.000Z',
    accident_type: 'TIPICO',
    location_text: 'Patio operacional',
    body_part_code: '000000001',
    agent_cause_code: '000000002',
    witness_text: 'Testemunha informou queda no patio',
    severity: catKind === 'OBITO' ? 'FATAL' : 'GRAVE',
    death_at: catKind === 'OBITO' ? '2026-05-02T11:00:00.000Z' : null,
    cat_kind: catKind,
    emitted_at: '2026-05-02T12:00:00.000Z',
    doctor_crm: 'CRM-SP 12345',
    doctor_name: 'Dra CAT',
    internment: catKind !== 'INICIAL',
    leave_until: catKind === 'OBITO' ? null : '2026-05-12',
    origin_receipt: '1.1.0000000000000000000',
  };
}

function withTenant<T>(callback: () => Promise<T>): Promise<T> {
  return RequestContextStore.run(
    {
      tenantId,
      permissions: [
        'esocial.event.read',
        'esocial.event.write',
        'saude.cat.write',
      ],
    },
    callback,
  );
}
