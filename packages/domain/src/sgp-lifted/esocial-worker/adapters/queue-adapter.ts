import { createHash, randomUUID } from 'node:crypto';

import {
  QueueAdapterDeliveryError,
  type QueueAdapterResponseEnvelope,
  type QueueAdapterRequestEnvelope,
  type QueueAdapterTransport,
  SgpQueueAdapter,
} from '../../common/adapters';
import { RequestContextStore } from '../../common/request-context/request-context.store';
import { DatabaseService } from '../../database/database.service';
import { EsocialSpoolService } from '../../esocial-spool';
import { type EsocialPadesPkcs7Envelope } from '../../auth/govbr/software-pades-pkcs7.signer';
import {
  ESOCIAL_RELAY_QUEUE_KIND,
  type EsocialRelayEventClass,
  type EsocialRelayKind,
  type EsocialRelayRequestPayload,
  type EsocialRelayResponsePayload,
  type EsocialRelayScenario,
} from '../../integrations/stynx-esocial/contracts';

export type EsocialQueueSubmissionEnvironment = 'PRODUCTION' | 'QUALIFICATION';

export type EsocialQueueSubmitInput = Readonly<{
  tenantId: string;
  batchId: string;
  environment: EsocialQueueSubmissionEnvironment;
  endpointUrl: string;
  eventIds: string[];
  signedEnvelope: EsocialPadesPkcs7Envelope;
  eventClass?: EsocialRelayEventClass;
  scenario?: EsocialRelayScenario;
  requestId?: string;
  correlationId?: string;
  idempotencyKey?: string;
  maxAttempts?: number;
}>;

export type EsocialQueueSubmitResult = Readonly<{
  batchId: string;
  tenantId: string;
  eventIds: string[];
  eventClass: EsocialRelayEventClass;
  status: 'ACCEPTED';
  attempts: number;
  protocolNumber: string;
  receiptNumber: string;
  httpStatus: 200;
  requestSha256: string;
  responseSha256: string;
}>;

export type EsocialQueueAdapterOptions = Readonly<{
  databaseService: DatabaseService;
  transport?: QueueAdapterTransport;
  queue?: SgpQueueAdapter<EsocialRelayKind>;
  responseTimeoutMs?: number;
  retryDelayMs?: (attempt: number) => number;
  now?: () => Date;
  idFactory?: () => string;
  spoolService?: EsocialSpoolService;
}>;

const ESOCIAL_QUEUE_WORKER_PERMISSIONS = [
  'esocial.event.read',
  'esocial.event.write',
  'esocial.submission.read',
  'esocial.submission.retry',
] as const;

export class EsocialQueueAdapter {
  private readonly databaseService: DatabaseService;
  private readonly spoolService?: EsocialSpoolService;
  private readonly queue: SgpQueueAdapter<EsocialRelayKind>;
  private readonly ownsQueue: boolean;

  constructor(options: EsocialQueueAdapterOptions) {
    this.databaseService = options.databaseService;
    this.spoolService = options.spoolService;
    if (options.queue) {
      this.queue = options.queue;
      this.ownsQueue = false;
      return;
    }
    if (!options.transport) {
      throw new Error(
        'EsocialQueueAdapter requires either a queue or a queue transport.',
      );
    }
    this.queue = new SgpQueueAdapter({
      kind: ESOCIAL_RELAY_QUEUE_KIND,
      transport: options.transport,
      responseTimeoutMs: options.responseTimeoutMs,
      retryDelayMs: options.retryDelayMs,
      now: options.now,
      idFactory: options.idFactory,
    });
    this.ownsQueue = true;
  }

  async submitSignedEnvelope(
    input: EsocialQueueSubmitInput,
  ): Promise<EsocialQueueSubmitResult> {
    const eventClass = input.eventClass ?? 'S-1299';
    const payload = this.buildPayload(input, eventClass);
    const spoolRow = await this.recordSpoolPending(input, eventClass, payload);

    try {
      const response = await this.queue.request<
        EsocialRelayRequestPayload,
        EsocialRelayResponsePayload
      >({
        tenantId: input.tenantId,
        requestId: input.requestId,
        correlationId: input.correlationId ?? spoolRow?.messageId,
        idempotencyKey:
          input.idempotencyKey ??
          `${input.tenantId}:${input.batchId}:${eventClass}`,
        maxAttempts: input.maxAttempts,
        payload,
        onPublished: (request) =>
          this.recordSpoolSent(input.tenantId, spoolRow?.messageId, request),
      });
      const result = await this.persistAccepted(input, eventClass, response);
      await this.recordSpoolResponse(
        input.tenantId,
        spoolRow?.messageId,
        response,
      );
      return result;
    } catch (error) {
      await this.persistRejected(input, error);
      await this.recordSpoolError(input, spoolRow?.messageId, error);
      throw error;
    }
  }

