import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import {
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AuditService } from '../../audit/audit.service';
import type { RequestWithContext } from '../../common/request-id/request-with-context';
import { RequirePermission } from '../../iam/decorators/require-permission.decorator';
import { ES03Service } from './es03.service';

@ApiTags('esocial')
@ApiBearerAuth()
@Controller('v1/esocial/eventos-trabalhador')
export class ES03Controller {
  constructor(
    private readonly service: ES03Service,
    private readonly auditService: AuditService,
  ) {}

  @ApiOperation({ summary: 'GET Status' })
  @Get()
  @RequirePermission('esocial.event.read')
  @ApiOkResponse({
    description: 'List S-2210/S-2220/S-2230/S-2299 worker event queues.',
  })
  status() {
    return this.service.listStatus();
  }

  @ApiOperation({ summary: 'POST s2210/:catEmissionId/emitir' })
  @Post('s2210/:catEmissionId/emitir')
  @RequirePermission('esocial.event.write')
  @ApiOkResponse({
    description: 'Emit a pending S-2210 CAT worker event.',
  })
  async emitS2210(
    @Req() request: RequestWithContext,
    @Param('catEmissionId') catEmissionId: string,
  ) {
    const result = await this.service.emitS2210(catEmissionId);
    await this.auditService.auditMutation(request, 'PROCESS', 'esocial.s2210', {
      resourceId: catEmissionId,
      tableName: 'esocial.s2210_pending',
      metadata: {
        emitted: result.emitted,
        xmlHash: result.xmlHash,
        lastError: result.lastError,
      },
    });
    return result;
  }

  @ApiOperation({ summary: 'POST s2220/:asoRecordId/retry' })
  @Post('s2220/:asoRecordId/retry')
  @RequirePermission('esocial.event.write')
  @ApiOkResponse({
    description: 'Retry a pending S-2220 ASO monitoring event.',
  })
  async retryS2220(
    @Req() request: RequestWithContext,
    @Param('asoRecordId') asoRecordId: string,
  ) {
    const result = await this.service.emitS2220(asoRecordId);
    await this.auditService.auditMutation(request, 'PROCESS', 'esocial.s2220', {
      resourceId: asoRecordId,
      tableName: 'esocial.s2220_pending',
      metadata: {
        emitted: result.emitted,
        xmlHash: result.xmlHash,
        lastError: result.lastError,
      },
    });
    return result;
  }

  @ApiOperation({ summary: 'POST s2240/:environmentalExposureId/emitir' })
  @Post('s2240/:environmentalExposureId/emitir')
  @RequirePermission('esocial.event.write')
  @ApiOkResponse({
    description: 'Emit a pending S-2240 environmental exposure event.',
  })
  async emitS2240(
    @Req() request: RequestWithContext,
    @Param('environmentalExposureId') environmentalExposureId: string,
    @Body() body: { triggerEvent?: 'START' | 'END' | 'CHANGE' },
  ) {
    const triggerEvent = body.triggerEvent ?? 'START';
    const result = await this.service.emitS2240(
      environmentalExposureId,
      triggerEvent,
    );
    await this.auditService.auditMutation(request, 'PROCESS', 'esocial.s2240', {
      resourceId: environmentalExposureId,
      tableName: 'esocial.s2240_pending',
      metadata: {
        emitted: result.emitted,
        xmlHash: result.xmlHash,
        lastError: result.lastError,
        triggerEvent,
      },
    });
    return result;
  }

  @ApiOperation({ summary: 'POST s2230/:pendingId/emitir' })
  @Post('s2230/:pendingId/emitir')
  @RequirePermission('esocial.event.write')
  @ApiOkResponse({ description: 'Emit a pending S-2230 event.' })
  async emitS2230(
    @Req() request: RequestWithContext,
    @Param('pendingId') pendingId: string,
  ) {
    const result = await this.service.emitS2230(pendingId);
    await this.auditService.auditMutation(request, 'PROCESS', 'esocial.s2230', {
      resourceId: pendingId,
      tableName: 'esocial.s2230_pending',
      metadata: { emitted: result.emitted, xmlHash: result.xmlHash },
    });
    return result;
  }

  @ApiOperation({ summary: 'POST s2299/:pendingId/emitir' })
  @Post('s2299/:pendingId/emitir')
  @RequirePermission('esocial.event.write')
  @ApiOkResponse({ description: 'Emit a pending S-2299 event.' })
  async emitS2299(
    @Req() request: RequestWithContext,
    @Param('pendingId') pendingId: string,
  ) {
    const result = await this.service.emitS2299(pendingId);
    await this.auditService.auditMutation(request, 'PROCESS', 'esocial.s2299', {
      resourceId: pendingId,
      tableName: 'esocial.s2299_pending',
      metadata: { emitted: result.emitted, xmlHash: result.xmlHash },
    });
    return result;
  }
}
