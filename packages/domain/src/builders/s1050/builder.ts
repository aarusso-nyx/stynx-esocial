import type { S1050WorkScheduleDto } from '@esocial/contracts';

import type { BuilderContext, BuiltXml } from '../common.js';
import { validateRequired } from '../common.js';
import { buildPromotedTableXml } from '../table-adapter.js';

export function buildS1050(
  dto: S1050WorkScheduleDto,
  ctx: BuilderContext = {},
): BuiltXml {
  validateRequired(dto, [
    'tenantId',
    'sourceEventId',
    'sourceEntityId',
    'employerCnpj',
    'validityStart',
    'workScheduleCode',
    'description',
    'dailyHours',
  ]);
  const sourceEntityId = dto.sourceEntityId ?? dto.sourceEventId;
  return buildPromotedTableXml({
    eventClass: 'S-1050',
    tenantId: dto.tenantId,
    sourceEventId: dto.sourceEventId,
    sourceEntityId,
    competence: dto.validityStart,
    environment: environmentCode(ctx),
    workSchedule: {
      code: dto.workScheduleCode,
      description: dto.description,
      dailyHours: dto.dailyHours,
      employerRegistrationNumber: dto.employerCnpj,
    },
  });
}

function environmentCode(ctx: BuilderContext): '1' | '2' {
  return ctx.environment === 'production' ? '1' : '2';
}
