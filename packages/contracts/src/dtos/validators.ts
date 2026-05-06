import { ESOCIAL_RELAY_EVENT_CLASSES } from '../kinds.js';
import type { EsocialRelayEventClass } from '../kinds.js';

import {
  ESOCIAL_PROMOTED_BENEFIT_PROCESS_DTO_EVENT_CLASSES,
} from './benefits-process-exclusion.js';
import type { EsocialPromotedBenefitProcessDto } from './benefits-process-exclusion.js';
import type { EsocialDtoEnvironment } from './common.js';
import {
  ESOCIAL_PROMOTED_PERIODIC_DTO_EVENT_CLASSES,
} from './periodic.js';
import type { EsocialPromotedPeriodicDto } from './periodic.js';
import type { EsocialRound0RequestDto } from './round0.js';
import { ESOCIAL_ROUND0_DTO_EVENT_CLASSES } from './round1-pending.js';
import type { EsocialRound1PendingDto } from './round1-pending.js';
import {
  ESOCIAL_PROMOTED_TABLE_DTO_EVENT_CLASSES,
} from './tables.js';
import type { EsocialPromotedTableDto } from './tables.js';
import {
  ESOCIAL_PROMOTED_WORKER_DTO_EVENT_CLASSES,
} from './worker.js';
import type { EsocialPromotedWorkerDto } from './worker.js';

export type EsocialSgpRequestDto =
  | EsocialRound0RequestDto
  | EsocialPromotedTableDto
  | EsocialPromotedPeriodicDto
  | EsocialPromotedWorkerDto
  | EsocialPromotedBenefitProcessDto
  | EsocialRound1PendingDto;

export type EsocialRelayRequestPayload =
  Omit<EsocialSgpRequestDto, 'environment'> &
    Readonly<{
      environment?: EsocialDtoEnvironment | 'PRODUCTION' | 'QUALIFICATION';
    }> &
    Record<string, unknown>;

export type EsocialDtoValidationResult =
  | Readonly<{ ok: true; dto: EsocialSgpRequestDto }>
  | Readonly<{ ok: false; errors: readonly string[] }>;

const FORBIDDEN_SGP_DTO_KEYS = [
  'xml',
  'payloadXml',
  'signedXml',
  'signedEnvelope',
  'pkcs7',
  'pkcs7Sha256',
] as const;

export function validateEsocialSgpRequestDto(
  candidate: unknown,
): EsocialDtoValidationResult {
  if (!isRecord(candidate)) {
    return { ok: false, errors: ['DTO must be a JSON object.'] };
  }

  const errors: string[] = [];
  for (const key of FORBIDDEN_SGP_DTO_KEYS) {
    if (key in candidate) {
      errors.push(`DTO must not contain ${key}; eSocial builds XML and signatures.`);
    }
  }

  if (!includesString(ESOCIAL_RELAY_EVENT_CLASSES, candidate['eventClass'])) {
    errors.push('eventClass is not supported.');
  }

  if (!isNonEmptyString(candidate['tenantId'])) {
    errors.push('tenantId is required.');
  }

  if (!isNonEmptyString(candidate['sourceEventId'])) {
    errors.push('sourceEventId is required.');
  }

  if (includesString(ESOCIAL_ROUND0_DTO_EVENT_CLASSES, candidate['eventClass'])) {
    validateRound0Dto(candidate, candidate['eventClass'], errors);
  } else if (
    includesString(ESOCIAL_PROMOTED_TABLE_DTO_EVENT_CLASSES, candidate['eventClass'])
  ) {
    validatePromotedTableDto(candidate, candidate['eventClass'], errors);
  } else if (
    includesString(
      ESOCIAL_PROMOTED_PERIODIC_DTO_EVENT_CLASSES,
      candidate['eventClass'],
    )
  ) {
    validatePromotedPeriodicDto(candidate, candidate['eventClass'], errors);
  } else if (
    includesString(
      ESOCIAL_PROMOTED_WORKER_DTO_EVENT_CLASSES,
      candidate['eventClass'],
    )
  ) {
    validatePromotedWorkerDto(candidate, candidate['eventClass'], errors);
  } else if (
    includesString(
      ESOCIAL_PROMOTED_BENEFIT_PROCESS_DTO_EVENT_CLASSES,
      candidate['eventClass'],
    )
  ) {
    validatePromotedBenefitProcessDto(candidate, candidate['eventClass'], errors);
  } else if (
    includesString(ESOCIAL_RELAY_EVENT_CLASSES, candidate['eventClass']) &&
    candidate['round1Pending'] !== true
  ) {
    errors.push('round1Pending must be true for deferred event DTO stubs.');
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, dto: candidate as EsocialSgpRequestDto };
}

