import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildEsocialIdempotencyKey,
  validateEsocialSgpRequestDto,
} from '../../packages/contracts/dist/index.js';
import {
  DeterministicSandboxTransport,
  buildS1299,
  parseEsocialReturnXml,
} from '../../packages/domain/dist/index.js';
import {
  signXmlBytes,
  verifySignedXmlBytes,
} from '../../packages/pki-pades/dist/index.js';

const root = new URL('../..', import.meta.url).pathname;
const fixedNow = new Date('2026-05-06T13:00:00.000Z');

test('local deterministic e2e pipeline runs DTO to XML to sign to SOAP stub to parsed status', async () => {
  const envelope = JSON.parse(
    readFileSync(join(root, 'packages/contracts/examples/v1/requests/S-1299.request.json'), 'utf8'),
  );
  const validation = validateEsocialSgpRequestDto(envelope.payload);
  assert.equal(validation.ok, true);

  const idempotency = buildEsocialIdempotencyKey({
    family: 'request',
    tenant_id: envelope.tenant_id,
    environment: envelope.environment,
    event_class: envelope.event_class,
    source_event_id: envelope.source.source_event_id,
    source_entity_id: envelope.source.source_entity_id,
    competence: envelope.payload.competence,
    payload_hash: envelope.payload_hash,
  });
  assert.equal(idempotency.value, envelope['idempotency-key']);

  const built = buildS1299(envelope.payload, {
    environment: '2',
    now: fixedNow,
  });
  assert.equal(built.metadata.eventCode, 'S-1299');
  assert.match(built.xml, /<evtFechaEvPer/u);

  const certificate = localCertificate();
  const signed = signXmlBytes({
    xmlBytes: built.xml,
    certificate,
    now: fixedNow,
  });
  assert.equal(verifySignedXmlBytes({ signedBytes: signed.signedBytes, certificate }), true);

  const transport = new DeterministicSandboxTransport({ root });
  const response = await transport.submit(
    'EnviarLoteEventos',
    signed.signedBytes.toString('utf8'),
    {
      tenantId: envelope.tenant_id,
      environment: envelope.environment,
      eventClass: envelope.event_class,
      requestXml: built.xml,
      now: fixedNow,
    },
  );
  assert.equal(response.httpStatus, 200);
  assert.match(response.protocol, /^LOCAL-/u);
  assert.ok(!response.endpointUrl.includes('gov.br'));

  const parsed = parseEsocialReturnXml(response.rawResponse);
  assert.equal(parsed.kind, 'protocol');
  assert.equal(parsed.protocol, response.protocol);
});

function localCertificate() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    reference: {
      tenantId: '00000000-0000-4000-8000-000000000600',
      environment: 'QUALIFICATION',
      label: 'round4-e2e',
      secretRef: 'local-test://round4-e2e',
      version: 'local-v1',
    },
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: '2027-01-01T00:00:00.000Z',
  };
}
