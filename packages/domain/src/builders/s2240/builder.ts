import type { S2240ExposureDto } from '@esocial/contracts';

import type { BuilderContext, BuiltXml } from '../common.js';
import { buildPromotedWorkerXml } from '../worker-adapter.js';

export function buildS2240(
  dto: S2240ExposureDto,
  ctx: BuilderContext = {},
): BuiltXml {
  return buildPromotedWorkerXml(dto, ctx);
}
