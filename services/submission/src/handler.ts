import type { EsocialContractError } from '@esocial/contracts';
import {
  RetryableSubmissionError,
  SubmissionProcessor,
  TerminalSubmissionError,
  validateIngressEnvelope,
} from '@esocial/domain';
import type {
  SubmissionPublishers,
  SubmissionRepository,
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
  now?: (() => Date) | undefined;
}>;

export function createSubmissionHandler(
  options: CreateSubmissionHandlerOptions = {},
): (event: SqsSubmissionEvent) => Promise<SqsBatchResponse> {
  const processor = options.processor ?? createDefaultProcessor(options);

  return async (event: SqsSubmissionEvent): Promise<SqsBatchResponse> => {
    const batchItemFailures: { itemIdentifier: string }[] = [];

    for (const [index, record] of (event.Records ?? []).entries()) {
      const itemIdentifier = record.messageId ?? record.messageID ?? `record-${index}`;
      const body = record.body ?? '';

      try {
        const parsed = JSON.parse(body) as unknown;
        const validation = validateIngressEnvelope(parsed, body);

        if (!validation.ok) {
          await processor.publishMalformedToDlq(validation);
          continue;
        }

        await processor.process(validation.envelope);
      } catch (error) {
        if (error instanceof RetryableSubmissionError) {
          batchItemFailures.push({ itemIdentifier });
          continue;
        }

        if (error instanceof SyntaxError) {
          await publishMalformedJson(processor, body, error, itemIdentifier, batchItemFailures);
          continue;
        }

        if (error instanceof TerminalSubmissionError) {
          continue;
        }

        batchItemFailures.push({ itemIdentifier });
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
