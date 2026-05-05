import type {
  EsocialEmployerIdentityDto,
  EsocialMoneyDto,
  EsocialSourceDtoBase,
} from './common.js';

type WorkerEventBase<TEventClass extends EsocialPromotedWorkerDtoEventClass> =
  EsocialSourceDtoBase<TEventClass> &
    EsocialEmployerIdentityDto &
    Readonly<{
      eventId?: string;
      employeeId: string;
      cpf: string;
      registration: string;
      receiptReference?: string;
    }>;

export type S2205WorkerChangeDto = WorkerEventBase<'S-2205'> &
  Readonly<{
    changeDate: string;
    name: string;
    sex?: 'F' | 'M';
    maritalStatus?: string;
    educationLevel?: string;
    dependents?: readonly S2205DependentChangeDto[];
    phone?: string;
    email?: string;
  }>;

export type S2205DependentChangeDto = Readonly<{
  sourceDependentId: string;
  name: string;
  birthDate: string;
  relationshipCode: string;
  cpf?: string;
}>;

export type S2206ContractChangeDto = WorkerEventBase<'S-2206'> &
  Readonly<{
    changeKind: 'promotion' | 'transfer' | 'regime-change';
    changeDate: string;
    effectiveDate: string;
    description: string;
    jobName: string;
    functionName?: string;
    categoryCode: string;
    workplaceRegistrationNumber?: string;
    workplaceDescription?: string;
  }>;

export type S2210CatDto = WorkerEventBase<'S-2210'> &
  Readonly<{
    kind: 'initial' | 'death' | 'reopening';
    accidentDate: string;
    accidentTime?: string;
    workedHoursBeforeAccident?: string;
    deathDate?: string;
    originalReceipt?: string;
    policeCommunication?: boolean;
    causedLeave?: boolean;
    internment?: boolean;
    treatmentDurationDays?: number;
    observation?: string;
  }>;

export type S2220ExamDto = WorkerEventBase<'S-2220'> &
  Readonly<{
    kind: 'admission' | 'periodic' | 'return-to-work' | 'termination';
    examDate: string;
    resultCode?: string;
    procedureCode?: string;
    procedureObservation?: string;
    doctorName?: string;
    doctorCrm?: string;
    doctorUf?: string;
  }>;

export type S2230LeaveDto = WorkerEventBase<'S-2230'> &
  Readonly<{
    kind: 'medical-leave' | 'vacation';
    startDate: string;
    leaveReasonCode: string;
    observation?: string;
    acquisitionStart?: string;
    acquisitionEnd?: string;
  }>;

export type S2240ExposureDto = Omit<WorkerEventBase<'S-2240'>, 'operation'> &
  Readonly<{
    operation: 'start' | 'change' | 'end';
    startDate: string;
    endDate?: string;
    workplaceRegistrationNumber: string;
    sector: string;
    activityDescription: string;
    riskCode: string;
    riskDescription: string;
    intensity: string | number;
    responsibleCpf: string;
  }>;

export type S2298ReintegrationDto = WorkerEventBase<'S-2298'> &
  Readonly<{
    kind: 'judicial' | 'amnesty' | 'other';
    reinstatementDate: string;
    decisionDate: string;
    processNumber?: string;
    originalS2299Receipt: string;
    originatingS2418Receipt?: string;
  }>;

export type S2299TerminationRubricDto = Readonly<{
  rubricCode: string;
  rubricTableId?: string;
  quantity: string | number;
  amount: string | number;
}>;

export type S2299TerminationDto = WorkerEventBase<'S-2299'> &
  Readonly<{
    kind: 'with-notice' | 'without-notice';
    terminationDate: string;
    terminationReasonCode: string;
    projectedNoticeEndDate?: string;
    ideDmDev: string;
    establishmentRegistrationNumber?: string;
    lotationCode?: string;
    rubrics: readonly S2299TerminationRubricDto[];
  }>;

export type S2300TsvStartDto = EsocialSourceDtoBase<'S-2300'> &
  EsocialEmployerIdentityDto &
  Readonly<{
    eventId?: string;
    kind: 'intern' | 'autonomous' | 'council-member';
    workerId: string;
    cpf: string;
    name: string;
    birthDate: string;
    registration: string;
    categoryCode: string;
    startDate: string;
    role: string;
    salaryAmount: EsocialMoneyDto;
    workplaceRegistrationNumber?: string;
    email?: string;
  }>;

export type S2306TsvContractChangeDto = EsocialSourceDtoBase<'S-2306'> &
  EsocialEmployerIdentityDto &
  Readonly<{
    eventId?: string;
    kind: 'role' | 'pay' | 'internship' | 'workplace';
    contractId: string;
    cpf: string;
    registration: string;
    changeDate: string;
    role?: string;
    salaryAmount?: EsocialMoneyDto;
    workplaceRegistrationNumber?: string;
    educationInstitution?: string;
  }>;

export type S2399TsvTerminationDto = EsocialSourceDtoBase<'S-2399'> &
  EsocialEmployerIdentityDto &
  Readonly<{
    eventId?: string;
    kind: 'intern' | 'autonomous' | 'council-member';
    contractId: string;
    cpf: string;
    registration: string;
    terminationDate: string;
    acceptedS2300Receipt: string;
    acceptedS2306Receipt?: string;
  }>;

export type EsocialPromotedWorkerDto =
  | S2205WorkerChangeDto
  | S2206ContractChangeDto
  | S2210CatDto
  | S2220ExamDto
  | S2230LeaveDto
  | S2240ExposureDto
  | S2298ReintegrationDto
  | S2299TerminationDto
  | S2300TsvStartDto
  | S2306TsvContractChangeDto
  | S2399TsvTerminationDto;

export const ESOCIAL_PROMOTED_WORKER_DTO_EVENT_CLASSES = [
  'S-2205',
  'S-2206',
  'S-2210',
  'S-2220',
  'S-2230',
  'S-2240',
  'S-2298',
  'S-2299',
  'S-2300',
  'S-2306',
  'S-2399',
] as const;

export type EsocialPromotedWorkerDtoEventClass =
  (typeof ESOCIAL_PROMOTED_WORKER_DTO_EVENT_CLASSES)[number];
