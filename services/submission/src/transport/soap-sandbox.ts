import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  assertHardenedXml,
  sha256Hex,
} from '@esocial/domain';

export type EsocialSoapEnvironment =
  | 'qualification'
  | 'restricted-production'
  | 'production';

export type EsocialSoapEndpointSet = Readonly<{
  submit: string;
  returnQuery: string;
}>;

export type EsocialSoapEndpointConfig = Readonly<
  Partial<Record<EsocialSoapEnvironment, EsocialSoapEndpointSet>>
>;

export type ResolveSoapEndpointOptions = Readonly<{
  config?: EsocialSoapEndpointConfig;
  nodeEnv?: string;
}>;

export type SoapEndpointGuardOptions = Readonly<{
  nodeEnv?: string;
  allowlistHosts?: readonly string[];
}>;

export type SoapSandboxSubmitInput = Readonly<{
  endpointUrl: string;
  signedBatchXml: string;
  now?: Date;
  protocolSeed?: string;
}>;

export type SoapSandboxReturnInput = Readonly<{
  endpointUrl: string;
  protocol: string;
  now?: Date;
}>;

export type SoapSandboxExchange = Readonly<{
  operation: 'submit' | 'return';
  endpointUrl: string;
  soapRequest: string;
  soapResponse: string;
  requestXmlSha256?: string;
  signedPayloadSha256?: string;
  soapRequestSha256: string;
  soapResponseSha256: string;
  protocol: string;
  accepted: boolean;
}>;

export class SoapTransportGuardError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'SoapTransportGuardError';
  }
}

export class SandboxSoapTransport {
  async submit(input: SoapSandboxSubmitInput): Promise<SoapSandboxExchange> {
    assertSoapEndpointAllowed(input.endpointUrl);
    assertHardenedXml(input.signedBatchXml);

    const protocol = `LOCAL-${sha256Hex(
      input.protocolSeed ?? input.signedBatchXml,
    ).slice(0, 24).toUpperCase()}`;
    const soapRequest = buildSubmitSoapRequest(input.signedBatchXml);
    const soapResponse = buildSubmitSoapResponse(protocol, input.now ?? new Date());

    return {
      operation: 'submit',
      endpointUrl: input.endpointUrl,
      soapRequest,
      soapResponse,
      requestXmlSha256: sha256Hex(stripSignature(input.signedBatchXml)),
      signedPayloadSha256: sha256Hex(input.signedBatchXml),
      soapRequestSha256: sha256Hex(soapRequest),
      soapResponseSha256: sha256Hex(soapResponse),
      protocol,
      accepted: true,
    };
  }

  async queryReturn(input: SoapSandboxReturnInput): Promise<SoapSandboxExchange> {
    assertSoapEndpointAllowed(input.endpointUrl);

    const soapRequest = buildReturnSoapRequest(input.protocol);
    const soapResponse = buildReturnSoapResponse(input.protocol, input.now ?? new Date());

    return {
      operation: 'return',
      endpointUrl: input.endpointUrl,
      soapRequest,
      soapResponse,
      soapRequestSha256: sha256Hex(soapRequest),
      soapResponseSha256: sha256Hex(soapResponse),
      protocol: input.protocol,
      accepted: true,
    };
  }
}

export function resolveEsocialSoapEndpoints(
  environment: EsocialSoapEnvironment,
  options: ResolveSoapEndpointOptions = {},
): EsocialSoapEndpointSet {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? 'development';
  if (environment === 'production' && nodeEnv !== 'production') {
    throw new SoapTransportGuardError(
      'Production eSocial SOAP endpoints cannot be resolved outside production.',
      'SOAP_PRODUCTION_ENDPOINT_FORBIDDEN_IN_TEST',
    );
  }

  const configured = options.config?.[environment] ?? endpointFromEnv(environment);
  if (configured) return configured;
  if (environment === 'production') {
    throw new SoapTransportGuardError(
      'Production eSocial SOAP endpoints must be supplied by environment/config.',
      'SOAP_PRODUCTION_ENDPOINT_REQUIRED',
    );
  }

  const localPort = environment === 'qualification' ? '9001' : '9002';
  return {
    submit: `http://127.0.0.1:${localPort}/esocial/${environment}/enviar-lote-eventos`,
    returnQuery: `http://127.0.0.1:${localPort}/esocial/${environment}/consultar-retorno`,
  };
}

