import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import {
  sha256Hex,
} from '@esocial/pki-pades';
import type {
  CertificateHandle,
  CertificateReference,
} from '@esocial/pki-pades';
import { handlerResult } from '@esocial/service-shared';
import pg from 'pg';
import type {
  Pool,
} from 'pg';

const { Pool: PgPool } = pg;

export async function handler(event: { Records?: unknown[] }) {
  return handlerResult('esocial-certificado', event.Records?.length ?? 0);
}

export type CertificateStatus = 'ACTIVE' | 'ROTATING' | 'REVOKED' | 'EXPIRED';
export type CertificateSecretKind =
  | 'AWS_SECRETS_MANAGER_ARN'
  | 'LOCAL_TEST_SECRET_REF';

export type TenantCertificateMetadata = Readonly<{
  certificateId: string;
  tenantId: string;
  environment: string;
  label: string;
  secretRef: string;
  secretKind: CertificateSecretKind;
  certificateFingerprintSha256: string;
  subjectName?: string | undefined;
  issuerName?: string | undefined;
  serialNumber?: string | undefined;
  validFrom: string;
  validUntil: string;
  status: CertificateStatus;
  revokedAt?: string | undefined;
  rotatedAt?: string | undefined;
}>;

export type ResolveCertificateInput = Readonly<{
  tenantId: string;
  environment: string;
  label: string;
  actor: string;
  correlationId?: string | undefined;
  now?: Date | undefined;
}>;

export type CertificateSecretProvider = Readonly<{
  getSecret(secretRef: string): Promise<string | Buffer | Uint8Array>;
}>;

export type TenantCertificateRepository = Readonly<{
  findActive(input: Pick<ResolveCertificateInput, 'tenantId' | 'environment' | 'label'>): Promise<TenantCertificateMetadata | undefined>;
  auditAccess(event: CertificateAccessAuditEvent): Promise<void> | void;
}>;

export type CertificateCustodyServiceOptions = Readonly<{
  cacheTtlMs?: number | undefined;
  now?: (() => Date) | undefined;
}>;

export type CertificateAccessAuditEvent = Readonly<{
  tenantId: string;
  environment: string;
  certificateId?: string | undefined;
  label: string;
  actor: string;
  correlationId?: string | undefined;
  outcome: 'granted' | 'denied';
  reasonCode: string;
  occurredAt: string;
}>;

export class CertificateCustodyError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'CertificateCustodyError';
  }
}

export class CertificateCustodyService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly cacheTtlMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly repository: TenantCertificateRepository,
    private readonly secretProvider: CertificateSecretProvider,
    options: CertificateCustodyServiceOptions = {},
  ) {
    this.cacheTtlMs = options.cacheTtlMs ?? 5 * 60 * 1000;
    this.now = options.now ?? (() => new Date());
  }

  async resolveCertificate(
    input: ResolveCertificateInput,
  ): Promise<CertificateHandle> {
    const now = input.now ?? this.now();
    const cacheKey = certificateCacheKey(input);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now.getTime()) {
      await this.audit(input, cached.metadata, 'granted', 'CERTIFICATE_CACHE_HIT', now);
      return cached.handle;
    }

    const metadata = await this.repository.findActive(input);

    if (!metadata) {
      await this.audit(input, undefined, 'denied', 'CERTIFICATE_NOT_FOUND', now);
      throw new CertificateCustodyError(
        'No active certificate metadata exists for the tenant/environment/label.',
        'CERTIFICATE_NOT_FOUND',
      );
    }

    try {
      assertCertificateMetadataUsable(metadata, now);
      assertCertificateSecretReference(metadata);
      const material = parseCertificateSecret(
        await this.secretProvider.getSecret(metadata.secretRef),
      );
      const fingerprint = sha256Hex(material.certificatePem ?? material.publicKeyPem);
      if (fingerprint !== metadata.certificateFingerprintSha256) {
        throw new CertificateCustodyError(
          'Certificate secret fingerprint does not match tenant metadata.',
          'CERTIFICATE_FINGERPRINT_MISMATCH',
        );
      }

      await this.audit(input, metadata, 'granted', 'CERTIFICATE_RESOLVED', now);
      const handle: CertificateHandle = {
        reference: certificateReference(metadata),
        privateKeyPem: material.privateKeyPem,
        publicKeyPem: material.publicKeyPem,
        certificatePem: material.certificatePem,
        subjectName: metadata.subjectName,
        issuerName: metadata.issuerName,
        serialNumber: metadata.serialNumber,
        validFrom: metadata.validFrom,
        validUntil: metadata.validUntil,
        revokedAt: metadata.revokedAt,
      };
      this.cache.set(cacheKey, {
        handle,
        metadata,
        expiresAt: now.getTime() + this.cacheTtlMs,
      });
      return handle;
    } catch (error) {
      const reasonCode = error instanceof CertificateCustodyError
        ? error.code
        : 'CERTIFICATE_SECRET_READ_FAILED';
      await this.audit(input, metadata, 'denied', reasonCode, now);
      throw error;
    }
  }

  private async audit(
    input: ResolveCertificateInput,
    metadata: TenantCertificateMetadata | undefined,
    outcome: 'granted' | 'denied',
    reasonCode: string,
    now: Date,
  ): Promise<void> {
    await this.repository.auditAccess({
      tenantId: input.tenantId,
      environment: input.environment,
      certificateId: metadata?.certificateId,
      label: input.label,
      actor: input.actor,
      correlationId: input.correlationId,
      outcome,
      reasonCode,
      occurredAt: now.toISOString(),
    });
  }
}

