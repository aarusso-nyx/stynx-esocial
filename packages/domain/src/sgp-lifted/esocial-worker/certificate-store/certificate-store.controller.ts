import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AuditService } from '../../audit/audit.service';
import type { RequestWithContext } from '../../common/request-id/request-with-context';
import { RequirePermission } from '../../iam/decorators/require-permission.decorator';
import {
  RotateTenantCertificateDto,
  UploadTenantCertificateDto,
} from './certificate-store.dto';
import { CertificateStoreService } from './certificate-store.service';

@ApiTags('esocial-certificates')
@ApiBearerAuth()
@Controller('v1/esocial/certificados')
export class CertificateStoreController {
  constructor(
    private readonly certificateStore: CertificateStoreService,
    private readonly auditService: AuditService,
  ) {}

  @ApiOperation({ summary: 'GET List' })
  @Get()
  @RequirePermission('esocial.certificate.read')
  @ApiOkResponse({ description: 'List current-tenant eSocial certificates.' })
  list() {
    return this.certificateStore.listCurrentTenantCertificates();
  }

  @ApiOperation({ summary: 'POST Upload' })
  @Post()
  @RequirePermission('esocial.certificate.write')
  @ApiCreatedResponse({ description: 'Upload a new ICP-Brasil certificate.' })
  async upload(
    @Req() request: RequestWithContext,
    @Body() body: UploadTenantCertificateDto,
  ) {
    const uploaded = await this.certificateStore.upload(body);
    await this.auditService.auditMutation(
      request,
      'CREATE',
      'esocial.tenant_certificate',
      {
        resourceId: uploaded.certificateId,
        tableName: 'esocial.tenant_certificate',
        metadata: { alias: uploaded.alias, kind: uploaded.kind },
      },
    );
    return uploaded;
  }

  @ApiOperation({ summary: 'PUT :certificateId/rotacao' })
  @Put(':certificateId/rotacao')
  @RequirePermission('esocial.certificate.write')
  @ApiOkResponse({ description: 'Rotate an ICP-Brasil certificate.' })
  async rotate(
    @Req() request: RequestWithContext,
    @Param('certificateId') certificateId: string,
    @Body() body: RotateTenantCertificateDto,
  ) {
    const rotated = await this.certificateStore.rotate(certificateId, body);
    await this.auditService.auditMutation(
      request,
      'UPDATE',
      'esocial.tenant_certificate',
      {
        resourceId: rotated.certificateId,
        tableName: 'esocial.tenant_certificate',
        metadata: { alias: rotated.alias, kind: rotated.kind, rotated: true },
      },
    );
    return rotated;
  }

  @ApiOperation({ summary: 'DELETE :certificateId' })
  @Delete(':certificateId')
  @RequirePermission('esocial.certificate.write')
  @ApiOkResponse({ description: 'Revoke an ICP-Brasil certificate.' })
  async revoke(
    @Req() request: RequestWithContext,
    @Param('certificateId') certificateId: string,
  ) {
    const revoked = await this.certificateStore.revoke(certificateId);
    await this.auditService.auditMutation(
      request,
      'UPDATE',
      'esocial.tenant_certificate',
      {
        resourceId: revoked.certificateId,
        tableName: 'esocial.tenant_certificate',
        metadata: { alias: revoked.alias, status: revoked.status },
      },
    );
    return revoked;
  }
}
