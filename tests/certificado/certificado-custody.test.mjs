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
  PostgresTenantCertificateRepository,
  SecretsManagerCertificateSecretProvider,
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

test('certificate custody serves cache hits without rereading secret material and still audits access', async () => {
  const material = localKeyMaterial();
  const secretRef = 'local-test://phase6-cache-cert';
  const repository = new InMemoryTenantCertificateRepository([
    {
      certificateId: '10000000-0000-4000-8000-000000000604',
      tenantId,
      environment,
      label: 'cache-a1',
      secretRef,
      secretKind: 'LOCAL_TEST_SECRET_REF',
      certificateFingerprintSha256: sha256Hex(material.publicKeyPem),
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: '2027-01-01T00:00:00.000Z',
      status: 'ACTIVE',
    },
  ]);
  let secretReads = 0;
  const service = new CertificateCustodyService(
    repository,
    {
      async getSecret(ref) {
        secretReads += 1;
        assert.equal(ref, secretRef);
        return JSON.stringify(material);
      },
    },
    { cacheTtlMs: 300000 },
  );

  const first = await service.resolveCertificate({
    tenantId,
    environment,
    label: 'cache-a1',
    actor: 'system:test',
    now,
  });
  const second = await service.resolveCertificate({
    tenantId,
    environment,
    label: 'cache-a1',
    actor: 'system:test',
    now: new Date(now.getTime() + 1000),
  });

  assert.equal(secretReads, 1);
  assert.equal(first.privateKeyPem, second.privateKeyPem);
  assert.deepEqual(
    repository.auditEvents.map((event) => event.reasonCode),
    ['CERTIFICATE_RESOLVED', 'CERTIFICATE_CACHE_HIT'],
  );
});

test('Secrets Manager provider accepts only ARNs and returns secret material', async () => {
  const material = JSON.stringify(localKeyMaterial());
  const requested = [];
  const provider = new SecretsManagerCertificateSecretProvider({
    client: {
      async send(command) {
        requested.push(command.input.SecretId);
        return { SecretString: material };
      },
    },
  });
  const arn = 'arn:aws:secretsmanager:us-east-1:123456789012:secret:esocial/test/cert';

  assert.equal(await provider.getSecret(arn), material);
  assert.deepEqual(requested, [arn]);

  await assert.rejects(
    () => provider.getSecret('-----BEGIN PRIVATE KEY-----'),
    (error) =>
      error instanceof CertificateCustodyError &&
      error.code === 'CERTIFICATE_SECRET_REF_INLINE_MATERIAL',
  );
  await assert.rejects(
    () => provider.getSecret('local-test://cert'),
    (error) =>
      error instanceof CertificateCustodyError &&
      error.code === 'CERTIFICATE_SECRET_REF_NOT_ARN',
  );
});

test('Postgres certificate repository reads tenant metadata and writes certificate.access audit rows', async () => {
  const client = new FakePgClient();
  const pool = new FakePgPool(client);
  const repository = new PostgresTenantCertificateRepository(pool);

  const metadata = await repository.findActive({
    tenantId,
    environment,
    label: 'active-a1',
  });
  await repository.auditAccess({
    tenantId,
    environment,
    certificateId: metadata.certificateId,
    label: metadata.label,
    actor: 'system:test',
    correlationId: 'corr-pg',
    outcome: 'granted',
    reasonCode: 'CERTIFICATE_RESOLVED',
    occurredAt: now.toISOString(),
  });

  assert.equal(metadata.secretRef, client.row.secret_ref);
  assert.equal(metadata.certificateFingerprintSha256, client.row.certificate_fingerprint_sha256);
  assert.equal(client.released, 2);
  assert.match(client.queries[0].sql, /FROM esocial\.tenant_certificate/u);
  assert.deepEqual(client.queries[0].params, [tenantId, environment, 'active-a1']);
  assert.match(client.queries[2].sql, /INSERT INTO esocial\.audit_event_log/u);
  assert.equal(client.queries[2].params[2], 'certificate.access');
  assert.equal(JSON.stringify(client.queries).includes('PRIVATE KEY'), false);
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

test('certificate custody rejects inline certificate material in metadata before secret resolution', async () => {
  const material = localKeyMaterial();
  const repository = new InMemoryTenantCertificateRepository([
    {
      certificateId: '10000000-0000-4000-8000-000000000605',
      tenantId,
      environment,
      label: 'inline-a1',
      secretRef: '-----BEGIN PRIVATE KEY-----',
      secretKind: 'LOCAL_TEST_SECRET_REF',
      certificateFingerprintSha256: sha256Hex(material.publicKeyPem),
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: '2027-01-01T00:00:00.000Z',
      status: 'ACTIVE',
    },
  ]);
  let secretReads = 0;
  const service = new CertificateCustodyService(repository, {
    async getSecret() {
      secretReads += 1;
      return JSON.stringify(material);
    },
  });

  await assert.rejects(
    () =>
      service.resolveCertificate({
        tenantId,
        environment,
        label: 'inline-a1',
        actor: 'system:test',
        now,
      }),
    (error) =>
      error instanceof CertificateCustodyError &&
      error.code === 'CERTIFICATE_SECRET_REF_INLINE_MATERIAL',
  );
  assert.equal(secretReads, 0);
  assert.equal(repository.auditEvents[0].outcome, 'denied');
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

class FakePgPool {
  constructor(client) {
    this.client = client;
  }

  async connect() {
    return this.client;
  }

  async end() {}
}

class FakePgClient {
  constructor() {
    this.released = 0;
    this.queries = [];
    this.row = {
      certificate_id: '10000000-0000-4000-8000-000000000606',
      tenant_id: tenantId,
      environment,
      label: 'active-a1',
      secret_ref: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:esocial/test/cert',
      secret_kind: 'AWS_SECRETS_MANAGER_ARN',
      certificate_fingerprint_sha256:
        'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      subject_name: 'CN=Postgres Test',
      issuer_name: 'CN=Issuer',
      serial_number: '1234',
      valid_from: '2026-01-01T00:00:00.000Z',
      valid_until: '2027-01-01T00:00:00.000Z',
      status: 'ACTIVE',
      revoked_at: null,
      rotated_at: null,
    };
  }

  async query(sql, params = []) {
    this.queries.push({ sql, params });
    if (/FROM esocial\.tenant_certificate/u.test(sql)) {
      return { rows: [this.row] };
    }
    return { rows: [] };
  }

  release() {
    this.released += 1;
  }
}
