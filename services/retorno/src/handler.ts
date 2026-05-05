import {
  ReturnProcessor,
  validateReturnIngressEnvelope,
} from '@esocial/domain';
import type {
  ReturnPublishers,
  ReturnRepository,
} from '@esocial/domain';
import type { EsocialContractError } from '@esocial/contracts';

import { createPostgresReturnRepositoryFromEnv } from './postgres-return-repository.js';
import { createAwsReturnPublishersFromEnv } from './transport-publishers.js';

export type SqsReturnRecord = Readonly<{
  messageId?: string;
  messageID?: string;
  body?: string;
}>;

export type SqsReturnEvent = Readonly<{
  Records?: readonly SqsReturnRecord[];
}>;

export type SqsBatchResponse = Readonly<{
  batchItemFailures: readonly {
    itemIdentifier: string;
  }[];
}>;

export type CreateReturnHandlerOptions = Readonly<{
  processor?: ReturnProcessor;
  repository?: ReturnRepository;
  publishers?: ReturnPublishers;
  now?: () => Date;
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

  return async (event: SqsReturnEvent): Promise<SqsBatchResponse> => {
    const batchItemFailures: { itemIdentifier: string }[] = [];

    for (const [index, record] of (event.Records ?? []).entries()) {
      const itemIdentifier = record.messageId ?? record.messageID ?? `record-${index}`;
      const body = record.body ?? '';

      try {
        const parsed = JSON.parse(body) as unknown;
        const validation = validateReturnIngressEnvelope(parsed, body);

        if (!validation.ok) {
          await processor.publishMalformedToDlq(validation);
          continue;
        }

        await processor.process(validation.envelope);
      } catch (error) {
        if (error instanceof SyntaxError) {
          await publishMalformedJson(processor, body, error, itemIdentifier, batchItemFailures);
          continue;
        }

        batchItemFailures.push({ itemIdentifier });
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
