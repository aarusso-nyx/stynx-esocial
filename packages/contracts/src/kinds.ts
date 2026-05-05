export const ESOCIAL_CLASSES = [
  'submit',
  'tabelas',
  'trabalhador',
  'folha',
  'fechamento',
  'exclusao',
  'retorno',
  'certificado',
] as const;

export type EsocialClass = (typeof ESOCIAL_CLASSES)[number];

export const ESOCIAL_SUBMIT_CLASS = 'submit' satisfies EsocialClass;
export const ESOCIAL_RELAY_QUEUE_KIND = 'esocial' as const;

export type EsocialRelayKind = typeof ESOCIAL_RELAY_QUEUE_KIND;

export const ESOCIAL_TABLE_EVENT_CLASSES = [
  'S-1000',
  'S-1005',
  'S-1010',
  'S-1020',
  'S-1030',
  'S-1040',
  'S-1050',
  'S-1060',
  'S-1070',
] as const;

export const ESOCIAL_PERIODIC_EVENT_CLASSES = [
  'S-1200',
  'S-1202',
  'S-1207',
  'S-1210',
  'S-1298',
  'S-1299',
] as const;

export const ESOCIAL_WORKER_EVENT_CLASSES = [
  'S-2200',
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

export const ESOCIAL_BENEFIT_PROCESS_EVENT_CLASSES = [
  'S-2400',
  'S-2405',
  'S-2410',
  'S-2416',
  'S-2418',
  'S-2420',
  'S-2501',
  'S-3000',
] as const;

export const ESOCIAL_RETURN_EVENT_CLASSES = [
  'S-5001',
  'S-5002',
  'S-5011',
  'S-5012',
  'S-5013',
] as const;

export const ESOCIAL_RELAY_EVENT_CLASSES = [
  ...ESOCIAL_TABLE_EVENT_CLASSES,
  ...ESOCIAL_PERIODIC_EVENT_CLASSES,
  ...ESOCIAL_WORKER_EVENT_CLASSES,
  ...ESOCIAL_BENEFIT_PROCESS_EVENT_CLASSES,
  ...ESOCIAL_RETURN_EVENT_CLASSES,
] as const;

export type EsocialRelayEventClass =
  (typeof ESOCIAL_RELAY_EVENT_CLASSES)[number];

export const ESOCIAL_CONTRACT_VERSION = 'v1' as const;
export type EsocialContractVersion = typeof ESOCIAL_CONTRACT_VERSION;

export const ESOCIAL_TRANSPORT_FAMILIES = [
  'request',
  'response',
  'spool',
  'audit',
  'retry',
  'dlq',
  'replay',
] as const;

export type EsocialTransportFamily =
  (typeof ESOCIAL_TRANSPORT_FAMILIES)[number];

export const ESOCIAL_ENVIRONMENTS = [
  'PRODUCTION',
  'QUALIFICATION',
] as const;

export type EsocialEnvironment = (typeof ESOCIAL_ENVIRONMENTS)[number];

export const ESOCIAL_STATUSES = [
  'pending',
  'building',
  'validation_failed',
  'signed',
  'sent',
  'accepted',
  'rejected',
  'retry',
  'timeout',
  'dlq',
  'excluded',
  'failed',
] as const;

export type EsocialStatus = (typeof ESOCIAL_STATUSES)[number];

export const ESOCIAL_ERROR_CATEGORIES = [
  'validation',
  'schema',
  'xml_build',
  'signing',
  'transport',
  'regulatory',
  'configuration',
  'authentication',
  'idempotency',
  'totalizer_parse',
  'internal',
] as const;

export type EsocialErrorCategory =
  (typeof ESOCIAL_ERROR_CATEGORIES)[number];

export type EsocialRelayScenario =
  | 'ACCEPT'
  | 'TRANSIENT_ERROR'
  | 'DEFINITIVE_ERROR';
