import type { S1298ReopeningDto } from '@esocial/contracts';

import type { BuilderContext, BuiltXml } from '../common.js';
import { validateRequired } from '../common.js';
import { buildPromotedPeriodicXml } from '../periodic-adapter.js';

export function buildS1298(
  dto: S1298ReopeningDto,
  ctx: BuilderContext = {},
): BuiltXml {
  validateRequired(dto, [
    'tenantId',
    'sourceEventId',
    'employerCnpj',
    'competence',
    'acceptedClosureReceipt',
    'acceptedClosureAt',
  ]);
  return buildPromotedPeriodicXml({
    eventClass: 'S-1298',
    tenantId: dto.tenantId,
    sourceEventId: dto.sourceEventId,
    ...optional('sourceEntityId', dto.sourceEntityId),
    competence: dto.competence,
    employerRegistrationNumber: dto.employerCnpj,
    environment: environmentCode(ctx),
    acceptedClosureReceipt: dto.acceptedClosureReceipt,
    acceptedClosureAt: dto.acceptedClosureAt,
    ...optional('eventId', dto.eventId),
  });
}

function environmentCode(ctx: BuilderContext): '1' | '2' {
  return ctx.environment === 'production' ? '1' : '2';
}

function optional<Key extends string, Value>(
  key: Key,
  value: Value | undefined,
): Partial<Record<Key, Value>> {
  return value === undefined ? {} : ({ [key]: value } as Record<Key, Value>);
}
