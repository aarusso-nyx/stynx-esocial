import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  PkiSigningError,
  signXmlBytes,
  verifySignedXmlBytes,
} from '../../packages/pki-pades/dist/index.js';

const root = new URL('../..', import.meta.url).pathname;
const now = new Date('2026-05-05T12:00:00.000Z');

test('PKI boundary signs and verifies eSocial XML with generated local key material', () => {
  const certificate = localCertificate();
  const xml = readFileSync(
    join(root, 'docs/templates/golden/builders/s1000.golden.xml'),
    'utf8',
  );

  const signed = signXmlBytes({
    xmlBytes: xml,
    certificate,
    now,
  });

  assert.match(signed.requestXmlSha256, /^[a-f0-9]{64}$/u);
  assert.match(signed.signedPayloadSha256, /^[a-f0-9]{64}$/u);
  assert.match(signed.signatureHash, /^[a-f0-9]{64}$/u);
  assert.equal(signed.algorithm, 'RSA-SHA256');
  assert.equal(signed.signedAt, now.toISOString());
  assert.equal(signed.certificateRef.secretRef, 'local-test://phase6-cert');
  assert.match(signed.signedBytes.toString('utf8'), /<ds:Signature\b/u);
  assert.equal(verifySignedXmlBytes({ signedBytes: signed.signedBytes, certificate }), true);
});

test('PKI boundary rejects DTD and unsigned non-eSocial candidates', () => {
  const certificate = localCertificate();

  assert.throws(
    () =>
      signXmlBytes({
        xmlBytes: '<!DOCTYPE eSocial [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><eSocial>&xxe;</eSocial>',
        certificate,
        now,
      }),
    (error) =>
      error instanceof PkiSigningError &&
      error.code === 'XML_DTD_FORBIDDEN',
  );

  assert.throws(
    () =>
      signXmlBytes({
        xmlBytes: '<root />',
        certificate,
        now,
      }),
    /eSocial root/u,
  );
});

function localCertificate() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const privateKeyPem = privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });
  const publicKeyPem = publicKey.export({
    type: 'spki',
    format: 'pem',
  });

  return {
    reference: {
      tenantId: '00000000-0000-4000-8000-000000000600',
      environment: 'QUALIFICATION',
      label: 'phase6-local',
      secretRef: 'local-test://phase6-cert',
      version: 'local-v1',
    },
    privateKeyPem,
    publicKeyPem,
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: '2027-01-01T00:00:00.000Z',
  };
}
