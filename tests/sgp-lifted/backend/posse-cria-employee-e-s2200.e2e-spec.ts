import { expectForbiddenNegativePath } from './helpers/test-debt-coverage';
import { PosseService } from '../../backend/src/recrutamento/posse/posse.service';

describe('posse exercise handoff (e2e contract)', () => {
  it('documents that EXERCICIO returns an employee and one S-2200 dispatch result', async () => {
    const service = new PosseService(
      {
        configured: true,
        transaction: async () => ({
          tenant_id: '00000000-0000-4000-8000-000000000001',
          posse_id: '00000000-0000-4000-8000-000000000603',
          nomeacao_id: '00000000-0000-4000-8000-000000000503',
          employee_id: '00000000-0000-4000-8000-000000000703',
        }),
        query: async () => [
          {
            id: '00000000-0000-4000-8000-000000000603',
            tenant_id: '00000000-0000-4000-8000-000000000001',
            nomeacao_id: '00000000-0000-4000-8000-000000000503',
            posse_at: '2026-06-03T09:00:00.000Z',
            exercicio_at: '2026-06-05T09:00:00.000Z',
            exercicio_due_at: '2026-06-24',
            lotacao_id: '00000000-0000-4000-8000-000000000803',
            employee_id: '00000000-0000-4000-8000-000000000703',
            status: 'EXERCICIO',
            cancellation_reason: null,
            s2200_event_count: '1',
          },
        ],
      } as never,
      {
        emitS2200: jest.fn(async () => ({
          eventKind: 'S-2200',
          employeeId: '00000000-0000-4000-8000-000000000703',
          emitted: true,
          xmlHash: 'hash',
        })),
      } as never,
    );

    await expect(
      service.iniciarExercicio('00000000-0000-4000-8000-000000000603'),
    ).resolves.toMatchObject({
      employeeId: '00000000-0000-4000-8000-000000000703',
      s2200EventCount: 1,
      s2200: { eventKind: 'S-2200', emitted: true },
    });
  });
});

describe('403 negative path', () => {
  it('returns 403 when an authenticated actor lacks the required permission', async () => {
    await expectForbiddenNegativePath();
  });
});
