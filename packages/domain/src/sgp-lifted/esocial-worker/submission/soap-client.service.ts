import { createHash } from 'node:crypto';
import * as https from 'node:https';

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import * as soap from 'soap';
import type { ISecurity } from 'soap';
import { SignedXml } from 'xml-crypto';

import {
  CertificateMaterial,
  IcpSignerService,
} from '../signature/icp-signer.service';

const SOAP_ENVELOPE_NS = 'http://schemas.xmlsoap.org/soap/envelope/';
const SERVICE_NS =
  'http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/v1_1_0';
const SOAP_ACTION = `${SERVICE_NS}/ServicoEnviarLoteEventos/EnviarLoteEventos`;
const WSSE_NS =
  'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd';
const WSU_NS =
  'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd';
const X509_VALUE_TYPE =
  'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3';
const BASE64_ENCODING_TYPE =
  'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary';
const EXC_C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';

export interface SendSoapBatchInput {
  endpointUrl: string;
  batchXml: string;
  pkcs12: Buffer;
  passphrase?: string;
  wsdlUrl?: string;
}

export interface SoapBatchResult {
  accepted: boolean;
  soapRequest: string;
  soapResponse: string;
  httpStatus: number | null;
}

export interface BuildSignedEnvelopeInput {
  batchXml: string;
  certificate: CertificateMaterial;
  createdAt: Date;
  expiresAt: Date;
  idSeed: string;
}

export class SoapSubmissionException extends Error {
  constructor(
    message: string,
    readonly soapRequest: string,
    readonly soapResponse: string,
    readonly httpStatus: number | null,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'SoapSubmissionException';
  }
}

@Injectable()
export class SoapClientService {
  constructor(private readonly signer: IcpSignerService) {}

  async sendBatch(input: SendSoapBatchInput): Promise<SoapBatchResult> {
    this.assertNoGovBrCallInTest(input.endpointUrl);
    const certificate = this.signer.readPkcs12(
      input.pkcs12,
      input.passphrase ?? '',
    );
    const security = new ESocialWsSecurity(certificate, {
      pfx: input.pkcs12,
      passphrase: input.passphrase ?? '',
    });
    const wsdlUrl = input.wsdlUrl ?? `${input.endpointUrl}?wsdl`;
    let soapRequest = '';
    let soapResponse = '';
    let responseStatus: number | null = null;

    try {
      const client = await soap.createClientAsync(
        wsdlUrl,
        {
          endpoint: input.endpointUrl,
          escapeXML: false,
        },
        input.endpointUrl,
      );
      client.setEndpoint(input.endpointUrl);
      client.setSOAPAction(SOAP_ACTION);
      client.setSecurity(security);
      client.on('request', (xml) => {
        soapRequest = xml;
      });
      client.on('response', (body, response) => {
        soapResponse = typeof body === 'string' ? body : String(body ?? '');
        responseStatus = this.httpStatus(response);
      });

      const method = client.EnviarLoteEventosAsync as soap.SoapMethodAsync;
      const methodResult = (await method({
        loteEventos: { $xml: input.batchXml },
      })) as unknown;
      const rawResponse: unknown = Array.isArray(methodResult)
        ? (methodResult as readonly unknown[])[1]
        : undefined;
      soapRequest = soapRequest || client.lastRequest || '';
      soapResponse = soapResponse || this.bodyText(rawResponse);

      return {
        accepted: true,
        soapRequest,
        soapResponse,
        httpStatus: responseStatus ?? this.httpStatus(client.lastResponse),
      };
    } catch (error) {
      throw this.toSubmissionException(error, soapRequest, soapResponse);
    }
  }

