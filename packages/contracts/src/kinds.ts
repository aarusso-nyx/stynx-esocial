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
export type EsocialRelayEventClass = 'S-1299';
export type EsocialRelayScenario =
  | 'ACCEPT'
  | 'TRANSIENT_ERROR'
  | 'DEFINITIVE_ERROR';
