import type { S2400BeneficiaryRegistrationDto } from '@esocial/contracts';

import { buildPromotedBenefitProcessXml } from '../benefits-process-exclusion-adapter.js';
import type { BuilderContext, BuiltXml } from '../common.js';

export function buildS2400(
  dto: S2400BeneficiaryRegistrationDto,
  ctx: BuilderContext = {},
): BuiltXml {
  return buildPromotedBenefitProcessXml(dto, ctx);
}
