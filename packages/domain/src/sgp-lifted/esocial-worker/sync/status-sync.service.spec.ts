import { StatusSyncService } from './status-sync.service';
import {
  OFFICIAL_RESPONSE_CLASSIFICATIONS,
  ResponseClass,
} from '../parsers/response-classification';

const tenantId = '00000000-0000-0000-0000-000000003809';
const eventId = '00000000-0000-4000-8000-000000003810';

describe('StatusSyncService', () => {
  it.each(OFFICIAL_RESPONSE_CLASSIFICATIONS)(
    'routes official cdResposta $responseCode as $class',
    async (classification) => {
      const client = mockClient(classification.class);
      const retryPolicy = {
        scheduleRetryInTransaction: jest.fn().mockResolvedValue({}),
        clearRetry: jest.fn().mockResolvedValue(undefined),
      };
      const service = new StatusSyncService({} as never, retryPolicy as never);

      const result = await service.synchronizeInTransaction(
        client as never,
        tenantId,
        {
          protocol: '1.2.202605.000000000000000001',
          responseCode: classification.responseCode,
          responseDescription: classification.description,
          estimatedConclusionSeconds: null,
          receivedAt: null,
          processedAt: '2026-05-02T12:00:00.000Z',
          employer: null,
          transmitter: null,
          occurrences: [],
          events: [
            {
              eventReference: eventId,
              duplicate: false,
              responseCode: classification.responseCode,
              responseDescription: classification.description,
              receipt:
                classification.class === 'ACCEPTED'
                  ? '1.1.0000000000000000001'
                  : null,
              processedAt: '2026-05-02T12:00:00.000Z',
              errors: [],
              rawXml: '<retornoEvento/>',
            },
          ],
        },
      );

      expect(result.events[0]).toMatchObject({
        responseCode: classification.responseCode,
        class: classification.class,
        status: expectedStatus(classification.class),
      });
      if (classification.class === 'RECOVERABLE') {
        expect(retryPolicy.scheduleRetryInTransaction).toHaveBeenCalled();
      } else {
        expect(retryPolicy.clearRetry).toHaveBeenCalled();
      }
    },
  );
});

function mockClient(responseClass: ResponseClass) {
  return {
    query: jest.fn((sql: string) => {
      if (sql.includes('FROM public.esocial_event')) {
        return Promise.resolve({
          rows: [{ id: eventId, tenant_id: tenantId, retry_count: 0 }],
        });
      }
      if (sql.includes('FROM esocial.response_classification')) {
        return Promise.resolve({
          rows: [{ class: responseClass, description: 'classified' }],
        });
      }
      return Promise.resolve({ rows: [] });
    }),
  };
}

function expectedStatus(responseClass: ResponseClass): string {
  if (responseClass === 'ACCEPTED') return 'PROCESSADO_COM_SUCESSO';
  if (responseClass === 'RECOVERABLE') return 'ERRO_TECNICO_RETENTAVEL';
  return 'ERRO_DEFINITIVO';
}
