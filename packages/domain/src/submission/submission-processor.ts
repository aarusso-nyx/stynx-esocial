import type {
  EsocialRelayKind,
  EsocialRelayRequestPayload,
  EsocialRelayResponsePayload,
  QueueAdapterRequestEnvelope,
  QueueAdapterResponseEnvelope,
  SpoolUpdateEnvelope,
} from '@stynx/esocial-contracts';

export type SubmissionProcessorResult = Readonly<{
  response: QueueAdapterResponseEnvelope<EsocialRelayKind, EsocialRelayResponsePayload>;
  spoolUpdate: SpoolUpdateEnvelope;
}>;

export class SubmissionProcessor {
  process(
    request: QueueAdapterRequestEnvelope<EsocialRelayKind, EsocialRelayRequestPayload>,
  ): SubmissionProcessorResult {
    const processedAt = new Date().toISOString();
    const protocolNumber = `STYNX-${request.payload.batchId}`;
    const responsePayload: EsocialRelayResponsePayload = {
      relay: 'stynx-esocial',
      batchId: request.payload.batchId,
      eventIds: request.payload.eventIds,
      eventClass: request.payload.eventClass,
      ack: {
        responseCode: '201',
        responseDescription: 'Lote recebido com sucesso',
        protocolNumber,
        receivedAt: processedAt,
      },
      receipt: {
        responseCode: '201',
        responseDescription: 'Sucesso.',
        receiptNumber: `STYNX-REC-${request.payload.batchId}`,
        processedAt,
      },
      hashes: {
        requestSha256: request.payload.signedEnvelope.payloadSha256,
        payloadSha256: request.payload.signedEnvelope.payloadSha256,
        pkcs7Sha256: request.payload.signedEnvelope.pkcs7Sha256,
      },
      httpStatus: 200,
    };

    return {
      response: {
        'request-id': request['request-id'],
        'correlation-id': request['correlation-id'],
        'created-at': processedAt,
        tenant_id: request.tenant_id,
        kind: request.kind,
        status: 'OK',
        attempt: request.attempt,
        payload: responsePayload,
      },
      spoolUpdate: {
        message_id: request['correlation-id'],
        tenant_id: request.tenant_id,
        kind: 'submit',
        status_transition: {
          from: 'SENT',
          to: 'ACCEPTED',
        },
        response_payload: responsePayload,
        occurred_at: processedAt,
      },
    };
  }
}
