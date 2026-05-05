import type {
  EsocialContractVersion,
  EsocialEnvironment,
  EsocialErrorCategory,
  EsocialRelayEventClass,
  EsocialStatus,
  EsocialTransportFamily,
} from './kinds.js';

export type EsocialSourceReference = Readonly<{
  source_event_id?: string;
  payroll_run_id?: string;
  employee_id?: string;
  source_entity_id?: string;
  source_entity_ids?: readonly string[];
  source_system?: string;
}>;

export type EsocialContractError = Readonly<{
  category: EsocialErrorCategory;
  code: string;
  message: string;
  details?: unknown;
  retryable?: boolean;
  occurred_at?: string;
}>;

export type EsocialPayloadHashes = Readonly<{
  request_sha256?: string;
  payload_sha256?: string;
  signed_payload_sha256?: string;
  response_sha256?: string;
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
    protocol_number?: string;
    receipt_number?: string;
    response_code?: string;
    response_description?: string;
    hashes?: EsocialPayloadHashes;
    payload?: TPayload;
    errors?: readonly EsocialContractError[];
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
      errors?: readonly EsocialContractError[];
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
      replay_topic?: string;
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
    payload?: TPayload;
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
