import assert from 'node:assert/strict';
import { describe } from 'node:test';

import { getBaseUrl, testWhen } from '../../lib/env.mjs';
import { requestJson } from '../../lib/http.mjs';

const apiBaseUrl = getBaseUrl('QA_API_BASE_URL', ['API_BASE_URL']);
const skipReason =
  'Set QA_API_BASE_URL or API_BASE_URL to run API smoke tests against a Nest backend.';

describe('SGP API smoke', () => {
  testWhen('returns root API metadata', apiBaseUrl, { skipReason }, async () => {
    const { response, body } = await requestJson(apiBaseUrl, '/api/v1');

    assert.equal(response.status, 200);
    assert.equal(body.service, 'sgp-core-api');
    assert.equal(body.status, 'ok');
  });

  testWhen(
    'returns health status and keeps request ids visible',
    apiBaseUrl,
    { skipReason },
    async () => {
      const requestId = `qa-smoke-${Date.now()}`;
      const { response, body } = await requestJson(apiBaseUrl, '/api/v1/health', {
        headers: { 'x-request-id': requestId },
      });

      assert.equal(response.status, 200);
      assert.equal(response.headers.get('x-request-id'), requestId);
      assert.equal(body.ok, true);
      assert.equal(body.service, 'sgp-core-api');
    },
  );

  testWhen(
    'returns readiness without exposing configured secret values',
    apiBaseUrl,
    { skipReason },
    async () => {
      const { response, body } = await requestJson(apiBaseUrl, '/api/v1/health/ready');

      assert.equal(response.status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.checks.config.ok, true);
      assert.equal(typeof body.checks.config.auth.jwksConfigured, 'boolean');
      assert.equal(typeof body.checks.config.auth.issuerConfigured, 'boolean');
      assert.equal(typeof body.checks.config.auth.audienceConfigured, 'boolean');
      assert.equal(typeof body.checks.config.auth.unsignedTestTokensEnabled, 'boolean');
      assert.equal(JSON.stringify(body).includes(process.env.APP_PASSWORD ?? '__not_set__'), false);
    },
  );
});