export type PostgresTenantCertificateRepositoryOptions = Readonly<{
  connectionString: string;
}>;

export type ClosableTenantCertificateRepository = TenantCertificateRepository &
  Readonly<{
    close(): Promise<void>;
  }>;

export function createPostgresTenantCertificateRepositoryFromEnv(): ClosableTenantCertificateRepository {
  const connectionString = process.env.ESOCIAL_DATABASE_URL;
  if (!connectionString) {
    throw new Error('ESOCIAL_DATABASE_URL is required for certificate custody.');
  }
  return createPostgresTenantCertificateRepository({ connectionString });
}

export function createPostgresTenantCertificateRepository(
  options: PostgresTenantCertificateRepositoryOptions,
): ClosableTenantCertificateRepository {
  return new PostgresTenantCertificateRepository(
    new PgPool({ connectionString: options.connectionString }),
  );
}

export class PostgresTenantCertificateRepository implements ClosableTenantCertificateRepository {
  constructor(private readonly pool: Pick<Pool, 'connect' | 'end'>) {}

  async findActive(
    input: Pick<ResolveCertificateInput, 'tenantId' | 'environment' | 'label'>,
  ): Promise<TenantCertificateMetadata | undefined> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<CertificateRow>(
        `
          SELECT
            certificate_id::text,
            tenant_id::text,
            environment,
            COALESCE(label, 'default') AS label,
            secret_ref,
            secret_kind,
            COALESCE(fingerprint_sha256, certificate_fingerprint_sha256) AS certificate_fingerprint_sha256,
            COALESCE(subject, subject_name) AS subject_name,
            COALESCE(issuer, issuer_name) AS issuer_name,
            COALESCE(serial, serial_number) AS serial_number,
            COALESCE(not_before, valid_from)::text AS valid_from,
            COALESCE(not_after, valid_until)::text AS valid_until,
            status,
            revoked_at::text,
            rotated_at::text
          FROM esocial.tenant_certificate
          WHERE tenant_id = $1
            AND environment = $2
            AND COALESCE(label, 'default') = $3
            AND status = 'ACTIVE'
          ORDER BY COALESCE(rotated_at, created_at) DESC
          LIMIT 1
        `,
        [input.tenantId, input.environment, input.label],
      );

