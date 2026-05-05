import type {
  EsocialEmployerIdentityDto,
  EsocialMoneyDto,
  EsocialSourceDtoBase,
} from './common.js';

type BenefitEventBase<TEventClass extends EsocialPromotedBenefitProcessDtoEventClass> =
  EsocialSourceDtoBase<TEventClass> &
    EsocialEmployerIdentityDto &
    Readonly<{
      eventId?: string;
    }>;

export type S2400DependentDto = Readonly<{
  sourceDependentId: string;
  name: string;
  birthDate: string;
  relationshipCode: string;
  cpf?: string;
}>;

export type S2400BeneficiaryRegistrationDto = BenefitEventBase<'S-2400'> &
  Readonly<{
    beneficiaryId: string;
    cpf: string;
    name: string;
    birthDate: string;
    startDate: string;
    sex: 'F' | 'M';
    maritalStatus?: string;
    dependents?: readonly S2400DependentDto[];
  }>;

export type S2405BeneficiaryChangeDto = BenefitEventBase<'S-2405'> &
  Readonly<{
    beneficiaryId: string;
    cpf: string;
    name: string;
    changeDate: string;
    acceptedS2400Receipt: string;
    sex?: 'F' | 'M';
    maritalStatus?: string;
  }>;

export type S2410BenefitStartDto = BenefitEventBase<'S-2410'> &
  Readonly<{
    benefitKind: 'RETIREMENT' | 'PENSION';
    benefitIdentifier: string;
    beneficiaryCpf: string;
    benefitNumber: string;
    startDate: string;
    benefitType: string;
    planType?: string;
    description?: string;
    registration?: string;
    judicialDecision?: 'S' | 'N';
    institutingCpf?: string;
    pensionDeathType?: '1' | '2';
    dependentTypeCode?: string;
  }>;

export type S2416BenefitChangeDto = BenefitEventBase<'S-2416'> &
  Readonly<{
    benefitIdentifier: string;
    beneficiaryCpf: string;
    benefitNumber: string;
    changeDate: string;
    acceptedS2410Receipt: string;
    benefitType: string;
    planType?: string;
    description?: string;
    suspensionIndicator?: 'S' | 'N';
    pensionDeathType?: '1' | '2';
    dependentTypeCode?: string;
  }>;

export type S2418BenefitReactivationDto = BenefitEventBase<'S-2418'> &
  Readonly<{
    benefitKind: 'RETIREMENT' | 'PENSION';
    benefitIdentifier: string;
    beneficiaryCpf: string;
    benefitNumber: string;
    effectiveReactivationDate: string;
    financialEffectDate: string;
    acceptedS2410Receipt: string;
    suspendedOrTerminatedBenefitReceipt: string;
    reactivatedBenefitReceipt?: string;
  }>;

export type S2420BenefitTerminationDto = BenefitEventBase<'S-2420'> &
  Readonly<{
    benefitIdentifier: string;
    beneficiaryCpf: string;
    benefitNumber: string;
    terminationDate: string;
    terminationReasonCode: string;
    acceptedS2410Receipt: string;
  }>;

export type S2501ContributionDto = Readonly<{
  revenueCode: string;
  amount: EsocialMoneyDto;
}>;

export type S2501IrrfDto = Readonly<{
  revenueCode: '593656' | '056152' | '188951';
  amount: EsocialMoneyDto;
  thirteenthAmount?: EsocialMoneyDto;
}>;

export type S2501ProcessTaxBaseDto = Readonly<{
  workerCpf: string;
  referencePeriod: string;
  monthlyBase: EsocialMoneyDto;
  thirteenthBase: EsocialMoneyDto;
  contributions?: readonly S2501ContributionDto[];
  irrf?: readonly S2501IrrfDto[];
}>;

export type S2501ProcessTaxDto = BenefitEventBase<'S-2501'> &
  Readonly<{
    processNumber: string;
    linkedProcessNumbers?: readonly string[];
    paymentPeriod: string;
    sequenceNumber?: number;
    observation?: string;
    processTaxBases: readonly S2501ProcessTaxBaseDto[];
  }>;

export type S3000ExclusionOriginalClass =
  | 'S-1000'
  | 'S-1005'
  | 'S-1010'
  | 'S-1020'
  | 'S-1050'
  | 'S-1070'
  | 'S-1200'
  | 'S-1202'
  | 'S-1207'
  | 'S-1210'
  | 'S-1298'
  | 'S-1299'
  | 'S-2200'
  | 'S-2205'
  | 'S-2206'
  | 'S-2210'
  | 'S-2220'
  | 'S-2230'
  | 'S-2240'
  | 'S-2298'
  | 'S-2299'
  | 'S-2300'
  | 'S-2306'
  | 'S-2399'
  | 'S-2400'
  | 'S-2405'
  | 'S-2410'
  | 'S-2416'
  | 'S-2418'
  | 'S-2420'
  | 'S-2501';

export type S3000ExclusionDto = BenefitEventBase<'S-3000'> &
  Readonly<{
    originalEventClass: S3000ExclusionOriginalClass;
    originalReceipt: string;
    exclusionReason: string;
    originalCompetence?: string;
    cpf?: string;
    registration?: string;
    beneficiaryCpf?: string;
    benefitNumber?: string;
  }>;

export type EsocialPromotedBenefitProcessDto =
  | S2400BeneficiaryRegistrationDto
  | S2405BeneficiaryChangeDto
  | S2410BenefitStartDto
  | S2416BenefitChangeDto
  | S2418BenefitReactivationDto
  | S2420BenefitTerminationDto
  | S2501ProcessTaxDto
  | S3000ExclusionDto;

export const ESOCIAL_PROMOTED_BENEFIT_PROCESS_DTO_EVENT_CLASSES = [
  'S-2400',
  'S-2405',
  'S-2410',
  'S-2416',
  'S-2418',
  'S-2420',
  'S-2501',
  'S-3000',
] as const;

export type EsocialPromotedBenefitProcessDtoEventClass =
  (typeof ESOCIAL_PROMOTED_BENEFIT_PROCESS_DTO_EVENT_CLASSES)[number];
