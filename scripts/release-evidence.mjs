import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  ESOCIAL_CLASSES,
  ESOCIAL_CONTRACT_VERSION,
  ESOCIAL_ENVIRONMENTS,
  ESOCIAL_ERROR_CATEGORIES,
  ESOCIAL_RELAY_EVENT_CLASSES,
  ESOCIAL_STATUSES,
  ESOCIAL_TRANSPORT_FAMILIES,
  buildEsocialIdempotencyKey,
} from '../packages/contracts/dist/index.js';
import {
  SubmissionProcessor,
  parseEsocialReturnXml,
} from '../packages/domain/dist/index.js';
import {
  SandboxSoapTransport,
  resolveEsocialSoapEndpoints,
} from '../services/submission/dist/transport/soap-sandbox.js';

const root = new URL('..', import.meta.url).pathname;
const version = argValue('--version');

if (!version) {
  throw new Error('Usage: node scripts/release-evidence.mjs --version <semver>');
}

await main(version);

async function main(releaseVersion) {
  generateContractArtifacts();

  const releaseDir = join(root, 'docs/release', releaseVersion);
  rmSync(releaseDir, { recursive: true, force: true });
  mkdirSync(releaseDir, { recursive: true });

  const now = new Date('2026-05-05T12:00:00.000Z');
  const inputEnvelope = exampleRequestEnvelope('S-1299', 1299, now);
  const sourceXml = readFileSync(
    join(root, 'docs/templates/golden/builders/s1299.golden.xml'),
    'utf8',
  );
  const signed = deterministicSignedXml(sourceXml, now);
  const endpoints = resolveEsocialSoapEndpoints('qualification', {
    nodeEnv: 'test',
  });
  const soapTransport = new SandboxSoapTransport();
  const submitExchange = await soapTransport.submit({
    endpointUrl: endpoints.submit,
    signedBatchXml: signed.signedXml,
    now,
    protocolSeed: `release-${releaseVersion}-s1299`,
  });
  const returnExchange = await soapTransport.queryReturn({
    endpointUrl: endpoints.returnQuery,
    protocol: submitExchange.protocol,
    now,
  });
  const protocolReturn = parseEsocialReturnXml(submitExchange.soapResponse);
  const processingReturn = parseEsocialReturnXml(
    processingReturnXml(submitExchange.protocol, now),
  );
  const published = createRecordingPublishers();
  const processor = new SubmissionProcessor({
    repository: inMemoryRepository(now),
    publishers: published.publishers,
    now: () => now,
  });
  const processorResult = await processor.process(inputEnvelope);

  writeJson(join(releaseDir, 'input-envelopes/submit-s1299.json'), inputEnvelope);
  writeText(join(releaseDir, 'generated-xml/s1299.xml'), sourceXml);
  writeText(join(releaseDir, 'signed-payload/s1299.signed.xml'), signed.signedXml);
  writeJson(join(releaseDir, 'signed-payload/metadata.json'), {
    requestXmlSha256: signed.requestXmlSha256,
    signedPayloadSha256: signed.signedPayloadSha256,
    signatureHash: signed.signatureHash,
    certificateFingerprintSha256: signed.certificateFingerprintSha256,
    algorithm: signed.algorithm,
    signedAt: signed.signedAt,
    certificateRef: signed.certificateRef,
  });
  writeText(join(releaseDir, 'soap/submit-request.xml'), submitExchange.soapRequest);
  writeText(join(releaseDir, 'soap/submit-response.xml'), submitExchange.soapResponse);
  writeText(join(releaseDir, 'soap/return-query-request.xml'), returnExchange.soapRequest);
  writeText(join(releaseDir, 'soap/return-query-response.xml'), returnExchange.soapResponse);
  writeJson(join(releaseDir, 'returns/protocol.json'), protocolReturn);
  writeJson(join(releaseDir, 'returns/processing.json'), processingReturn);
  writeJson(join(releaseDir, 'status/response-envelope.json'), processorResult.response);
  writeJson(join(releaseDir, 'status/spool-envelope.json'), processorResult.spoolUpdate);
  writeJson(join(releaseDir, 'status/audit-envelope.json'), processorResult.auditEvent);
  writeJson(join(releaseDir, 'status/published.json'), {
    response: published.response,
    spool: published.spool,
    audit: published.audit,
  });
  writeJson(join(releaseDir, 'database/db-state-diff.json'), {
    evidence: 'Executable database assertion is owned by tests/integration/localstack/harness.mjs.',
    command: 'npm run integration:localstack',
    expected: {
      submission_message_count: 1,
      submission_batch_count: 1,
      event_record_count: 1,
      event_record_status: 'building',
    },
  });
  writeJson(join(releaseDir, 'evidence-manifest.json'), evidenceManifest(releaseVersion));
  writeText(join(releaseDir, 'README.md'), releaseReadme(releaseVersion, submitExchange.protocol));

  console.log(`[release-evidence] wrote docs/release/${releaseVersion}`);
}