function validatePromotedBenefitProcessDto(
  candidate: Record<string, unknown>,
  eventClass: EsocialRelayEventClass,
  errors: string[],
): void {
  requireStrings(candidate, errors, ['employerCnpj']);

  if (eventClass === 'S-2400') {
    requireStrings(candidate, errors, [
      'beneficiaryId',
      'cpf',
      'name',
      'birthDate',
      'startDate',
      'sex',
    ]);
  }
  if (eventClass === 'S-2405') {
    requireStrings(candidate, errors, [
      'beneficiaryId',
      'cpf',
      'name',
      'changeDate',
      'acceptedS2400Receipt',
    ]);
  }
  if (eventClass === 'S-2410') {
    requireStrings(candidate, errors, [
      'benefitKind',
      'benefitIdentifier',
      'beneficiaryCpf',
      'benefitNumber',
      'startDate',
      'benefitType',
    ]);
  }
  if (eventClass === 'S-2416') {
    requireStrings(candidate, errors, [
      'benefitIdentifier',
      'beneficiaryCpf',
      'benefitNumber',
      'changeDate',
      'acceptedS2410Receipt',
      'benefitType',
    ]);
  }
  if (eventClass === 'S-2418') {
    requireStrings(candidate, errors, [
      'benefitKind',
      'benefitIdentifier',
      'beneficiaryCpf',
      'benefitNumber',
      'effectiveReactivationDate',
      'financialEffectDate',
      'acceptedS2410Receipt',
      'suspendedOrTerminatedBenefitReceipt',
    ]);
  }
  if (eventClass === 'S-2420') {
    requireStrings(candidate, errors, [
      'benefitIdentifier',
      'beneficiaryCpf',
      'benefitNumber',
      'terminationDate',
      'terminationReasonCode',
      'acceptedS2410Receipt',
    ]);
  }
  if (eventClass === 'S-2501') {
    requireStrings(candidate, errors, ['processNumber', 'paymentPeriod']);
    requireArray(candidate, errors, 'processTaxBases');
    const bases = candidate['processTaxBases'];
    if (Array.isArray(bases) && bases.length === 0) {
      errors.push('processTaxBases must contain at least one item.');
    }
    requireNestedStrings(candidate, errors, 'processTaxBases', [
      'workerCpf',
      'referencePeriod',
    ]);
  }
  if (eventClass === 'S-3000') {
    requireStrings(candidate, errors, [
      'originalEventClass',
      'originalReceipt',
      'exclusionReason',
    ]);
  }
}

