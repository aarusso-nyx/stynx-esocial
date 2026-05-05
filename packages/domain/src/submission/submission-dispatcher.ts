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
  S1202RppsRemunerationDto,
  S1207RppsBenefitPaymentDto,
  S1210PaymentDto,
  S1298ReopeningDto,
  S1299ClosureDto,
  S2200AdmissionDto,
  S2205WorkerChangeDto,
  S2206ContractChangeDto,
  S2210CatDto,
  S2220ExamDto,
  S2230LeaveDto,
  S2240ExposureDto,
  S2298ReintegrationDto,
  S2299TerminationDto,
  S2300TsvStartDto,
  S2306TsvContractChangeDto,
  S2399TsvTerminationDto,
  S2400BeneficiaryRegistrationDto,
  S2405BeneficiaryChangeDto,
  S2410BenefitStartDto,
  S2416BenefitChangeDto,
  S2418BenefitReactivationDto,
  S2420BenefitTerminationDto,
  S2501ProcessTaxDto,
  S3000ExclusionDto,
} from '@esocial/contracts';

import {
  buildS1000,
  buildS1005,
  buildS1010,
  buildS1020,
  buildS1050,
  buildS1070,
  buildS1200,
  buildS1202,
  buildS1207,
  buildS1210,
  buildS1298,
  buildS1299,
  buildS2200,
  buildS2205,
  buildS2206,
  buildS2210,
  buildS2220,
  buildS2230,
  buildS2240,
  buildS2298Worker,
  buildS2299Worker,
  buildS2300,
  buildS2306,
  buildS2399,
  buildS2400,
  buildS2405,
  buildS2410,
  buildS2416,
  buildS2418,
  buildS2420,
  buildS2501,
  buildS3000,
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
    'S-1202': (dto, context) =>
      dispatchBuiltXml(
        buildS1202(dto as S1202RppsRemunerationDto, builderContext(context)),
        context,
      ),
    'S-1207': (dto, context) =>
      dispatchBuiltXml(
        buildS1207(dto as S1207RppsBenefitPaymentDto, builderContext(context)),
        context,
      ),
    'S-1210': (dto, context) =>
      dispatchBuiltXml(
        buildS1210(dto as S1210PaymentDto, builderContext(context)),
        context,
      ),
    'S-1298': (dto, context) =>
      dispatchBuiltXml(
        buildS1298(dto as S1298ReopeningDto, builderContext(context)),
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
    'S-2205': (dto, context) =>
      dispatchBuiltXml(
        buildS2205(dto as S2205WorkerChangeDto, builderContext(context)),
        context,
      ),
    'S-2206': (dto, context) =>
      dispatchBuiltXml(
        buildS2206(dto as S2206ContractChangeDto, builderContext(context)),
        context,
      ),
    'S-2210': (dto, context) =>
      dispatchBuiltXml(
        buildS2210(dto as S2210CatDto, builderContext(context)),
        context,
      ),
    'S-2220': (dto, context) =>
      dispatchBuiltXml(
        buildS2220(dto as S2220ExamDto, builderContext(context)),
        context,
      ),
    'S-2230': (dto, context) =>
      dispatchBuiltXml(
        buildS2230(dto as S2230LeaveDto, builderContext(context)),
        context,
      ),
    'S-2240': (dto, context) =>
      dispatchBuiltXml(
        buildS2240(dto as S2240ExposureDto, builderContext(context)),
        context,
      ),
    'S-2298': (dto, context) =>
      dispatchBuiltXml(
        buildS2298Worker(dto as S2298ReintegrationDto, builderContext(context)),
        context,
      ),
    'S-2299': (dto, context) =>
      dispatchBuiltXml(
        buildS2299Worker(dto as S2299TerminationDto, builderContext(context)),
        context,
      ),
    'S-2300': (dto, context) =>
      dispatchBuiltXml(
        buildS2300(dto as S2300TsvStartDto, builderContext(context)),
        context,
      ),
    'S-2306': (dto, context) =>
      dispatchBuiltXml(
        buildS2306(dto as S2306TsvContractChangeDto, builderContext(context)),
        context,
      ),
    'S-2399': (dto, context) =>
      dispatchBuiltXml(
        buildS2399(dto as S2399TsvTerminationDto, builderContext(context)),
        context,
      ),
    'S-2400': (dto, context) =>
      dispatchBuiltXml(
        buildS2400(dto as S2400BeneficiaryRegistrationDto, builderContext(context)),
        context,
      ),
    'S-2405': (dto, context) =>
      dispatchBuiltXml(
        buildS2405(dto as S2405BeneficiaryChangeDto, builderContext(context)),
        context,
      ),
    'S-2410': (dto, context) =>
      dispatchBuiltXml(
        buildS2410(dto as S2410BenefitStartDto, builderContext(context)),
        context,
      ),
    'S-2416': (dto, context) =>
      dispatchBuiltXml(
        buildS2416(dto as S2416BenefitChangeDto, builderContext(context)),
        context,
      ),
    'S-2418': (dto, context) =>
      dispatchBuiltXml(
        buildS2418(dto as S2418BenefitReactivationDto, builderContext(context)),
        context,
      ),
    'S-2420': (dto, context) =>
      dispatchBuiltXml(
        buildS2420(dto as S2420BenefitTerminationDto, builderContext(context)),
        context,
      ),
    'S-2501': (dto, context) =>
      dispatchBuiltXml(
        buildS2501(dto as S2501ProcessTaxDto, builderContext(context)),
        context,
      ),
    'S-3000': (dto, context) =>
      dispatchBuiltXml(
        buildS3000(dto as S3000ExclusionDto, builderContext(context)),
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
