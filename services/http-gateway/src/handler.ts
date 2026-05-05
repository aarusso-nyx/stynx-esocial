import { handlerResult } from '@esocial/service-shared';

import type {
  HttpGatewayEvent,
  HttpGatewayResponse,
} from './dlq/replay.js';

export type CreateHttpGatewayHandlerOptions = Readonly<{
  dlqReplayHandler?: ((event: HttpGatewayEvent) => Promise<HttpGatewayResponse>) | undefined;
}>;

export function createHttpGatewayHandler(
  options: CreateHttpGatewayHandlerOptions = {},
) {
  return async (event: { Records?: unknown[] } & HttpGatewayEvent) => {
    if (isDlqReplay(event) && options.dlqReplayHandler) {
      return options.dlqReplayHandler(event);
    }

    if (isDlqReplay(event)) {
      return {
        statusCode: 501,
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          error: 'dlq_replay_repository_not_configured',
        }),
      };
    }

    return handlerResult('esocial-http-gateway', event.Records?.length ?? 0);
  };
}

export async function handler(event: { Records?: unknown[] } & HttpGatewayEvent) {
  return createHttpGatewayHandler()(event);
}

function isDlqReplay(event: HttpGatewayEvent): boolean {
  return event.httpMethod === 'POST' &&
    /^\/dlq\/[^/]+\/replay$/u.test(event.path ?? '');
}
