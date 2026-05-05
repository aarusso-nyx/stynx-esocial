import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

import { AuditService } from '../../audit/audit.service';
import type { RequestWithContext } from '../../common/request-id/request-with-context';
import { RequirePermission } from '../../iam/decorators/require-permission.decorator';
import type { S1xxxEventKind } from './s1xxx-common';
import { S1xxxService } from './s1xxx.service';

const S1XXX_EVENT_KINDS: readonly S1xxxEventKind[] = [
  'S-1000',
  'S-1005',
  'S-1010',
  'S-1020',
  'S-1030',
  'S-1040',
  'S-1060',
  'S-1050',
  'S-1070',
] as const;

class EmitS1xxxDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}$/)
  competence?: string;

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

@ApiTags('esocial')
@ApiBearerAuth()
@Controller('v1/esocial/tabelas-iniciais')
export class S1xxxController {
  constructor(
    private readonly s1xxxService: S1xxxService,
    private readonly auditService: AuditService,
  ) {}

  @ApiOperation({ summary: 'GET Status' })
  @Get()
  @RequirePermission('esocial.event.read')
  @ApiOkResponse({ description: 'List S-1xxx table dispatch status.' })
  status() {
    return this.s1xxxService.status();
  }

  @ApiOperation({ summary: 'POST emitir' })
  @Post('emitir')
  @RequirePermission('esocial.event.write')
  @ApiOkResponse({ description: 'Emit all S-1xxx table deltas.' })
  async emitAll(
    @Req() request: RequestWithContext,
    @Body() body: EmitS1xxxDto,
  ) {
    const results = await this.s1xxxService.emitAll(body);
    await this.auditService.auditMutation(request, 'PROCESS', 'esocial.s1xxx', {
      tableName: 'esocial.s1xxx_dispatch_state',
      metadata: {
        eventKinds: S1XXX_EVENT_KINDS,
        emitted: results.filter((result) => result.emitted).length,
      },
    });
    return results;
  }

  @ApiOperation({ summary: 'POST :eventKind/emitir' })
  @Post(':eventKind/emitir')
  @RequirePermission('esocial.event.write')
  @ApiOkResponse({ description: 'Emit one S-1xxx table delta.' })
  async emitOne(
    @Req() request: RequestWithContext,
    @Param('eventKind') eventKind: S1xxxEventKind,
    @Body() body: EmitS1xxxDto,
  ) {
    this.assertEventKind(eventKind);
    const results = await this.s1xxxService.emitOne(eventKind, body);
    await this.auditService.auditMutation(request, 'PROCESS', 'esocial.s1xxx', {
      tableName: 'esocial.s1xxx_dispatch_state',
      metadata: {
        eventKind,
        emitted: results.filter((result) => result.emitted).length,
      },
    });
    return results;
  }

  private assertEventKind(
    eventKind: string,
  ): asserts eventKind is S1xxxEventKind {
    if (!S1XXX_EVENT_KINDS.includes(eventKind as S1xxxEventKind)) {
      throw new BadRequestException(
        `Unsupported S-1xxx event kind: ${eventKind}`,
      );
    }
  }
}