export function assertSoapEndpointAllowed(
  endpointUrl: string,
  options: SoapEndpointGuardOptions = {},
): void {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? 'development';
  if (nodeEnv === 'production') return;

  const host = new URL(endpointUrl).hostname.toLowerCase();
  const allowlist = new Set([
    'localhost',
    '127.0.0.1',
    '::1',
    ...(options.allowlistHosts ?? []).map((value) => value.toLowerCase()),
  ]);

  if (host.endsWith('gov.br')) {
    throw new SoapTransportGuardError(
      'Test/dev SOAP transports cannot reach gov.br endpoints.',
      'SOAP_GOV_BR_FORBIDDEN_IN_TEST',
    );
  }
  if (allowlist.has(host) || host.endsWith('.test') || host.endsWith('.local')) {
    return;
  }

  throw new SoapTransportGuardError(
    `Test/dev SOAP endpoint host is not allowlisted: ${host}.`,
    'SOAP_ENDPOINT_NOT_ALLOWLISTED',
  );
}

export function loadCommittedEnviarLoteWsdl(root = process.cwd()): string {
  return readFileSync(
    join(root, 'docs/templates/wsdl/ws-enviar-lote-eventos.wsdl'),
    'utf8',
  );
}

function endpointFromEnv(
  environment: EsocialSoapEnvironment,
): EsocialSoapEndpointSet | undefined {
  const prefix = `ESOCIAL_${environment.replace('-', '_').toUpperCase()}`;
  const submit = process.env[`${prefix}_SOAP_SUBMIT_URL`];
  const returnQuery = process.env[`${prefix}_SOAP_RETURN_URL`];
  if (!submit || !returnQuery) return undefined;
  return { submit, returnQuery };
}

function buildSubmitSoapRequest(signedBatchXml: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:esoc="http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/v1_1_0">',
    '<soap:Header/>',
    '<soap:Body>',
    '<esoc:EnviarLoteEventos>',
    '<esoc:loteEventos>',
    signedBatchXml,
    '</esoc:loteEventos>',
    '</esoc:EnviarLoteEventos>',
    '</soap:Body>',
    '</soap:Envelope>',
  ].join('');
}

function buildSubmitSoapResponse(protocol: string, now: Date): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">',
    '<soap:Body>',
    '<EnviarLoteEventosResponse xmlns="http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/v1_1_0">',
    '<EnviarLoteEventosResult>',
    `<retornoEnvioLoteEventos><status>201</status><protocoloEnvio>${protocol}</protocoloEnvio><receivedAt>${now.toISOString()}</receivedAt></retornoEnvioLoteEventos>`,
    '</EnviarLoteEventosResult>',
    '</EnviarLoteEventosResponse>',
    '</soap:Body>',
    '</soap:Envelope>',
  ].join('');
}

function buildReturnSoapRequest(protocol: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">',
    '<soap:Header/>',
    '<soap:Body>',
    `<ConsultarRetornoEventos><protocoloEnvio>${xmlEscape(protocol)}</protocoloEnvio></ConsultarRetornoEventos>`,
    '</soap:Body>',
    '</soap:Envelope>',
  ].join('');
}

function buildReturnSoapResponse(protocol: string, now: Date): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">',
    '<soap:Body>',
    `<ConsultarRetornoEventosResponse><retornoProcessamento><protocoloEnvio>${xmlEscape(protocol)}</protocoloEnvio><status>202</status><processedAt>${now.toISOString()}</processedAt></retornoProcessamento></ConsultarRetornoEventosResponse>`,
    '</soap:Body>',
    '</soap:Envelope>',
  ].join('');
}

function stripSignature(xml: string): string {
  return xml.replace(/<ds:Signature\b[\s\S]*?<\/ds:Signature>/u, '');
}

function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