function generateContractArtifacts() {
  const schemaDir = join(root, 'packages/contracts/schemas/v1');
  const exampleDir = join(root, 'packages/contracts/examples/v1/requests');
  rmSync(schemaDir, { recursive: true, force: true });
  rmSync(exampleDir, { recursive: true, force: true });
  mkdirSync(schemaDir, { recursive: true });
  mkdirSync(exampleDir, { recursive: true });

  for (const family of ESOCIAL_TRANSPORT_FAMILIES) {
    writeJson(join(schemaDir, `${family}.schema.json`), schemaForFamily(family));
  }

  for (const [index, eventClass] of ESOCIAL_RELAY_EVENT_CLASSES.entries()) {
    writeJson(
      join(exampleDir, `${eventClass}.request.json`),
      exampleRequestEnvelope(eventClass, index + 1, new Date('2026-05-05T12:00:00.000Z')),
    );
  }
}

function schemaForFamily(family) {
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `https://schemas.sistematech.local/esocial/v1/${family}.schema.json`,
    title: `eSocial ${family} envelope v1`,
    type: 'object',
    additionalProperties: true,
    properties: {
      version: { const: ESOCIAL_CONTRACT_VERSION },
      family: { const: family },
      'request-id': { type: 'string', minLength: 1 },
      'correlation-id': { type: 'string', minLength: 1 },
      'idempotency-key': { type: 'string', minLength: 1 },
      created_at: { type: 'string', format: 'date-time' },
      tenant_id: { type: 'string', format: 'uuid' },
      environment: { enum: ESOCIAL_ENVIRONMENTS },
      event_class: { enum: ESOCIAL_RELAY_EVENT_CLASSES },
      source: { type: 'object' },
    },
    required: [
      'version',
      'family',
      'request-id',
      'correlation-id',
      'idempotency-key',
      'created_at',
      'tenant_id',
      'environment',
      'event_class',
      'source',
    ],
  };

  addFamilyFields(schema, family);
  return schema;
}

function addFamilyFields(schema, family) {
  if (family === 'request') {
    Object.assign(schema.properties, {
      kind: { enum: ESOCIAL_CLASSES },
      payload_hash: { type: 'string', minLength: 1 },
      attempt: { type: 'integer', minimum: 0 },
      'max-attempts': { type: 'integer', minimum: 1 },
      'reply-to': { type: 'string', minLength: 1 },
      'dead-letter-topic': { type: 'string', minLength: 1 },
      payload: { type: 'object' },
    });
    schema.required.push('kind', 'payload_hash', 'attempt', 'max-attempts', 'reply-to', 'dead-letter-topic', 'payload');
    return;
  }

  if (family === 'response') {
    Object.assign(schema.properties, {
      kind: { enum: ESOCIAL_CLASSES },
      status: { enum: ESOCIAL_STATUSES },
      attempt: { type: 'integer', minimum: 0 },
      processed_at: { type: 'string', format: 'date-time' },
      errors: { type: 'array' },
    });
    schema.required.push('kind', 'status', 'attempt', 'processed_at');
    return;
  }

  if (family === 'spool') {
    Object.assign(schema.properties, {
      message_id: { type: 'string', minLength: 1 },
      kind: { enum: ESOCIAL_CLASSES },
      status_transition: { type: 'object' },
      occurred_at: { type: 'string', format: 'date-time' },
    });
    schema.required.push('message_id', 'kind', 'status_transition', 'occurred_at');
    return;
  }

  if (family === 'audit') {
    Object.assign(schema.properties, {
      action: { type: 'string', minLength: 1 },
      status: { enum: ESOCIAL_STATUSES },
      target: { type: 'object' },
      occurred_at: { type: 'string', format: 'date-time' },
    });
    schema.required.push('action', 'target', 'occurred_at');
    return;
  }

  if (family === 'retry') {
    Object.assign(schema.properties, {
      kind: { enum: ESOCIAL_CLASSES },
      status: { enum: ['retry', 'timeout'] },
      attempt: { type: 'integer', minimum: 1 },
      'max-attempts': { type: 'integer', minimum: 1 },
      next_attempt_at: { type: 'string', format: 'date-time' },
      retry_reason: { type: 'string', minLength: 1 },
    });
    schema.required.push('kind', 'status', 'attempt', 'max-attempts', 'next_attempt_at', 'retry_reason');
    return;
  }

  if (family === 'dlq') {
    Object.assign(schema.properties, {
      kind: { enum: ESOCIAL_CLASSES },
      status: { enum: ['dlq', 'failed'] },
      final_attempt: { type: 'integer', minimum: 0 },
      dlq_reason: { type: 'string', minLength: 1 },
      failed_at: { type: 'string', format: 'date-time' },
      errors: { type: 'array' },
    });
    schema.required.push('kind', 'status', 'final_attempt', 'dlq_reason', 'failed_at', 'errors');
    return;
  }

  if (family === 'replay') {
    Object.assign(schema.properties, {
      kind: { enum: ESOCIAL_CLASSES },
      status: { const: 'pending' },
      original_request_id: { type: 'string', minLength: 1 },
      replay_request_id: { type: 'string', minLength: 1 },
      replayed_by: { type: 'string', minLength: 1 },
      replay_reason: { type: 'string', minLength: 1 },
    });
    schema.required.push('kind', 'status', 'original_request_id', 'replay_request_id', 'replayed_by', 'replay_reason');
  }
}