  close(): void {
    if (this.ownsQueue) {
      this.queue.close();
    }
  }

  private buildPayload(
    input: EsocialQueueSubmitInput,
    eventClass: EsocialRelayEventClass,
  ): EsocialRelayRequestPayload {
    return {
      batchId: input.batchId,
      environment: input.environment,
      endpointUrl: input.endpointUrl,
      eventIds: input.eventIds,
      eventClass,
      signedEnvelope: input.signedEnvelope,
      scenario: input.scenario,
    };
  }

  private async persistAccepted(
    input: EsocialQueueSubmitInput,
    eventClass: EsocialRelayEventClass,
    response: QueueAdapterResponseEnvelope<
      EsocialRelayKind,
      EsocialRelayResponsePayload
    >,
  ): Promise<EsocialQueueSubmitResult> {
    const payload = response.payload;
    if (!payload) {
      throw new Error('eSocial relay accepted without a response payload.');
    }
    const requestSha256 = sha256(payload.soapRequest);
    const responseSha256 = sha256(payload.soapResponse);

    await this.runAsWorker(input.tenantId, () =>
      this.databaseService.transaction(async (client) => {
        await client.query(
          `
          UPDATE esocial.submission_batch
          SET status = 'ACCEPTED'::esocial.submission_batch_status,
              attempts = attempts + $3,
              soap_request_hash = $4,
              soap_response_hash = $5,
              http_status = $6,
              sent_at = coalesce(sent_at, $7::timestamptz),
              response_at = $8::timestamptz,
              next_attempt_at = NULL,
              updated_at = now()
          WHERE tenant_id = $1::uuid
            AND batch_id = $2::uuid
          `,
          [
            input.tenantId,
            input.batchId,
            response.attempt,
            requestSha256,
            responseSha256,
            payload.httpStatus,
            payload.ack.receivedAt,
            payload.receipt.processedAt,
          ],
        );
        await client.query(
          `
          UPDATE public.esocial_event
          SET status = 'PROCESSADO_COM_SUCESSO'::public."ESocialEventStatus",
              protocol_number = COALESCE(protocol_number, $3),
              receipt_number = COALESCE(receipt_number, $4),
              response_code = $5,
              response_description = $6,
              last_response_at = $7::timestamptz,
              updated_at = now()
          WHERE tenant_id = $1::uuid
            AND id = ANY($2::uuid[])
          `,
          [
            input.tenantId,
            input.eventIds,
            payload.ack.protocolNumber,
            payload.receipt.receiptNumber,
            payload.receipt.responseCode,
            payload.receipt.responseDescription,
            payload.receipt.processedAt,
          ],
        );
      }),
    );

    return {
      batchId: input.batchId,
      tenantId: input.tenantId,
      eventIds: input.eventIds,
      eventClass,
      status: 'ACCEPTED',
      attempts: response.attempt,
      protocolNumber: payload.ack.protocolNumber,
      receiptNumber: payload.receipt.receiptNumber,
      httpStatus: payload.httpStatus,
      requestSha256,
      responseSha256,
    };
  }

  private async persistRejected(
    input: EsocialQueueSubmitInput,
    error: unknown,
  ): Promise<void> {
    if (!(error instanceof QueueAdapterDeliveryError)) return;

    const response = error.response;
    const detail = relayErrorDetail(response?.error?.details);
    const reason =
      response?.error?.message ?? error.deadLetter.reason ?? error.message;
    const responseHash = sha256(detail.soapResponse ?? reason);

    await this.runAsWorker(input.tenantId, () =>
      this.databaseService.transaction(async (client) => {
        await client.query(
          `
          UPDATE esocial.submission_batch
          SET status = 'REJECTED'::esocial.submission_batch_status,
              attempts = attempts + $3,
              soap_request_hash = COALESCE(soap_request_hash, $4),
              soap_response_hash = $5,
              http_status = $6,
              response_at = now(),
              next_attempt_at = NULL,
              updated_at = now()
          WHERE tenant_id = $1::uuid
            AND batch_id = $2::uuid
          `,
          [
            input.tenantId,
            input.batchId,
            response?.attempt ?? error.request.attempt,
            sha256(JSON.stringify(input.signedEnvelope)),
            responseHash,
            detail.httpStatus,
          ],
        );
        await client.query(
          `
          UPDATE public.esocial_event
          SET status = 'ERRO_DEFINITIVO'::public."ESocialEventStatus",
              last_error_code = $3,
              last_error_message = $4,
              response_code = $5,
              response_description = $6,
              last_response_at = now(),
              updated_at = now()
          WHERE tenant_id = $1::uuid
            AND id = ANY($2::uuid[])
          `,
          [
            input.tenantId,
            input.eventIds,
            response?.error?.code ?? 'ESOCIAL_RELAY_REJECTED',
            reason.slice(0, 1000),
            detail.responseCode,
            detail.responseDescription,
          ],
        );
      }),
    );
  }

