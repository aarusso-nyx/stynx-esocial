import type {
  EsocialPeriodicRubricLineDto,
  S1202RppsRemunerationDto,
} from '@esocial/contracts';

import type { BuilderContext, BuiltXml } from '../common.js';
import { requireNonEmptyArray, validateRequired } from '../common.js';
import { buildPromotedPeriodicXml } from '../periodic-adapter.js';

export function buildS1202(
  dto: S1202RppsRemunerationDto,
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
  const workers = requireNonEmptyArray(dto.workers, 'workers');
  return buildPromotedPeriodicXml({
    eventClass: 'S-1202',
    tenantId: dto.tenantId,
    sourceEventId: dto.sourceEventId,
    competence: dto.competence,
    employerRegistrationNumber: dto.employerCnpj,
    environment: environmentCode(ctx),
    payrollRunId: dto.payrollRunId,
    payrollRunStatus: dto.payrollRunStatus,
    workers: workers.map((worker) => {
      const rubrics = requireNonEmptyArray(worker.rubrics, 'workers.rubrics');
      return {
        employeeId: worker.employeeId,
        registration: worker.registration,
        cpf: worker.cpf,
        categoryCode: worker.categoryCode,
        ...optional(
          'establishmentRegistrationNumber',
          worker.establishmentRegistrationNumber,
        ),
        ...optional('ideDmDev', worker.ideDmDev),
        ...optional('eventId', worker.eventId),
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