function exampleRequestEnvelope(eventClass, index, now) {
  const tenantId = deterministicUuid(9000 + index);
  const sourceEventId = deterministicUuid(10_000 + index);
  const sourceEntityId = `source-${eventClass.toLowerCase()}-${String(index).padStart(2, '0')}`;
  const payloadHash = `sha256:${sha256(`${tenantId}:${eventClass}:${sourceEventId}`)}`;
  const idempotency = buildEsocialIdempotencyKey({
    family: 'request',
    tenant_id: tenantId,
    environment: 'QUALIFICATION',
    event_class: eventClass,
    source_event_id: sourceEventId,
    source_entity_id: sourceEntityId,
    competence: '2026-05',
    payload_hash: payloadHash,
  });

  return {
    version: 'v1',
    family: 'request',
    'request-id': deterministicUuid(20_000 + index),
    'correlation-id': deterministicUuid(30_000 + index),
    'idempotency-key': idempotency.value,
    created_at: now.toISOString(),
    tenant_id: tenantId,
    environment: 'QUALIFICATION',
    event_class: eventClass,
    source: {
      source_event_id: sourceEventId,
      source_entity_id: sourceEntityId,
      payroll_run_id: `payroll-2026-05-${String(index).padStart(2, '0')}`,
      source_system: 'SGP',
    },
    kind: 'submit',
    payload_hash: payloadHash,
    attempt: 1,
    'max-attempts': 3,
    'reply-to': 'sgp.esocial.submit.response',
    'dead-letter-topic': 'sgp.esocial.dlq',
    payload: {
      batchId: deterministicUuid(40_000 + index),
      environment: 'QUALIFICATION',
      endpointUrl: 'https://sandbox.esocial.example.test/submit',
      eventIds: [deterministicUuid(50_000 + index)],
      eventClass,
      signedEnvelope: {
        tenantId,
        eventKind: eventClass,
        payloadXml: '<eSocial />',
        payloadSha256: payloadHash,
        pkcs7Sha256: `sha256:${sha256(`signed:${payloadHash}`)}`,
        signedAt: now.toISOString(),
      },
    },
  };
}