function validatePromotedWorkerDto(
  candidate: Record<string, unknown>,
  eventClass: EsocialRelayEventClass,
  errors: string[],
): void {
  requireStrings(candidate, errors, ['employerCnpj']);

  if (eventClass.startsWith('S-22') || eventClass === 'S-2298' || eventClass === 'S-2299') {
    requireStrings(candidate, errors, ['employeeId', 'cpf', 'registration']);
  }

  if (eventClass === 'S-2205') {
    requireStrings(candidate, errors, ['changeDate', 'name']);
  }
  if (eventClass === 'S-2206') {
    requireStrings(candidate, errors, [
      'changeKind',
      'changeDate',
      'effectiveDate',
      'description',
      'jobName',
      'categoryCode',
    ]);
  }
  if (eventClass === 'S-2210') {
    requireStrings(candidate, errors, ['kind', 'accidentDate']);
    requireVariantReceipt(candidate, errors, 'kind', ['death', 'reopening'], 'originalReceipt');
  }
  if (eventClass === 'S-2220') {
    requireStrings(candidate, errors, ['kind', 'examDate']);
  }
  if (eventClass === 'S-2230') {
    requireStrings(candidate, errors, ['kind', 'startDate', 'leaveReasonCode']);
  }
  if (eventClass === 'S-2240') {
    requireStrings(candidate, errors, [
      'operation',
      'startDate',
      'workplaceRegistrationNumber',
      'sector',
      'activityDescription',
      'riskCode',
      'riskDescription',
      'responsibleCpf',
    ]);
  }
  if (eventClass === 'S-2298') {
    requireStrings(candidate, errors, [
      'kind',
      'reinstatementDate',
      'decisionDate',
      'originalS2299Receipt',
    ]);
  }
  if (eventClass === 'S-2299') {
    requireStrings(candidate, errors, [
      'kind',
      'terminationDate',
      'terminationReasonCode',
      'ideDmDev',
    ]);
    requireArray(candidate, errors, 'rubrics');
  }
  if (eventClass === 'S-2300') {
    requireStrings(candidate, errors, [
      'kind',
      'workerId',
      'cpf',
      'name',
      'birthDate',
      'registration',
      'categoryCode',
      'startDate',
      'role',
    ]);
  }
  if (eventClass === 'S-2306') {
    requireStrings(candidate, errors, [
      'kind',
      'contractId',
      'cpf',
      'registration',
      'changeDate',
    ]);
  }
  if (eventClass === 'S-2399') {
    requireStrings(candidate, errors, [
      'kind',
      'contractId',
      'cpf',
      'registration',
      'terminationDate',
      'acceptedS2300Receipt',
    ]);
  }
}

function validatePromotedPeriodicDto(
  candidate: Record<string, unknown>,
  eventClass: EsocialRelayEventClass,
  errors: string[],
): void {
  requireStrings(candidate, errors, ['employerCnpj', 'competence']);

  if (eventClass === 'S-1202') {
    requireStrings(candidate, errors, ['payrollRunId', 'payrollRunStatus']);
    requireArray(candidate, errors, 'workers');
    requireNestedArrays(candidate, errors, 'workers', 'rubrics');
  }

  if (eventClass === 'S-1207') {
    requireStrings(candidate, errors, ['payrollRunId', 'payrollRunStatus']);
    requireArray(candidate, errors, 'benefits');
    requireNestedStrings(candidate, errors, 'benefits', [
      'benefitSourceId',
      'benefitNumber',
      'beneficiaryCpf',
    ]);
    requireNestedArrays(candidate, errors, 'benefits', 'rubrics');
  }

  if (eventClass === 'S-1210') {
    requireStrings(candidate, errors, ['paymentBatchId', 'paymentBatchStatus']);
    if (candidate['confirmedTotal'] === undefined || candidate['confirmedTotal'] === '') {
      errors.push('confirmedTotal is required.');
    }
    requireArray(candidate, errors, 'payments');
    requireNestedStrings(candidate, errors, 'payments', [
      'employeeId',
      'cpf',
      'paymentDate',
      'receiptReference',
    ]);
  }

  if (eventClass === 'S-1298') {
    requireStrings(candidate, errors, [
      'acceptedClosureReceipt',
      'acceptedClosureAt',
    ]);
  }
}

export function parseEsocialSgpRequestDto(
  candidate: unknown,
): EsocialSgpRequestDto {
  const result = validateEsocialSgpRequestDto(candidate);
  if (result.ok) return result.dto;
  throw new Error(result.errors.join(' '));
}

