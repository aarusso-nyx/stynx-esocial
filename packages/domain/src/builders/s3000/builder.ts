import type { S3000ExclusionDto } from '@esocial/contracts';

import { buildPromotedBenefitProcessXml } from '../benefits-process-exclusion-adapter.js';
import type { BuilderContext, BuiltXml } from '../common.js';

export function buildS3000(
  dto: S3000ExclusionDto,
  ctx: BuilderContext = {},
): BuiltXml {
  return buildPromotedBenefitProcessXml(dto, ctx);
}
