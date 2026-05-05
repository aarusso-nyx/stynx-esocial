import { Controller, Get, Param, Post, Req } from '@nestjs/common';
import {
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AuditService } from '../../audit/audit.service';
import type { RequestWithContext } from '../../common/request-id/request-with-context';
import { RequirePermission } from '../../iam/decorators/require-permission.decorator';
import { SubmissionService } from './submission.service';

@ApiTags('esocial-submission')
@ApiBearerAuth()
@Controller('v1/esocial/submissoes')
export class SubmissionController {
  constructor(
    private readonly submissionService: SubmissionService,
    private readonly auditService: AuditService,
  ) {}

  @ApiOperation({ summary: 'GET List batches' })
  @Get()
  @RequirePermission('esocial.submission.read')
  @ApiOkResponse({ description: 'List eSocial SOAP submission batches.' })
  listBatches() {
    return this.submissionService.listBatches();
  }

  @ApiOperation({ summary: 'GET circuitos' })
  @Get('circuitos')
  @RequirePermission('esocial.submission.read')
  @ApiOkResponse({ description: 'List eSocial endpoint circuit states.' })
  listCircuitStates() {
    return this.submissionService.listCircuitStates();
  }

  @ApiOperation({ summary: 'POST :batchId/retry' })
  @Post(':batchId/retry')
  @RequirePermission('esocial.submission.retry')
  @ApiOkResponse({
    description: 'Force retry for an eSocial submission batch.',
  })
  async forceRetry(
    @Req() request: RequestWithContext,
    @Param('batchId') batchId: string,
  ) {
    const result = await this.submissionService.forceRetry(batchId);
    await this.auditService.auditMutation(
      request,
      'PROCESS',
      'esocial.submission_batch',
      {
        resourceId: result.batchId,
        tableName: 'esocial.submission_batch',
        metadata: {
          status: result.status,
          attempts: result.attempts,
          endpointUrl: result.endpointUrl,
        },
      },
    );
    return result;
  }
}
