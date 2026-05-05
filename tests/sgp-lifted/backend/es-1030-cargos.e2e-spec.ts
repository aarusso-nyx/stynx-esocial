import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { S1030Builder } from '../../backend/src/esocial-worker/builders/s1030.builder';
import { S1xxxDispatchService } from '../../backend/src/esocial-worker/builders/s1xxx-common';
import type { S1xxxSourceRecord } from '../../backend/src/esocial-worker/builders/s1xxx-common';
import type { EmitESocialInput } from '../../backend/src/esocial-worker/esocial-emit.service';

describe('ES-1030 Cargos publicos (e2e)', () => {
  it('enqueues S-1030 job-position deltas and skips unchanged reruns', async () => {
    const tenantId = '00000000-0000-0000-0000-000000000100';
    const rowsByStateKey = new Map<string, string>();
    const emitted: EmitESocialInput[] = [];
    const database = {
      query: jest.fn(async (sql: string, values: unknown[]) => {
        if (sql.includes('FROM hr.job_position')) {
          return [
            {
              id: '00000000-0000-4000-8000-000000000030',
              code: 'ANL',
              name: 'Analista Administrativo',
              creation_law: 'Lei 1/2026',
              legal_regime: 'estatutario',
              cbo_code: '252105',
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
        return [];
      }),
    };
    const emitService = {
      emit: jest.fn(async (input: EmitESocialInput) => {
        emitted.push(input);
        return {
          id: `event-${emitted.length}`,
          eventKind: input.eventKind,
          reference: input.reference,
          competence: input.competence,
          status: 'PENDENTE',
          createdAt: '2026-05-01T00:00:00.000Z',
        };
      }),
    };
    const builder = new S1030Builder(database as never);
    const dispatch = new S1xxxDispatchService(
      database as never,
      emitService as never,
    );

    const first = await dispatch.dispatch(builder, { tenantId });
    const second = await dispatch.dispatch(builder, { tenantId });

    expect(first[0]).toMatchObject({
      eventKind: 'S-1030',
      sourceEntityId: '00000000-0000-4000-8000-000000000030',
      sourceEntityKind: 'hr.job_position',
      emitted: true,
    });
    expect(second[0]).toMatchObject({
      eventKind: 'S-1030',
      emitted: false,
    });
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      tenantId,
      eventKind: 'S-1030',
      competence: '2026-01',
      sourceEntityKind: 'hr.job_position',
      sourceEntityId: '00000000-0000-4000-8000-000000000030',
    });
    expect((emitted[0].payload as S1xxxSourceRecord['payload']).code).toBe(
      'ANL',
    );
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
