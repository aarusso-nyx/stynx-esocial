import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import type { EmitESocialInput } from '../../backend/src/esocial-worker/esocial-emit.service';
import { ES05Service } from '../../backend/src/esocial-worker/builders/es05.service';
import { S1298Builder } from '../../backend/src/esocial-worker/builders/s1298.builder';
import { S1299Builder } from '../../backend/src/esocial-worker/builders/s1299.builder';
import { TotalizerParser } from '../../backend/src/esocial-worker/parsers/totalizer.parser';

const tenantId = '00000000-0000-0000-0000-000000001299';

describe('ES-05 S-1299 closure flow (e2e)', () => {
  it('fails with pending periodics, closes after receipts, and ingests totalizers', async () => {
    const blockedBuilder = new S1299Builder(
      database([
        [
          {
            event_kind: 'S-1210',
            payroll_run_id: '00000000-0000-4000-8000-000000001200',
            payment_batch_id: '00000000-0000-4000-8000-000000001210',
            employee_id: '00000000-0000-4000-8000-000000000001',
            reason: 'missing_s1210_receipt',
          },
        ],
      ]) as never,
    );

    await expect(
      blockedBuilder.build(tenantId, '2026-01'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ESOCIAL_S1299_PERIODICS_PENDING',
      }),
    });

    const emitService = {
      emit: jest.fn(async (input: EmitESocialInput) => ({
        id: '00000000-0000-4000-8000-000000001299',
        eventKind: input.eventKind,
        reference: input.reference ?? 'ID1299',
        competence: input.competence ?? '2026-01',
        status: 'PENDENTE',
        createdAt: '2026-05-02T12:00:00.000Z',
      })),
    };
    const db = database([
      [],
      [{ cnpj: '12.345.678/0001-99' }],
      [{ remuneration_count: '1', payment_count: '1' }],
      [],
      [
        {
          competence: '2026-01-01',
          status: 'EMITTED',
          recibo: 'ID1299',
          emitted_at: '2026-05-02T12:00:00.000Z',
          accepted_at: null,
        },
      ],
      [],
      [],
    ]);
    const service = new ES05Service(
      db as never,
      emitService as never,
      new S1299Builder(db as never),
      new S1298Builder(db as never),
      new TotalizerParser(db as never),
    );

    await RequestContextStore.run(
      {
        tenantId,
        permissions: ['esocial.event.read', 'esocial.event.write'],
      },
      async () => {
        const closed = await service.close(2026, 1);
        expect(closed.emitted).toBe(true);
        expect(emitService.emit).toHaveBeenCalledWith(
          expect.objectContaining({ eventKind: 'S-1299' }),
        );
      },
    );

    const parserDb = {
      transaction: jest.fn(async (callback: (client: unknown) => unknown) =>
        callback({
          query: jest
            .fn()
            .mockResolvedValueOnce({
              rows: [
                {
                  tenant_id: tenantId,
                  competence: '2026-01-01',
                  kind: 'S-5011',
                  source_event_recibo: 'ID1299',
                  payload: {},
                  received_at: '2026-05-02T12:10:00.000Z',
                },
              ],
            })
            .mockResolvedValueOnce({ rows: [] }),
        }),
      ),
    };
    const totalizer = await new TotalizerParser(parserDb as never).ingest(
      tenantId,
      totalizerXml('evtCS', 'ID1299'),
      new Date('2026-05-02T12:10:00.000Z'),
    );
    expect(totalizer.kind).toBe('S-5011');
    expect(totalizer.sourceEventRecibo).toBe('ID1299');
  });

  it('emits S-1298 and reopens state after accepted S-1299', async () => {
    const emitService = {
      emit: jest.fn(async (input: EmitESocialInput) => ({
        id: '00000000-0000-4000-8000-000000001298',
        eventKind: input.eventKind,
        reference: input.reference ?? 'ID1298',
        competence: input.competence ?? '2026-01',
        status: 'PENDENTE',
        createdAt: '2026-05-02T12:40:00.000Z',
      })),
    };
    const db = database([
      [
        {
          status: 'ACCEPTED',
          recibo: '1.1.0000000000000001299',
          accepted_at: '2026-05-02T12:30:00.000Z',
        },
      ],
      [{ cnpj: '12.345.678/0001-99' }],
      [],
      [
        {
          competence: '2026-01-01',
          status: 'PENDING',
          recibo: null,
          emitted_at: null,
          accepted_at: null,
        },
      ],
      [],
      [],
    ]);
    const service = new ES05Service(
      db as never,
      emitService as never,
      new S1299Builder(db as never),
      new S1298Builder(db as never),
      new TotalizerParser(db as never),
    );

    await RequestContextStore.run(
      {
        tenantId,
        permissions: ['esocial.event.read', 'esocial.event.write'],
      },
      async () => {
        const reopened = await service.reopen(2026, 1);

        expect(reopened.emitted).toBe(true);
        expect(reopened.state.status).toBe('PENDING');
        expect(reopened.state.recibo).toBeNull();
        expect(emitService.emit).toHaveBeenCalledWith(
          expect.objectContaining({
            eventKind: 'S-1298',
            payload: expect.objectContaining({
              reopenedFromS1299Receipt: '1.1.0000000000000001299',
            }),
          }),
        );
      },
    );
  });
});

function database(results: unknown[][]) {
  let index = 0;
  return {
    query: jest.fn(async () => results[index++] ?? []),
  };
}

function totalizerXml(eventElement: string, receipt: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/${eventElement}/v_S_01_03_00">
  <${eventElement} Id="ID5011000000000000000000000000000001">
    <ideEvento><perApur>2026-01</perApur></ideEvento>
    <infoTotal><nrRecArqBase>${receipt}</nrRecArqBase></infoTotal>
  </${eventElement}>
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
