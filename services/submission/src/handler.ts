import type { EsocialContractError } from '@esocial/contracts';
import {
  ESOCIAL_METRIC_NAMES,
  RetryableSubmissionError,
  SubmissionProcessor,
  TerminalSubmissionError,
  contextFromEnvelope,
  createMetricEmitter,
  createPinoLogger,
  metricNameForStatus,
  withTraceSpan,
  validateIngressEnvelope,
  validateIngressIdempotencyKey,
} from '@esocial/domain';
import type {
  MetricEmitter,
  StructuredLogContext,
  StructuredLogger,
  SubmissionPublishers,
  SubmissionRepository,
  TraceSpanSink,
} from '@esocial/domain';

import { createPostgresSubmissionRepositoryFromEnv } from './postgres-submission-repository.js';
import { createAwsSubmissionPublishersFromEnv } from './transport-publishers.js';

export type SqsSubmissionRecord = Readonly<{
  messageId?: string | undefined;
  messageID?: string | undefined;
  body?: string | undefined;
}>;

export type SqsSubmissionEvent = Readonly<{
  Records?: readonly SqsSubmissionRecord[] | undefined;
}>;

export type SqsBatchResponse = Readonly<{
  batchItemFailures: readonly {
    itemIdentifier: string;
  }[];
}>;

export type CreateSubmissionHandlerOptions = Readonly<{
  processor?: SubmissionProcessor | undefined;
  repository?: SubmissionRepository | undefined;
  publishers?: SubmissionPublishers | undefined;
  logger?: StructuredLogger | undefined;
  metrics?: MetricEmitter | undefined;
  traceSink?: TraceSpanSink | undefined;
  now?: (() => Date) | undefined;
}>;

export function createSubmissionHandler(
  options: CreateSubmissionHandlerOptions = {},
): (event: SqsSubmissionEvent) => Promise<SqsBatchResponse> {
  const processor = options.processor ?? createDefaultProcessor(options);
  const logger = options.logger ?? createPinoLogger({ service: 'submission' });
  const metrics = options.metrics ?? createMetricEmitter();

  return async (event: SqsSubmissionEvent): Promise<SqsBatchResponse> => {
    const batchItemFailures: { itemIdentifier: string }[] = [];

    for (const [index, record] of (event.Records ?? []).entries()) {
      const itemIdentifier = record.messageId ?? record.messageID ?? `record-${index}`;
      const body = record.body ?? '';

      const baseContext: StructuredLogContext = {
        requestId: itemIdentifier,
        attempt: index,
      };

      try {
        logStage(logger, 'ingress', 'Submission SQS record received.', baseContext);
        const parsed = JSON.parse(body) as unknown;
        const validation = validateIngressEnvelope(parsed, body);
        const context = validation.ok
          ? contextFromEnvelope(validation.envelope, { requestId: itemIdentifier })
          : baseContext;
        logStage(logger, 'ingress-validation', 'Submission envelope validated.', context);

        if (!validation.ok) {
          await processor.publishMalformedToDlq(validation);
          metrics.emit(ESOCIAL_METRIC_NAMES.dlq, 1, context);
          logStage(logger, 'publish', 'Malformed submission published to DLQ.', context);
          continue;
        }

        const keyValidation = validateIngressIdempotencyKey(validation.envelope);
        if (!keyValidation.ok) {
          await processor.publishIngressValidationFailure(
            validation.envelope,
            keyValidation.error,
          );
          metrics.emit(ESOCIAL_METRIC_NAMES.validationFailed, 1, context);
          logStage(logger, 'publish', 'Submission idempotency-key validation failed.', context);
          continue;
        }

        for (const stage of ['idempotency-lookup', 'build', 'xsd', 'sign', 'submit'] as const) {
          logStage(logger, stage, `Submission stage ${stage} reached.`, context);
        }
        const result = await withTraceSpan(
          {
            service: 'submission',
            spanName: 'handler',
            context,
            sink: options.traceSink,
            now: options.now,
          },
          async () => processor.process(validation.envelope),
        );
        logStage(logger, 'publish', 'Submission status events published.', contextFromEnvelope(validation.envelope, {
          batchId: result.record.batchId,
          protocol: result.record.transport?.protocolNumber,
        }));
        const metricName = metricNameForStatus(result.record.status);
        if (metricName) {
          metrics.emit(metricName, 1, contextFromEnvelope(validation.envelope, {
            batchId: result.record.batchId,
          }));
        }
      } catch (error) {
        if (error instanceof RetryableSubmissionError) {
          batchItemFailures.push({ itemIdentifier });
          metrics.emit(ESOCIAL_METRIC_NAMES.retry, 1, baseContext);
          logStage(logger, 'publish', 'Retryable submission failure returned to SQS.', baseContext, error);
          continue;
        }

        if (error instanceof SyntaxError) {
          await publishMalformedJson(processor, body, error, itemIdentifier, batchItemFailures);
          metrics.emit(ESOCIAL_METRIC_NAMES.dlq, 1, baseContext);
          logStage(logger, 'publish', 'Malformed JSON routed to submission DLQ.', baseContext, error);
          continue;
        }

        if (error instanceof TerminalSubmissionError) {
          metrics.emit(ESOCIAL_METRIC_NAMES.dlq, 1, baseContext);
          logStage(logger, 'publish', 'Terminal submission failure routed to DLQ.', baseContext, error);
          continue;
        }

        batchItemFailures.push({ itemIdentifier });
        logStage(logger, 'publish', 'Unexpected submission failure returned to SQS.', baseContext, error);
      }
    }

    return { batchItemFailures };
  };
}

function createDefaultProcessor(options: CreateSubmissionHandlerOptions): SubmissionProcessor {
  const publishers = options.publishers ?? createAwsSubmissionPublishersFromEnv();
  return new SubmissionProcessor({
    repository: options.repository ?? createPostgresSubmissionRepositoryFromEnv(),
    publishers,
    now: options.now,
  });
}

let defaultHandler: ((event: SqsSubmissionEvent) => Promise<SqsBatchResponse>) | undefined;

export async function handler(event: SqsSubmissionEvent): Promise<SqsBatchResponse> {
  defaultHandler ??= createSubmissionHandler();
  return defaultHandler(event);
}

async function publishMalformedJson(
  processor: SubmissionProcessor,
  body: string,
  error: SyntaxError,
  itemIdentifier: string,
  batchItemFailures: { itemIdentifier: string }[],
): Promise<void> {
  const contractError: EsocialContractError = {
    category: 'validation',
    code: 'ESOCIAL_MALFORMED_JSON',
    message: error.message,
    retryable: false,
  };

  try {
    await processor.publishMalformedToDlq({
      ok: false,
      error: contractError,
      rawBody: body,
    });
  } catch {
    batchItemFailures.push({ itemIdentifier });
  }
}

function logStage(
  logger: StructuredLogger,
  stage: string,
  message: string,
  context: StructuredLogContext,
  error?: unknown,
): void {
  if (error) {
    logger.error({
      stage,
      message,
      context,
      error: {
        code: error instanceof Error ? error.name : 'UNKNOWN',
        message: error instanceof Error ? error.message : String(error),
      },
    });
    return;
  }

  logger.info({ stage, message, context });
}