  buildSignedEnviarLoteEnvelope(input: BuildSignedEnvelopeInput): string {
    const unsigned = [
      `<soap:Envelope xmlns:soap="${SOAP_ENVELOPE_NS}" xmlns:esoc="${SERVICE_NS}" xmlns:wsu="${WSU_NS}">`,
      '<soap:Header/>',
      `<soap:Body wsu:Id="Body-${input.idSeed}">`,
      '<esoc:EnviarLoteEventos>',
      '<esoc:loteEventos>',
      input.batchXml,
      '</esoc:loteEventos>',
      '</esoc:EnviarLoteEventos>',
      '</soap:Body>',
      '</soap:Envelope>',
    ].join('');
    return signWsSecurityEnvelope(unsigned, 'soap', input.certificate, {
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
      idSeed: input.idSeed,
    });
  }

  verifyWsSecurityEnvelope(envelope: string, certificatePem: string): boolean {
    const signatureXml = envelope.match(
      /<(?:\w+:)?Signature\b[\s\S]*<\/(?:\w+:)?Signature>/,
    )?.[0];
    if (!signatureXml) return false;

    const verifier = new SignedXml({ idMode: 'wssecurity' });
    verifier.publicCert = certificatePem;
    verifier.loadSignature(signatureXml);
    return verifier.checkSignature(envelope);
  }

  sha256(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  private assertNoGovBrCallInTest(endpointUrl: string): void {
    if (!process.env.JEST_WORKER_ID && process.env.NODE_ENV !== 'test') return;
    const host = new URL(endpointUrl).hostname;
    if (host.endsWith('gov.br')) {
      throw new ServiceUnavailableException(
        'Tests must use a committed local eSocial WSDL stub, not gov.br endpoints',
      );
    }
  }

  private toSubmissionException(
    error: unknown,
    soapRequest: string,
    soapResponse: string,
  ): SoapSubmissionException {
    const errorLike =
      error && typeof error === 'object'
        ? (error as {
            message?: string;
            code?: string;
            response?: { status?: number; data?: unknown };
            body?: unknown;
          })
        : { message: this.unknownText(error) };
    const responseBody = this.bodyText(
      errorLike.response?.data ?? errorLike.body,
    );
    return new SoapSubmissionException(
      errorLike.message ?? responseBody ?? 'SOAP submission failed',
      soapRequest,
      responseBody || soapResponse,
      errorLike.response?.status ?? null,
      errorLike.code,
    );
  }

  private bodyText(body: unknown): string {
    if (typeof body === 'string') return body;
    if (!body || typeof body !== 'object') return '';
    try {
      return JSON.stringify(body);
    } catch {
      return '';
    }
  }

  private unknownText(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.message;
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return this.bodyText(value);
    if (typeof value === 'number' || typeof value === 'boolean') {
      return value.toString();
    }
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'symbol') return value.description ?? '';
    return '';
  }

  private httpStatus(response: unknown): number | null {
    if (!response || typeof response !== 'object') return null;
    const status = (response as { status?: unknown; statusCode?: unknown })
      .status;
    const statusCode = (response as { status?: unknown; statusCode?: unknown })
      .statusCode;
    if (typeof status === 'number') return status;
    if (typeof statusCode === 'number') return statusCode;
    return null;
  }
}

class ESocialWsSecurity implements ISecurity {
  constructor(
    private readonly certificate: CertificateMaterial,
    private readonly tls: { pfx: Buffer; passphrase: string },
  ) {}

  toXML(): string {
    return '';
  }

  addOptions(options: Record<string, unknown>): void {
    options.httpsAgent = new https.Agent({
      pfx: this.tls.pfx,
      passphrase: this.tls.passphrase,
    });
  }

  postProcess(xml: string, envelopeKey: string): string {
    const now = new Date();
    return signWsSecurityEnvelope(xml, envelopeKey, this.certificate, {
      createdAt: now,
      expiresAt: new Date(now.getTime() + 10 * 60_000),
      idSeed: createHash('sha256').update(xml).digest('hex').slice(0, 16),
    });
  }
}

