import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ConfigurationError,
  loadCertificateServiceConfig,
  loadConfig,
  loadReturnServiceConfig,
  loadSubmissionServiceConfig,
  readNodeEnvironment,
  redactConfig,
} from '../../packages/domain/dist/index.js';

const env = {
  NODE_ENV: 'test',
  CI: 'true',
  AWS_REGION: 'sa-east-1',
  AWS_ENDPOINT_URL_SECRETS_MANAGER: 'http://127.0.0.1:4566',
  ESOCIAL_DATABASE_URL: 'postgres://esocial:esocial@127.0.0.1:5432/esocial',
  ESOCIAL_RESPONSE_QUEUE_URL: 'http://127.0.0.1:4566/000000000000/response.fifo',
  ESOCIAL_SPOOL_QUEUE_URL: 'http://127.0.0.1:4566/000000000000/spool.fifo',
  ESOCIAL_RETRY_QUEUE_URL: 'http://127.0.0.1:4566/000000000000/retry.fifo',
  ESOCIAL_DLQ_QUEUE_URL: 'http://127.0.0.1:4566/000000000000/dlq.fifo',
  ESOCIAL_EVENT_BUS_NAME: 'esocial-local',
  ESOCIAL_QUALIFICATION_SOAP_SUBMIT_URL:
    'http://127.0.0.1:9001/esocial/qualification/enviar-lote-eventos',
  ESOCIAL_QUALIFICATION_SOAP_RETURN_URL:
    'http://127.0.0.1:9001/esocial/qualification/consultar-retorno',
};

test('typed config loads runtime and service-specific settings', () => {
  const config = loadConfig(env);

  assert.equal(config.nodeEnv, 'test');
  assert.equal(config.ci, true);
  assert.equal(config.aws.region, 'sa-east-1');
  assert.equal(
    config.soapEndpoints.qualification?.submit,
    env.ESOCIAL_QUALIFICATION_SOAP_SUBMIT_URL,
  );

  assert.equal(loadSubmissionServiceConfig(env).responseQueueUrl, env.ESOCIAL_RESPONSE_QUEUE_URL);
  assert.equal(loadReturnServiceConfig(env).dlqQueueUrl, env.ESOCIAL_DLQ_QUEUE_URL);
  assert.deepEqual(loadCertificateServiceConfig(env), {
    databaseUrl: env.ESOCIAL_DATABASE_URL,
    awsRegion: 'sa-east-1',
    secretsManagerEndpoint: 'http://127.0.0.1:4566',
  });
});

test('typed config rejects invalid or incomplete values', () => {
  assert.throws(
    () => readNodeEnvironment({ NODE_ENV: 'sandbox' }),
    (error) =>
      error instanceof ConfigurationError &&
      error.code === 'CONFIG_NODE_ENV_INVALID',
  );

  assert.throws(
    () => loadConfig({
      ESOCIAL_QUALIFICATION_SOAP_SUBMIT_URL: 'http://127.0.0.1:9001/submit',
    }),
    (error) =>
      error instanceof ConfigurationError &&
      error.code === 'CONFIG_SOAP_ENDPOINT_INCOMPLETE',
  );

  assert.throws(
    () => loadSubmissionServiceConfig({}),
    (error) =>
      error instanceof ConfigurationError &&
      error.key === 'ESOCIAL_DATABASE_URL',
  );
});

test('typed config redacts secrets and endpoint material for diagnostics', () => {
  const redacted = redactConfig(loadConfig(env));

  assert.equal(redacted.databaseUrl, '[configured]');
  assert.deepEqual(redacted.aws, {
    region: 'sa-east-1',
    secretsManagerEndpoint: '[configured]',
  });
  assert.deepEqual(redacted.queues, {
    responseQueueUrl: '[configured]',
    spoolQueueUrl: '[configured]',
    retryQueueUrl: '[configured]',
    dlqQueueUrl: '[configured]',
  });
});
