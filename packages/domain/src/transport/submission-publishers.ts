import { createHash } from 'node:crypto';

import type {
  AuditEventEnvelope,
  EsocialDlqEnvelope,
  EsocialRetryEnvelope,
  QueueAdapterResponseEnvelope,
  SpoolUpdateEnvelope,
} from '@esocial/contracts';

export const SUBMISSION_TOPICS = {
  response: 'sgp.esocial.submit.response',
  spool: 'sgp.esocial.spool.update',
  audit: 'sgp.esocial.audit',
  retry: 'sgp.esocial.retry',
  dlq: 'sgp.esocial.dlq',
} as const;

export type SubmissionTopicFamily = keyof typeof SUBMISSION_TOPICS;

export type SubmissionFifoMetadata = Readonly<{
  messageGroupId: string;
  messageDeduplicationId: string;
}>;

export type SubmissionPublishCommand<TEnvelope> = Readonly<{
  family: SubmissionTopicFamily;
  topic: string;
  envelope: TEnvelope;
  correlationId: string;
  fifo: SubmissionFifoMetadata;
}>;

export type SubmissionPublisher<TEnvelope> = Readonly<{
  publish(command: SubmissionPublishCommand<TEnvelope>): Promise<void>;
}>;

export type SubmissionDlqEnvelope = EsocialDlqEnvelope | MalformedSubmissionDlqEnvelope;

export type SubmissionPublishers = Readonly<{
  response: SubmissionPublisher<QueueAdapterResponseEnvelope>;
  spool: SubmissionPublisher<SpoolUpdateEnvelope>;
  audit: SubmissionPublisher<AuditEventEnvelope>;
  retry: SubmissionPublisher<EsocialRetryEnvelope>;
  dlq: SubmissionPublisher<SubmissionDlqEnvelope>;
}>;

export type MalformedSubmissionDlqEnvelope = EsocialDlqEnvelope &
  Readonly<{
    malformed_body?: string;
  }>;

export function buildSubmissionPublishCommand<TEnvelope extends {
  tenant_id: string;
  event_class: string;
  'correlation-id': string;
  'idempotency-key': string;
}>(
  family: SubmissionTopicFamily,
  envelope: TEnvelope,
  outboundEventId: string,
): SubmissionPublishCommand<TEnvelope> {
  return {
    family,
    topic: SUBMISSION_TOPICS[family],
    envelope,
    correlationId: envelope['correlation-id'],
    fifo: buildSubmissionFifoMetadata(envelope, outboundEventId),
  };
}

export function buildSubmissionFifoMetadata(
  envelope: {
    tenant_id: string;
    event_class: string;
    'idempotency-key': string;
  },
  outboundEventId: string,
): SubmissionFifoMetadata {
  return {
    // Per-tenant/event-class ordering avoids cross-tenant serialization.
    messageGroupId: `${envelope.tenant_id}:${envelope.event_class}`.slice(0, 128),
    messageDeduplicationId: createHash('sha256')
      .update(`${envelope['idempotency-key']}:${outboundEventId}`)
      .digest('hex'),
  };
}
