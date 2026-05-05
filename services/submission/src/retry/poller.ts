import {
  buildSubmissionPublishCommand,
  pollRetrySchedule,
} from '@esocial/domain';
import type {
  RetryScheduleCircuitGate,
  RetrySchedulePollerRepository,
  RetrySchedulePollerResult,
  SubmissionPublisher,
  SubmissionRequestEnvelope,
} from '@esocial/domain';

import { createAwsSubmissionPublishersFromEnv } from '../transport-publishers.js';

import {
  createPostgresRetryRepositoryFromEnv,
} from './postgres-retry-repository.js';

export type CreateRetryPollerOptions = Readonly<{
  repository?: RetrySchedulePollerRepository<SubmissionRequestEnvelope> | undefined;
  retryPublisher?: SubmissionPublisher<ReturnType<typeof retryEnvelopeFromRequest>> | undefined;
  circuitGate?: RetryScheduleCircuitGate<SubmissionRequestEnvelope> | undefined;
  now?: (() => Date) | undefined;
  limit?: number | undefined;
}>;

export function createRetryPoller(
  options: CreateRetryPollerOptions = {},
): () => Promise<RetrySchedulePollerResult> {
  const repository = options.repository ?? createPostgresRetryRepositoryFromEnv();
  const retryPublisher = options.retryPublisher ?? createAwsSubmissionPublishersFromEnv().retry;

  return async () =>
    pollRetrySchedule({
      repository,
      circuitGate: options.circuitGate,
      now: options.now?.(),
      limit: options.limit,
      publisher: {
        async publish(request: SubmissionRequestEnvelope) {
          await retryPublisher.publish(
            buildSubmissionPublishCommand(
              'retry',
              retryEnvelopeFromRequest(request),
              `${request['request-id']}:retry:${request.attempt}`,
            ),
          );
        },
      },
    });
}

let defaultPoller: (() => Promise<RetrySchedulePollerResult>) | undefined;

export async function handler(): Promise<RetrySchedulePollerResult> {
  defaultPoller ??= createRetryPoller();
  return defaultPoller();
}

function retryEnvelopeFromRequest(request: SubmissionRequestEnvelope) {
  const now = new Date().toISOString();
  return {
    version: 'v1',
    family: 'retry',
    'request-id': request['request-id'],
    'correlation-id': request['correlation-id'],
    'idempotency-key': request['idempotency-key'],
    created_at: now,
    tenant_id: request.tenant_id,
    environment: request.environment,
    event_class: request.event_class,
    source: request.source,
    kind: request.kind,
    status: 'retry',
    attempt: request.attempt,
    'max-attempts': request['max-attempts'],
    next_attempt_at: now,
    retry_reason: 'event_retry_schedule due',
    errors: [],
  } as const;
}