function validateRound0Dto(
  candidate: Record<string, unknown>,
  eventClass: EsocialRelayEventClass,
  errors: string[],
): void {
  if (eventClass === 'S-1000') {
    requireStrings(candidate, errors, [
      'employerCnpj',
      'validityStart',
      'legalName',
      'taxClassification',
    ]);
  }

  if (eventClass === 'S-1010') {
    requireStrings(candidate, errors, [
      'employerCnpj',
      'validityStart',
      'rubricCode',
      'rubricTableId',
      'description',
      'rubricType',
      'natureCode',
      'socialSecurityIncidence',
      'incomeTaxIncidence',
      'fgtsIncidence',
    ]);
  }

  if (eventClass === 'S-1200') {
    requireStrings(candidate, errors, [
      'employerCnpj',
      'competence',
      'payrollRunId',
      'payrollRunStatus',
    ]);
    requireArray(candidate, errors, 'workers');
  }

  if (eventClass === 'S-1299') {
    requireStrings(candidate, errors, [
      'employerCnpj',
      'competence',
      'payrollRunId',
    ]);
    requireArray(candidate, errors, 'pendingPeriodicEvents');
    if (!isRecord(candidate['acceptedEventCounts'])) {
      errors.push('acceptedEventCounts is required.');
    }
  }

  if (eventClass === 'S-2200') {
    requireStrings(candidate, errors, [
      'employerCnpj',
      'employeeId',
      'cpf',
      'name',
      'birthDate',
      'admissionDate',
      'registration',
      'categoryCode',
      'contractType',
      'jobCode',
    ]);
  }
}

function validatePromotedTableDto(
  candidate: Record<string, unknown>,
  eventClass: EsocialRelayEventClass,
  errors: string[],
): void {
  requireStrings(candidate, errors, [
    'sourceEntityId',
    'employerCnpj',
    'validityStart',
  ]);

  if (eventClass === 'S-1005') {
    requireStrings(candidate, errors, ['establishmentRegistrationNumber']);
  }

  if (eventClass === 'S-1020') {
    requireStrings(candidate, errors, ['lotationCode']);
  }

  if (eventClass === 'S-1050') {
    requireStrings(candidate, errors, ['workScheduleCode', 'description']);
    if (
      candidate['dailyHours'] === undefined ||
      candidate['dailyHours'] === null ||
      candidate['dailyHours'] === ''
    ) {
      errors.push('dailyHours is required.');
    }
  }

  if (eventClass === 'S-1070') {
    requireStrings(candidate, errors, ['processNumber', 'subject']);
  }
}

function requireStrings(
  candidate: Record<string, unknown>,
  errors: string[],
  keys: readonly string[],
): void {
  for (const key of keys) {
    if (!isNonEmptyString(candidate[key])) errors.push(`${key} is required.`);
  }
}

function requireArray(
  candidate: Record<string, unknown>,
  errors: string[],
  key: string,
): void {
  if (!Array.isArray(candidate[key])) errors.push(`${key} must be an array.`);
}

function requireNestedStrings(
  candidate: Record<string, unknown>,
  errors: string[],
  arrayKey: string,
  keys: readonly string[],
): void {
  const value = candidate[arrayKey];
  if (!Array.isArray(value)) return;
  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      errors.push(`${arrayKey}[${index}] must be an object.`);
      return;
    }
    for (const key of keys) {
      if (!isNonEmptyString(entry[key])) {
        errors.push(`${arrayKey}[${index}].${key} is required.`);
      }
    }
  });
}

function requireNestedArrays(
  candidate: Record<string, unknown>,
  errors: string[],
  arrayKey: string,
  nestedKey: string,
): void {
  const value = candidate[arrayKey];
  if (!Array.isArray(value)) return;
  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      errors.push(`${arrayKey}[${index}] must be an object.`);
      return;
    }
    if (!Array.isArray(entry[nestedKey])) {
      errors.push(`${arrayKey}[${index}].${nestedKey} must be an array.`);
    }
  });
}

function requireVariantReceipt(
  candidate: Record<string, unknown>,
  errors: string[],
  variantKey: string,
  variants: readonly string[],
  receiptKey: string,
): void {
  const variant = candidate[variantKey];
  if (
    typeof variant === 'string' &&
    variants.includes(variant) &&
    !isNonEmptyString(candidate[receiptKey])
  ) {
    errors.push(`${receiptKey} is required for ${variant}.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function includesString<TValue extends string>(
  values: readonly TValue[],
  candidate: unknown,
): candidate is TValue {
  return typeof candidate === 'string' && values.includes(candidate as TValue);
}
