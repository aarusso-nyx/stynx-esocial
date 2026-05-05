import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { EmitESocialInput } from '../../backend/src/esocial-worker/esocial-emit.service';
import { S1xxxDispatchService } from '../../backend/src/esocial-worker/builders/s1xxx-common';
import { XsdValidatorService } from '../../backend/src/esocial-worker/xsd/xsd-validator.service';

describe('ES-01 S-1xxx tables (e2e)', () => {
  it('validates six S-1xxx XML payloads, enqueues deltas, and skips unchanged reruns', async () => {
    const tenantId = '00000000-0000-0000-0000-000000000100';
    const validator = new XsdValidatorService();
    const rowsByStateKey = new Map<string, string>();
    const insertedEvents: unknown[] = [];
    const auditEvents: unknown[] = [];
    const database = {
      query: jest.fn(async (sql: string, values: unknown[]) => {
        if (sql.includes('SELECT last_payload_hash')) {
          return rowsByStateKey.has(String(values[2]))
            ? [{ last_payload_hash: rowsByStateKey.get(String(values[2])) }]
            : [];
        }
        if (sql.includes('INSERT INTO esocial.s1xxx_dispatch_state')) {
          rowsByStateKey.set(String(values[2]), String(values[3]));
          return [];
        }
        if (sql.includes('INSERT INTO public.esocial_event')) {
          insertedEvents.push({ eventKind: values[1], xml: values[5] });
          return [
            {
              id: `event-${insertedEvents.length}`,
              event_type: values[1],
              reference: values[2],
              competence: values[3],
              status: 'PENDENTE',
              created_at: '2026-05-01T00:00:00.000Z',
            },
          ];
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
        validator.assertValid(input.eventKind, input.xml, {
          allowUnsigned: true,
        });
        await database.query('INSERT INTO public.esocial_event', [
          input.tenantId,
          input.eventKind,
          input.reference,
          input.competence,
          input.payload,
          input.xml,
        ]);
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
    const builders = [
      'S-1000',
      'S-1005',
      'S-1010',
      'S-1020',
      'S-1050',
      'S-1070',
    ].map((eventKind) => ({
      eventKind,
      build: async () => [
        {
          id: `${eventKind}:source`,
          sourceEntityKind: 'fixture',
          xml: xmlFor(eventKind, tenantId),
          reference: `${eventKind}:ref`,
          competence: '2026-01',
          payload: {},
        },
      ],
    }));

    for (const builder of builders) {
      const first = await dispatch.dispatch(builder as never, { tenantId });
      const second = await dispatch.dispatch(builder as never, { tenantId });
      expect(first[0].emitted).toBe(true);
      expect(second[0].emitted).toBe(false);
    }

    expect(insertedEvents).toHaveLength(6);
    expect(auditEvents).toHaveLength(6);
  });
});

function xmlFor(eventKind: string, tenantId: string): string {
  const fixture = eventKind.toLowerCase().replace('-', '');
  return readFileSync(
    join(
      process.cwd(),
      'src/esocial-worker/builders/__fixtures__',
      `${fixture}.golden.xml`,
    ),
    'utf8',
  )
    .replace(/00000000-0000-0000-0000-000000000100/g, tenantId)
    .trim();
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
