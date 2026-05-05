import type { S2210CatDto } from '@esocial/contracts';

import type { BuilderContext, BuiltXml } from '../common.js';
import { buildPromotedWorkerXml } from '../worker-adapter.js';

export function buildS2210(
  dto: S2210CatDto,
  ctx: BuilderContext = {},
): BuiltXml {
  return buildPromotedWorkerXml(dto, ctx);
}
