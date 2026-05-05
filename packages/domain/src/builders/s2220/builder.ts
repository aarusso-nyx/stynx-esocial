import type { S2220ExamDto } from '@esocial/contracts';

import type { BuilderContext, BuiltXml } from '../common.js';
import { buildPromotedWorkerXml } from '../worker-adapter.js';

export function buildS2220(
  dto: S2220ExamDto,
  ctx: BuilderContext = {},
): BuiltXml {
  return buildPromotedWorkerXml(dto, ctx);
}
