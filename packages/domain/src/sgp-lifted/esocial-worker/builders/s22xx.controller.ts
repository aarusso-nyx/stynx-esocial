import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
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
import { S22xxService } from './s22xx.service';

class EmitS22xxDto {
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
@Controller('v1/esocial/trabalhadores')
export class S22xxController {
  constructor(
    private readonly service: S22xxService,
    private readonly auditService: AuditService,
  ) {}

  @ApiOperation({ summary: 'GET Status' })
  @Get()
  @RequirePermission('esocial.event.read')
  @ApiOkResponse({ description: 'List worker eSocial S-2200/S-2205 status.' })
  status() {
    return this.service.listStatus();
  }

  @ApiOperation({ summary: 'POST :employeeId/s2200/emitir' })
  @Post(':employeeId/s2200/emitir')
  @RequirePermission('esocial.event.write')
  @ApiOkResponse({ description: 'Force or schedule S-2200 emission.' })
  async emitS2200(
    @Req() request: RequestWithContext,
    @Param('employeeId') employeeId: string,
    @Body() body: EmitS22xxDto,
  ) {
    const result = await this.service.emitS2200(employeeId, body);
    await this.auditService.auditMutation(request, 'PROCESS', 'esocial.s2200', {
      resourceId: employeeId,
      tableName: 'esocial.s2200_emission_state',
      metadata: { emitted: result.emitted, xmlHash: result.xmlHash },
    });
    return result;
  }

  @ApiOperation({ summary: 'POST :employeeId/s2205/emitir' })
  @Post(':employeeId/s2205/emitir')
  @RequirePermission('esocial.event.write')
  @ApiOkResponse({ description: 'Emit pending S-2205 worker changes.' })
  async emitS2205(
    @Req() request: RequestWithContext,
    @Param('employeeId') employeeId: string,
    @Body() body: EmitS22xxDto,
  ) {
    const result = await this.service.emitPendingS2205(employeeId, body);
    await this.auditService.auditMutation(request, 'PROCESS', 'esocial.s2205', {
      resourceId: employeeId,
      tableName: 'esocial.s2205_pending_alteration',
      metadata: { emitted: result.emitted, xmlHash: result.xmlHash },
    });
    return result;
  }
}
