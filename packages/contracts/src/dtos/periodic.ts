import type {
  EsocialEmployerIdentityDto,
  EsocialSourceDtoBase,
} from './common.js';

export type EsocialPeriodicRubricKind =
  | 'EARNING'
  | 'DEDUCTION'
  | 'INFORMATION'
  | 'BASE';

export type EsocialPeriodicMoneyDto = string | number;

export type EsocialPeriodicRubricLineDto = Readonly<{
  rubricCode: string;
  rubricTableId?: string;
  amount: EsocialPeriodicMoneyDto;
  quantity?: string | number;
  kind: EsocialPeriodicRubricKind;
}>;

export type S1202RppsWorkerRemunerationDto = Readonly<{
  employeeId: string;
  registration: string;
  cpf: string;
  categoryCode: string;
  establishmentRegistrationNumber?: string;
  ideDmDev?: string;
  eventId?: string;
  rubrics: readonly EsocialPeriodicRubricLineDto[];
}>;

export type S1202RppsRemunerationDto = EsocialSourceDtoBase<'S-1202'> &
  EsocialEmployerIdentityDto &
  Readonly<{
    competence: string;
    payrollRunId: string;
    payrollRunStatus: string;
    workers: readonly S1202RppsWorkerRemunerationDto[];
  }>;

export type S1207BenefitSourceKind = 'RETIREMENT' | 'PENSION';

export type S1207RppsBenefitLineDto = Readonly<{
  employeeId: string;
  beneficiaryCpf: string;
  benefitSourceKind: S1207BenefitSourceKind;
  benefitSourceId: string;
  benefitNumber: string;
  activeBenefitCount: number;
  establishmentRegistrationNumber?: string;
  ideDmDev?: string;
  eventId?: string;
  rubrics: readonly EsocialPeriodicRubricLineDto[];
}>;

export type S1207RppsBenefitPaymentDto = EsocialSourceDtoBase<'S-1207'> &
  EsocialEmployerIdentityDto &
  Readonly<{
    competence: string;
    payrollRunId: string;
    payrollRunStatus: string;
    benefits: readonly S1207RppsBenefitLineDto[];
  }>;

export type S1210PaymentLineDto = Readonly<{
  employeeId: string;
  cpf: string;
  amount: EsocialPeriodicMoneyDto;
  paymentDate: string;
  receiptReference: string;
  payrollRunId?: string | null;
  ideDmDev?: string;
  eventId?: string;
}>;

export type S1210PaymentDto = EsocialSourceDtoBase<'S-1210'> &
  EsocialEmployerIdentityDto &
  Readonly<{
    competence: string;
    paymentBatchId: string;
    paymentBatchStatus: string;
    payrollRunId?: string | null;
    confirmedTotal: EsocialPeriodicMoneyDto;
    payments: readonly S1210PaymentLineDto[];
  }>;

export type S1298ReopeningDto = EsocialSourceDtoBase<'S-1298'> &
  EsocialEmployerIdentityDto &
  Readonly<{
    competence: string;
    acceptedClosureReceipt: string;
    acceptedClosureAt: string;
    eventId?: string;
  }>;

export type EsocialPromotedPeriodicDto =
  | S1202RppsRemunerationDto
  | S1207RppsBenefitPaymentDto
  | S1210PaymentDto
  | S1298ReopeningDto;

export const ESOCIAL_PROMOTED_PERIODIC_DTO_EVENT_CLASSES = [
  'S-1202',
  'S-1207',
  'S-1210',
  'S-1298',
] as const;

export type EsocialPromotedPeriodicDtoEventClass =
  (typeof ESOCIAL_PROMOTED_PERIODIC_DTO_EVENT_CLASSES)[number];
