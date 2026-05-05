import type { EsocialRelayEventClass } from '../kinds.js';

export type EsocialDtoEnvironment =
  | 'qualification'
  | 'restricted_production'
  | 'production';

export type EsocialDtoOperation =
  | 'inclusion'
  | 'change'
  | 'rectification'
  | 'exclusion';

export type EsocialSourceDtoBase<
  TEventClass extends EsocialRelayEventClass,
> = Readonly<{
  eventClass: TEventClass;
  tenantId: string;
  sourceEventId: string;
  sourceEntityId?: string;
  sourceEntityIds?: readonly string[];
  environment?: EsocialDtoEnvironment;
  operation?: EsocialDtoOperation;
}>;

export type EsocialEmployerIdentityDto = Readonly<{
  employerCnpj: string;
  employerCpf?: string;
}>;

export type EsocialValidityDto = Readonly<{
  validityStart: string;
  validityEnd?: string;
}>;

export type EsocialMoneyDto = number;
