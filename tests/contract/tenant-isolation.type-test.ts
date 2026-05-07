import type {
  EsocialClass,
  EsocialEnvelopeBase,
  EsocialRelayRequestPayload,
  TenantId,
} from '@esocial/contracts';

import type {
  ReturnRequestEnvelope,
  SubmissionRequestEnvelope,
} from '../../packages/domain/src/index.js';

const tenantId = '00000000-0000-4000-8000-000000000101' as TenantId;

const _badEnvelope: EsocialEnvelopeBase<'request'> = {
  version: 'v1',
  family: 'request',
  'request-id': 'request-1',
  'correlation-id': '00000000-0000-4000-8000-000000000102',
  'idempotency-key': 'esocial:v1:request:bad',
  created_at: '2026-05-06T12:00:00.000Z',
  // @ts-expect-error plain string must NOT satisfy tenant_id.
  tenant_id: 'plain-string',
  environment: 'QUALIFICATION',
  event_class: 'S-1299',
  source: {},
};

const _goodEnvelope: Pick<EsocialEnvelopeBase<'request'>, 'tenant_id'> = {
  tenant_id: tenantId,
};

const _badSubmissionEnvelope: SubmissionRequestEnvelope = {
  ...baseRequest('submit'),
  // @ts-expect-error submission processor envelopes must carry branded tenant_id.
  tenant_id: 'plain-string',
};

const _badReturnEnvelope: ReturnRequestEnvelope = {
  ...baseRequest('retorno'),
  // @ts-expect-error return processor envelopes must carry branded tenant_id.
  tenant_id: 'plain-string',
};

const _goodSubmissionEnvelope: SubmissionRequestEnvelope = {
  ...baseRequest('submit'),
  tenant_id: tenantId,
};

const _goodReturnEnvelope: ReturnRequestEnvelope = {
  ...baseRequest('retorno'),
  tenant_id: tenantId,
};

void _badEnvelope;
void _goodEnvelope;
void _badSubmissionEnvelope;
void _badReturnEnvelope;
void _goodSubmissionEnvelope;
void _goodReturnEnvelope;

function baseRequest(kind: EsocialClass): Omit<SubmissionRequestEnvelope, 'tenant_id'> {
  return {
    version: 'v1',
    family: 'request',
    'request-id': 'request-1',
    'correlation-id': '00000000-0000-4000-8000-000000000102',
    'idempotency-key': 'esocial:v1:request:00000000-0000-4000-8000-000000000101:QUALIFICATION:S-1299:source-1:-:-:2026-05:sha256%3A0000000000000000000000000000000000000000000000000000000000000000:-:-',
    created_at: '2026-05-06T12:00:00.000Z',
    environment: 'QUALIFICATION',
    event_class: 'S-1299',
    source: { source_event_id: 'source-1' },
    kind,
    payload: {
      eventClass: 'S-1299',
      tenantId: tenantId,
      sourceEventId: 'source-1',
      sourceEntityId: 'source-1',
      competence: '2026-05',
      environment: 'qualification',
    } as EsocialRelayRequestPayload,
    payload_hash: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    attempt: 1,
    'max-attempts': 3,
    'reply-to': 'sgp.esocial.response.qualification.fifo',
    'dead-letter-topic': 'sgp.esocial.dlq.qualification.fifo',
  };
}
