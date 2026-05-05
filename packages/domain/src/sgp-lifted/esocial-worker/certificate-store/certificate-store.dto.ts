import {
  IsBase64,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UploadTenantCertificateDto {
  @IsString()
  @MaxLength(80)
  alias!: string;

  @IsIn(['A1', 'A3'])
  kind!: 'A1' | 'A3';

  @IsBase64()
  pkcs12Base64!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  password?: string;

  @IsOptional()
  @IsISO8601()
  validFrom?: string;

  @IsOptional()
  @IsISO8601()
  validTo?: string;
}

export class RotateTenantCertificateDto extends UploadTenantCertificateDto {}

export interface TenantCertificateDto {
  certificateId: string;
  alias: string;
  kind: 'A1' | 'A3';
  validFrom: string;
  validTo: string;
  rotatedAt: string | null;
  rotationDueAt: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  expiresInDays: number;
  expiresSoon: boolean;
}
