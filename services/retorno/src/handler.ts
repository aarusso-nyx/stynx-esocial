import type { EsocialContractError } from '@esocial/contracts';
import {
  ESOCIAL_METRIC_NAMES,
  ReturnProcessor,
  contextFromEnvelope,
  createMetricEmitter,
  createPinoLogger,
  metricNameForStatus,
  withTraceSpan,
  validateReturnIngressEnvelope,
} from '@esocial/domain';
import type {
  MetricEmitter,
  ReturnPublishers,
  ReturnRepository,
  StructuredLogContext,
  StructuredLogger,
  TraceSpanSink,
} from '@esocial/domain';

import { createPostgresReturnRepositoryFromEnv } from './postgres-return-repository.js';
import { createAwsReturnPublishersFromEnv } from './transport-publishers.js';

export type SqsReturnRecord = Readonly<{
  messageId?: string | undefined;
  messageID?: string | undefined;
  body?: string | undefined;
}>;

export type SqsReturnEvent = Readonly<{
  Records?: readonly SqsReturnRecord[] | undefined;
}>;

export type SqsBatchResponse = Readonly<{
  batchItemFailures: readonly {
    itemIdentifier: string;
  }[];
}>;

export type CreateReturnHandlerOptions = Readonly<{
  processor?: ReturnProcessor | undefined;
  repository?: ReturnRepository | undefined;
  publishers?: ReturnPublishers | undefined;
  logger?: StructuredLogger | undefined;
  metrics?: MetricEmitter | undefined;
  traceSink?: TraceSpanSink | undefined;
  now?: (() => Date) | undefined;
}>;

export function createReturnHandler(
  options: CreateReturnHandlerOptions = {},
): (event: SqsReturnEvent) => Promise<SqsBatchResponse> {
  const publishers = options.publishers ?? createAwsReturnPublishersFromEnv();
  const processor =
    options.processor ??
    new ReturnProcessor({
      repository: options.repository ?? createPostgresReturnRepositoryFromEnv(),
      publishers,
      now: options.now,
    });
  const logger = options.logger ?? createPinoLogger({ service: 'retorno' });
  const metrics = options.metrics ?? createMetricEmitter();

  return async (event: SqsReturnEvent): Promise<SqsBatchResponse> => {
    const batchItemFailures: { itemIdentifier: string }[] = [];

    for (const [index, record] of (event.Records ?? []).entries()) {
      const itemIdentifier = record.messageId ?? record.messageID ?? `record-${index}`;
      const body = record.body ?? '';
      const baseContext: StructuredLogContext = {
        requestId: itemIdentifier,
        attempt: index,
      };

      try {
        logStage(logger, 'ingress', 'Return SQS record received.', baseContext);
        const parsed = JSON.parse(body) as unknown;
        const validation = validateReturnIngressEnvelope(parsed, body);
        const context = validation.ok
          ? contextFromEnvelope(validation.envelope, { requestId: itemIdentifier })
          : baseContext;
        logStage(logger, 'ingress-validation', 'Return envelope validated.', context);

        if (!validation.ok) {
          await processor.publishMalformedToDlq(validation);
          metrics.emit(ESOCIAL_METRIC_NAMES.dlq, 1, context);
          logStage(logger, 'publish', 'Malformed return published to DLQ.', context);
          continue;
        }

        logStage(logger, 'parse-return', 'Return parse stage reached.', context);
        const result = await withTraceSpan(
          {
            service: 'retorno',
            spanName: 'handler',
            context,
            sink: options.traceSink,
            now: options.now,
          },
          async () => processor.process(validation.envelope),
        );
        const resultContext = contextFromEnvelope(validation.envelope, {
          batchId: result.record.batchId,
          protocol: result.record.protocol,
          receipt: result.record.receipt,
        });
        logStage(logger, 'publish', 'Return spool and audit events published.', resultContext);
        const metricName = metricNameForStatus(result.record.status);
        if (metricName) metrics.emit(metricName, 1, resultContext);
      } catch (error) {
        if (error instanceof SyntaxError) {
          await publishMalformedJson(processor, body, error, itemIdentifier, batchItemFailures);
          metrics.emit(ESOCIAL_METRIC_NAMES.dlq, 1, baseContext);
          logStage(logger, 'publish', 'Malformed JSON routed to return DLQ.', baseContext, error);
          continue;
        }

        batchItemFailures.push({ itemIdentifier });
        logStage(logger, 'publish', 'Unexpected return failure returned to SQS.', baseContext, error);
      }
    }

    return { batchItemFailures };
  };
}

let defaultHandler: ((event: SqsReturnEvent) => Promise<SqsBatchResponse>) | undefined;

export async function handler(event: SqsReturnEvent): Promise<SqsBatchResponse> {
  defaultHandler ??= createReturnHandler();
  return defaultHandler(event);
}

async function publishMalformedJson(
  processor: ReturnProcessor,
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