function inMemoryRepository(now) {
  return {
    async persist(command) {
      return {
        inserted: true,
        messageId: deterministicUuid(61_001),
        batchId: command.envelope.payload.batchId,
        eventRecordId: deterministicUuid(62_001),
        status: command.status,
        route: command.route,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        errors: command.errors,
      };
    },
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

function deterministicSignedXml(xml, now) {
  const requestXmlSha256 = sha256(xml);
  const signatureHash = sha256(`release-evidence-signature:${requestXmlSha256}`);
  const certificateFingerprintSha256 = sha256('release-evidence-local-certificate');
  const signatureXml = [
    '<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">',
    '<ds:SignedInfo>',
    '<ds:CanonicalizationMethod Algorithm="LOCAL-DETERMINISTIC-C14N"/>',
    '<ds:SignatureMethod Algorithm="LOCAL-DETERMINISTIC-SHA256"/>',
    '<ds:Reference URI="">',
    '<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>',
    `<ds:DigestValue>${requestXmlSha256}</ds:DigestValue>`,
    '</ds:Reference>',
    '</ds:SignedInfo>',
    `<ds:SignatureValue>${signatureHash}</ds:SignatureValue>`,
    '<ds:KeyInfo>',
    `<ds:KeyName>${certificateFingerprintSha256}</ds:KeyName>`,
    '</ds:KeyInfo>',
    '</ds:Signature>',
  ].join('');
  const closingMatch = xml.match(/<\/eSocial>(\s*)$/u);
  if (!closingMatch || closingMatch.index === undefined) {
    throw new Error('Release evidence XML is missing the closing eSocial root element.');
  }
  const signedXml = `${xml.slice(0, closingMatch.index)}${signatureXml}</eSocial>${closingMatch[1]}`;

  return {
    signedXml,
    requestXmlSha256,
    signedPayloadSha256: sha256(signedXml),
    signatureHash,
    certificateFingerprintSha256,
    algorithm: 'LOCAL-DETERMINISTIC-SHA256',
    signedAt: now.toISOString(),
    certificateRef: {
      tenantId: '00000000-0000-4000-8000-000000000901',
      environment: 'QUALIFICATION',
      label: 'release-evidence-local',
      secretRef: 'local-test://release-evidence',
      version: 'local-v1',
    },
  };
}

function processingReturnXml(protocol, now) {
  return `
  <eSocial>
    <retornoProcessamentoLoteEventos>
      <ideEmpregador><tpInsc>1</tpInsc><nrInsc>12345678</nrInsc></ideEmpregador>
      <status><cdResposta>201</cdResposta><descResposta>Lote Processado com Sucesso.</descResposta></status>
      <dadosRecepcaoLote><dhRecepcao>${now.toISOString()}</dhRecepcao><protocoloEnvio>${protocol}</protocoloEnvio></dadosRecepcaoLote>
      <retornoEventos>
        <evento Id="IDES1299RELEASE00000000000000000001">
          <retornoEvento>
            <eSocial>
              <retornoEvento>
                <processamento><cdResposta>201</cdResposta><descResposta>Sucesso.</descResposta><dhProcessamento>${now.toISOString()}</dhProcessamento></processamento>
                <recibo><nrRecibo>1.1.0000000000000000001</nrRecibo></recibo>
              </retornoEvento>
            </eSocial>
          </retornoEvento>
        </evento>
      </retornoEventos>
    </retornoProcessamentoLoteEventos>
  </eSocial>`;
}

function evidenceManifest(releaseVersion) {
  return {
    version: releaseVersion,
    generated_at: '2026-05-05T12:00:00.000Z',
    commands: [
      'npm run build',
      'npm run lint',
      'npm test',
      'npm run test:db',
      'npm run test:integration',
      'npm run integration:localstack',
      'npm run templates:check',
      `node scripts/release-evidence.mjs --version ${releaseVersion}`,
    ],
    restricted_production: {
      status: 'deferred',
      owner: 'release owner',
      review_date: '2026-06-05',
      reason: 'No explicit owner authorization for restricted-production or real-service evidence.',
    },
    artifacts: [
      'input-envelopes/submit-s1299.json',
      'generated-xml/s1299.xml',
      'signed-payload/s1299.signed.xml',
      'signed-payload/metadata.json',
      'soap/submit-request.xml',
      'soap/submit-response.xml',
      'soap/return-query-request.xml',
      'soap/return-query-response.xml',
      'returns/protocol.json',
      'returns/processing.json',
      'status/response-envelope.json',
      'status/spool-envelope.json',
      'status/audit-envelope.json',
      'status/published.json',
      'database/db-state-diff.json',
    ],
    contract_artifacts: {
      schemas: ESOCIAL_TRANSPORT_FAMILIES.map((family) => `packages/contracts/schemas/v1/${family}.schema.json`),
      request_examples: ESOCIAL_RELAY_EVENT_CLASSES.length,
      error_categories: ESOCIAL_ERROR_CATEGORIES,
    },
  };
}

function releaseReadme(releaseVersion, protocol) {
  return `# eSocial Release Evidence ${releaseVersion}

This folder is generated by:

\`\`\`bash
node scripts/release-evidence.mjs --version ${releaseVersion}
\`\`\`

The evidence uses deterministic qualification fixtures only. It does not use
real certificates, real endpoints, production payloads, or production personal
data.

Captured flow:

1. SGP-style v1 request envelope for S-1299.
2. Golden XML fixture.
3. Deterministic local signature placeholder with SHA-256 evidence. Executable
   RSA signing behavior is proven by \`npm test\` and does not commit private
   keys.
4. SOAP sandbox submit and return query exchanges.
5. Return parser evidence for protocol ${protocol} and receipt
   1.1.0000000000000000001.
6. Response, spool, and audit envelopes emitted by the submission processor.
7. Database expectations proven by \`npm run integration:localstack\`.

Restricted-production evidence is deferred until the owner explicitly
authorizes real-service testing and provides redaction rules.
`;
}

function writeJson(fileName, value) {
  writeText(fileName, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(fileName, value) {
  mkdirSync(dirname(fileName), { recursive: true });
  writeFileSync(fileName, value);
}

function deterministicUuid(number) {
  return `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
