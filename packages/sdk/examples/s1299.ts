import {
  makeCorrelationId,
  makeTenantId,
} from '@esocial/contracts';

import {
  EsocialClient,
  RecordingTransport,
} from '../src/index.js';

const transport = new RecordingTransport();
const client = new EsocialClient(
  {
    tenantId: makeTenantId('00000000-0000-4000-8000-000000000101'),
    environment: 'QUALIFICATION',
    replyTo: 'sgp.esocial.submit.response',
    deadLetterTopic: 'sgp.esocial.dlq',
  },
  transport,
);

await client.submit(
  {
    eventClass: 'S-1299',
    tenantId: '00000000-0000-4000-8000-000000000101',
    sourceEventId: 'source-event-S-1299',
    sourceEntityId: 'source-entity-S-1299',
    employerCnpj: '11222333000181',
    competence: '2026-05',
    payrollRunId: 'payroll-2026-05',
    pendingPeriodicEvents: [],
    acceptedEventCounts: {
      remuneration: 1,
      payments: 1,
    },
  },
  {
    correlationId: makeCorrelationId('10000000-0000-4000-8000-000000000101'),
    requestId: 'request-S-1299',
  },
);
