import type { EsocialRelayEventClass, EsocialRelayScenario } from '../kinds.js';

export type EsocialPadesPkcs7Envelope = Readonly<{
  tenantId: string;
  eventKind: EsocialRelayEventClass;
  payloadXml: string;
  payloadSha256: string;
  pkcs7Sha256: string;
  signedAt: string;
}>;

export type EsocialRelayRequestPayload = Readonly<{
  batchId: string;
  environment: 'PRODUCTION' | 'QUALIFICATION';
  endpointUrl: string;
  eventIds: string[];
  eventClass: EsocialRelayEventClass;
  signedEnvelope: EsocialPadesPkcs7Envelope;
  scenario?: EsocialRelayScenario;
}>;

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
