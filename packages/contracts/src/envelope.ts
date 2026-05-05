import type {
  EsocialContractVersion,
  EsocialEnvironment,
  EsocialErrorCategory,
  EsocialRelayEventClass,
  EsocialStatus,
  EsocialTransportFamily,
} from './kinds.js';

export type EsocialSourceReference = Readonly<{
  source_event_id?: string | undefined;
  payroll_run_id?: string | undefined;
  employee_id?: string | undefined;
  source_entity_id?: string | undefined;
  source_entity_ids?: readonly string[] | undefined;
  source_system?: string | undefined;
}>;

export type EsocialContractError = Readonly<{
  category: EsocialErrorCategory;
  code: string;
  message: string;
  details?: unknown | undefined;
  retryable?: boolean | undefined;
  occurred_at?: string | undefined;
}>;

export type EsocialPayloadHashes = Readonly<{
  request_sha256?: string | undefined;
  payload_sha256?: string | undefined;
  signed_payload_sha256?: string | undefined;
  response_sha256?: string | undefined;
}>;

export type EsocialEnvelopeBase<TFamily extends EsocialTransportFamily> =
  Readonly<{
    version: EsocialContractVersion;
    family: TFamily;
    'request-id': string;
    'correlation-id': string;
    'idempotency-key': string;
    created_at: string;
    tenant_id: string;
    environment: EsocialEnvironment;
    event_class: EsocialRelayEventClass;
    source: EsocialSourceReference;
  }>;

export type EsocialRequestEnvelope<
  TKind extends string = string,
  TPayload = unknown,
> = EsocialEnvelopeBase<'request'> &
  Readonly<{
    kind: TKind;
    payload: TPayload;
    payload_hash: string;
    attempt: number;
    'max-attempts': number;
    'reply-to': string;
    'dead-letter-topic': string;
  }>;

export type EsocialResponseEnvelope<
  TKind extends string = string,
  TPayload = unknown,
> = EsocialEnvelopeBase<'response'> &
  Readonly<{
    kind: TKind;
    status: EsocialStatus;
    attempt: number;
    processed_at: string;
    protocol_number?: string | undefined;
    receipt_number?: string | undefined;
    response_code?: string | undefined;
    response_description?: string | undefined;
    hashes?: EsocialPayloadHashes | undefined;
    payload?: TPayload | undefined;
    errors?: readonly EsocialContractError[] | undefined;
  }>;

export type EsocialRetryEnvelope<TKind extends string = string> =
  EsocialEnvelopeBase<'retry'> &
    Readonly<{
      kind: TKind;
      status: Extract<EsocialStatus, 'retry' | 'timeout'>;
      attempt: number;
      'max-attempts': number;
      next_attempt_at: string;
      retry_reason: string;
      errors?: readonly EsocialContractError[] | undefined;
    }>;

export type EsocialDlqEnvelope<TKind extends string = string> =
  EsocialEnvelopeBase<'dlq'> &
    Readonly<{
      kind: TKind;
      status: Extract<EsocialStatus, 'dlq' | 'failed'>;
      final_attempt: number;
      dlq_reason: string;
      failed_at: string;
      errors: readonly EsocialContractError[];
      replay_topic?: string | undefined;
    }>;

export type EsocialReplayEnvelope<
  TKind extends string = string,
  TPayload = unknown,
> = EsocialEnvelopeBase<'replay'> &
  Readonly<{
    kind: TKind;
    status: Extract<EsocialStatus, 'pending'>;
    original_request_id: string;
    replay_request_id: string;
    replayed_by: string;
    replay_reason: string;
    payload?: TPayload | undefined;
  }>;

export type QueueAdapterResponseStatus = EsocialStatus;
export type QueueAdapterErrorKind = EsocialErrorCategory;
export type QueueAdapterErrorEnvelope = EsocialContractError;
export type QueueAdapterRequestEnvelope<
  TKind extends string = string,
  TPayload = unknown,
> = EsocialRequestEnvelope<TKind, TPayload>;
export type QueueAdapterResponseEnvelope<
  TKind extends string = string,
  TPayload = unknown,
> = EsocialResponseEnvelope<TKind, TPayload>;
export type QueueAdapterDeadLetterEnvelope<TKind extends string = string> =
  EsocialDlqEnvelope<TKind>;
