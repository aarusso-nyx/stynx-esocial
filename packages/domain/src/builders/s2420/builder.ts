import type { S2420BenefitTerminationDto } from '@esocial/contracts';

import { buildPromotedBenefitProcessXml } from '../benefits-process-exclusion-adapter.js';
import type { BuilderContext, BuiltXml } from '../common.js';

export function buildS2420(
  dto: S2420BenefitTerminationDto,
  ctx: BuilderContext = {},
): BuiltXml {
  return buildPromotedBenefitProcessXml(dto, ctx);
}
