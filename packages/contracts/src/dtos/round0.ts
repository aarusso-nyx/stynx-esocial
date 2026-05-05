import type {
  EsocialEmployerIdentityDto,
  EsocialMoneyDto,
  EsocialSourceDtoBase,
  EsocialValidityDto,
} from './common.js';

export type S1000EmployerInfoDto = EsocialSourceDtoBase<'S-1000'> &
  EsocialEmployerIdentityDto &
  EsocialValidityDto &
  Readonly<{
    legalName: string;
    taxClassification: string;
    cooperativeIndicator?: string;
    constructionIndicator?: string;
    payrollExemptionIndicator?: string;
    electronicRecordOption?: string;
  }>;

export type S1010RubricDto = EsocialSourceDtoBase<'S-1010'> &
  EsocialEmployerIdentityDto &
  EsocialValidityDto &
  Readonly<{
    rubricCode: string;
    rubricTableId: string;
    description: string;
    rubricType: string;
    natureCode: string;
    socialSecurityIncidence: string;
    incomeTaxIncidence: string;
    fgtsIncidence: string;
    unionContributionIncidence?: string;
  }>;

export type S1200RubricLineDto = Readonly<{
  rubricCode: string;
  rubricTableId?: string;
  ideDmDev: string;
  amount: EsocialMoneyDto;
  quantity?: number;
}>;

export type S1200WorkerRemunerationDto = Readonly<{
  employeeId: string;
  cpf: string;
  registration: string;
  categoryCode: string;
  establishmentRegistrationNumber?: string;
  lotationCode?: string;
  rubrics: readonly S1200RubricLineDto[];
}>;

export type S1200RemunerationDto = EsocialSourceDtoBase<'S-1200'> &
  EsocialEmployerIdentityDto &
  Readonly<{
    competence: string;
    payrollRunId: string;
    payrollRunStatus: string;
    workers: readonly S1200WorkerRemunerationDto[];
  }>;

export type S1299ClosureDto = EsocialSourceDtoBase<'S-1299'> &
  EsocialEmployerIdentityDto &
  Readonly<{
    competence: string;
    payrollRunId: string;
    pendingPeriodicEvents: readonly string[];
    acceptedEventCounts: Readonly<{
      remuneration: number;
      payments: number;
      totalizers?: number;
    }>;
    responsibleCpf?: string;
  }>;

export type S2200DependentDto = Readonly<{
  sourceDependentId: string;
  cpf?: string;
  name: string;
  birthDate: string;
  relationshipCode: string;
}>;

export type S2200AdmissionDto = EsocialSourceDtoBase<'S-2200'> &
  EsocialEmployerIdentityDto &
  Readonly<{
    employeeId: string;
    cpf: string;
    name: string;
    birthDate: string;
    admissionDate: string;
    registration: string;
    categoryCode: string;
    contractType: string;
    jobCode: string;
    workScheduleCode?: string;
    salaryAmount?: EsocialMoneyDto;
    dependents?: readonly S2200DependentDto[];
  }>;

export type EsocialRound0RequestDto =
  | S1000EmployerInfoDto
  | S1010RubricDto
  | S1200RemunerationDto
  | S1299ClosureDto
  | S2200AdmissionDto;
