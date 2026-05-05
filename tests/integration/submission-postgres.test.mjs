import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import { buildEsocialIdempotencyKey } from '../../packages/contracts/src/idempotency.ts';
import { createSubmissionHandler } from '../../services/submission/dist/handler.js';
import {
  createPostgresSubmissionRepository,
} from '../../services/submission/dist/postgres-submission-repository.js';

const root = new URL('../..', import.meta.url).pathname;
const adminUrl = process.env.ESOCIAL_TEST_ADMIN_URL
  ?? process.env.ESOCIAL_DATABASE_URL
  ?? defaultAdminUrl();
const fixedNow = new Date('2026-05-04T12:00:00.000Z');

test('submission handler persists and deduplicates against the esocial schema', async () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const databaseName = `esocial_phase4_${suffix}`;
  const databaseUrl = withDatabase(adminUrl, databaseName);
  const workerRole = `esocial_phase4_worker_${suffix}`;
  const workerPassword = `p${randomUUID().replaceAll('-', '')}`;
  const workerUrl = roleUrl(databaseUrl, workerRole, workerPassword);
  let repository;

  try {
    runNode(['scripts/check-migrations.mjs', 'migrate:dev'], {
      ESOCIAL_DATABASE_URL: databaseUrl,
    });

    psql(databaseUrl, `
      CREATE ROLE ${quoteIdent(workerRole)} LOGIN PASSWORD ${quoteLiteral(workerPassword)};
      GRANT esocial_worker TO ${quoteIdent(workerRole)};
    `);

    repository = createPostgresSubmissionRepository({
      connectionString: workerUrl,
    });
    const published = createRecordingPublishers();
    const handler = createSubmissionHandler({
      repository,
      publishers: published.publishers,
      now: () => fixedNow,
    });
    const envelope = submissionEnvelope();

    assert.deepEqual(await handler(sqsEvent(envelope, 'pg-first')), {
      batchItemFailures: [],
    });
    assert.deepEqual(await handler(sqsEvent(envelope, 'pg-duplicate')), {
      batchItemFailures: [],
    });

    assert.equal(queryScalar(workerUrl, 'SELECT count(*) FROM esocial.submission_message;'), '1');
    assert.equal(queryScalar(workerUrl, 'SELECT count(*) FROM esocial.submission_batch;'), '1');
    assert.equal(queryScalar(workerUrl, 'SELECT count(*) FROM esocial.event_record;'), '1');
    assert.equal(queryScalar(workerUrl, 'SELECT lower(status) FROM esocial.event_record;'), 'building');
    assert.equal(published.response.length, 2);
    assert.equal(published.response[1].envelope.payload.duplicate, true);
  } finally {
    if (repository) await repository.close();
    cleanup(databaseName, workerRole);
  }
});

function createRecordingPublishers() {
  const published = {
    response: [],
    spool: [],
    audit: [],
    retry: [],
    dlq: [],
  };

  return {
    ...published,
    publishers: {
      response: publisher('response', published),
      spool: publisher('spool', published),
      audit: publisher('audit', published),
      retry: publisher('retry', published),
      dlq: publisher('dlq', published),
    },
  };
}

function publisher(family, published) {
  return {
    async publish(command) {
      published[family].push(command);
    },
  };
}

function sqsEvent(envelope, messageId) {
  return {
    Records: [
      {
        messageId,
        body: JSON.stringify(envelope),
      },
    ],
  };
}

function submissionEnvelope() {
  const tenantId = '00000000-0000-4000-8000-000000000201';
  const environment = 'QUALIFICATION';
  const eventClass = 'S-1299';
  const sourceEventId = '10000000-0000-4000-8000-000000000201';
  const sourceEntityId = 'payroll-run-2026-05';
  const payloadHash = `sha256:${createHash('sha256')
    .update(`${tenantId}:${eventClass}:${sourceEventId}`)
    .digest('hex')}`;
  const idempotency = buildEsocialIdempotencyKey({
    family: 'request',
    tenant_id: tenantId,
    environment,
    event_class: eventClass,
    source_event_id: sourceEventId,
    source_entity_id: sourceEntityId,
    competence: '2026-05',
    payload_hash: payloadHash,
  });

  return {
    version: 'v1',
    family: 'request',
    'request-id': randomUUID(),
    'correlation-id': randomUUID(),
    'idempotency-key': idempotency.value,
    created_at: fixedNow.toISOString(),
    tenant_id: tenantId,
    environment,
    event_class: eventClass,
    source: {
      source_event_id: sourceEventId,
      source_entity_id: sourceEntityId,
      payroll_run_id: 'payroll-2026-05',
    },
    kind: 'submit',
    payload_hash: payloadHash,
    attempt: 1,
    'max-attempts': 3,
    'reply-to': 'sgp.esocial.submit.response',
    'dead-letter-topic': 'sgp.esocial.dlq',
    payload: {
      batchId: '20000000-0000-4000-8000-000000000201',
      environment,
      endpointUrl: 'https://sandbox.esocial.example.test/submit',
      eventIds: ['30000000-0000-4000-8000-000000000201'],
      eventClass,
      signedEnvelope: {
        tenantId,
        eventKind: eventClass,
        payloadXml: '<eSocial />',
        payloadSha256: payloadHash,
        pkcs7Sha256: `sha256:${createHash('sha256').update(`signed:${payloadHash}`).digest('hex')}`,
        signedAt: fixedNow.toISOString(),
      },
    },
  };
}

function runNode(args, extraEnv = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    throw new Error(`node ${args.join(' ')} failed\n${result.stderr}`);
  }

  return result;
}

function queryScalar(databaseUrl, sql) {
  return psql(databaseUrl, sql).stdout.trim();
}

function psql(databaseUrl, sql, options = {}) {
  const result = spawnSync(
    'psql',
    ['-X', '-v', 'ON_ERROR_STOP=1', '-qAt', databaseUrl],
    {
      encoding: 'utf8',
      input: sql,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  if (result.error) {
    throw new Error(`psql failed to start: ${result.error.message}`);
  }

  if (options.expectFailure) {
    assert.notEqual(result.status, 0, 'psql command was expected to fail');
    return result;
  }

  if (result.status !== 0) {
    throw new Error(`psql failed\n${result.stderr}`);
  }

  return result;
}

function cleanup(databaseName, ...roleNames) {
  const maintenanceUrl = withDatabase(adminUrl, 'postgres');
  psql(maintenanceUrl, `DROP DATABASE IF EXISTS ${quoteIdent(databaseName)} WITH (FORCE);`);
  for (const roleName of roleNames) {
    psql(maintenanceUrl, `DROP ROLE IF EXISTS ${quoteIdent(roleName)};`);
  }
}

function defaultAdminUrl() {
  const user = encodeURIComponent(process.env.USER ?? 'postgres');
  return `postgresql://${user}@localhost:5432/postgres`;
}

function withDatabase(databaseUrl, databaseName) {
  const parsed = new URL(databaseUrl);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

function roleUrl(databaseUrl, roleName, password) {
  const parsed = new URL(databaseUrl);
  parsed.username = roleName;
  parsed.password = password;
  return parsed.toString();
}

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
