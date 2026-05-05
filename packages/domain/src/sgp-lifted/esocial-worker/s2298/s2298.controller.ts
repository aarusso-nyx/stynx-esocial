import { Controller, Param, Post } from '@nestjs/common';
import {
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AuditMutation } from '../../common/audit/audit-mutation.decorator';
import { RequirePermission } from '../../iam/decorators/require-permission.decorator';
import { S2298Service } from './s2298.service';

@ApiTags('esocial')
@ApiBearerAuth()
@Controller('v1/admin/esocial/s2298')
export class S2298Controller {
  constructor(private readonly service: S2298Service) {}

  @ApiOperation({ summary: 'POST :orderId' })
  @Post(':orderId')
  @RequirePermission('esocial.event.write')
  @AuditMutation({
    action: 'CREATE',
    resourceType: 'esocial.s2298_event',
    tableName: 'esocial.s2298_event',
  })
  @ApiOkResponse({ description: 'Build and transmit an S-2298 event.' })
  emit(@Param('orderId') orderId: string) {
    return this.service.emit(orderId);
  }
}
