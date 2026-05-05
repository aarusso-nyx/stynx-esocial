import type { S1005EstablishmentDto } from '@esocial/contracts';

import type { BuilderContext, BuiltXml } from '../common.js';
import { validateRequired } from '../common.js';
import { buildPromotedTableXml } from '../table-adapter.js';

export function buildS1005(
  dto: S1005EstablishmentDto,
  ctx: BuilderContext = {},
): BuiltXml {
  validateRequired(dto, [
    'tenantId',
    'sourceEventId',
    'sourceEntityId',
    'employerCnpj',
    'validityStart',
    'establishmentRegistrationNumber',
  ]);
  const sourceEntityId = dto.sourceEntityId ?? dto.sourceEventId;
  return buildPromotedTableXml({
    eventClass: 'S-1005',
    tenantId: dto.tenantId,
    sourceEventId: dto.sourceEventId,
    sourceEntityId,
    competence: dto.validityStart,
    environment: environmentCode(ctx),
    establishment: {
      registrationNumber: dto.establishmentRegistrationNumber,
      employerRegistrationNumber: dto.employerCnpj,
      cnaePreponderante: dto.cnaePreponderante,
    },
  });
}

function environmentCode(ctx: BuilderContext): '1' | '2' {
  return ctx.environment === 'production' ? '1' : '2';
}
