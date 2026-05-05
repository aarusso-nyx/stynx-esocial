import type { EsocialRelayRequestPayload } from '../dtos/validators.js';
import type { EsocialRelayEventClass } from '../kinds.js';

/** @deprecated SGP v1 request DTOs do not carry XML or signatures. */
export type EsocialPadesPkcs7Envelope = Readonly<{
  tenantId: string;
  eventKind: EsocialRelayEventClass;
  payloadXml: string;
  payloadSha256: string;
  pkcs7Sha256: string;
  signedAt: string;
}>;

export type { EsocialRelayRequestPayload };

export type EsocialRelayResponsePayload = Readonly<{
  relay: 'esocial';
  batchId: string;
  eventIds: string[];
  eventClass: EsocialRelayEventClass;
  ack: {
    responseCode: string;
    responseDescription: string;
    protocolNumber: string;
    receivedAt: string;
  };
  receipt?: {
    responseCode: string;
    responseDescription: string;
    receiptNumber: string;
    processedAt: string;
  };
  hashes: {
    requestSha256: string;
    payloadSha256: string;
    pkcs7Sha256: string;
  };
  httpStatus: number;
}>;
