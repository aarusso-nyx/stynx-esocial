import type { S2205WorkerChangeDto } from '@esocial/contracts';

import type { BuilderContext, BuiltXml } from '../common.js';
import { buildPromotedWorkerXml } from '../worker-adapter.js';

export function buildS2205(
  dto: S2205WorkerChangeDto,
  ctx: BuilderContext = {},
): BuiltXml {
  return buildPromotedWorkerXml(dto, ctx);
}
