import type { S2399TsvTerminationDto } from '@esocial/contracts';

import type { BuilderContext, BuiltXml } from '../common.js';
import { buildPromotedWorkerXml } from '../worker-adapter.js';

export function buildS2399(
  dto: S2399TsvTerminationDto,
  ctx: BuilderContext = {},
): BuiltXml {
  return buildPromotedWorkerXml(dto, ctx);
}
