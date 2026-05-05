import type { S2418BenefitReactivationDto } from '@esocial/contracts';

import { buildPromotedBenefitProcessXml } from '../benefits-process-exclusion-adapter.js';
import type { BuilderContext, BuiltXml } from '../common.js';

export function buildS2418(
  dto: S2418BenefitReactivationDto,
  ctx: BuilderContext = {},
): BuiltXml {
  return buildPromotedBenefitProcessXml(dto, ctx);
}
