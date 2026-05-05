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
import { AcceptS3000Dto, RequestS3000ExclusionDto } from './s3000.dto';
import { S3000Service } from './s3000.service';

@ApiTags('esocial')
@ApiBearerAuth()
@Controller('v1/esocial')
export class S3000Controller {
  constructor(
    private readonly service: S3000Service,
    private readonly auditService: AuditService,
  ) {}

  @ApiOperation({ summary: 'GET events/excludable' })
  @Get('events/excludable')
  @RequirePermission('esocial.event.read')
  @ApiOkResponse({
    description: 'List accepted eSocial events eligible for S-3000.',
  })
  eligibleEvents() {
    return this.service.eligibleEvents();
  }

  @ApiOperation({ summary: 'GET exclusions' })
  @Get('exclusions')
  @RequirePermission('esocial.event.read')
  @ApiOkResponse({ description: 'List S-3000 exclusion requests.' })
  requests() {
    return this.service.requests();
  }

  @ApiOperation({ summary: 'POST events/:id/exclude' })
  @Post('events/:id/exclude')
  @RequirePermission('esocial.event.exclude')
  @ApiOkResponse({
    description: 'Request and emit S-3000 for an accepted eSocial event.',
  })
  async exclude(
    @Req() request: RequestWithContext,
    @Param('id') id: string,
    @Body() body: RequestS3000ExclusionDto,
  ) {
    const result = await this.service.requestAndEmit(
      id,
      body.justification,
      userIdFromRequest(request),
    );
    await this.auditService.auditMutation(request, 'PROCESS', 'esocial.s3000', {
      resourceId: result.requestId,
      tableName: 'esocial.s3000_request',
      reason: body.justification,
      metadata: {
        targetEventId: id,
        targetEventKind: result.targetEventKind,
        emitted: result.emitted,
        blockReason: result.blockReason,
        requestedByUserId: result.requestedByUserId,
      },
    });
    return result;
  }

  @ApiOperation({ summary: 'POST exclusions/:requestId/accept' })
  @Post('exclusions/:requestId/accept')
  @RequirePermission('esocial.event.exclude')
  @ApiOkResponse({
    description:
      'Apply accepted S-3000 receipt and mark target event excluded.',
  })
  async accept(
    @Req() request: RequestWithContext,
    @Param('requestId') requestId: string,
    @Body() body: AcceptS3000Dto,
  ) {
    const result = await this.service.accept(requestId, body.receipt);
    await this.auditService.auditMutation(request, 'PROCESS', 'esocial.s3000', {
      resourceId: result.requestId,
      tableName: 'esocial.s3000_request',
      reason: result.justification,
      metadata: {
        targetEventId: result.targetEventId,
        targetEventKind: result.targetEventKind,
        targetRecibo: result.targetRecibo,
        acceptedReceipt: result.acceptedReceipt,
      },
    });
    return result;
  }
}

function userIdFromRequest(request: RequestWithContext): string | null {
  const claims = request.actor?.claims ?? {};
  const value = claims['user_id'] ?? claims['custom:user_id'];
  return typeof value === 'string' ? value : null;
}
