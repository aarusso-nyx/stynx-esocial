import type { S1070ProcessDto } from '@esocial/contracts';

import type { BuilderContext, BuiltXml } from '../common.js';
import { validateRequired } from '../common.js';
import { buildPromotedTableXml } from '../table-adapter.js';

export function buildS1070(
  dto: S1070ProcessDto,
  ctx: BuilderContext = {},
): BuiltXml {
  validateRequired(dto, [
    'tenantId',
    'sourceEventId',
    'sourceEntityId',
    'employerCnpj',
    'validityStart',
    'processNumber',
    'subject',
  ]);
  const sourceEntityId = dto.sourceEntityId ?? dto.sourceEventId;
  return buildPromotedTableXml({
    eventClass: 'S-1070',
    tenantId: dto.tenantId,
    sourceEventId: dto.sourceEventId,
    sourceEntityId,
    competence: dto.validityStart,
    environment: environmentCode(ctx),
    process: {
      processNumber: dto.processNumber,
      subject: dto.subject,
      employerRegistrationNumber: dto.employerCnpj,
      processType: dto.processType,
      matterIndicator: dto.matterIndicator,
    },
  });
}

function environmentCode(ctx: BuilderContext): '1' | '2' {
  return ctx.environment === 'production' ? '1' : '2';
}
