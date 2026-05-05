import { createHash } from 'node:crypto';

import {
  adapterQueueTopics,
  type QueueAdapterErrorEnvelope,
  type QueueAdapterRequestEnvelope,
  type QueueAdapterResponseEnvelope,
  type QueueAdapterResponseStatus,
  type QueueAdapterTransport,
  type QueueSubscription,
} from '../../../common/adapters';
import { SoftwarePadesPkcs7Signer } from '../../../auth/govbr/software-pades-pkcs7.signer';
import { XsdValidatorService } from '../../../esocial-worker/xsd/xsd-validator.service';
import {
  ESOCIAL_RELAY_QUEUE_KIND,
  type EsocialRelayKind,
  type EsocialRelayRequestPayload,
  type EsocialRelayResponsePayload,
} from '../../../integrations/stynx-esocial/contracts';

type RelayDecision =
  | {
      status: 'OK';
      payload: EsocialRelayResponsePayload;
    }
  | {
      status: 'RETRY' | 'DEAD_LETTER';
      error: QueueAdapterErrorEnvelope;
    };

export type EsocialRelayMockResponderOptions = Readonly<{
  transport: QueueAdapterTransport;
  signer?: SoftwarePadesPkcs7Signer;
  xsdValidator?: XsdValidatorService;
  concurrency?: number;
  now?: () => Date;
}>;

export class EsocialRelayMockResponder {
  private readonly transport: QueueAdapterTransport;
  private readonly signer: SoftwarePadesPkcs7Signer;
  private readonly xsdValidator: XsdValidatorService;
  private readonly now: () => Date;
  private readonly subscription: QueueSubscription;

  constructor(options: EsocialRelayMockResponderOptions) {
    this.transport = options.transport;
    this.signer = options.signer ?? new SoftwarePadesPkcs7Signer();
    this.xsdValidator = options.xsdValidator ?? new XsdValidatorService();
    this.now = options.now ?? (() => new Date());
    this.subscription = this.transport.subscribe<
      QueueAdapterRequestEnvelope<EsocialRelayKind, EsocialRelayRequestPayload>
    >(
      adapterQueueTopics(ESOCIAL_RELAY_QUEUE_KIND).request,
      (request) => this.handleRequest(request),
      { concurrency: options.concurrency ?? 4 },
    );
  }

  close(): void {
    this.subscription.unsubscribe();
  }

  private async handleRequest(
    request: QueueAdapterRequestEnvelope<
      EsocialRelayKind,
      EsocialRelayRequestPayload
    >,
  ): Promise<void> {
    const decision = this.evaluate(request);
    const response = this.buildResponse(request, decision);
    await this.transport.publish(request['reply-to'], response);
  }

  private evaluate(
    request: QueueAdapterRequestEnvelope<
      EsocialRelayKind,
      EsocialRelayRequestPayload
    >,
  ): RelayDecision {
    const payload = request.payload;
    if (payload.scenario === 'TRANSIENT_ERROR') {
      return this.error('RETRY', 'TRANSIENT', 'ESOCIAL_RELAY_TRANSIENT');
    }
    if (payload.scenario === 'DEFINITIVE_ERROR') {
      return this.error(
        'DEAD_LETTER',
        'DEFINITIVE',
        'ESOCIAL_RELAY_DEFINITIVE',
      );
    }
    if (payload.signedEnvelope.eventKind !== payload.eventClass) {
      return this.error(
        'DEAD_LETTER',
        'DEFINITIVE',
        'ESOCIAL_RELAY_EVENT_MISMATCH',
        'Signed envelope event class does not match relay payload.',
      );
    }
    if (payload.signedEnvelope.tenantId !== request.tenant_id) {
      return this.error(
        'DEAD_LETTER',
        'DEFINITIVE',
        'ESOCIAL_RELAY_TENANT_MISMATCH',
        'Signed envelope tenant does not match queue envelope tenant.',
      );
    }
    if (payload.eventIds.length === 0) {
      return this.error(
        'DEAD_LETTER',
        'DEFINITIVE',
        'ESOCIAL_RELAY_EMPTY_BATCH',
        'eSocial relay requests must carry at least one event id.',
      );
    }
    if (!this.signer.verifyEnvelope(payload.signedEnvelope)) {
      return this.error(
        'DEAD_LETTER',
        'DEFINITIVE',
        'ESOCIAL_RELAY_SIGNATURE_INVALID',
        'PAdES/PKCS#7 envelope failed local sandbox verification.',
      );
    }

    const xsd = this.xsdValidator.validate(
      payload.eventClass,
      payload.signedEnvelope.payloadXml,
      { allowUnsigned: true },
    );
    if (!xsd.valid) {
      return this.error(
        'DEAD_LETTER',
        'DEFINITIVE',
        'ESOCIAL_RELAY_XSD_INVALID',
        'Signed eSocial payload failed S-1.3 XSD validation.',
        {
          httpStatus: 422,
          xsd: {
            eventKind: xsd.eventKind,
            xsdPath: xsd.xsdPath,
            errors: xsd.errors,
          },
        },
      );
    }

    const receivedAt = this.now().toISOString();
    const processedAt = receivedAt;
    const requestSha256 = sha256(JSON.stringify(payload));
    const protocolNumber = `1.1.202605.${digitsFromHash(requestSha256, 15)}`;
    const receiptNumber = `1.1.${digitsFromHash(
      payload.signedEnvelope.payloadSha256,
      19,
    )}`;
    const soapRequest = buildSoapRequest(request, requestSha256);
    const soapResponse = buildSoapResponse({
      protocolNumber,
      receiptNumber,
      receivedAt,
      processedAt,
      eventIds: payload.eventIds,
    });

    return {
      status: 'OK',
      payload: {
        relay: 'esocial-relay',
        batchId: payload.batchId,
        eventIds: payload.eventIds,
        eventClass: payload.eventClass,
        ack: {
          responseCode: '201',
          responseDescription: 'Lote recebido com sucesso',
          protocolNumber,
          receivedAt,
        },
        receipt: {
          responseCode: '201',
          responseDescription: 'Sucesso.',
          receiptNumber,
          processedAt,
        },
        hashes: {
          requestSha256,
          payloadSha256: payload.signedEnvelope.payloadSha256,
          pkcs7Sha256: payload.signedEnvelope.pkcs7Sha256,
        },
        xsd: {
          valid: true,
          eventKind: payload.eventClass,
          xsdPath: xsd.xsdPath,
        },
        httpStatus: 200,
        soapRequest,
        soapResponse,
      },
    };
  }

