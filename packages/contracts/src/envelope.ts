export type QueueAdapterResponseStatus = 'OK' | 'RETRY' | 'DEAD_LETTER';

export type QueueAdapterErrorKind =
  | 'TRANSIENT'
  | 'DEFINITIVE'
  | 'TIMEOUT'
  | 'MAX_ATTEMPTS_EXCEEDED';

export type QueueAdapterErrorEnvelope = Readonly<{
  kind: QueueAdapterErrorKind;
  code: string;
  message: string;
  details?: unknown;
}>;

export type QueueAdapterRequestEnvelope<
  TKind extends string = string,
  TPayload = unknown,
> = Readonly<{
  'request-id': string;
  'correlation-id': string;
  'idempotency-key': string;
  'reply-to': string;
  'dead-letter-topic': string;
  'created-at': string;
  tenant_id: string;
  kind: TKind;
  payload: TPayload;
  attempt: number;
  'max-attempts': number;
}>;

export type QueueAdapterResponseEnvelope<
  TKind extends string = string,
  TPayload = unknown,
> = Readonly<{
  'request-id': string;
  'correlation-id': string;
  'created-at': string;
  tenant_id: string;
  kind: TKind;
  status: QueueAdapterResponseStatus;
  attempt: number;
  payload?: TPayload;
  error?: QueueAdapterErrorEnvelope;
}>;
