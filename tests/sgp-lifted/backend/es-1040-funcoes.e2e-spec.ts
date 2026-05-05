import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { EmitESocialInput } from '../../backend/src/esocial-worker/esocial-emit.service';
import { S1040Builder } from '../../backend/src/esocial-worker/builders/s1040.builder';
import { S1xxxDispatchService } from '../../backend/src/esocial-worker/builders/s1xxx-common';

describe('ES-01 S-1040 funcoes (e2e)', () => {
  it('builds S-1040 from job functions, enqueues deltas, and skips unchanged reruns', async () => {
    const tenantId = '00000000-0000-0000-0000-000000000100';
    const rowsByStateKey = new Map<string, string>();
    const insertedEvents: EmitESocialInput[] = [];
    const auditEvents: unknown[] = [];
    const database = {
      query: jest.fn(async (sql: string, values: unknown[]) => {
        if (sql.includes('FROM hr.job_function')) {
          return [
            {
              id: '00000000-0000-4000-8000-000000000040',
              code: 'FUNC01',
              name: 'Funcao comissionada',
              cnpj: '12345678000199',
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
        if (sql.includes('sgp_append_audit_event')) {
          auditEvents.push(values);
          return [];
        }
        return [];
      }),
    };
    const emitService = {
      emit: jest.fn(async (input: EmitESocialInput) => {
        insertedEvents.push(input);
        await database.query('SELECT public.sgp_append_audit_event()', []);
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
    const builder = new S1040Builder(database as never);

    const first = await dispatch.dispatch(builder, {
      tenantId,
      competence: '2026-01',
    });
    const second = await dispatch.dispatch(builder, {
      tenantId,
      competence: '2026-01',
    });

    expect(first[0]).toMatchObject({
      eventKind: 'S-1040',
      sourceEntityId: '00000000-0000-4000-8000-000000000040',
      sourceEntityKind: 'hr.job_function',
      emitted: true,
    });
    expect(second[0]).toMatchObject({
      eventKind: 'S-1040',
      sourceEntityId: '00000000-0000-4000-8000-000000000040',
      emitted: false,
    });
    expect(insertedEvents).toHaveLength(1);
    expect(insertedEvents[0]).toMatchObject({
      tenantId,
      eventKind: 'S-1040',
      competence: '2026-01',
      sourceEntityKind: 'hr.job_function',
      sourceEntityId: '00000000-0000-4000-8000-000000000040',
      payload: {
        code: 'FUNC01',
        sourceEntityKind: 'hr.job_function',
        sourceEntityId: '00000000-0000-4000-8000-000000000040',
      },
    });
    expect(insertedEvents[0]?.xml).toContain('<evtTabFuncao ');
    expect(insertedEvents[0]?.xml).toContain('<codFuncao>FUNC01</codFuncao>');
    expect(auditEvents).toHaveLength(1);
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
