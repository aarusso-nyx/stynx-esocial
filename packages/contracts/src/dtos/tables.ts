import type {
  EsocialEmployerIdentityDto,
  EsocialSourceDtoBase,
  EsocialValidityDto,
} from './common.js';

export type S1005EstablishmentDto = EsocialSourceDtoBase<'S-1005'> &
  EsocialEmployerIdentityDto &
  EsocialValidityDto &
  Readonly<{
    establishmentRegistrationNumber: string;
    cnaePreponderante?: string;
  }>;

export type S1020TaxLotationDto = EsocialSourceDtoBase<'S-1020'> &
  EsocialEmployerIdentityDto &
  EsocialValidityDto &
  Readonly<{
    lotationCode: string;
    lotationTypeCode?: string;
    fpasCode?: string;
    thirdPartyCode?: string;
  }>;

export type S1050WorkScheduleDto = EsocialSourceDtoBase<'S-1050'> &
  EsocialEmployerIdentityDto &
  EsocialValidityDto &
  Readonly<{
    workScheduleCode: string;
    description: string;
    dailyHours: string | number;
  }>;

export type S1070ProcessDto = EsocialSourceDtoBase<'S-1070'> &
  EsocialEmployerIdentityDto &
  EsocialValidityDto &
  Readonly<{
    processNumber: string;
    subject: string;
    processType?: string;
    matterIndicator?: string;
  }>;

export type EsocialPromotedTableDto =
  | S1005EstablishmentDto
  | S1020TaxLotationDto
  | S1050WorkScheduleDto
  | S1070ProcessDto;

export const ESOCIAL_PROMOTED_TABLE_DTO_EVENT_CLASSES = [
  'S-1005',
  'S-1020',
  'S-1050',
  'S-1070',
] as const;

export type EsocialPromotedTableDtoEventClass =
  (typeof ESOCIAL_PROMOTED_TABLE_DTO_EVENT_CLASSES)[number];
