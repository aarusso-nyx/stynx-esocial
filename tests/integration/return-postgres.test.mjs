import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  ReturnProcessor,
} from '../../packages/domain/dist/index.js';
import {
  createPostgresReturnRepository,
} from '../../services/retorno/dist/postgres-return-repository.js';

const root = new URL('../..', import.meta.url).pathname;
const adminUrl = process.env.ESOCIAL_TEST_ADMIN_URL
  ?? process.env.ESOCIAL_DATABASE_URL
  ?? defaultAdminUrl();
const fixedNow = new Date('2026-05-05T12:00:00.000Z');

test('return processor persists status and totalizer evidence against the esocial schema', async () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const databaseName = `esocial_phase7_${suffix}`;
  const databaseUrl = withDatabase(adminUrl, databaseName);
  const workerRole = `esocial_phase7_worker_${suffix}`;
  const workerPassword = `p${randomUUID().replaceAll('-', '')}`;
  const workerUrl = roleUrl(databaseUrl, workerRole, workerPassword);
  const tenantId = '00000000-0000-4000-8000-000000000721';
  const eventRecordId = '00000000-0000-4000-8000-000000000722';
  const batchId = '00000000-0000-4000-8000-000000000723';
  const messageId = '00000000-0000-4000-8000-000000000724';
  let repository;

  try {
    runNode(['scripts/check-migrations.mjs', 'migrate:dev'], {
      ESOCIAL_DATABASE_URL: databaseUrl,
    });

    psql(databaseUrl, `
      CREATE ROLE ${quoteIdent(workerRole)} LOGIN PASSWORD ${quoteLiteral(workerPassword)};
      GRANT esocial_worker TO ${quoteIdent(workerRole)};
    `);
    psql(workerUrl, `
      INSERT INTO esocial.tenant (tenant_id, tenant_code, display_name)
      VALUES (${quoteLiteral(tenantId)}, 'phase7', 'Phase 7');

      INSERT INTO esocial.submission_message (
        message_id,
        tenant_id,
        kind,
        event_class,
        payload_hash,
        payload,
        status,
        attempt,
        request_id,
        correlation_id,
        idempotency_key,
        environment,
        source_ref
      )
      VALUES (
        ${quoteLiteral(messageId)},
        ${quoteLiteral(tenantId)},
        'submit',
        'S-1299',
        'sha256:submit',
        '{}'::jsonb,
        'sent',
        1,
        'submit-request',
        'submit-correlation',
        'submit-idempotency',
        'QUALIFICATION',
        '{}'::jsonb
      );

      INSERT INTO esocial.submission_batch (
        batch_id,
        tenant_id,
        message_id,
        environment,
        event_class,
        source_ref,
        payload_hash,
        status,
        protocol_number
      )
      VALUES (
        ${quoteLiteral(batchId)},
        ${quoteLiteral(tenantId)},
        ${quoteLiteral(messageId)},
        'QUALIFICATION',
        'S-1299',
        '{}'::jsonb,
        'sha256:batch',
        'sent',
        '1.2.202605.000000000000000001'
      );

      INSERT INTO esocial.event_record (
        event_record_id,
        tenant_id,
        source_event_id,
        environment,
        event_class,
        competence,
        payload_hash,
        status,
        operation,
        batch_id
      )
      VALUES (
        ${quoteLiteral(eventRecordId)},
        ${quoteLiteral(tenantId)},
        '00000000-0000-4000-8000-000000000725',
        'QUALIFICATION',
        'S-1299',
        '2026-01',
        'sha256:event',
        'SENT',
        'ORIGINAL',
        ${quoteLiteral(batchId)}
      );
    `);

    repository = createPostgresReturnRepository({
      connectionString: workerUrl,
    });
    const published = createRecordingPublishers();
    const processor = new ReturnProcessor({
      repository,
      publishers: published.publishers,
      now: () => fixedNow,
    });

    const result = await processor.process(
      returnEnvelope({
        tenantId,
        eventRecordId,
        batchId,
        rawResponseXml: liftedParserFixture('s5011-totalizer.golden.xml'),
      }),
    );

    assert.equal(result.record.status, 'accepted');
    assert.equal(result.record.totalizerClass, 'S-5011');
    assert.match(result.record.totalizerId, /^[0-9a-f-]{36}$/u);
    assert.equal(queryScalar(workerUrl, 'SELECT lower(status) FROM esocial.event_record;'), 'accepted');
    assert.equal(queryScalar(workerUrl, 'SELECT count(*) FROM esocial.event_status_history;'), '1');
    assert.equal(queryScalar(workerUrl, 'SELECT count(*) FROM esocial.audit_event_log;'), '1');
    assert.equal(queryScalar(workerUrl, 'SELECT totalizer_class FROM esocial.esocial_totalizer;'), 'S-5011');
    assert.equal(queryScalar(workerUrl, 'SELECT receipt_number FROM esocial.esocial_totalizer;'), result.record.receipt);
    assert.equal(published.spool.length, 1);
    assert.equal(published.spool[0].envelope.event_class, 'S-5011');
    assert.equal(published.spool[0].envelope.response_payload.batch_id, batchId);
    assert.equal(published.spool[0].envelope.response_payload.event_record_id, eventRecordId);
    assert.equal(published.audit.length, 1);
  } finally {
    if (repository) await repository.close();
    cleanup(databaseName, workerRole);
  }
});

function createRecordingPublishers() {
  const published = {
    spool: [],
    audit: [],
    dlq: [],
  };

  return {
    ...published,
    publishers: {
      spool: publisher('spool', published),
      audit: publisher('audit', published),
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

function returnEnvelope(input) {
  return {
    version: 'v1',
    family: 'request',
    'request-id': randomUUID(),
    'correlation-id': randomUUID(),
    'idempotency-key': `return:${input.batchId}:s5011`,
    created_at: fixedNow.toISOString(),
    tenant_id: input.tenantId,
    environment: 'QUALIFICATION',
    event_class: 'S-1299',
    source: {
      source_event_id: '00000000-0000-4000-8000-000000000725',
      source_entity_id: 'closure-2026-01',
      payroll_run_id: 'payroll-2026-01',
    },
    kind: 'retorno',
    payload_hash: 'sha256:return',
    attempt: 1,
    'max-attempts': 3,
    'reply-to': 'sgp.esocial.spool.update',
    'dead-letter-topic': 'sgp.esocial.dlq',
    payload: {
      eventRecordId: input.eventRecordId,
      batchId: input.batchId,
      previousStatus: 'sent',
      sourceEventClass: 'S-1299',
      rawResponseXml: input.rawResponseXml,
    },
  };
}

function liftedParserFixture(fileName) {
  return readFileSync(
    join(
      root,
      'packages/domain/src/sgp-lifted/esocial-worker/parsers/__fixtures__',
      fileName,
    ),
    'utf8',
  );
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
