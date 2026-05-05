import { Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import {
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AuditService } from '../../audit/audit.service';
import type { RequestWithContext } from '../../common/request-id/request-with-context';
import { RequirePermission } from '../../iam/decorators/require-permission.decorator';
import { RetornoService } from './retorno.service';

@ApiTags('esocial-retornos')
@ApiBearerAuth()
@Controller('v1/esocial/retornos')
export class RetornoController {
  constructor(
    private readonly retornoService: RetornoService,
    private readonly auditService: AuditService,
  ) {}

  @ApiOperation({ summary: 'GET falhas' })
  @Get('falhas')
  @RequirePermission('esocial.event.read')
  @ApiOkResponse({
    description: 'List definitive and recoverable eSocial return failures.',
  })
  listFailures(@Query('status') status?: string) {
    return this.retornoService.listFailures(status);
  }

  @ApiOperation({ summary: 'GET eventos/:eventId' })
  @Get('eventos/:eventId')
  @RequirePermission('esocial.event.read')
  @ApiOkResponse({ description: 'Show one eSocial return failure detail.' })
  eventDetail(@Param('eventId') eventId: string) {
    return this.retornoService.eventDetail(eventId);
  }

  @ApiOperation({ summary: 'POST eventos/:eventId/retry' })
  @Post('eventos/:eventId/retry')
  @RequirePermission('esocial.event.retry')
  @ApiOkResponse({
    description: 'Force immediate retry for an eSocial return failure.',
  })
  async forceRetry(
    @Req() request: RequestWithContext,
    @Param('eventId') eventId: string,
  ) {
    const result = await this.retornoService.forceRetry(eventId);
    await this.auditService.auditMutation(
      request,
      'PROCESS',
      'esocial.event_retry_schedule',
      {
        resourceId: eventId,
        tableName: 'esocial.event_retry_schedule',
        metadata: {
          responseCode: result.responseCode,
          attempt: result.attempt,
          nextAt: result.nextAt,
        },
      },
    );
    return result;
  }

  @ApiOperation({ summary: 'POST eventos/:eventId/tratado' })
  @Post('eventos/:eventId/tratado')
  @RequirePermission('esocial.event.retry')
  @ApiOkResponse({
    description:
      'Mark a definitive eSocial failure as handled after source correction.',
  })
  async markHandled(
    @Req() request: RequestWithContext,
    @Param('eventId') eventId: string,
  ) {
    await this.retornoService.markHandled(eventId);
    await this.auditService.auditMutation(
      request,
      'PROCESS',
      'public.esocial_event',
      {
        resourceId: eventId,
        tableName: 'public.esocial_event',
        metadata: {
          handled: true,
        },
      },
    );
    return { eventId, handled: true };
  }
}