      return result.rows[0] ? certificateMetadataFromRow(result.rows[0]) : undefined;
    } finally {
      client.release();
    }
  }

  async auditAccess(event: CertificateAccessAuditEvent): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT set_config($1, $2, true)', [
        'app.current_tenant_id',
        event.tenantId,
      ]);
      await client.query(
        `
          INSERT INTO esocial.audit_event_log (
            tenant_id,
            correlation_id,
            event_type,
            kind,
            actor,
            payload,
            payload_hash,
            occurred_at
          )
          VALUES ($1, $2, $3, $3, $4, $5::jsonb, $6, $7::timestamptz)
        `,
        [
          event.tenantId,
          event.correlationId ?? null,
          'certificate.access',
          event.actor,
          JSON.stringify({
            environment: event.environment,
            certificate_id: event.certificateId,
            label: event.label,
            outcome: event.outcome,
            reason_code: event.reasonCode,
          }),
          sha256Hex([
            event.tenantId,
            event.environment,
            event.certificateId ?? 'missing',
            event.label,
            event.outcome,
            event.reasonCode,
            event.occurredAt,
          ].join(':')),
          event.occurredAt,
        ],
      );
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export type SecretsManagerProviderOptions = Readonly<{
  client?: Pick<SecretsManagerClient, 'send'> | undefined;
  region?: string | undefined;
  endpoint?: string | undefined;
}>;

export function createSecretsManagerSecretProvider(
  options: SecretsManagerProviderOptions = {},
): CertificateSecretProvider {
  return new SecretsManagerCertificateSecretProvider(options);
}

export class SecretsManagerCertificateSecretProvider implements CertificateSecretProvider {
  private readonly client: Pick<SecretsManagerClient, 'send'>;

  constructor(options: SecretsManagerProviderOptions = {}) {
    const endpoint =
      options.endpoint ??
      process.env.AWS_ENDPOINT_URL_SECRETS_MANAGER ??
      process.env.AWS_ENDPOINT_URL;
    this.client = options.client ?? new SecretsManagerClient({
      region: options.region ?? process.env.AWS_REGION ?? 'us-east-1',
      ...(endpoint ? { endpoint } : {}),
    });
  }

  async getSecret(secretRef: string): Promise<string | Buffer | Uint8Array> {
    assertNoInlineCertificateMaterial(secretRef, 'CERTIFICATE_SECRET_REF_INLINE_MATERIAL');
    if (!/^arn:aws(?:-[a-z]+)?:secretsmanager:/u.test(secretRef)) {
      throw new CertificateCustodyError(
        'Certificate secret reference must be an AWS Secrets Manager ARN.',
        'CERTIFICATE_SECRET_REF_NOT_ARN',
      );
    }

    const result = await this.client.send(
      new GetSecretValueCommand({ SecretId: secretRef }),
    );
    if (result.SecretString) return result.SecretString;
    if (result.SecretBinary) return Buffer.from(result.SecretBinary);

    throw new CertificateCustodyError(
      'Certificate secret did not contain string or binary material.',
      'CERTIFICATE_SECRET_EMPTY',
    );
  }
}

export class InMemoryCertificateSecretProvider implements CertificateSecretProvider {
  constructor(private readonly secrets: ReadonlyMap<string, string | Buffer | Uint8Array>) {}

  async getSecret(secretRef: string): Promise<string | Buffer | Uint8Array> {
    const value = this.secrets.get(secretRef);
    if (!value) {
      throw new CertificateCustodyError(
        'Certificate secret was not found in the local test provider.',
        'CERTIFICATE_SECRET_NOT_FOUND',
      );
    }
    return value;
  }
}

export class InMemoryTenantCertificateRepository implements TenantCertificateRepository {
  readonly auditEvents: CertificateAccessAuditEvent[] = [];

  constructor(private readonly certificates: readonly TenantCertificateMetadata[]) {}

  async findActive(
    input: Pick<ResolveCertificateInput, 'tenantId' | 'environment' | 'label'>,
  ): Promise<TenantCertificateMetadata | undefined> {
    return this.certificates.find(
      (certificate) =>
        certificate.tenantId === input.tenantId &&
        certificate.environment === input.environment &&
        certificate.label === input.label &&
        certificate.status === 'ACTIVE',
    );
  }

  auditAccess(event: CertificateAccessAuditEvent): void {
    this.auditEvents.push(event);
  }
}

function assertCertificateMetadataUsable(
  metadata: TenantCertificateMetadata,
  now: Date,
): void {
  if (metadata.status !== 'ACTIVE') {
    throw new CertificateCustodyError(
      `Certificate is not active: ${metadata.status}.`,
      'CERTIFICATE_NOT_ACTIVE',
    );
  }
  if (metadata.revokedAt) {
    throw new CertificateCustodyError(
      'Certificate has been revoked.',
      'CERTIFICATE_REVOKED',
    );
  }
  if (now < new Date(metadata.validFrom)) {
    throw new CertificateCustodyError(
      'Certificate is not valid yet.',
      'CERTIFICATE_NOT_YET_VALID',
    );
  }
  if (now > new Date(metadata.validUntil)) {
    throw new CertificateCustodyError(
      'Certificate is expired.',
      'CERTIFICATE_EXPIRED',
    );
  }
}