function signWsSecurityEnvelope(
  xml: string,
  envelopeKey: string,
  certificate: CertificateMaterial,
  options: { createdAt: Date; expiresAt: Date; idSeed: string },
): string {
  const bodyId = `Body-${options.idSeed}`;
  const timestampId = `Timestamp-${options.idSeed}`;
  const tokenId = `X509-${options.idSeed}`;
  const signedXml = ensureBodyId(
    ensureHeader(ensureWsuNamespace(xml, envelopeKey), envelopeKey),
    envelopeKey,
    bodyId,
  );
  const securityXml = [
    `<wsse:Security xmlns:wsse="${WSSE_NS}" xmlns:wsu="${WSU_NS}" ${envelopeKey}:mustUnderstand="1">`,
    `<wsu:Timestamp wsu:Id="${timestampId}">`,
    `<wsu:Created>${dateStringForSoap(options.createdAt)}</wsu:Created>`,
    `<wsu:Expires>${dateStringForSoap(options.expiresAt)}</wsu:Expires>`,
    '</wsu:Timestamp>',
    `<wsse:BinarySecurityToken EncodingType="${BASE64_ENCODING_TYPE}" ValueType="${X509_VALUE_TYPE}" wsu:Id="${tokenId}">`,
    certificate.certificatePem
      .replace('-----BEGIN CERTIFICATE-----', '')
      .replace('-----END CERTIFICATE-----', '')
      .replace(/(\r\n|\n|\r)/g, ''),
    '</wsse:BinarySecurityToken>',
    '</wsse:Security>',
  ].join('');
  const withSecurity = signedXml.replace(
    `</${envelopeKey}:Header>`,
    `${securityXml}</${envelopeKey}:Header>`,
  );
  const signer = new SignedXml({ idMode: 'wssecurity' });
  signer.privateKey = certificate.privateKeyPem;
  signer.publicCert = certificate.certificatePem;
  signer.canonicalizationAlgorithm = EXC_C14N;
  signer.signatureAlgorithm = RSA_SHA256;
  signer.addReference({
    xpath: `//*[@*[local-name(.)='Id']='${bodyId}']`,
    transforms: [EXC_C14N],
    digestAlgorithm: SHA256,
  });
  signer.addReference({
    xpath: `//*[@*[local-name(.)='Id']='${timestampId}']`,
    transforms: [EXC_C14N],
    digestAlgorithm: SHA256,
  });
  signer.getKeyInfoContent = () =>
    [
      '<wsse:SecurityTokenReference>',
      `<wsse:Reference URI="#${tokenId}" ValueType="${X509_VALUE_TYPE}"/>`,
      '</wsse:SecurityTokenReference>',
    ].join('');
  signer.computeSignature(withSecurity, {
    location: {
      reference: "//*[local-name(.)='Security']",
      action: 'append',
    },
    prefix: 'ds',
    existingPrefixes: { wsse: WSSE_NS, wsu: WSU_NS },
  });
  return signer.getSignedXml();
}

function ensureHeader(xml: string, envelopeKey: string): string {
  if (xml.includes(`<${envelopeKey}:Header`)) {
    return xml.replace(
      new RegExp(`<${envelopeKey}:Header\\s*/>`),
      `<${envelopeKey}:Header></${envelopeKey}:Header>`,
    );
  }
  return xml.replace(
    `<${envelopeKey}:Body`,
    `<${envelopeKey}:Header></${envelopeKey}:Header><${envelopeKey}:Body`,
  );
}

function ensureWsuNamespace(xml: string, envelopeKey: string): string {
  if (xml.includes('xmlns:wsu=')) return xml;
  return xml.replace(
    `<${envelopeKey}:Envelope `,
    `<${envelopeKey}:Envelope xmlns:wsu="${WSU_NS}" `,
  );
}

function ensureBodyId(
  xml: string,
  envelopeKey: string,
  bodyId: string,
): string {
  if (new RegExp(`<${envelopeKey}:Body[^>]+wsu:Id=`).test(xml)) return xml;
  return xml.replace(
    `<${envelopeKey}:Body`,
    `<${envelopeKey}:Body wsu:Id="${bodyId}"`,
  );
}

function dateStringForSoap(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
