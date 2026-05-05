import type { S2405BeneficiaryChangeDto } from '@esocial/contracts';

import { buildPromotedBenefitProcessXml } from '../benefits-process-exclusion-adapter.js';
import type { BuilderContext, BuiltXml } from '../common.js';

export function buildS2405(
  dto: S2405BeneficiaryChangeDto,
  ctx: BuilderContext = {},
): BuiltXml {
  return buildPromotedBenefitProcessXml(dto, ctx);
}
