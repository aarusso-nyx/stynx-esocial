import { Controller, Param, Post } from '@nestjs/common';
import {
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AuditMutation } from '../../common/audit/audit-mutation.decorator';
import { RequirePermission } from '../../iam/decorators/require-permission.decorator';
import { S2306Service } from './s2306.service';

@ApiTags('esocial')
@ApiBearerAuth()
@Controller('v1/admin/esocial/s2306')
export class S2306Controller {
  constructor(private readonly service: S2306Service) {}

  @ApiOperation({ summary: 'POST :changeId' })
  @Post(':changeId')
  @RequirePermission('esocial.event.write')
  @AuditMutation({
    action: 'CREATE',
    resourceType: 'esocial.s2306_event',
    tableName: 'esocial.s2306_event',
  })
  @ApiOkResponse({ description: 'Build and transmit an S-2306 event.' })
  emit(@Param('changeId') changeId: string) {
    return this.service.emit(changeId);
  }
}
