import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  loadConfig,
  loadSoapEndpointConfig,
  readNodeEnvironment,
} from '../config/index.js';
import {
  assertHardenedXml,
  sha256Hex,
} from '../xml/security.js';

export type SoapEnvironment =
  | 'qualification'
  | 'restricted_production'
  | 'production';

export type LegacySoapEnvironment = SoapEnvironment | 'restricted-production';

export type SoapSubmitOperation = 'enviar_lote_eventos';

export type SoapStatus =
  | 'accepted'
  | 'retryable_fault'
  | 'terminal_fault';

export type SoapEndpointSet = Readonly<{
  submit: string;
  returnQuery: string;
}>;

export type SoapEndpointConfig = Readonly<
  Partial<Record<SoapEnvironment, SoapEndpointSet>>
>;

export type SoapContext = Readonly<{
  tenantId: string;
  environment: SoapEnvironment;
  eventClass?: string | undefined;
  requestId?: string | undefined;
  correlationId?: string | undefined;
  requestXml?: string | undefined;
  now?: Date | undefined;
}>;

export type SoapResult = Readonly<{
  httpStatus: number;
  soapStatus: SoapStatus;
  endpointUrl: string;
  protocol?: string | undefined;
  requestHash: string;
  signedPayloadHash: string;
  soapRequestHash: string;
  responseHash: string;
  rawResponse: string;
  rawRequest?: string | undefined;
  latencyMs: number;
}>;

export type SoapTransport = Readonly<{
  submit(
    operation: SoapSubmitOperation,
    signedXml: string,
    ctx: SoapContext,
  ): Promise<SoapResult>;
  consultProtocol(protocol: string, ctx: SoapContext): Promise<SoapResult>;
}>;

export type SoapLogger = Readonly<{
  info(message: string, fields: Record<string, unknown>): void;
}>;

export type DeterministicSandboxTransportOptions = Readonly<{
  root?: string | undefined;
  endpoints?: SoapEndpointSet | undefined;
  logger?: SoapLogger | undefined;
}>;

export type SoapClientTransportOptions = Readonly<{
  environment: SoapEnvironment;
  endpoints: SoapEndpointSet;
  timeoutMs?: number | undefined;
  allowlistHosts?: readonly string[] | undefined;
  certificatePinning?: CertificatePinningVerifier | undefined;
  fetch?: FetchLike | undefined;
  logger?: SoapLogger | undefined;
}>;

export type TransportFactoryOptions = Readonly<{
  config?: SoapEndpointConfig | undefined;
  nodeEnv?: string | undefined;
  ci?: boolean | undefined;
  mode?: 'auto' | 'sandbox' | 'client' | undefined;
  allowlistHosts?: readonly string[] | undefined;
  timeoutMs?: number | undefined;
  certificatePinning?: CertificatePinningVerifier | undefined;
  logger?: SoapLogger | undefined;
}>;

export type ResolveSoapEndpointOptions = Readonly<{
  config?: SoapEndpointConfig | undefined;
  nodeEnv?: string | undefined;
}>;

export type SoapEndpointGuardOptions = Readonly<{
  nodeEnv?: string | undefined;
  allowlistHosts?: readonly string[] | undefined;
  requireHttps?: boolean | undefined;
}>;

export type TlsPolicy = Readonly<{
  rejectUnauthorized: true;
  minVersion: 'TLSv1.2';
  certificatePinning: 'configured' | 'not-configured';
}>;

export type CertificatePinningVerifier = (
  input: Readonly<{
    endpointUrl: string;
    environment: SoapEnvironment;
    minimumTlsVersion: 'TLSv1.2';
  }>,
) => void | Promise<void>;

