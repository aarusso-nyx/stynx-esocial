import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { buildEsocialIdempotencyKey } from '../../packages/contracts/src/idempotency.ts';
import {
  DeterministicSandboxTransport,
  SubmissionProcessor,
  buildS1000,
  buildS1005,
  buildS1010,
  buildS1020,
  buildS1050,
  buildS1070,
  buildS1200,
  buildS1202,
  buildS1207,
  buildS1210,
  buildS1298,
  buildS1299,
  buildS2200,
  buildS2205,
  buildS2206,
  buildS2210,
  buildS2220,
  buildS2230,
  buildS2240,
  buildS2298Worker,
  buildS2299Worker,
  buildS2300,
  buildS2306,
  buildS2399,
  routeSubmissionEventClass,
} from '../../packages/domain/dist/index.js';
import { signXmlBytes } from '../../packages/pki-pades/dist/index.js';
import {
  createPostgresSubmissionRepository,
} from '../../services/submission/dist/postgres-submission-repository.js';

const root = new URL('../..', import.meta.url).pathname;
const adminUrl = process.env.ESOCIAL_TEST_ADMIN_URL
  ?? process.env.ESOCIAL_DATABASE_URL
  ?? defaultAdminUrl();
const fixedNow = new Date('2026-05-05T12:00:00.000Z');

const familySpecs = {
  'S-1000': { fixture: 's1000.dto.json', build: buildS1000, kind: 'tabelas' },
  'S-1005': { fixture: 's1005.dto.json', build: buildS1005, kind: 'tabelas' },
  'S-1010': { fixture: 's1010.dto.json', build: buildS1010, kind: 'tabelas' },
  'S-1020': { fixture: 's1020.dto.json', build: buildS1020, kind: 'tabelas' },
  'S-1050': { fixture: 's1050.dto.json', build: buildS1050, kind: 'tabelas' },
  'S-1070': { fixture: 's1070.dto.json', build: buildS1070, kind: 'tabelas' },
  'S-1200': { fixture: 's1200.dto.json', build: buildS1200, kind: 'folha' },
  'S-1202': { fixture: 's1202.dto.json', build: buildS1202, kind: 'folha' },
  'S-1207': { fixture: 's1207.dto.json', build: buildS1207, kind: 'folha' },
  'S-1210': { fixture: 's1210.dto.json', build: buildS1210, kind: 'folha' },
  'S-1298': { fixture: 's1298.dto.json', build: buildS1298, kind: 'fechamento' },
  'S-1299': { fixture: 's1299.dto.json', build: buildS1299, kind: 'fechamento' },
  'S-2200': { fixture: 's2200.dto.json', build: buildS2200, kind: 'trabalhador' },
  'S-2205': { fixture: 's2205.dto.json', build: buildS2205, kind: 'trabalhador' },
  'S-2206': { fixture: 's2206.dto.json', build: buildS2206, kind: 'trabalhador' },
  'S-2210': { fixture: 's2210.dto.json', build: buildS2210, kind: 'trabalhador' },
  'S-2220': { fixture: 's2220.dto.json', build: buildS2220, kind: 'trabalhador' },
  'S-2230': { fixture: 's2230.dto.json', build: buildS2230, kind: 'trabalhador' },
  'S-2240': { fixture: 's2240.dto.json', build: buildS2240, kind: 'trabalhador' },
  'S-2298': { fixture: 's2298.dto.json', build: buildS2298Worker, kind: 'trabalhador' },
  'S-2299': { fixture: 's2299.dto.json', build: buildS2299Worker, kind: 'trabalhador' },
  'S-2300': { fixture: 's2300.dto.json', build: buildS2300, kind: 'trabalhador' },
  'S-2306': { fixture: 's2306.dto.json', build: buildS2306, kind: 'trabalhador' },
  'S-2399': { fixture: 's2399.dto.json', build: buildS2399, kind: 'trabalhador' },
};

