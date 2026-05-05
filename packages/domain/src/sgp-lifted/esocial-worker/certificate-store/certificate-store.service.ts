import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueryResultRow } from 'pg';

import { RequestContextStore } from '../../common/request-context/request-context.store';
import { DatabaseService } from '../../database/database.service';
import { IcpSignerService } from '../signature/icp-signer.service';
import {
  RotateTenantCertificateDto,
  TenantCertificateDto,
  UploadTenantCertificateDto,
} from './certificate-store.dto';

interface TenantCertificateRow extends QueryResultRow {
  certificate_id: string;
  alias: string;
  kind: 'A1' | 'A3';
  valid_from: Date | string;
  valid_to: Date | string;
  rotated_at: Date | string | null;
  rotation_due_at: Date | string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
}

interface ActiveCertificateRow extends TenantCertificateRow {
  pkcs12_blob: Buffer;
  blob_kms_key_id: string;
}

export interface ActiveCertificateMaterial {
  certificateId: string;
  alias: string;
  pkcs12: Buffer;
  validTo: Date;
}

@Injectable()
export class CertificateStoreService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
    private readonly signer: IcpSignerService,
  ) {}

  async listCurrentTenantCertificates(): Promise<TenantCertificateDto[]> {
    this.ensureDatabase();
    const rows = await this.databaseService.query<TenantCertificateRow>(
      `
      UPDATE esocial.tenant_certificate
      SET status = 'EXPIRED'::esocial.certificate_status
      WHERE valid_to < now()
        AND status = 'ACTIVE'::esocial.certificate_status
      RETURNING
        certificate_id::text,
        alias,
        kind::text AS kind,
        valid_from,
        valid_to,
        rotated_at,
        rotation_due_at,
        status::text AS status
      `,
    );

    const listed = await this.databaseService.query<TenantCertificateRow>(
      `
      SELECT
        certificate_id::text,
        alias,
        kind::text AS kind,
        valid_from,
        valid_to,
        rotated_at,
        rotation_due_at,
        status::text AS status
      FROM esocial.tenant_certificate
      ORDER BY valid_to DESC, alias ASC
      `,
    );
    return [...rows, ...listed].map((row) => this.toDto(row));
  }

  async upload(
    input: UploadTenantCertificateDto,
  ): Promise<TenantCertificateDto> {
    this.ensureDatabase();
    const tenantId = this.currentTenantId();
    const pkcs12 = Buffer.from(input.pkcs12Base64, 'base64');
    const material = this.signer.readPkcs12(pkcs12, input.password);
    const validFrom = input.validFrom
      ? new Date(input.validFrom)
      : material.validFrom;
    const validTo = input.validTo ? new Date(input.validTo) : material.validTo;
    this.assertUsableValidity(validFrom, validTo);
    const encrypted = this.encrypt(this.signer.toUnencryptedPkcs12(material));

    const rows = await this.databaseService.query<TenantCertificateRow>(
      `
      INSERT INTO esocial.tenant_certificate (
        tenant_id,
        alias,
        kind,
        pkcs12_blob,
        blob_kms_key_id,
        valid_from,
        valid_to,
        rotation_due_at,
        status
      )
      VALUES (
        $1::uuid,
        $2,
        $3::esocial.certificate_kind,
        $4,
        $5,
        $6::timestamptz,
        $7::timestamptz,
        ($7::timestamptz - interval '30 days'),
        'ACTIVE'::esocial.certificate_status
      )
      RETURNING
        certificate_id::text,
        alias,
        kind::text AS kind,
        valid_from,
        valid_to,
        rotated_at,
        rotation_due_at,
        status::text AS status
      `,
      [
        tenantId,
        input.alias.trim(),
        input.kind,
        encrypted.blob,
        encrypted.keyId,
        validFrom.toISOString(),
        validTo.toISOString(),
      ],
    );
    return this.toDto(rows[0]!);
  }

  async rotate(
    certificateId: string,
    input: RotateTenantCertificateDto,
  ): Promise<TenantCertificateDto> {
    this.ensureDatabase();
    const pkcs12 = Buffer.from(input.pkcs12Base64, 'base64');
    const material = this.signer.readPkcs12(pkcs12, input.password);
    const validFrom = input.validFrom
      ? new Date(input.validFrom)
      : material.validFrom;
    const validTo = input.validTo ? new Date(input.validTo) : material.validTo;
    this.assertUsableValidity(validFrom, validTo);
    const encrypted = this.encrypt(this.signer.toUnencryptedPkcs12(material));

    const rows = await this.databaseService.query<TenantCertificateRow>(
      `
      UPDATE esocial.tenant_certificate
      SET alias = $2,
          kind = $3::esocial.certificate_kind,
          pkcs12_blob = $4,
          blob_kms_key_id = $5,
          valid_from = $6::timestamptz,
          valid_to = $7::timestamptz,
          rotated_at = now(),
          rotation_due_at = ($7::timestamptz - interval '30 days'),
          status = 'ACTIVE'::esocial.certificate_status
      WHERE certificate_id = $1::uuid
      RETURNING
        certificate_id::text,
        alias,
        kind::text AS kind,
        valid_from,
        valid_to,
        rotated_at,
        rotation_due_at,
        status::text AS status
      `,
      [
        certificateId,
        input.alias.trim(),
        input.kind,
        encrypted.blob,
        encrypted.keyId,
        validFrom.toISOString(),
        validTo.toISOString(),
      ],
    );
    if (!rows[0]) {
      throw new BadRequestException('Certificate not found for current tenant');
    }
    return this.toDto(rows[0]);
  }

  async revoke(certificateId: string): Promise<TenantCertificateDto> {
    this.ensureDatabase();
    const rows = await this.databaseService.query<TenantCertificateRow>(
      `
      UPDATE esocial.tenant_certificate
      SET status = 'REVOKED'::esocial.certificate_status,
          rotated_at = now()
      WHERE certificate_id = $1::uuid
      RETURNING
        certificate_id::text,
        alias,
        kind::text AS kind,
        valid_from,
        valid_to,
        rotated_at,
        rotation_due_at,
        status::text AS status
      `,
      [certificateId],
    );
    if (!rows[0]) {
      throw new BadRequestException('Certificate not found for current tenant');
    }
    return this.toDto(rows[0]);
  }

  async activeCertificate(): Promise<ActiveCertificateMaterial> {
    this.ensureDatabase();
    const rows = await this.databaseService.query<ActiveCertificateRow>(
      `
      SELECT
        certificate_id::text,
        alias,
        kind::text AS kind,
        pkcs12_blob,
        blob_kms_key_id,
        valid_from,
        valid_to,
        rotated_at,
        rotation_due_at,
        status::text AS status
      FROM esocial.tenant_certificate
      WHERE status = 'ACTIVE'::esocial.certificate_status
        AND valid_from <= now()
        AND valid_to > now()
      ORDER BY valid_to DESC
      LIMIT 1
      `,
    );
    const row = rows[0];
    if (!row) {
      throw new BadRequestException(
        'No active non-expired eSocial certificate is available for current tenant',
      );
    }

    return {
      certificateId: row.certificate_id,
      alias: row.alias,
      pkcs12: this.decrypt(row.pkcs12_blob, row.blob_kms_key_id),
      validTo: new Date(row.valid_to),
    };
  }

  private encrypt(plain: Buffer): { blob: Buffer; keyId: string } {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      blob: Buffer.concat([Buffer.from('v1:'), iv, tag, encrypted]),
      keyId: this.keyId(),
    };
  }

  private decrypt(blob: Buffer, keyId: string): Buffer {
    if (keyId !== this.keyId()) {
      throw new BadRequestException(
        'Certificate KMS key id does not match this runtime',
      );
    }
    if (blob.subarray(0, 3).toString('utf8') !== 'v1:') {
      throw new BadRequestException('Unsupported certificate blob format');
    }
    const iv = blob.subarray(3, 15);
    const tag = blob.subarray(15, 31);
    const encrypted = blob.subarray(31);
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  private assertUsableValidity(validFrom: Date, validTo: Date): void {
    if (Number.isNaN(validFrom.getTime()) || Number.isNaN(validTo.getTime())) {
      throw new BadRequestException('Certificate validity dates are invalid');
    }
    if (validTo <= validFrom || validTo <= new Date()) {
      throw new BadRequestException('Expired certificates cannot be activated');
    }
  }

  private toDto(row: TenantCertificateRow): TenantCertificateDto {
    const validTo = new Date(row.valid_to);
    const expiresInDays = Math.ceil(
      (validTo.getTime() - Date.now()) / 86_400_000,
    );
    return {
      certificateId: row.certificate_id,
      alias: row.alias,
      kind: row.kind,
      validFrom: new Date(row.valid_from).toISOString(),
      validTo: validTo.toISOString(),
      rotatedAt: row.rotated_at ? new Date(row.rotated_at).toISOString() : null,
      rotationDueAt: new Date(row.rotation_due_at).toISOString(),
      status: row.status,
      expiresInDays,
      expiresSoon: expiresInDays <= 30,
    };
  }

  private currentTenantId(): string {
    const context = RequestContextStore.get();
    const tenantId = context?.actor?.tenantId ?? context?.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required');
    }
    return tenantId;
  }

  private ensureDatabase(): void {
    if (!this.databaseService.configured) {
      throw new ServiceUnavailableException(
        'DATABASE_URL is required for eSocial certificate operations',
      );
    }
  }

  private encryptionKey(): Buffer {
    const configured = this.configService.get<string>(
      'ESOCIAL_CERTIFICATE_ENCRYPTION_KEY',
    );
    if (configured) {
      const raw = Buffer.from(
        configured,
        /^[0-9a-f]{64}$/i.test(configured) ? 'hex' : 'base64',
      );
      if (raw.length === 32) return raw;
      throw new Error(
        'ESOCIAL_CERTIFICATE_ENCRYPTION_KEY must decode to 32 bytes',
      );
    }
    return createHash('sha256')
      .update('sgp-esocial-local-development-certificate-key')
      .digest();
  }

  private keyId(): string {
    return (
      this.configService.get<string>('ESOCIAL_CERTIFICATE_KMS_KEY_ID') ??
      'local-development'
    );
  }
}
