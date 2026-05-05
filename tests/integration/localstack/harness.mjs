import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

import { buildEsocialIdempotencyKey } from '../../../packages/contracts/dist/idempotency.js';
import { createSubmissionHandler } from '../../../services/submission/dist/handler.js';
import {
  createPostgresSubmissionRepository,
} from '../../../services/submission/dist/postgres-submission-repository.js';

const root = new URL('../../..', import.meta.url).pathname;
const adminUrl = process.env.ESOCIAL_TEST_ADMIN_URL
  ?? process.env.ESOCIAL_DATABASE_URL
  ?? defaultAdminUrl();
const fixedNow = new Date('2026-05-05T12:00:00.000Z');

async function main() {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const databaseName = `esocial_localstack_${suffix}`;
  const databaseUrl = withDatabase(adminUrl, databaseName);
  const workerRole = `esocial_localstack_worker_${suffix}`;
  const workerPassword = `p${randomUUID().replaceAll('-', '')}`;
  const workerUrl = roleUrl(databaseUrl, workerRole, workerPassword);
  const startedAt = Date.now();
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

    const requestQueue = new LocalFifoQueue('sgp.esocial.submit.request.qualification.fifo');
    const responseQueue = new LocalFifoQueue('sgp.esocial.submit.response.qualification.fifo');
    const spoolQueue = new LocalFifoQueue('sgp.esocial.spool.update.qualification.fifo');
    const retryQueue = new LocalFifoQueue('sgp.esocial.retry.qualification.fifo');
    const dlqQueue = new LocalFifoQueue('sgp.esocial.submit.dlq.qualification.fifo');
    const auditBus = new LocalEventBus('esocial-qualification-events');
    const envelope = submissionEnvelope();
    const handler = createSubmissionHandler({
      repository,
      publishers: {
        response: responseQueue.publisher(),
        spool: spoolQueue.publisher(),
        audit: auditBus.publisher(),
        retry: retryQueue.publisher(),
        dlq: dlqQueue.publisher(),
      },
      now: () => fixedNow,
    });

    requestQueue.enqueueEnvelope(envelope);
    assert.deepEqual(await handler(requestQueue.receiveSqsEvent()), {
      batchItemFailures: [],
    });

    assert.equal(responseQueue.messages.length, 1, 'response queue publish count');
    assert.equal(spoolQueue.messages.length, 1, 'spool queue publish count');
    assert.equal(auditBus.events.length, 1, 'audit event count');
    assert.equal(retryQueue.messages.length, 0, 'retry queue should remain empty');
    assert.equal(dlqQueue.messages.length, 0, 'dlq queue should remain empty');
    assert.equal(
      responseQueue.messages[0].command.envelope.payload.route,
      'periodic',
      'S-1299 should route to the periodic builder lane',
    );
    assert.equal(
      queryScalar(workerUrl, 'SELECT count(*) FROM esocial.event_record;'),
      '1',
      'one event_record row',
    );
    assert.equal(
      queryScalar(workerUrl, 'SELECT lower(status) FROM esocial.event_record;'),
      'building',
      'persisted event_record status',
    );

    const latencyMs = Date.now() - startedAt;
    console.log(
      `[integration:localstack] local queue/event/PostgreSQL round trip completed in ${latencyMs}ms ` +
      `(request=${requestQueue.name}, response=${responseQueue.messages.length}, ` +
      `spool=${spoolQueue.messages.length}, audit=${auditBus.events.length})`,
    );
  } finally {
    if (repository) await repository.close();
    cleanup(databaseName, workerRole);
  }
}

class LocalFifoQueue {
  constructor(name) {
    this.name = name;
    this.messages = [];
  }

  enqueueEnvelope(envelope) {
    this.messages.push({
      messageId: randomUUID(),
      body: envelope,
    });
  }

  receiveSqsEvent() {
    const records = this.messages.splice(0).map((message) => ({
      messageId: message.messageId,
      body: JSON.stringify(message.body),
    }));

    return { Records: records };
  }

  publisher() {
    return {
      publish: async (command) => {
        this.messages.push({
          messageId: randomUUID(),
          command,
        });
      },
    };
  }
}

class LocalEventBus {
  constructor(name) {
    this.name = name;
    this.events = [];
  }

  publisher() {
    return {
      publish: async (command) => {
        this.events.push({
          busName: this.name,
          source: 'esocial.submission',
          detailType: command.envelope.action,
          command,
        });
      },
    };
  }
}

function submissionEnvelope() {
  const tenantId = '00000000-0000-4000-8000-000000000901';
  const environment = 'QUALIFICATION';
  const eventClass = 'S-1299';
  const sourceEventId = '10000000-0000-4000-8000-000000000901';
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
    'reply-to': 'sgp.esocial.submit.response.qualification.fifo',
    'dead-letter-topic': 'sgp.esocial.submit.dlq.qualification.fifo',
    payload: {
      batchId: '20000000-0000-4000-8000-000000000901',
      environment,
      endpointUrl: 'https://sandbox.esocial.example.test/submit',
      eventIds: ['30000000-0000-4000-8000-000000000901'],
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

function psql(databaseUrl, sql) {
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

await main();
