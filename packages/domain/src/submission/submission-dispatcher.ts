import { ESOCIAL_RELAY_EVENT_CLASSES } from '@esocial/contracts';
import type {
  EsocialRelayEventClass,
  EsocialRelayRequestPayload,
  S1000EmployerInfoDto,
  S1005EstablishmentDto,
  S1010RubricDto,
  S1020TaxLotationDto,
  S1050WorkScheduleDto,
  S1070ProcessDto,
  S1200RemunerationDto,
  S1299ClosureDto,
  S2200AdmissionDto,
} from '@esocial/contracts';

import {
  buildS1000,
  buildS1005,
  buildS1010,
  buildS1020,
  buildS1050,
  buildS1070,
  buildS1200,
  buildS1299,
  buildS2200,
} from '../builders/index.js';
import type { BuilderContext, BuiltXml } from '../builders/index.js';

import type { SubmissionRequestEnvelope } from './submission-processor.js';
import { routeSubmissionEventClass } from './submission-router.js';
import type { SubmissionRoute } from './submission-router.js';

export type SubmissionDispatchContext = Readonly<{
  request: SubmissionRequestEnvelope;
  occurredAt: string;
}>;

export type SubmissionDispatchResult = Readonly<{
  eventClass: EsocialRelayEventClass;
  route: SubmissionRoute;
  stage: 'building' | 'sent' | 'failed';
  builderReady: boolean;
  builtXml?: BuiltXml | undefined;
  protocolNumber?: string | undefined;
  transport?: SubmissionDispatchTransportEvidence | undefined;
}>;

export type SubmissionDispatchTransportEvidence = Readonly<{
  endpointUrl?: string | undefined;
  endpointName?: string | undefined;
  requestSha256?: string | undefined;
  signedPayloadSha256?: string | undefined;
  soapRequestSha256?: string | undefined;
  soapResponseSha256?: string | undefined;
  responseSha256?: string | undefined;
}>;

export type SubmissionDispatcher = (
  dto: EsocialRelayRequestPayload,
  context: SubmissionDispatchContext,
) => Promise<SubmissionDispatchResult> | SubmissionDispatchResult;

type DispatchEntry = Readonly<{
  eventClass: EsocialRelayEventClass;
  route: SubmissionRoute;
  dispatch: SubmissionDispatcher;
}>;

const ROUND0_DISPATCHERS: Partial<Record<EsocialRelayEventClass, SubmissionDispatcher>> =
  {
    'S-1000': (dto, context) =>
      dispatchBuiltXml(
        buildS1000(dto as S1000EmployerInfoDto, builderContext(context)),
        context,
      ),
    'S-1005': (dto, context) =>
      dispatchBuiltXml(
        buildS1005(dto as S1005EstablishmentDto, builderContext(context)),
        context,
      ),
    'S-1010': (dto, context) =>
      dispatchBuiltXml(
        buildS1010(dto as S1010RubricDto, builderContext(context)),
        context,
      ),
    'S-1020': (dto, context) =>
      dispatchBuiltXml(
        buildS1020(dto as S1020TaxLotationDto, builderContext(context)),
        context,
      ),
    'S-1050': (dto, context) =>
      dispatchBuiltXml(
        buildS1050(dto as S1050WorkScheduleDto, builderContext(context)),
        context,
      ),
    'S-1070': (dto, context) =>
      dispatchBuiltXml(
        buildS1070(dto as S1070ProcessDto, builderContext(context)),
        context,
      ),
    'S-1200': (dto, context) =>
      dispatchBuiltXml(
        buildS1200(dto as S1200RemunerationDto, builderContext(context)),
        context,
      ),
    'S-1299': (dto, context) =>
      dispatchBuiltXml(
        buildS1299(dto as S1299ClosureDto, builderContext(context)),
        context,
      ),
    'S-2200': (dto, context) =>
      dispatchBuiltXml(
        buildS2200(dto as S2200AdmissionDto, builderContext(context)),
        context,
      ),
  };

export const SUBMISSION_DISPATCHERS: ReadonlyMap<EsocialRelayEventClass, DispatchEntry> =
  new Map(
    ESOCIAL_RELAY_EVENT_CLASSES.map((eventClass) => [
      eventClass,
      {
        eventClass,
        route: routeSubmissionEventClass(eventClass),
        dispatch: ROUND0_DISPATCHERS[eventClass] ?? dispatchBuildingPlaceholder,
      },
    ]),
  );

export function dispatchByEventClass(
  dto: EsocialRelayRequestPayload,
  context: SubmissionDispatchContext,
): Promise<SubmissionDispatchResult> | SubmissionDispatchResult {
  const entry = SUBMISSION_DISPATCHERS.get(context.request.event_class);

  if (!entry) {
    throw new Error(`No submission dispatcher for ${context.request.event_class}`);
  }

  return entry.dispatch(dto, context);
}

function dispatchBuildingPlaceholder(
  _dto: EsocialRelayRequestPayload,
  context: SubmissionDispatchContext,
): SubmissionDispatchResult {
  return {
    eventClass: context.request.event_class,
    route: routeSubmissionEventClass(context.request.event_class),
    stage: 'building',
    builderReady: false,
  };
}

function dispatchBuiltXml(
  builtXml: BuiltXml,
  context: SubmissionDispatchContext,
): SubmissionDispatchResult {
  return {
    eventClass: context.request.event_class,
    route: routeSubmissionEventClass(context.request.event_class),
    stage: 'building',
    builderReady: true,
    builtXml,
  };
}

function builderContext(
  context: SubmissionDispatchContext,
): BuilderContext {
  return {
    environment:
      context.request.environment === 'PRODUCTION' ? 'production' : 'qualification',
  };
}
