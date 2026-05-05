import {
  Body,
  Controller,
  Get,
  Param,
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
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

import { AuditService } from '../../audit/audit.service';
import type { RequestWithContext } from '../../common/request-id/request-with-context';
import { RequirePermission } from '../../iam/decorators/require-permission.decorator';
import { ES04Service } from './es04.service';

class EmitPeriodicPayrollDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

@ApiTags('esocial')
@ApiBearerAuth()
@Controller('v1/esocial/folha-periodica')
export class ES04Controller {
  constructor(
    private readonly service: ES04Service,
    private readonly auditService: AuditService,
  ) {}

  @ApiOperation({ summary: 'GET Status' })
  @Get()
  @RequirePermission('esocial.event.read')
  @ApiOkResponse({ description: 'List S-1200/S-1210 status by competence.' })
  status(
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.service.listStatus(year, month);
  }

  @ApiOperation({ summary: 'POST runs/:payrollRunId/s1200/emitir' })
  @Post('runs/:payrollRunId/s1200/emitir')
  @RequirePermission('esocial.event.write')
  @ApiCreatedResponse({ description: 'Emit S-1200 remuneration events.' })
  async emitS1200(
    @Req() request: RequestWithContext,
    @Param('payrollRunId') payrollRunId: string,
    @Body() body: EmitPeriodicPayrollDto,
  ) {
    const results = await this.service.emitS1200(payrollRunId, body);
    await this.auditService.auditMutation(request, 'PROCESS', 'esocial.s1200', {
      resourceId: payrollRunId,
      tableName: 'esocial.s1200_emission_state',
      metadata: {
        employeeId: body.employeeId ?? null,
        emitted: results.filter((result) => result.emitted).length,
      },
    });
    return results;
  }

  @ApiOperation({ summary: 'POST runs/:payrollRunId/s1202/emitir' })
  @Post('runs/:payrollRunId/s1202/emitir')
  @RequirePermission('esocial.event.write')
  @ApiCreatedResponse({ description: 'Emit S-1202 RPPS remuneration events.' })
  async emitS1202(
    @Req() request: RequestWithContext,
    @Param('payrollRunId') payrollRunId: string,
    @Body() body: EmitPeriodicPayrollDto,
  ) {
    const results = await this.service.emitS1202(payrollRunId, body);
    await this.auditService.auditMutation(request, 'PROCESS', 'esocial.s1202', {
      resourceId: payrollRunId,
      tableName: 'esocial.s1202_emission_state',
      metadata: {
        employeeId: body.employeeId ?? null,
        emitted: results.filter((result) => result.emitted).length,
      },
    });
    return results;
  }

  @ApiOperation({ summary: 'POST payments/:paymentBatchId/s1210/emitir' })
  @Post('payments/:paymentBatchId/s1210/emitir')
  @RequirePermission('esocial.event.write')
  @ApiCreatedResponse({ description: 'Emit S-1210 payment events.' })
  async emitS1210(
    @Req() request: RequestWithContext,
    @Param('paymentBatchId') paymentBatchId: string,
    @Body() body: EmitPeriodicPayrollDto,
  ) {
    const results = await this.service.emitS1210(paymentBatchId, body);
    await this.auditService.auditMutation(request, 'PROCESS', 'esocial.s1210', {
      resourceId: paymentBatchId,
      tableName: 'esocial.s1210_emission_state',
      metadata: {
        employeeId: body.employeeId ?? null,
        emitted: results.filter((result) => result.emitted).length,
      },
    });
    return results;
  }
}
