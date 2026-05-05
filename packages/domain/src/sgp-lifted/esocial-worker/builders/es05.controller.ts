import {
  Body,
  Controller,
  Get,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

import { AuditService } from '../../audit/audit.service';
import { AuditMutation } from '../../common/audit/audit-mutation.decorator';
import type { RequestWithContext } from '../../common/request-id/request-with-context';
import { RequirePermission } from '../../iam/decorators/require-permission.decorator';
import { ES05Service } from './es05.service';

class CloseCompetenceDto {
  year!: number;
  month!: number;
}

class ReopenCompetenceDto {
  year!: number;
  month!: number;
}

class IngestTotalizerDto {
  @IsString()
  @IsNotEmpty()
  xml!: string;
}

@ApiTags('esocial')
@ApiBearerAuth()
@Controller('v1/esocial/fechamento')
export class ES05Controller {
  constructor(
    private readonly service: ES05Service,
    private readonly auditService: AuditService,
  ) {}

  @ApiOperation({ summary: 'GET Status' })
  @Get()
  @RequirePermission('esocial.event.read')
  @ApiOkResponse({
    description:
      'List S-1299 closure state, pending periodics, and S-5xxx totalizers.',
  })
  status(
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.service.status(year, month);
  }

  @ApiOperation({ summary: 'POST fechar' })
  @Post('fechar')
  @RequirePermission('esocial.event.write')
  @ApiCreatedResponse({
    description: 'Emit S-1299 for a closed periodic competence.',
  })
  async close(
    @Req() request: RequestWithContext,
    @Body() body: CloseCompetenceDto,
  ) {
    const result = await this.service.close(body.year, body.month);
    await this.auditService.auditMutation(request, 'PROCESS', 'esocial.s1299', {
      resourceId: result.competence,
      tableName: 'esocial.s1299_emission_state',
      metadata: {
        emitted: result.emitted,
        eventId: result.event.id,
        xmlHash: result.xmlHash,
      },
    });
    return result;
  }

  @ApiOperation({ summary: 'POST totalizadores' })
  @Post('totalizadores')
  @RequirePermission('esocial.event.write')
  @ApiCreatedResponse({
    description: 'Ingest S-5001..S-5013 totalizer return XML.',
  })
  async ingestTotalizer(
    @Req() request: RequestWithContext,
    @Body() body: IngestTotalizerDto,
  ) {
    const result = await this.service.ingestTotalizer(body.xml);
    await this.auditService.auditMutation(
      request,
      'PROCESS',
      'esocial.totalizer',
      {
        resourceId: `${result.competence}:${result.kind}:${result.sourceEventRecibo}`,
        tableName: 'esocial.esocial_totalizer',
        metadata: {
          kind: result.kind,
          competence: result.competence,
          sourceEventRecibo: result.sourceEventRecibo,
        },
      },
    );
    return result;
  }

  @ApiOperation({ summary: 'POST reabrir' })
  @Post('reabrir')
  @RequirePermission('esocial.event.write')
  @AuditMutation({
    resourceType: 'esocial.reopening',
    tableName: 'esocial.s1299_emission_state',
    action: 'PROCESS',
  })
  @ApiOkResponse({
    description: 'Emit S-1298 to reopen an accepted periodic competence.',
  })
  reopen(@Body() body: ReopenCompetenceDto) {
    return this.service.reopen(body.year, body.month);
  }
}
