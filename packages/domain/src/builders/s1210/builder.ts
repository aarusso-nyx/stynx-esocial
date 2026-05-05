import type { S1210PaymentDto } from '@esocial/contracts';

import type { BuilderContext, BuiltXml } from '../common.js';
import {
  nonEmptyString,
  requireNonEmptyArray,
  validateRequired,
} from '../common.js';
import {
  MissingReceiptReference,
  buildPromotedPeriodicXml,
} from '../periodic-adapter.js';

export function buildS1210(
  dto: S1210PaymentDto,
  ctx: BuilderContext = {},
): BuiltXml {
  validateRequired(dto, [
    'tenantId',
    'sourceEventId',
    'employerCnpj',
    'competence',
    'paymentBatchId',
    'paymentBatchStatus',
    'confirmedTotal',
  ]);
  const payments = requireNonEmptyArray(dto.payments, 'payments');
  payments.forEach((payment, index) => {
    if (!nonEmptyString(payment.receiptReference)) {
      throw new MissingReceiptReference(`payments[${index}].receiptReference`);
    }
  });
  return buildPromotedPeriodicXml({
    eventClass: 'S-1210',
    tenantId: dto.tenantId,
    sourceEventId: dto.sourceEventId,
    competence: dto.competence,
    employerRegistrationNumber: dto.employerCnpj,
    environment: environmentCode(ctx),
    paymentBatchId: dto.paymentBatchId,
    paymentBatchStatus: dto.paymentBatchStatus,
    ...optional('payrollRunId', dto.payrollRunId ?? undefined),
    confirmedTotal: dto.confirmedTotal,
    payments: payments.map((payment) => ({
      employeeId: payment.employeeId,
      cpf: payment.cpf,
      amount: payment.amount,
      paymentDate: payment.paymentDate,
      ...optional('payrollRunId', payment.payrollRunId ?? undefined),
      ...optional('ideDmDev', payment.ideDmDev),
      ...optional('eventId', payment.eventId),
    })),
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
