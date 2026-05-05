import assert from 'node:assert/strict';
import { describe } from 'node:test';

import { getBaseUrl, testWhen } from '../../lib/env.mjs';
import { assertPagedResponse, requestJson, unsignedTokenFor } from '../../lib/http.mjs';

const apiBaseUrl = getBaseUrl('QA_API_BASE_URL', ['API_BASE_URL']);
const skipReason = [
  'Set QA_API_BASE_URL or API_BASE_URL to run backend e2e tests.',
  'For unsigned QA tokens, start the backend with AUTH_ALLOW_UNSIGNED_TEST_TOKENS=true.',
].join(' ');

describe('SGP backend auth and domain e2e', () => {
  testWhen(
    'uses the standard unauthorized error shape for protected endpoints',
    apiBaseUrl,
    { skipReason },
    async () => {
      const { response, body } = await requestJson(apiBaseUrl, '/api/v1/auth/me');

      assert.equal(response.status, 401);
      assert.equal(body.error.code, 'UNAUTHORIZED');
      assert.equal(body.error.status, 401);
      assert.equal(body.error.path, '/api/v1/auth/me');
      assert.equal(typeof body.error.requestId, 'string');
    },
  );

  testWhen(
    'maps Cognito groups to permissions for the current session',
    apiBaseUrl,
    { skipReason },
    async () => {
      const { response, body } = await requestJson(apiBaseUrl, '/api/v1/auth/me', {
        headers: { authorization: `Bearer ${unsignedTokenFor(['SGP_RH'])}` },
      });

      assert.equal(response.status, 200);
      assert.equal(body.authenticated, true);
      assert.equal(body.actor.username, 'qa.test');
      assert.deepEqual(body.actor.groups, ['SGP_RH']);
      assert.ok(body.actor.permissions.includes('rh:read'));
      assert.ok(body.actor.permissions.includes('rh:write'));
    },
  );

  testWhen(
    'rejects tokens that do not carry a tenant claim',
    apiBaseUrl,
    { skipReason },
    async () => {
      const { response, body } = await requestJson(apiBaseUrl, '/api/v1/auth/me', {
        headers: {
          authorization: `Bearer ${unsignedTokenFor(['SGP_RH'], {
            'custom:tenant_id': undefined,
            tenant_id: undefined,
          })}`,
        },
      });

      assert.equal(response.status, 401);
      assert.equal(body.error.code, 'UNAUTHORIZED');
      assert.equal(body.error.status, 401);
    },
  );

  testWhen(
    'enforces permissions on protected domain resources',
    apiBaseUrl,
    { skipReason },
    async () => {
      const { response, body } = await requestJson(apiBaseUrl, '/api/v1/master-data', {
        headers: { authorization: `Bearer ${unsignedTokenFor(['SGP_CONVENIO'])}` },
      });

      assert.equal(response.status, 403);
      assert.equal(body.error.code, 'FORBIDDEN');
      assert.equal(body.error.status, 403);
    },
  );

  testWhen(
    'returns representative paged data for an allowed domain read',
    apiBaseUrl,
    { skipReason },
    async () => {
      const { response, body } = await requestJson(
        apiBaseUrl,
        '/api/v1/master-data?page=1&pageSize=2&search=gestao',
        { headers: { authorization: `Bearer ${unsignedTokenFor(['SGP_ADMIN'])}` } },
      );

      assert.equal(response.status, 200);
      assertPagedResponse(body);
      assert.equal(body.page, 1);
      assert.equal(body.pageSize, 2);
      assert.ok(body.items.length <= 2);
      assert.equal(body.items[0].status, 'observed');
    },
  );

  testWhen(
    'rejects invalid pagination input with validation details',
    apiBaseUrl,
    { skipReason },
    async () => {
      const { response, body } = await requestJson(
        apiBaseUrl,
        '/api/v1/master-data?page=0&pageSize=2',
        {
          headers: { authorization: `Bearer ${unsignedTokenFor(['SGP_ADMIN'])}` },
        },
      );

      assert.equal(response.status, 400);
      assert.equal(body.error.code, 'BAD_REQUEST');
      assert.equal(body.error.status, 400);
      assert.ok(body.error.details.includes('page must not be less than 1'));
    },
  );

  testWhen(
    'creates, updates, and deactivates a Gestao master-data record',
    apiBaseUrl,
    { skipReason },
    async () => {
      const headers = {
        authorization: `Bearer ${unsignedTokenFor(['SGP_ADMIN'])}`,
        'content-type': 'application/json',
      };
      const suffix = Date.now().toString(36);

      const createdResult = await requestJson(apiBaseUrl, '/api/v1/master-data/cargo', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          code: `QA-${suffix}`,
          name: 'Cargo QA',
          description: 'Criado pelo harness QA',
          active: true,
        }),
      });

      assert.equal(createdResult.response.status, 201);
      assert.equal(createdResult.body.code, `QA-${suffix}`);
      assert.equal(createdResult.body.active, true);

      const updatedResult = await requestJson(
        apiBaseUrl,
        `/api/v1/master-data/cargo/${createdResult.body.id}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            code: `QA2-${suffix}`,
            name: 'Cargo QA atualizado',
            description: 'Atualizado pelo harness QA',
            active: true,
          }),
        },
      );

      assert.equal(updatedResult.response.status, 200);
      assert.equal(updatedResult.body.code, `QA2-${suffix}`);
      assert.equal(updatedResult.body.name, 'Cargo QA atualizado');

      const deactivatedResult = await requestJson(
        apiBaseUrl,
        `/api/v1/master-data/cargo/${createdResult.body.id}`,
        {
          method: 'DELETE',
          headers: { authorization: headers.authorization },
        },
      );

      assert.equal(deactivatedResult.response.status, 200);
      assert.equal(deactivatedResult.body.active, false);
    },
  );
});
