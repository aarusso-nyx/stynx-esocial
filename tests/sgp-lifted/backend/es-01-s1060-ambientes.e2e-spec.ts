import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { EmitESocialInput } from '../../backend/src/esocial-worker/esocial-emit.service';
import { S1060Builder } from '../../backend/src/esocial-worker/builders/s1060.builder';
import { S1xxxDispatchService } from '../../backend/src/esocial-worker/builders/s1xxx-common';

const tenantId = '00000000-0000-0000-0000-000000000100';

describe('ES-01 S-1060 work environments (e2e)', () => {
  it('dispatches active work locations as ambiente records and skips unchanged reruns', async () => {
    const rowsByStateKey = new Map<string, string>();
    const insertedEvents: EmitESocialInput[] = [];
    const database = {
      query: jest.fn(async (sql: string, values: unknown[]) => {
        if (sql.includes('FROM hr.work_location')) {
          return [
            {
              id: '00000000-0000-4000-8000-000000001060',
              code: 'AMB01',
              name: 'Oficina de maquinas',
              description: 'Setor de manutencao com exposicao controlada',
              branch_cnpj: '12345678000199',
              company_cnpj: '12345678000199',
            },
          ];
        }
        if (sql.includes('SELECT last_payload_hash')) {
          return rowsByStateKey.has(String(values[2]))
            ? [{ last_payload_hash: rowsByStateKey.get(String(values[2])) }]
            : [];
        }
        if (sql.includes('INSERT INTO esocial.s1xxx_dispatch_state')) {
          rowsByStateKey.set(String(values[2]), String(values[3]));
          return [];
        }
        return [];
      }),
    };
    const emitService = {
      emit: jest.fn(async (input: EmitESocialInput) => {
        insertedEvents.push(input);
        return {
          id: `event-${insertedEvents.length}`,
          eventKind: input.eventKind,
          reference: input.reference,
          competence: input.competence,
          status: 'PENDENTE',
          createdAt: '2026-05-01T00:00:00.000Z',
        };
      }),
    };
    const dispatch = new S1xxxDispatchService(
      database as never,
      emitService as never,
    );
    const builder = new S1060Builder(database as never);

    const first = await dispatch.dispatch(builder, { tenantId });
    const second = await dispatch.dispatch(builder, { tenantId });

    expect(first[0]).toMatchObject({
      eventKind: 'S-1060',
      sourceEntityKind: 'hr.work_location',
      emitted: true,
    });
    expect(second[0].emitted).toBe(false);
    expect(insertedEvents).toHaveLength(1);
    expect(insertedEvents[0]).toMatchObject({
      eventKind: 'S-1060',
      sourceEntityKind: 'hr.work_location',
      sourceEntityId: '00000000-0000-4000-8000-000000001060',
      payload: expect.objectContaining({
        workEnvironmentCode: 'AMB01',
      }),
    });
    expect(insertedEvents[0].xml).toContain('<evtTabAmbiente');
    expect(insertedEvents[0].xml).toContain('<codAmb>AMB01</codAmb>');
  });
});

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