  private error(
    status: 'RETRY' | 'DEAD_LETTER',
    kind: QueueAdapterErrorEnvelope['kind'],
    code: string,
    message = 'Mock eSocial relay requested adapter retry.',
    details?: unknown,
  ): RelayDecision {
    return {
      status,
      error: {
        kind,
        code,
        message,
        details,
      },
    };
  }

  private buildResponse(
    request: QueueAdapterRequestEnvelope<
      EsocialRelayKind,
      EsocialRelayRequestPayload
    >,
    decision: RelayDecision,
  ): QueueAdapterResponseEnvelope<
    EsocialRelayKind,
    EsocialRelayResponsePayload
  > {
    return {
      'request-id': request['request-id'],
      'correlation-id': request['correlation-id'],
      'created-at': this.now().toISOString(),
      tenant_id: request.tenant_id,
      kind: request.kind,
      status: decision.status satisfies QueueAdapterResponseStatus,
      attempt: request.attempt,
      payload: decision.status === 'OK' ? decision.payload : undefined,
      error: decision.status === 'OK' ? undefined : decision.error,
    };
  }
}

function buildSoapRequest(
  request: QueueAdapterRequestEnvelope<
    EsocialRelayKind,
    EsocialRelayRequestPayload
  >,
  requestSha256: string,
): string {
  const payload = request.payload;
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">',
    '<soap:Body>',
    '<EnviarLoteEventos xmlns="http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/v1_1_0">',
    '<loteEventos>',
    `<mockPadesEnvelope eventClass="${escapeXml(payload.eventClass)}" batchId="${escapeXml(payload.batchId)}">`,
    `<payloadSha256>${escapeXml(payload.signedEnvelope.payloadSha256)}</payloadSha256>`,
    `<pkcs7Sha256>${escapeXml(payload.signedEnvelope.pkcs7Sha256)}</pkcs7Sha256>`,
    `<requestSha256>${escapeXml(requestSha256)}</requestSha256>`,
    '</mockPadesEnvelope>',
    '</loteEventos>',
    '</EnviarLoteEventos>',
    '</soap:Body>',
    '</soap:Envelope>',
  ].join('');
}

function buildSoapResponse(input: {
  protocolNumber: string;
  receiptNumber: string;
  receivedAt: string;
  processedAt: string;
  eventIds: readonly string[];
}): string {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">',
    '<soap:Body>',
    '<EnviarLoteEventosResponse xmlns="http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/v1_1_0">',
    '<EnviarLoteEventosResult>',
    '<eSocial xmlns="http://www.esocial.gov.br/schema/lote/eventos/envio/retorno/v1_1_0">',
    '<retornoEnvioLoteEventos>',
    '<status><cdResposta>201</cdResposta><descResposta>Lote recebido com sucesso</descResposta></status>',
    `<dadosRecepcaoLote><protocoloEnvio>${escapeXml(input.protocolNumber)}</protocoloEnvio><dhRecepcao>${escapeXml(input.receivedAt)}</dhRecepcao></dadosRecepcaoLote>`,
    '</retornoEnvioLoteEventos>',
    '<retornoProcessamentoLoteEventos>',
    '<status><cdResposta>201</cdResposta><descResposta>Lote Processado com Sucesso.</descResposta></status>',
    '<retornoEventos>',
    ...input.eventIds.map((eventId) =>
      [
        `<evento Id="${escapeXml(eventId)}">`,
        '<retornoEvento><eSocial><retornoEvento>',
        '<processamento><cdResposta>201</cdResposta><descResposta>Sucesso.</descResposta>',
        `<dhProcessamento>${escapeXml(input.processedAt)}</dhProcessamento></processamento>`,
        `<recibo><nrRecibo>${escapeXml(input.receiptNumber)}</nrRecibo></recibo>`,
        '</retornoEvento></eSocial></retornoEvento>',
        '</evento>',
      ].join(''),
    ),
    '</retornoEventos>',
    '</retornoProcessamentoLoteEventos>',
    '</eSocial>',
    '</EnviarLoteEventosResult>',
    '</EnviarLoteEventosResponse>',
    '</soap:Body>',
    '</soap:Envelope>',
  ].join('');
}

function digitsFromHash(hash: string, length: number): string {
  const digits = hash.replace(/\D/gu, '');
  if (digits.length >= length) return digits.slice(0, length);
  const expanded = BigInt(`0x${hash.slice(0, 15)}`).toString();
  return `${digits}${expanded}`.padEnd(length, '0').slice(0, length);
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;');
}