type FetchLike = (
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal | undefined;
    rejectUnauthorized: true;
    tls: TlsPolicy;
  },
) => Promise<{
  status: number;
  text(): Promise<string>;
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

export class DeterministicSandboxTransport implements SoapTransport {
  private readonly endpoints: SoapEndpointSet;
  private readonly wsdl: string;
  private readonly logger?: SoapLogger | undefined;

  constructor(options: DeterministicSandboxTransportOptions = {}) {
    this.endpoints = options.endpoints ?? localQualificationEndpoints();
    this.wsdl = loadCommittedEnviarLoteWsdl(options.root);
    this.logger = options.logger;
    if (!this.wsdl.includes('ServicoEnviarLoteEventos')) {
      throw new SoapTransportGuardError(
        'Committed eSocial SOAP WSDL fixture is missing EnviarLoteEventos binding.',
        'SOAP_WSDL_FIXTURE_INVALID',
      );
    }
  }

  async submit(
    operation: SoapSubmitOperation,
    signedXml: string,
    ctx: SoapContext,
  ): Promise<SoapResult> {
    assertNonProductionEndpointSafe(this.endpoints.submit);
    assertHardenedXml(signedXml);

    const started = Date.now();
    const requestHash = sha256Hex(ctx.requestXml ?? stripSignature(signedXml));
    const signedPayloadHash = sha256Hex(signedXml);
    const soapRequest = buildSubmitSoapRequest(operation, signedXml);
    const protocol = `LOCAL-${sha256Hex(
      `${ctx.tenantId}:${ctx.environment}:${ctx.eventClass ?? ''}:${requestHash}`,
    ).slice(0, 24).toUpperCase()}`;
    const rawResponse = buildSubmitSoapResponse(protocol, ctx.now ?? new Date());
    const result = {
      httpStatus: 200,
      soapStatus: 'accepted',
      endpointUrl: this.endpoints.submit,
      protocol,
      requestHash,
      signedPayloadHash,
      soapRequestHash: sha256Hex(soapRequest),
      responseHash: sha256Hex(rawResponse),
      rawResponse,
      rawRequest: soapRequest,
      latencyMs: Date.now() - started,
    } satisfies SoapResult;
    this.log('submit', ctx, result);
    return result;
  }

  async consultProtocol(protocol: string, ctx: SoapContext): Promise<SoapResult> {
    assertNonProductionEndpointSafe(this.endpoints.returnQuery);

    const started = Date.now();
    const soapRequest = buildReturnSoapRequest(protocol);
    const rawResponse = buildReturnSoapResponse(protocol, ctx.now ?? new Date());
    const result = {
      httpStatus: 200,
      soapStatus: 'accepted',
      endpointUrl: this.endpoints.returnQuery,
      protocol,
      requestHash: sha256Hex(protocol),
      signedPayloadHash: sha256Hex(protocol),
      soapRequestHash: sha256Hex(soapRequest),
      responseHash: sha256Hex(rawResponse),
      rawResponse,
      rawRequest: soapRequest,
      latencyMs: Date.now() - started,
    } satisfies SoapResult;
    this.log('consultProtocol', ctx, result);
    return result;
  }

  private log(operation: string, ctx: SoapContext, result: SoapResult): void {
    this.logger?.info('esocial.soap.sandbox.exchange', {
      operation,
      tenant_id: ctx.tenantId,
      environment: ctx.environment,
      event_class: ctx.eventClass,
      request_hash: result.requestHash,
      signed_payload_hash: result.signedPayloadHash,
      soap_request_hash: result.soapRequestHash,
      response_hash: result.responseHash,
      protocol: result.protocol,
      latency_ms: result.latencyMs,
    });
  }
}

export class SoapClientTransport implements SoapTransport {
  private readonly environment: SoapEnvironment;
  private readonly endpoints: SoapEndpointSet;
  private readonly timeoutMs: number;
  private readonly allowlistHosts: readonly string[];
  private readonly fetch: FetchLike;
  private readonly logger?: SoapLogger | undefined;
  private readonly certificatePinning?: CertificatePinningVerifier | undefined;

  constructor(options: SoapClientTransportOptions) {
    this.environment = options.environment;
    this.endpoints = options.endpoints;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.allowlistHosts = options.allowlistHosts ?? [];
    this.fetch = options.fetch ?? defaultFetch();
    this.logger = options.logger;
    this.certificatePinning = options.certificatePinning;

    assertSoapEndpointAllowed(this.endpoints.submit, {
      requireHttps: true,
      allowlistHosts: this.allowlistHosts,
    });
    assertSoapEndpointAllowed(this.endpoints.returnQuery, {
      requireHttps: true,
      allowlistHosts: this.allowlistHosts,
    });
  }

  async submit(
    operation: SoapSubmitOperation,
    signedXml: string,
    ctx: SoapContext,
  ): Promise<SoapResult> {
    assertHardenedXml(signedXml);
    const requestHash = sha256Hex(ctx.requestXml ?? stripSignature(signedXml));
    return this.postSoap({
      endpointUrl: this.endpoints.submit,
      requestHash,
      signedPayloadHash: sha256Hex(signedXml),
      soapRequest: buildSubmitSoapRequest(operation, signedXml),
      ctx,
    });
  }

  async consultProtocol(protocol: string, ctx: SoapContext): Promise<SoapResult> {
    return this.postSoap({
      endpointUrl: this.endpoints.returnQuery,
      requestHash: sha256Hex(protocol),
      signedPayloadHash: sha256Hex(protocol),
      soapRequest: buildReturnSoapRequest(protocol),
      ctx,
      protocol,
    });
  }

  private async postSoap(input: Readonly<{
    endpointUrl: string;
    requestHash: string;
    signedPayloadHash: string;
    soapRequest: string;
    ctx: SoapContext;
    protocol?: string | undefined;
  }>): Promise<SoapResult> {
    assertSoapEndpointAllowed(input.endpointUrl, {
      requireHttps: true,
      allowlistHosts: this.allowlistHosts,
    });
    await this.certificatePinning?.({
      endpointUrl: input.endpointUrl,
      environment: this.environment,
      minimumTlsVersion: 'TLSv1.2',
    });

    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(input.endpointUrl, {
        method: 'POST',
        headers: {
          'content-type': 'text/xml; charset=utf-8',
          soapaction:
            'ServicoEnviarLoteEventos/EnviarLoteEventos',
        },
        body: input.soapRequest,
        signal: controller.signal,
        rejectUnauthorized: true,
        tls: buildTlsPolicy(this.certificatePinning),
      });
      const rawResponse = await response.text();
      const result = {
        httpStatus: response.status,
        soapStatus: classifySoapStatus(response.status, rawResponse),
        endpointUrl: input.endpointUrl,
        protocol: input.protocol ?? protocolFromResponse(rawResponse),
        requestHash: input.requestHash,
        signedPayloadHash: input.signedPayloadHash,
        soapRequestHash: sha256Hex(input.soapRequest),
        responseHash: sha256Hex(rawResponse),
        rawResponse,
        rawRequest: input.soapRequest,
        latencyMs: Date.now() - started,
      } satisfies SoapResult;
      this.log(input.ctx, result);
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  private log(ctx: SoapContext, result: SoapResult): void {
    this.logger?.info('esocial.soap.client.exchange', {
      tenant_id: ctx.tenantId,
      environment: ctx.environment,
      event_class: ctx.eventClass,
      http_status: result.httpStatus,
      soap_status: result.soapStatus,
      request_hash: result.requestHash,
      signed_payload_hash: result.signedPayloadHash,
      soap_request_hash: result.soapRequestHash,
      response_hash: result.responseHash,
      latency_ms: result.latencyMs,
    });
  }
}

export function transportFactory(
  environment: LegacySoapEnvironment,
  options: TransportFactoryOptions = {},
): SoapTransport {
  const normalized = normalizeSoapEnvironment(environment);
  const runtimeConfig = loadConfig();
  const nodeEnv = options.nodeEnv ?? runtimeConfig.nodeEnv;
  const ci = options.ci ?? runtimeConfig.ci;
  const mode = options.mode ?? 'auto';
  if (mode === 'sandbox' && normalized !== 'qualification') {
    throw new SoapTransportGuardError(
      'Deterministic SOAP sandbox is only allowed for qualification.',
      'SOAP_SANDBOX_ENVIRONMENT_FORBIDDEN',
    );
  }
  const useSandbox =
    normalized === 'qualification' &&
    (mode === 'sandbox' ||
    (mode === 'auto' &&
      normalized === 'qualification' &&
      (nodeEnv === 'test' || ci)));

  if (useSandbox) {
    return new DeterministicSandboxTransport({
      endpoints: resolveEsocialSoapEndpoints('qualification', {
        config: options.config,
        nodeEnv,
      }),
      logger: options.logger,
    });
  }

  const endpoints = resolveEsocialSoapEndpoints(normalized, {
    config: options.config,
    nodeEnv,
  });

  return new SoapClientTransport({
    environment: normalized,
    endpoints,
    allowlistHosts: options.allowlistHosts,
    timeoutMs: options.timeoutMs,
    certificatePinning: options.certificatePinning,
    logger: options.logger,
  });
}

export function resolveEsocialSoapEndpoints(
  environment: LegacySoapEnvironment,
  options: ResolveSoapEndpointOptions = {},
): SoapEndpointSet {
  const normalized = normalizeSoapEnvironment(environment);
  const nodeEnv = options.nodeEnv ?? readNodeEnvironment();
  if (normalized === 'production' && nodeEnv !== 'production') {
    throw new SoapTransportGuardError(
      'Production eSocial SOAP endpoints cannot be resolved outside production.',
      'SOAP_PRODUCTION_ENDPOINT_FORBIDDEN_IN_TEST',
    );
  }

  const configured = options.config?.[normalized] ?? endpointFromEnv(normalized);
  if (configured) {
    assertEndpointSetConfigured(normalized, configured);
    return configured;
  }

  if (normalized !== 'qualification') {
    throw new SoapTransportGuardError(
      `${normalized} eSocial SOAP endpoints must be supplied by environment/config.`,
      'SOAP_ENDPOINT_REQUIRED',
    );
  }

  return localQualificationEndpoints();
}

export function assertSoapEndpointAllowed(
  endpointUrl: string,
  options: SoapEndpointGuardOptions = {},
): void {
  const nodeEnv = options.nodeEnv ?? readNodeEnvironment();
  const parsed = new URL(endpointUrl);

  if (options.requireHttps && parsed.protocol !== 'https:') {
    throw new SoapTransportGuardError(
      'Non-qualification eSocial SOAP endpoints must use https.',
      'SOAP_ENDPOINT_HTTPS_REQUIRED',
    );
  }
  if (nodeEnv === 'production') return;

  const forbiddenHost = ['gov', 'br'].join('.');
  const host = parsed.hostname.toLowerCase();
  if (host === forbiddenHost || host.endsWith(`.${forbiddenHost}`)) {
    throw new SoapTransportGuardError(
      'Test/dev SOAP transports cannot reach official endpoint hosts.',
      'SOAP_GOV_BR_FORBIDDEN_IN_TEST',
    );
  }

  const allowlist = new Set(
    (options.allowlistHosts ?? []).map((value) => value.toLowerCase()),
  );
  if (allowlist.has(host)) return;

  throw new SoapTransportGuardError(
    `Test/dev SOAP endpoint host is not allowlisted: ${host}.`,
    'SOAP_ENDPOINT_NOT_ALLOWLISTED',
  );
}

export function assertNonProductionEndpointSafe(endpointUrl: string): void {
  const parsed = new URL(endpointUrl);
  const forbiddenHost = ['gov', 'br'].join('.');
  const host = parsed.hostname.toLowerCase();
  if (host === forbiddenHost || host.endsWith(`.${forbiddenHost}`)) {
    throw new SoapTransportGuardError(
      'Deterministic SOAP transport cannot be pointed at official endpoint hosts.',
      'SOAP_GOV_BR_FORBIDDEN_IN_TEST',
    );
  }
}

export function loadCommittedEnviarLoteWsdl(root = process.cwd()): string {
  return readFileSync(
    join(root, 'docs/templates/wsdl/ws-enviar-lote-eventos.wsdl'),
    'utf8',
  );
}

export function normalizeSoapEnvironment(
  environment: LegacySoapEnvironment,
): SoapEnvironment {
  return environment === 'restricted-production'
    ? 'restricted_production'
    : environment;
}

function endpointFromEnv(environment: SoapEnvironment): SoapEndpointSet | undefined {
  return loadSoapEndpointConfig()[environment];
}

function assertEndpointSetConfigured(
  environment: SoapEnvironment,
  endpoints: SoapEndpointSet,
): void {
  assertSoapEndpointAllowed(endpoints.submit, {
    nodeEnv: 'production',
    requireHttps: true,
  });
  assertSoapEndpointAllowed(endpoints.returnQuery, {
    nodeEnv: 'production',
    requireHttps: true,
  });
}

function buildTlsPolicy(
  certificatePinning: CertificatePinningVerifier | undefined,
): TlsPolicy {
  return {
    rejectUnauthorized: true,
    minVersion: 'TLSv1.2',
    certificatePinning: certificatePinning ? 'configured' : 'not-configured',
  };
}

function localQualificationEndpoints(): SoapEndpointSet {
  return {
    submit: 'http://127.0.0.1:9001/esocial/qualification/enviar-lote-eventos',
    returnQuery: 'http://127.0.0.1:9001/esocial/qualification/consultar-retorno',
  };
}

function defaultFetch(): FetchLike {
  const candidate = (globalThis as typeof globalThis & {
    fetch?: FetchLike | undefined;
  }).fetch;
  if (!candidate) {
    throw new SoapTransportGuardError(
      'Global fetch is required for SoapClientTransport.',
      'SOAP_FETCH_UNAVAILABLE',
    );
  }
  return candidate;
}

function buildSubmitSoapRequest(
  _operation: SoapSubmitOperation,
  signedXml: string,
): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:esoc="http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/v1_1_0">',
    '<soap:Header/>',
    '<soap:Body>',
    '<esoc:EnviarLoteEventos>',
    '<esoc:loteEventos>',
    signedXml,
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
    `<retornoEnvioLoteEventos><status>201</status><protocoloEnvio>${xmlEscape(protocol)}</protocoloEnvio><receivedAt>${now.toISOString()}</receivedAt></retornoEnvioLoteEventos>`,
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
  return xml.replace(/<(?:(?:\w+):)?Signature\b[\s\S]*?<\/(?:(?:\w+):)?Signature>/u, '');
}

function classifySoapStatus(httpStatus: number, response: string): SoapStatus {
  if (/<(?:\w+:)?Fault\b/u.test(response)) {
    return httpStatus >= 500 ? 'retryable_fault' : 'terminal_fault';
  }
  return httpStatus >= 500 ? 'retryable_fault' : 'accepted';
}

function protocolFromResponse(response: string): string | undefined {
  return response.match(/<protocoloEnvio>([^<]+)<\/protocoloEnvio>/u)?.[1];
}

function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
