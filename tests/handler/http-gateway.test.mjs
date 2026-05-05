import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createHttpGatewayHandler } from '../../services/http-gateway/dist/handler.js';

test('default DLQ replay route rejects unauthenticated requests before repository wiring', async () => {
  const handler = createHttpGatewayHandler();

  const response = await handler({
    httpMethod: 'POST',
    path: '/dlq/dlq-1/replay',
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(JSON.parse(response.body), { error: 'iam_sigv4_required' });
});

test('default DLQ replay route remains explicit when authenticated but repository is not configured', async () => {
  const handler = createHttpGatewayHandler();

  const response = await handler({
    httpMethod: 'POST',
    path: '/dlq/dlq-1/replay',
    requestContext: {
      identity: {
        userArn: 'arn:aws:iam::123456789012:user/operator',
      },
    },
  });

  assert.equal(response.statusCode, 501);
  assert.deepEqual(JSON.parse(response.body), {
    error: 'dlq_replay_repository_not_configured',
  });
});