  private async recordSpoolPending(
    input: EsocialQueueSubmitInput,
    eventClass: EsocialRelayEventClass,
    payload: EsocialRelayRequestPayload,
  ) {
    if (!this.spoolService) return null;

    return this.spoolService.recordPending({
      tenantId: input.tenantId,
      messageId: randomUUID(),
      kind: 'submit',
      eventClass,
      sourceRef: {
        batchId: input.batchId,
        eventIds: input.eventIds,
        idempotencyKey: input.idempotencyKey ?? null,
      },
      payload,
      actorSub: RequestContextStore.get()?.actor?.sub,
      actorLogin: RequestContextStore.get()?.actor?.username,
      requestId: input.requestId ?? RequestContextStore.get()?.requestId,
      maxAttempts: input.maxAttempts,
    });
  }

  private async recordSpoolSent(
    tenantId: string,
    messageId: string | undefined,
    request: QueueAdapterRequestEnvelope<string, EsocialRelayRequestPayload>,
  ): Promise<void> {
    if (!this.spoolService || !messageId) return;

    await this.spoolService.recordSent({
      tenantId,
      messageId,
      attempt: request.attempt,
    });
  }

  private async recordSpoolResponse(
    tenantId: string,
    messageId: string | undefined,
    response: QueueAdapterResponseEnvelope<
      EsocialRelayKind,
      EsocialRelayResponsePayload
    >,
  ): Promise<void> {
    if (!this.spoolService || !messageId || !response.payload) return;

    await this.spoolService.recordResponse({
      tenantId,
      messageId,
      status: 'ACCEPTED',
      response: response.payload,
    });
  }

  private async recordSpoolError(
    input: EsocialQueueSubmitInput,
    messageId: string | undefined,
    error: unknown,
  ): Promise<void> {
    if (!this.spoolService || !messageId) return;

    if (error instanceof QueueAdapterDeliveryError) {
      await this.spoolService.recordError({
        tenantId: input.tenantId,
        messageId,
        status: error.response?.status === 'RETRY' ? 'RETRY' : 'DLQ',
        error: {
          code: error.response?.error?.code ?? 'ESOCIAL_QUEUE_DELIVERY_ERROR',
          message: error.message,
          details: error.response?.error?.details,
        },
        response: error.response,
      });
      return;
    }

    await this.spoolService.recordError({
      tenantId: input.tenantId,
      messageId,
      status: 'RETRY',
      error: {
        code: 'ESOCIAL_QUEUE_ERROR',
        message: error instanceof Error ? error.message : 'Unknown queue error',
      },
    });
  }

  private runAsWorker<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return RequestContextStore.run(
      {
        tenantId,
        permissions: [...ESOCIAL_QUEUE_WORKER_PERMISSIONS],
        bypassRls: true,
        bypassRlsReason: 'esocial-worker',
      },
      fn,
    );
  }
}

function relayErrorDetail(details: unknown): {
  httpStatus: number | null;
  responseCode: string | null;
  responseDescription: string | null;
  soapResponse: string | null;
} {
  if (!details || typeof details !== 'object') {
    return {
      httpStatus: null,
      responseCode: null,
      responseDescription: null,
      soapResponse: null,
    };
  }
  const record = details as Record<string, unknown>;
  return {
    httpStatus:
      typeof record.httpStatus === 'number' ? record.httpStatus : null,
    responseCode:
      typeof record.responseCode === 'string' ? record.responseCode : null,
    responseDescription:
      typeof record.responseDescription === 'string'
        ? record.responseDescription
        : null,
    soapResponse:
      typeof record.soapResponse === 'string' ? record.soapResponse : null,
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
