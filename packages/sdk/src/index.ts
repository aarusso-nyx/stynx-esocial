import { createHash } from 'node:crypto';

import {
  buildEsocialIdempotencyKey,
} from '@esocial/contracts';
import type {
  CorrelationId,
  EsocialContractVersion,
  EsocialEnvironment,
  EsocialRelayEventClass,
  EsocialRequestEnvelope,
  EsocialResponseEnvelope,
  EsocialSgpRequestDto,
  EventClass,
  IdempotencyKey,
  TenantId,
} from '@esocial/contracts';

export type DtoFor<TEventClass extends EsocialRelayEventClass> = Extract<
  EsocialSgpRequestDto,
  { eventClass: TEventClass }
>;

export type EsocialClientConfig = Readonly<{
  tenantId: TenantId;
  environment: EsocialEnvironment;
  replyTo: string;
  deadLetterTopic: string;
  sourceSystem?: string | undefined;
  maxAttempts?: number | undefined;
}>;

export type SubmitOptions<TEventClass extends EsocialRelayEventClass> = Readonly<{
  eventClass?: EventClass | undefined;
  correlationId: CorrelationId;
  requestId: string;
  sourceEntityId?: string | undefined;
  sourceEntityIds?: readonly string[] | undefined;
  competence?: string | undefined;
  now?: Date | undefined;
  kind?: string | undefined;
  dto?: DtoFor<TEventClass> | undefined;
}>;

export type ReplayOptions = Readonly<{
  reason: string;
  replayedBy: string;
  force?: boolean | undefined;
}>;

export type StatusResult = Readonly<{
  idempotencyKey: IdempotencyKey;
  status: string;
  raw?: unknown | undefined;
}>;

export type EsocialTransport = Readonly<{
  submit(envelope: EsocialRequestEnvelope): Promise<EsocialResponseEnvelope | void>;
  consultStatus(idempotencyKey: IdempotencyKey): Promise<StatusResult>;
  replayDlq(itemId: string, options: ReplayOptions): Promise<unknown>;
}>;

export class EsocialClient {
  constructor(
    private readonly config: EsocialClientConfig,
    private readonly transport: EsocialTransport,
  ) {}

  async submit<TEventClass extends EsocialRelayEventClass>(
    dto: DtoFor<TEventClass>,
    options: SubmitOptions<TEventClass>,
  ): Promise<EsocialResponseEnvelope | void> {
    const eventClass = dto.eventClass;
    const payloadHash = sha256(JSON.stringify(dto));
    const idempotency = buildEsocialIdempotencyKey({
      family: 'request',
      tenant_id: this.config.tenantId,
      environment: this.config.environment,
      event_class: eventClass,
      source_event_id: dto.sourceEventId,
      source_entity_id: options.sourceEntityId ?? dto.sourceEntityId,
      source_entity_ids: options.sourceEntityIds ?? dto.sourceEntityIds,
      competence: options.competence ?? competenceFromDto(dto),
      payload_hash: payloadHash,
    });
    const envelope: EsocialRequestEnvelope = {
      version: 'v1' satisfies EsocialContractVersion,
      family: 'request',
      'request-id': options.requestId,
      'correlation-id': options.correlationId,
      'idempotency-key': idempotency.value,
      created_at: (options.now ?? new Date()).toISOString(),
      tenant_id: this.config.tenantId,
      environment: this.config.environment,
      event_class: eventClass,
      source: {
        source_event_id: dto.sourceEventId,
        source_entity_id: options.sourceEntityId ?? dto.sourceEntityId,
        source_entity_ids: options.sourceEntityIds ?? dto.sourceEntityIds,
        source_system: this.config.sourceSystem ?? 'SGP',
      },
      kind: options.kind ?? 'submit',
      payload: dto,
      payload_hash: payloadHash,
      attempt: 1,
      'max-attempts': this.config.maxAttempts ?? 3,
      'reply-to': this.config.replyTo,
      'dead-letter-topic': this.config.deadLetterTopic,
    };

    return this.transport.submit(envelope);
  }

  consultStatus(idempotencyKey: IdempotencyKey): Promise<StatusResult> {
    return this.transport.consultStatus(idempotencyKey);
  }

  replayDlq(itemId: string, options: ReplayOptions): Promise<unknown> {
    return this.transport.replayDlq(itemId, options);
  }
}

export class RecordingTransport implements EsocialTransport {
  readonly submitted: EsocialRequestEnvelope[] = [];
  readonly replays: ReadonlyArray<{ itemId: string; options: ReplayOptions }> = [];

  async submit(envelope: EsocialRequestEnvelope): Promise<void> {
    this.submitted.push(envelope);
  }

  async consultStatus(idempotencyKey: IdempotencyKey): Promise<StatusResult> {
    return { idempotencyKey, status: 'pending' };
  }

  async replayDlq(itemId: string, options: ReplayOptions): Promise<unknown> {
    const next = [...this.replays, { itemId, options }];
    Object.defineProperty(this, 'replays', { value: next });
    return { status: 'replay_requested', itemId };
  }
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function competenceFromDto(dto: EsocialSgpRequestDto): string | undefined {
  if ('competence' in dto && typeof dto.competence === 'string') return dto.competence;
  if ('validityStart' in dto && typeof dto.validityStart === 'string') return dto.validityStart;
  return undefined;
}
