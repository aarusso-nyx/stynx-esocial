import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const root = new URL('../..', import.meta.url).pathname;
const adminUrl = process.env.ESOCIAL_TEST_ADMIN_URL
  ?? process.env.DATABASE_URL
  ?? defaultAdminUrl();

test('fresh migrations enforce tenant RLS, idempotency, and append-only history', () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const databaseName = `esocial_test_${suffix}`;
  const databaseUrl = withDatabase(adminUrl, databaseName);
  const appRole = `esocial_app_${suffix}`;
  const workerRole = `esocial_worker_${suffix}`;
  const appPassword = `p${randomUUID().replaceAll('-', '')}`;
  const workerPassword = `p${randomUUID().replaceAll('-', '')}`;
  const appUrl = roleUrl(databaseUrl, appRole, appPassword);
  const workerUrl = roleUrl(databaseUrl, workerRole, workerPassword);

  try {
    createDatabase(databaseName);
    runNode(['scripts/migrate-dev.mjs'], {
      DATABASE_URL: databaseUrl,
    });
    runNode(['scripts/migrate-dev.mjs'], {
      DATABASE_URL: databaseUrl,
    });

    psql(databaseUrl, `
      CREATE ROLE ${quoteIdent(appRole)} LOGIN PASSWORD ${quoteLiteral(appPassword)};
      CREATE ROLE ${quoteIdent(workerRole)} LOGIN PASSWORD ${quoteLiteral(workerPassword)};
      GRANT esocial_app TO ${quoteIdent(appRole)};
      GRANT esocial_worker TO ${quoteIdent(workerRole)};
    `);

    assert.equal(countRelations(databaseUrl, 'BASE TABLE', [
      'tenant',
      'tenant_certificate',
      'endpoint_circuit_state',
      'submission_message',
      'submission_batch',
      'event_record',
      'event_retry_schedule',
      'response_classification',
      'dlq_item',
      's1xxx_dispatch_state',
      's1200_emission_state',
      's1202_emission_state',
      's1210_emission_state',
      's1299_emission_state',
      's2200_emission_state',
      's2205_pending_alteration',
      's2210_pending',
      's2220_pending',
      's2230_pending',
      's2240_pending',
      's2298_event',
      's2299_pending',
      's2306_event',
      's3000_request',
      'esocial_totalizer',
      'xsd_validation_failure',
      'audit_event_log',
      'event_status_history',
    ]), 28);
    assert.equal(countRelations(databaseUrl, 'VIEW', [
      'v_competence_periodics_pending',
      'v_event_failures',
    ]), 2);
    assert.equal(psql(databaseUrl, `
      SELECT count(*) >= 13
      FROM esocial.response_classification
      WHERE regulatory_code IS NOT NULL
        AND status IN ('accepted', 'rejected', 'retry', 'timeout', 'dlq', 'failed');
    `).stdout.trim(), 't');
    assert.equal(psql(databaseUrl, `
      SELECT status || ':' || retryable::text
      FROM esocial.response_classification
      WHERE regulatory_code = '503'
        AND environment = 'ANY';
    `).stdout.trim(), 'retry:true');

    const tenantA = '00000000-0000-4000-8000-0000000000a1';
    const tenantB = '00000000-0000-4000-8000-0000000000b2';

    psql(appUrl, `
      SET app.current_tenant_id = ${quoteLiteral(tenantA)};
      INSERT INTO esocial.tenant (tenant_id, tenant_code, display_name)
      VALUES (${quoteLiteral(tenantA)}, 'tenant-a', 'Tenant A');
    `);
    psql(appUrl, `
      SET app.current_tenant_id = ${quoteLiteral(tenantB)};
      INSERT INTO esocial.tenant (tenant_id, tenant_code, display_name)
      VALUES (${quoteLiteral(tenantB)}, 'tenant-b', 'Tenant B');
    `);

    assert.equal(psql(appUrl, `
      SET app.current_tenant_id = ${quoteLiteral(tenantA)};
      SELECT string_agg(tenant_code, ',' ORDER BY tenant_code)
      FROM esocial.tenant;
    `).stdout.trim(), 'tenant-a');
    assert.equal(psql(appUrl, `
      SET app.current_tenant_id = ${quoteLiteral(tenantB)};
      SELECT string_agg(tenant_code, ',' ORDER BY tenant_code)
      FROM esocial.tenant;
    `).stdout.trim(), 'tenant-b');

    assert.equal(psql(workerUrl, `
      SELECT count(*) FROM esocial.tenant;
    `).stdout.trim(), '2');

    const invalidSecretRef = psql(appUrl, `
      SET app.current_tenant_id = ${quoteLiteral(tenantA)};
      INSERT INTO esocial.tenant_certificate (
        tenant_id,
        environment,
        secret_ref,
        certificate_fingerprint_sha256,
        valid_from,
        valid_until
      )
      VALUES (
        ${quoteLiteral(tenantA)},
        'QUALIFICATION',
        'local-test-secret',
        'sha256:invalid-secret-ref',
        now(),
        now() + interval '1 year'
      );
    `, { expectFailure: true });
    assert.match(invalidSecretRef.stderr, /tenant_certificate_secret_ref_arn_check/u);

    psql(appUrl, `
      SET app.current_tenant_id = ${quoteLiteral(tenantA)};
      INSERT INTO esocial.tenant_certificate (
        tenant_id,
        environment,
        label,
        secret_ref,
        certificate_fingerprint_sha256,
        valid_from,
        valid_until
      )
      VALUES (
        ${quoteLiteral(tenantA)},
        'QUALIFICATION',
        'tenant-a qualification',
        'arn:aws:secretsmanager:sa-east-1:123456789012:secret:esocial/tenant-a/cert-AbCd12',
        'sha256:valid-secret-ref',
        now(),
        now() + interval '1 year'
      );
    `);

    psql(appUrl, `
      SET app.current_tenant_id = ${quoteLiteral(tenantA)};
      INSERT INTO esocial.submission_message (
        message_id,
        tenant_id,
        kind,
        event_class,
        payload_hash,
        payload,
        status,
        environment,
        idempotency_key
      )
      VALUES (
        '30000000-0000-4000-8000-000000000001',
        ${quoteLiteral(tenantA)},
        'submit',
        'S-1299',
        'payload-hash-message-1',
        '{}'::jsonb,
        'building',
        'QUALIFICATION',
        'idem-message-duplicate'
      );
    `);

    const duplicateMessage = psql(appUrl, `
      SET app.current_tenant_id = ${quoteLiteral(tenantA)};
      INSERT INTO esocial.submission_message (
        message_id,
        tenant_id,
        kind,
        event_class,
        payload_hash,
        payload,
        status,
        environment,
        idempotency_key
      )
      VALUES (
        '30000000-0000-4000-8000-000000000002',
        ${quoteLiteral(tenantA)},
        'retorno',
        'S-1299',
        'payload-hash-message-2',
        '{}'::jsonb,
        'accepted',
        'QUALIFICATION',
        'idem-message-duplicate'
      );
    `, { expectFailure: true });
    assert.match(duplicateMessage.stderr, /submission_message_transport_idempotency_ux/u);

    const sourceEvent = '10000000-0000-4000-8000-000000000001';
    psql(appUrl, `
      SET app.current_tenant_id = ${quoteLiteral(tenantA)};
      INSERT INTO esocial.event_record (
        event_record_id,
        tenant_id,
        source_event_id,
        environment,
        event_class,
        competence,
        payload_hash,
        status,
        operation
      )
      VALUES (
        '20000000-0000-4000-8000-000000000001',
        ${quoteLiteral(tenantA)},
        ${quoteLiteral(sourceEvent)},
        'QUALIFICATION',
        'S-1299',
        '2026-05',
        'payload-hash-duplicate',
        'PENDING',
        'ORIGINAL'
      );
    `);

    const duplicate = psql(appUrl, `
      SET app.current_tenant_id = ${quoteLiteral(tenantA)};
      INSERT INTO esocial.event_record (
        event_record_id,
        tenant_id,
        source_event_id,
        environment,
        event_class,
        competence,
        payload_hash,
        status,
        operation
      )
      VALUES (
        '20000000-0000-4000-8000-000000000002',
        ${quoteLiteral(tenantA)},
        ${quoteLiteral(sourceEvent)},
        'QUALIFICATION',
        'S-1299',
        '2026-05',
        'payload-hash-duplicate',
        'PENDING',
        'ORIGINAL'
      );
    `, { expectFailure: true });
    assert.match(duplicate.stderr, /event_record_regulatory_idempotency_ux/u);

    psql(workerUrl, `
      INSERT INTO esocial.dlq_item (
        tenant_id,
        environment,
        event_class,
        original_envelope,
        last_classification,
        attempt_history,
        hashes,
        replay_hint
      )
      VALUES
        (
          ${quoteLiteral(tenantA)},
          'QUALIFICATION',
          'S-1299',
          '{"request-id":"dlq-a"}'::jsonb,
          '{"category":"validation"}'::jsonb,
          '[]'::jsonb,
          '{"original_envelope_sha256":"sha256:a"}'::jsonb,
          '{"eligible":true}'::jsonb
        ),
        (
          ${quoteLiteral(tenantB)},
          'QUALIFICATION',
          'S-1299',
          '{"request-id":"dlq-b"}'::jsonb,
          '{"category":"validation"}'::jsonb,
          '[]'::jsonb,
          '{"original_envelope_sha256":"sha256:b"}'::jsonb,
          '{"eligible":true}'::jsonb
        );
    `);
    assert.equal(psql(appUrl, `
      SET app.current_tenant_id = ${quoteLiteral(tenantA)};
      SELECT count(*) FROM esocial.dlq_item;
    `).stdout.trim(), '1');
    assert.equal(psql(workerUrl, `
      SELECT count(*) FROM esocial.dlq_item;
    `).stdout.trim(), '2');
    assert.equal(psql(appUrl, `
      SET app.current_tenant_id = ${quoteLiteral(tenantB)};
      SELECT count(*) FROM esocial.dlq_item;
    `).stdout.trim(), '1');

    psql(workerUrl, `
      INSERT INTO esocial.event_status_history (
        tenant_id,
        event_record_id,
        from_status,
        to_status,
        reason_code
      )
      VALUES (
        ${quoteLiteral(tenantA)},
        '20000000-0000-4000-8000-000000000001',
        'PENDING',
        'SENT',
        'TEST'
      );

      INSERT INTO esocial.audit_event_log (
        tenant_id,
        event_record_id,
        event_type,
        payload
      )
      VALUES (
        ${quoteLiteral(tenantA)},
        '20000000-0000-4000-8000-000000000001',
        'status.transition',
        '{"source":"db-test"}'::jsonb
      );
    `);
    assert.equal(psql(appUrl, `
      SET app.current_tenant_id = ${quoteLiteral(tenantB)};
      SELECT count(*) FROM esocial.event_status_history;
    `).stdout.trim(), '0');
    psql(workerUrl, `
      INSERT INTO esocial.audit_event_log (
        tenant_id,
        event_record_id,
        event_type,
        payload
      )
      VALUES (
        ${quoteLiteral(tenantB)},
        NULL,
        'rls.cross_tenant_select_denied',
        '{"source":"db-test","tenant_visible_to_app":false}'::jsonb
      );
    `);
    assert.equal(psql(workerUrl, `
      SELECT count(*) FROM esocial.audit_event_log;
    `).stdout.trim(), '2');

    assert.match(psql(workerUrl, `
      UPDATE esocial.event_status_history
      SET to_status = 'ACCEPTED';
    `, { expectFailure: true }).stderr, /permission denied|append-only/iu);

    assert.match(psql(workerUrl, `
      DELETE FROM esocial.audit_event_log;
    `, { expectFailure: true }).stderr, /permission denied|append-only/iu);

    assert.match(psql(workerUrl, `
      TRUNCATE esocial.audit_event_log;
    `, { expectFailure: true }).stderr, /permission denied|append-only|must be owner/iu);

    assert.match(psql(workerUrl, `
      TRUNCATE esocial.event_status_history;
    `, { expectFailure: true }).stderr, /permission denied|append-only|must be owner/iu);

    psql(workerUrl, `
      INSERT INTO esocial.lgpd_approval (
        batch_id,
        tenant_id,
        approver_role,
        approver_actor,
        approval_reason
      )
      VALUES (
        '90000000-0000-4000-8000-000000000001',
        ${quoteLiteral(tenantA)},
        'Data Protection Officer',
        'Data Protection Officer (TBD)',
        'db test approval gate'
      );
    `);
    assert.match(psql(workerUrl, `
      UPDATE esocial.lgpd_approval
      SET approval_reason = 'mutated';
    `, { expectFailure: true }).stderr, /permission denied|append-only/iu);
    assert.match(psql(workerUrl, `
      DELETE FROM esocial.lgpd_approval;
    `, { expectFailure: true }).stderr, /permission denied|append-only/iu);
  } finally {
    cleanup(databaseName, appRole, workerRole);
  }
});

function createDatabase(databaseName) {
  const maintenanceUrl = withDatabase(adminUrl, 'postgres');
  psql(maintenanceUrl, `CREATE DATABASE ${quoteIdent(databaseName)};`);
}

function countRelations(databaseUrl, tableType, names) {
  const rows = psql(databaseUrl, `
    SELECT count(*)
    FROM information_schema.tables
    WHERE table_schema = 'esocial'
      AND table_type = ${quoteLiteral(tableType)}
      AND table_name = ANY (ARRAY[${names.map(quoteLiteral).join(', ')}]);
  `).stdout.trim();
  return Number(rows);
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

function roleUrl(databaseUrl, username, password) {
  const parsed = new URL(databaseUrl);
  parsed.username = username;
  parsed.password = password;
  if (!parsed.hostname) {
    parsed.hostname = 'localhost';
  }
  return parsed.toString();
}

function quoteLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function quoteIdent(value) {
  return `"${value.replaceAll('"', '""')}"`;
}
