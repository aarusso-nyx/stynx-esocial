import type {
  EsocialPeriodicRubricLineDto,
  S1207RppsBenefitPaymentDto,
} from '@esocial/contracts';

import type { BuilderContext, BuiltXml } from '../common.js';
import { requireNonEmptyArray, validateRequired } from '../common.js';
import { buildPromotedPeriodicXml } from '../periodic-adapter.js';

export function buildS1207(
  dto: S1207RppsBenefitPaymentDto,
  ctx: BuilderContext = {},
): BuiltXml {
  validateRequired(dto, [
    'tenantId',
    'sourceEventId',
    'employerCnpj',
    'competence',
    'payrollRunId',
    'payrollRunStatus',
  ]);
  const benefits = requireNonEmptyArray(dto.benefits, 'benefits');
  return buildPromotedPeriodicXml({
    eventClass: 'S-1207',
    tenantId: dto.tenantId,
    sourceEventId: dto.sourceEventId,
    competence: dto.competence,
    employerRegistrationNumber: dto.employerCnpj,
    environment: environmentCode(ctx),
    payrollRunId: dto.payrollRunId,
    payrollRunStatus: dto.payrollRunStatus,
    benefits: benefits.map((benefit) => {
      const rubrics = requireNonEmptyArray(benefit.rubrics, 'benefits.rubrics');
      return {
        employeeId: benefit.employeeId,
        beneficiaryCpf: benefit.beneficiaryCpf,
        benefitSourceKind: benefit.benefitSourceKind,
        benefitSourceId: benefit.benefitSourceId,
        benefitNumber: benefit.benefitNumber,
        activeBenefitCount: benefit.activeBenefitCount,
        ...optional(
          'establishmentRegistrationNumber',
          benefit.establishmentRegistrationNumber,
        ),
        ...optional('ideDmDev', benefit.ideDmDev),
        ...optional('eventId', benefit.eventId),
        rubrics: rubrics.map(mapRubric),
      };
    }),
  });
}

function mapRubric(rubric: EsocialPeriodicRubricLineDto) {
  validateRequired(rubric, ['rubricCode', 'amount', 'kind']);
  return {
    code: rubric.rubricCode,
    ...optional('tableCode', rubric.rubricTableId),
    amount: rubric.amount,
    ...optional('quantity', rubric.quantity),
    kind: rubric.kind,
  };
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
