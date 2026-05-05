import {
  sha256Hex,
} from '@esocial/pki-pades';
import type {
  CertificateHandle,
  CertificateReference,
} from '@esocial/pki-pades';
import { handlerResult } from '@esocial/service-shared';

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
  constructor(
    private readonly repository: TenantCertificateRepository,
    private readonly secretProvider: CertificateSecretProvider,
  ) {}

  async resolveCertificate(
    input: ResolveCertificateInput,
  ): Promise<CertificateHandle> {
    const now = input.now ?? new Date();
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
      return {
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