function assertCertificateSecretReference(metadata: TenantCertificateMetadata): void {
  assertNoInlineCertificateMaterial(
    metadata.secretRef,
    'CERTIFICATE_SECRET_REF_INLINE_MATERIAL',
  );
  if (
    metadata.secretKind === 'AWS_SECRETS_MANAGER_ARN' &&
    !/^arn:aws(?:-[a-z]+)?:secretsmanager:/u.test(metadata.secretRef)
  ) {
    throw new CertificateCustodyError(
      'Certificate metadata must reference an AWS Secrets Manager ARN.',
      'CERTIFICATE_SECRET_REF_NOT_ARN',
    );
  }
}

function assertNoInlineCertificateMaterial(value: string, code: string): void {
  if (/-----BEGIN|PRIVATE KEY|BEGIN CERTIFICATE/iu.test(value)) {
    throw new CertificateCustodyError(
      'Certificate metadata must not contain inline certificate or private-key material.',
      code,
    );
  }
}

function parseCertificateSecret(
  value: string | Buffer | Uint8Array,
): {
  privateKeyPem: string;
  publicKeyPem: string;
  certificatePem?: string | undefined;
} {
  const text = Buffer.isBuffer(value)
    ? value.toString('utf8')
    : typeof value === 'string'
      ? value
      : Buffer.from(value).toString('utf8');
  const parsed = JSON.parse(text) as Partial<{
    privateKeyPem: string;
    publicKeyPem: string;
    certificatePem: string;
  }>;

  if (!parsed.privateKeyPem || !parsed.publicKeyPem) {
    throw new CertificateCustodyError(
      'Certificate secret must contain privateKeyPem and publicKeyPem.',
      'CERTIFICATE_SECRET_MATERIAL_INVALID',
    );
  }

  return {
    privateKeyPem: parsed.privateKeyPem,
    publicKeyPem: parsed.publicKeyPem,
    certificatePem: parsed.certificatePem,
  };
}

type CertificateRow = Readonly<{
  certificate_id: string;
  tenant_id: string;
  environment: string;
  label: string;
  secret_ref: string;
  secret_kind: CertificateSecretKind;
  certificate_fingerprint_sha256: string;
  subject_name: string | null;
  issuer_name: string | null;
  serial_number: string | null;
  valid_from: string;
  valid_until: string;
  status: CertificateStatus;
  revoked_at: string | null;
  rotated_at: string | null;
}>;

type CacheEntry = Readonly<{
  handle: CertificateHandle;
  metadata: TenantCertificateMetadata;
  expiresAt: number;
}>;

function certificateMetadataFromRow(row: CertificateRow): TenantCertificateMetadata {
  return {
    certificateId: row.certificate_id,
    tenantId: row.tenant_id,
    environment: row.environment,
    label: row.label,
    secretRef: row.secret_ref,
    secretKind: row.secret_kind,
    certificateFingerprintSha256: row.certificate_fingerprint_sha256,
    subjectName: row.subject_name ?? undefined,
    issuerName: row.issuer_name ?? undefined,
    serialNumber: row.serial_number ?? undefined,
    validFrom: new Date(row.valid_from).toISOString(),
    validUntil: new Date(row.valid_until).toISOString(),
    status: row.status,
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : undefined,
    rotatedAt: row.rotated_at ? new Date(row.rotated_at).toISOString() : undefined,
  };
}

function certificateCacheKey(
  input: Pick<ResolveCertificateInput, 'tenantId' | 'environment' | 'label'>,
): string {
  return `${input.tenantId}:${input.environment}:${input.label}`;
}

function certificateReference(
  metadata: TenantCertificateMetadata,
): CertificateReference {
  return {
    tenantId: metadata.tenantId,
    environment: metadata.environment,
    label: metadata.label,
    secretRef: metadata.secretRef,
    version: metadata.certificateId,
  };
}
