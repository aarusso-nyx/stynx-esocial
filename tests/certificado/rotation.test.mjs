import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { test } from 'node:test';

import {
  buildS1000,
} from '../../packages/domain/dist/index.js';
import {
  sha256Hex,
  signXmlBytes,
} from '../../packages/pki-pades/dist/index.js';
import {
  CertificateCustodyError,
  CertificateCustodyService,
  InMemoryCertificateSecretProvider,
} from '../../services/certificado/dist/handler.js';

const tenantId = '00000000-0000-4000-8000-000000000622';
const environment = 'QUALIFICATION';

test('certificate rotation drill blocks expired signing and accepts a rotated certificate without code changes', async () => {
  const first = localKeyMaterial();
  const second = localKeyMaterial();
  const firstSecret = 'local-test://rotation-cert-v1';
  const secondSecret = 'local-test://rotation-cert-v2';
  const repository = new MutableCertificateRepository([
    certificateMetadata({
      certificateId: '10000000-0000-4000-8000-000000000621',
      secretRef: firstSecret,
      publicKeyPem: first.publicKeyPem,
      validUntil: '2026-05-05T13:00:00.000Z',
    }),
  ]);
  const service = new CertificateCustodyService(
    repository,
    new InMemoryCertificateSecretProvider(
      new Map([
        [firstSecret, JSON.stringify(first)],
        [secondSecret, JSON.stringify(second)],
      ]),
    ),
    { cacheTtlMs: 0 },
  );
  const xml = buildS1000({
    eventClass: 'S-1000',
    tenantId,
    sourceEventId: 'rotation-source-event',
    sourceEntityId: 'rotation-source-entity',
    employerCnpj: '12345678000199',
    validityStart: '2026-05',
    legalName: 'SistemaTech Rotation Fixture',
    taxClassification: '99',
    environment: 'qualification',
  }).xml;

  const active = await service.resolveCertificate({
    tenantId,
    environment,
    label: 'default',
    actor: 'system:test',
    now: new Date('2026-05-05T12:00:00.000Z'),
  });
  const signed = signXmlBytes({
    xmlBytes: xml,
    certificate: active,
    now: new Date('2026-05-05T12:05:00.000Z'),
  });
  assert.match(signed.signedPayloadSha256, /^[a-f0-9]{64}$/u);

  await assert.rejects(
    () =>
      service.resolveCertificate({
        tenantId,
        environment,
        label: 'default',
        actor: 'system:test',
        now: new Date('2026-05-05T14:00:00.000Z'),
      }),
    (error) =>
      error instanceof CertificateCustodyError &&
      error.code === 'CERTIFICATE_EXPIRED',
  );
  assert.deepEqual(statusFromCertificateError('CERTIFICATE_EXPIRED'), {
    status: 'validation_failed',
    category: 'signing',
  });

  repository.unshift(certificateMetadata({
    certificateId: '10000000-0000-4000-8000-000000000622',
    secretRef: secondSecret,
    publicKeyPem: second.publicKeyPem,
    validUntil: '2027-05-05T00:00:00.000Z',
  }));
  const rotated = await service.resolveCertificate({
    tenantId,
    environment,
    label: 'default',
    actor: 'system:test',
    now: new Date('2026-05-05T14:01:00.000Z'),
  });
  const rotatedSigned = signXmlBytes({
    xmlBytes: xml,
    certificate: rotated,
    now: new Date('2026-05-05T14:02:00.000Z'),
  });

  assert.equal(rotated.reference.version, '10000000-0000-4000-8000-000000000622');
  assert.notEqual(rotatedSigned.certificateRef.version, signed.certificateRef.version);
  assert.deepEqual(
    repository.auditEvents.map((event) => event.reasonCode),
    ['CERTIFICATE_RESOLVED', 'CERTIFICATE_EXPIRED', 'CERTIFICATE_RESOLVED'],
  );
});

function certificateMetadata(input) {
  return {
    certificateId: input.certificateId,
    tenantId,
    environment,
    label: 'default',
    secretRef: input.secretRef,
    secretKind: 'LOCAL_TEST_SECRET_REF',
    certificateFingerprintSha256: sha256Hex(input.publicKeyPem),
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: input.validUntil,
    status: 'ACTIVE',
  };
}

function statusFromCertificateError(code) {
  if (code === 'CERTIFICATE_EXPIRED') {
    return {
      status: 'validation_failed',
      category: 'signing',
    };
  }
  return {
    status: 'failed',
    category: 'configuration',
  };
}

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

class MutableCertificateRepository {
  auditEvents = [];

  constructor(certificates) {
    this.certificates = certificates;
  }

  unshift(certificate) {
    this.certificates.unshift(certificate);
  }

  async findActive(input) {
    return this.certificates.find(
      (certificate) =>
        certificate.tenantId === input.tenantId &&
        certificate.environment === input.environment &&
        certificate.label === input.label &&
        certificate.status === 'ACTIVE',
    );
  }

  auditAccess(event) {
    this.auditEvents.push(event);
  }
}
