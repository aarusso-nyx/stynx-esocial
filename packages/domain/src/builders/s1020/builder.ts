import type { S1020TaxLotationDto } from '@esocial/contracts';

import type { BuilderContext, BuiltXml } from '../common.js';
import { validateRequired } from '../common.js';
import { buildPromotedTableXml } from '../table-adapter.js';

export function buildS1020(
  dto: S1020TaxLotationDto,
  ctx: BuilderContext = {},
): BuiltXml {
  validateRequired(dto, [
    'tenantId',
    'sourceEventId',
    'sourceEntityId',
    'employerCnpj',
    'validityStart',
    'lotationCode',
  ]);
  const sourceEntityId = dto.sourceEntityId ?? dto.sourceEventId;
  return buildPromotedTableXml({
    eventClass: 'S-1020',
    tenantId: dto.tenantId,
    sourceEventId: dto.sourceEventId,
    sourceEntityId,
    competence: dto.validityStart,
    environment: environmentCode(ctx),
    taxLotation: {
      code: dto.lotationCode,
      employerRegistrationNumber: dto.employerCnpj,
      typeCode: dto.lotationTypeCode,
      fpasCode: dto.fpasCode,
      thirdPartyCode: dto.thirdPartyCode,
    },
  });
}

function environmentCode(ctx: BuilderContext): '1' | '2' {
  return ctx.environment === 'production' ? '1' : '2';
}
