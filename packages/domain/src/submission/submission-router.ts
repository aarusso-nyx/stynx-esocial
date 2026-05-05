import {
  ESOCIAL_BENEFIT_PROCESS_EVENT_CLASSES,
  ESOCIAL_PERIODIC_EVENT_CLASSES,
  ESOCIAL_RETURN_EVENT_CLASSES,
  ESOCIAL_TABLE_EVENT_CLASSES,
  ESOCIAL_WORKER_EVENT_CLASSES,
} from '@esocial/contracts';
import type { EsocialRelayEventClass } from '@esocial/contracts';

export type SubmissionRouteName =
  | 'tables'
  | 'periodic'
  | 'worker'
  | 'benefit-process'
  | 'return';

export type SubmissionRoute = Readonly<{
  name: SubmissionRouteName;
  eventClasses: readonly EsocialRelayEventClass[];
  stage: string;
}>;

export const SUBMISSION_ROUTES: readonly SubmissionRoute[] = [
  {
    name: 'tables',
    eventClasses: ESOCIAL_TABLE_EVENT_CLASSES,
    stage: 'build.tables',
  },
  {
    name: 'periodic',
    eventClasses: ESOCIAL_PERIODIC_EVENT_CLASSES,
    stage: 'build.periodic',
  },
  {
    name: 'worker',
    eventClasses: ESOCIAL_WORKER_EVENT_CLASSES,
    stage: 'build.worker',
  },
  {
    name: 'benefit-process',
    eventClasses: ESOCIAL_BENEFIT_PROCESS_EVENT_CLASSES,
    stage: 'build.benefit_process',
  },
  {
    name: 'return',
    eventClasses: ESOCIAL_RETURN_EVENT_CLASSES,
    stage: 'parse.return',
  },
] as const;

export function routeSubmissionEventClass(
  eventClass: EsocialRelayEventClass,
): SubmissionRoute {
  const route = SUBMISSION_ROUTES.find((candidate) =>
    candidate.eventClasses.includes(eventClass),
  );

  if (!route) {
    throw new Error(`No eSocial submission route for ${eventClass}`);
  }

  return route;
}
