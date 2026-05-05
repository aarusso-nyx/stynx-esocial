import type { EsocialRelayEventClass } from '../kinds.js';

import type { EsocialSourceDtoBase } from './common.js';
import type { EsocialPromotedPeriodicDtoEventClass } from './periodic.js';
import type { EsocialPromotedTableDtoEventClass } from './tables.js';

export const ESOCIAL_ROUND0_DTO_EVENT_CLASSES = [
  'S-1000',
  'S-1010',
  'S-1200',
  'S-1299',
  'S-2200',
] as const;

export type EsocialRound0DtoEventClass =
  (typeof ESOCIAL_ROUND0_DTO_EVENT_CLASSES)[number];

export type EsocialRound1PendingEventClass = Exclude<
  EsocialRelayEventClass,
  | EsocialRound0DtoEventClass
  | EsocialPromotedTableDtoEventClass
  | EsocialPromotedPeriodicDtoEventClass
>;

export type EsocialRound1PendingDto<
  TEventClass extends EsocialRound1PendingEventClass =
    EsocialRound1PendingEventClass,
> = EsocialSourceDtoBase<TEventClass> &
  Readonly<{
    round1Pending: true;
    deferredReason: 'builder_not_promoted_in_round0';
  }>;
