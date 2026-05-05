import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { test } from 'node:test';

import {
  sha256Hex,
} from '../../packages/pki-pades/dist/index.js';
import {
  CertificateCustodyError,
  CertificateCustodyService,
  InMemoryCertificateSecretProvider,
  InMemoryTenantCertificateRepository,
} from '../../services/certificado/dist/handler.js';

const tenantId = '00000000-0000-4000-8000-000000000602';
const environment = 'QUALIFICATION';
const now = new Date('2026-05-05T12:00:00.000Z');

test('certificate custody resolves local test secret handles and audits access without storing key bytes', async () => {
  const material = localKeyMaterial();
  const secretRef = 'local-test://phase6-cert';
  const repository = new InMemoryTenantCertificateRepository([
    {
      certificateId: '10000000-0000-4000-8000-000000000602',
      tenantId,
      environment,
      label: 'active-a1',
      secretRef,
      secretKind: 'LOCAL_TEST_SECRET_REF',
      certificateFingerprintSha256: sha256Hex(material.publicKeyPem),
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: '2027-01-01T00:00:00.000Z',
      status: 'ACTIVE',
      subjectName: 'CN=Local Phase6',
    },
  ]);
  const secrets = new InMemoryCertificateSecretProvider(
    new Map([[secretRef, JSON.stringify(material)]]),
  );
  const service = new CertificateCustodyService(repository, secrets);

  const handle = await service.resolveCertificate({
    tenantId,
    environment,
    label: 'active-a1',
    actor: 'system:test',
    correlationId: 'corr-phase6',
    now,
  });

  assert.equal(handle.reference.secretRef, secretRef);
  assert.equal(handle.reference.label, 'active-a1');
  assert.equal(handle.privateKeyPem.includes('PRIVATE KEY'), true);
  assert.equal(repository.auditEvents.length, 1);
  assert.equal(repository.auditEvents[0].outcome, 'granted');
  assert.equal(repository.auditEvents[0].reasonCode, 'CERTIFICATE_RESOLVED');
  assert.equal(JSON.stringify(repository.auditEvents).includes('PRIVATE KEY'), false);
});

test('certificate custody denies expired metadata and audits the denial', async () => {
  const material = localKeyMaterial();
  const repository = new InMemoryTenantCertificateRepository([
    {
      certificateId: '10000000-0000-4000-8000-000000000603',
      tenantId,
      environment,
      label: 'expired-a1',
      secretRef: 'local-test://expired-cert',
      secretKind: 'LOCAL_TEST_SECRET_REF',
      certificateFingerprintSha256: sha256Hex(material.publicKeyPem),
      validFrom: '2025-01-01T00:00:00.000Z',
      validUntil: '2025-12-31T00:00:00.000Z',
      status: 'ACTIVE',
    },
  ]);
  const service = new CertificateCustodyService(
    repository,
    new InMemoryCertificateSecretProvider(
      new Map([['local-test://expired-cert', JSON.stringify(material)]]),
    ),
  );

  await assert.rejects(
    () =>
      service.resolveCertificate({
        tenantId,
        environment,
        label: 'expired-a1',
        actor: 'system:test',
        now,
      }),
    (error) =>
      error instanceof CertificateCustodyError &&
      error.code === 'CERTIFICATE_EXPIRED',
  );
  assert.equal(repository.auditEvents[0].outcome, 'denied');
  assert.equal(repository.auditEvents[0].reasonCode, 'CERTIFICATE_EXPIRED');
});

function localKeyMaterial() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  return {
    privateKeyPem: privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    }),
    publicKeyPem: publicKey.export({
      type: 'spki',
      format: 'pem',
    }),
  };
}