test('promoted DTO to SOAP pipeline persists sent status and deterministic hashes for all active families', async () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const databaseName = `esocial_b4_${suffix}`;
  const databaseUrl = withDatabase(adminUrl, databaseName);
  const workerRole = `esocial_b4_worker_${suffix}`;
  const workerPassword = `p${randomUUID().replaceAll('-', '')}`;
  const workerUrl = roleUrl(databaseUrl, workerRole, workerPassword);
  const tenantId = `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
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
    const transport = new DeterministicSandboxTransport();
    const certificate = localCertificate(tenantId);
    const processor = new SubmissionProcessor({
      repository,
      publishers: published.publishers,
      dispatcher: deterministicSoapDispatcher(transport, certificate),
      now: () => fixedNow,
    });

    for (const [eventClass, spec] of Object.entries(familySpecs)) {
      const dto = {
        ...fixture(spec.fixture),
        tenantId,
        environment: 'qualification',
      };
      const envelope = submissionEnvelope({
        tenantId,
        eventClass,
        kind: spec.kind,
        dto,
      });
      const result = await processor.process(envelope);

      assert.equal(result.record.status, 'sent', eventClass);
      assert.match(result.record.transport.protocolNumber, /^LOCAL-[0-9A-F]{24}$/u);
      assert.match(result.record.transport.requestSha256, /^[a-f0-9]{64}$/u);
      assert.match(result.record.transport.signedPayloadSha256, /^[a-f0-9]{64}$/u);
      assert.match(result.record.transport.soapRequestSha256, /^[a-f0-9]{64}$/u);
      assert.match(result.record.transport.soapResponseSha256, /^[a-f0-9]{64}$/u);
      assert.equal(result.response.status, 'sent');
      assert.equal(result.response.hashes.request_sha256, result.record.transport.requestSha256);
      assert.equal(
        result.response.hashes.signed_payload_sha256,
        result.record.transport.signedPayloadSha256,
      );
      assert.equal(result.spoolUpdate.status_transition.to, 'sent');
    }

    const expectedCount = String(Object.keys(familySpecs).length);
    assert.equal(queryScalar(workerUrl, 'SELECT count(*) FROM esocial.submission_batch;'), expectedCount);
    assert.equal(queryScalar(workerUrl, "SELECT count(*) FROM esocial.submission_batch WHERE status = 'SENT';"), expectedCount);
    assert.equal(queryScalar(workerUrl, "SELECT count(*) FROM esocial.event_record WHERE status = 'SENT';"), expectedCount);
    assert.equal(
      queryScalar(
        workerUrl,
        `SELECT count(*)
         FROM esocial.submission_batch
         WHERE request_sha256 IS NOT NULL
           AND signed_payload_sha256 IS NOT NULL
           AND soap_request_sha256 IS NOT NULL
           AND soap_response_sha256 IS NOT NULL
           AND protocol_number LIKE 'LOCAL-%';`,
      ),
      expectedCount,
    );
    assert.equal(published.spool.length, Object.keys(familySpecs).length);
    assert.equal(published.response.length, Object.keys(familySpecs).length);
  } finally {
    if (repository) await repository.close();
    cleanup(databaseName, workerRole);
  }
});

function deterministicSoapDispatcher(transport, certificate) {
  return async (dto, context) => {
    const eventClass = context.request.event_class;
    const built = familySpecs[eventClass].build(dto, { environment: 'qualification' });
    const signed = signXmlBytes({
      xmlBytes: built.xml,
      certificate,
      now: fixedNow,
    });
    const soap = await transport.submit(
      'enviar_lote_eventos',
      signed.signedBytes.toString('utf8'),
      {
        tenantId: context.request.tenant_id,
        environment: 'qualification',
        eventClass,
        requestId: context.request['request-id'],
        correlationId: context.request['correlation-id'],
        requestXml: built.xml,
        now: fixedNow,
      },
    );

    return {
      eventClass,
      route: routeSubmissionEventClass(eventClass),
      stage: 'sent',
      builderReady: true,
      builtXml: built,
      protocolNumber: soap.protocol,
      transport: {
        endpointName: 'deterministic-sandbox',
        endpointUrl: soap.endpointUrl,
        protocolNumber: soap.protocol,
        requestSha256: soap.requestHash,
        signedPayloadSha256: soap.signedPayloadHash,
        soapRequestSha256: soap.soapRequestHash,
        soapResponseSha256: soap.responseHash,
        responseSha256: soap.responseHash,
      },
    };
  };
}

function submissionEnvelope(input) {
  const sourceEventId = `${input.eventClass.toLowerCase()}-${randomUUID()}`;
  const sourceEntityId =
    input.dto.sourceEntityId ??
    input.dto.employeeId ??
    input.dto.payrollRunId ??
    sourceEventId;
  const payloadHash = `sha256:${createHash('sha256')
    .update(JSON.stringify(input.dto))
    .digest('hex')}`;
  const idempotency = buildEsocialIdempotencyKey({
    family: 'request',
    tenant_id: input.tenantId,
    environment: 'QUALIFICATION',
    event_class: input.eventClass,
    source_event_id: sourceEventId,
    source_entity_id: sourceEntityId,
    competence: input.dto.competence ?? input.dto.validityStart,
    payload_hash: payloadHash,
  });

  return {
    version: 'v1',
    family: 'request',
    'request-id': randomUUID(),
    'correlation-id': randomUUID(),
    'idempotency-key': idempotency.value,
    created_at: fixedNow.toISOString(),
    tenant_id: input.tenantId,
    environment: 'QUALIFICATION',
    event_class: input.eventClass,
    source: {
      source_event_id: sourceEventId,
      source_entity_id: sourceEntityId,
      payroll_run_id: input.dto.payrollRunId,
      employee_id: input.dto.employeeId,
    },
    kind: input.kind,
    payload_hash: payloadHash,
    attempt: 1,
    'max-attempts': 3,
    'reply-to': 'sgp.esocial.submit.response',
    'dead-letter-topic': 'sgp.esocial.dlq',
    payload: input.dto,
  };
}

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

function fixture(fileName) {
  return JSON.parse(
    readFileSync(join(root, 'tests/golden/fixtures', fileName), 'utf8'),
  );
}

function localCertificate(tenantId) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  return {
    reference: {
      tenantId,
      environment: 'QUALIFICATION',
      label: 'b4-local',
      secretRef: 'local-test://b4-cert',
      version: 'local-v1',
    },
    privateKeyPem: privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    }),
    publicKeyPem: publicKey.export({
      type: 'spki',
      format: 'pem',
    }),
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: '2027-01-01T00:00:00.000Z',
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
