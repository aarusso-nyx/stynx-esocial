import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  signXmlBytes,
} from '@esocial/pki-pades';
import type {
  CertificateHandle,
  SignedXmlBytes,
} from '@esocial/pki-pades';

import {
  TABLE_EVENT_METADATA,
  isPromotedTableEventClass,
} from './builders/tables/index.js';
import type {
  PromotedTableEventClass,
} from './builders/tables/index.js';
import {
  XmlSecurityError,
  assertHardenedXml,
  sha256Prefixed,
} from './security.js';

export type XsdValidationSeverity = 'ERROR' | 'WARNING';

export type XsdValidationFailureRecord = Readonly<{
  tenantId: string;
  eventRecordId?: string | undefined;
  batchId?: string | undefined;
  environment: string;
  eventClass: PromotedTableEventClass;
  payloadHash: string;
  nodePath: string;
  xsdCode: string;
  message: string;
  severity: XsdValidationSeverity;
  createdAt: string;
}>;

export type XsdValidationIssue = Readonly<{
  code: string;
  message: string;
  nodePath: string;
  line?: number | undefined;
  column?: number | undefined;
}>;

export type PromotedTableXsdValidationInput = Readonly<{
  eventClass: string;
  xml: string;
  tenantId?: string | undefined;
  eventRecordId?: string | undefined;
  batchId?: string | undefined;
  environment?: string | undefined;
  allowUnsigned?: boolean | undefined;
  now?: Date | undefined;
}>;

export type PromotedTableXsdValidationResult = Readonly<{
  valid: boolean;
  eventClass: PromotedTableEventClass;
  xsdPath: string;
  payloadHash: string;
  issues: readonly XsdValidationIssue[];
  status: 'building' | 'validation_failed';
  statusUpdate?: Readonly<{
    status: 'validation_failed';
    failure_category: 'xml_security' | 'xsd_validation';
    payload_hash: string;
    node_path: string;
    message: string;
  }>;
}>;

export type XsdValidationFailureSink = Readonly<{
  record(failure: XsdValidationFailureRecord): Promise<void> | void;
}>;

export class XsdValidationError extends Error {
  constructor(readonly result: PromotedTableXsdValidationResult) {
    super(
      `eSocial ${result.eventClass} XML failed XSD validation: ${result.issues
        .map((issue) => issue.message)
        .join('; ')}`,
    );
    this.name = 'XsdValidationError';
  }
}

export class InMemoryXsdValidationFailureSink implements XsdValidationFailureSink {
  readonly failures: XsdValidationFailureRecord[] = [];

  record(failure: XsdValidationFailureRecord): void {
    this.failures.push(failure);
  }
}

export async function validateAndCapturePromotedTableXml(
  input: PromotedTableXsdValidationInput,
  sink: XsdValidationFailureSink,
): Promise<PromotedTableXsdValidationResult> {
  const result = validatePromotedTableXml(input);
  if (!result.valid) {
    await Promise.all(
      result.issues.map((issue) =>
        sink.record(toFailureRecord(input, result, issue)),
      ),
    );
  }
  return result;
}

export function assertPromotedTableXmlValid(
  input: PromotedTableXsdValidationInput,
): PromotedTableXsdValidationResult {
  const result = validatePromotedTableXml(input);
  if (!result.valid) throw new XsdValidationError(result);
  return result;
}

export function signValidatedPromotedTableXml(input: Readonly<{
  eventClass: PromotedTableEventClass;
  xml: string;
  certificate: CertificateHandle;
  tenantId?: string | undefined;
  eventRecordId?: string | undefined;
  batchId?: string | undefined;
  environment?: string | undefined;
  now?: Date | undefined;
}>): Readonly<{
  validation: PromotedTableXsdValidationResult;
  signed: SignedXmlBytes;
}> {
  const validation = assertPromotedTableXmlValid({
    eventClass: input.eventClass,
    xml: input.xml,
    tenantId: input.tenantId,
    eventRecordId: input.eventRecordId,
    batchId: input.batchId,
    environment: input.environment,
    allowUnsigned: true,
    now: input.now,
  });
  return {
    validation,
    signed: signXmlBytes({
      xmlBytes: input.xml,
      certificate: input.certificate,
      now: input.now,
    }),
  };
}

export function validatePromotedTableXml(
  input: PromotedTableXsdValidationInput,
): PromotedTableXsdValidationResult {
  if (!isPromotedTableEventClass(input.eventClass)) {
    const payloadHash = sha256Prefixed(input.xml);
    throw new XsdValidationError({
      valid: false,
      eventClass: 'S-1000',
      xsdPath: '',
      payloadHash,
      status: 'validation_failed',
      issues: [
        {
          code: 'XSD_UNSUPPORTED_EVENT_CLASS',
          message: `Unsupported promoted table event class: ${input.eventClass}`,
          nodePath: '/',
        },
      ],
      statusUpdate: {
        status: 'validation_failed',
        failure_category: 'xsd_validation',
        payload_hash: payloadHash,
        node_path: '/',
        message: `Unsupported promoted table event class: ${input.eventClass}`,
      },
    });
  }

  const eventClass = input.eventClass;
  const metadata = TABLE_EVENT_METADATA[eventClass];
  const payloadHash = sha256Prefixed(input.xml);
  const xsdPath = activeXsdPathFor(metadata.xsdPath);

  try {
    assertHardenedXml(input.xml);
  } catch (error) {
    if (!(error instanceof XmlSecurityError)) throw error;
    return invalidResult({
      eventClass,
      xsdPath,
      payloadHash,
      category: 'xml_security',
      issues: [
        {
          code: error.code,
          message: error.message,
          nodePath: '/',
        },
      ],
    });
  }

  const metadataIssue = metadataMismatchIssue(input.xml, eventClass);
  if (metadataIssue) {
    return invalidResult({
      eventClass,
      xsdPath,
      payloadHash,
      category: 'xsd_validation',
      issues: [metadataIssue],
    });
  }

  if (!existsSync(xsdPath)) {
    return invalidResult({
      eventClass,
      xsdPath,
      payloadHash,
      category: 'xsd_validation',
      issues: [
        {
          code: 'XSD_BINDING_NOT_FOUND',
          message: `XSD binding does not exist: ${xsdPath}`,
          nodePath: '/',
        },
      ],
    });
  }

  const candidate = input.allowUnsigned === false
    ? input.xml
    : withValidationSignatureStub(input.xml);
  const xmllint = spawnSync(
    'xmllint',
    ['--noout', '--nonet', '--schema', resolve(xsdPath), '-'],
    {
      encoding: 'utf8',
      input: candidate,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  if (xmllint.error) {
    return invalidResult({
      eventClass,
      xsdPath,
      payloadHash,
      category: 'xsd_validation',
      issues: [
        {
          code: 'XSD_VALIDATOR_UNAVAILABLE',
          message: xmllint.error.message,
          nodePath: '/',
        },
      ],
    });
  }

  if (xmllint.status === 0) {
    return {
      valid: true,
      eventClass,
      xsdPath,
      payloadHash,
      issues: [],
      status: 'building',
    };
  }

  return invalidResult({
    eventClass,
    xsdPath,
    payloadHash,
    category: 'xsd_validation',
    issues: parseXmllintIssues(xmllint.stderr, metadata.eventElement),
  });
}

function invalidResult(input: Readonly<{
  eventClass: PromotedTableEventClass;
  xsdPath: string;
  payloadHash: string;
  category: 'xml_security' | 'xsd_validation';
  issues: readonly XsdValidationIssue[];
}>): PromotedTableXsdValidationResult {
  const first = input.issues[0] ?? {
    code: 'XSD_VALIDATION_FAILED',
    message: 'XSD validation failed.',
    nodePath: '/',
  };
  return {
    valid: false,
    eventClass: input.eventClass,
    xsdPath: input.xsdPath,
    payloadHash: input.payloadHash,
    issues: input.issues,
    status: 'validation_failed',
    statusUpdate: {
      status: 'validation_failed',
      failure_category: input.category,
      payload_hash: input.payloadHash,
      node_path: first.nodePath,
      message: first.message,
    },
  };
}

function toFailureRecord(
  input: PromotedTableXsdValidationInput,
  result: PromotedTableXsdValidationResult,
  issue: XsdValidationIssue,
): XsdValidationFailureRecord {
  return {
    tenantId: input.tenantId ?? '00000000-0000-0000-0000-000000000000',
    eventRecordId: input.eventRecordId,
    batchId: input.batchId,
    environment: input.environment ?? 'QUALIFICATION',
    eventClass: result.eventClass,
    payloadHash: result.payloadHash,
    nodePath: issue.nodePath,
    xsdCode: issue.code,
    message: issue.message,
    severity: 'ERROR',
    createdAt: (input.now ?? new Date()).toISOString(),
  };
}

function metadataMismatchIssue(
  xml: string,
  eventClass: PromotedTableEventClass,
): XsdValidationIssue | undefined {
  const metadata = TABLE_EVENT_METADATA[eventClass];
  if (!new RegExp(`<eSocial\\s+xmlns="${escapeRegExp(metadata.namespace)}"`, 'u').test(xml)) {
    return {
      code: 'XSD_NAMESPACE_MISMATCH',
      message: `Expected ${metadata.namespace} for ${eventClass}.`,
      nodePath: '/eSocial',
    };
  }
  if (!new RegExp(`<${metadata.eventElement}\\b`, 'u').test(xml)) {
    return {
      code: 'XSD_EVENT_ELEMENT_MISMATCH',
      message: `Expected event element ${metadata.eventElement} for ${eventClass}.`,
      nodePath: '/eSocial',
    };
  }
  return undefined;
}

function withValidationSignatureStub(xml: string): string {
  if (/<(?:\w+:)?Signature\b/u.test(xml)) return xml;
  return xml.replace(/<\/eSocial>\s*$/u, `${SIGNATURE_STUB}</eSocial>`);
}

function parseXmllintIssues(
  stderr: string,
  fallbackElement: string,
): XsdValidationIssue[] {
  const lines = stderr
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) =>
      line.length > 0 &&
      !line.endsWith('fails to validate') &&
      !line.endsWith('validates'),
    );

  if (lines.length === 0) {
    return [
      {
        code: 'XSD_VALIDATION_FAILED',
        message: 'XSD validation failed.',
        nodePath: `//${fallbackElement}`,
      },
    ];
  }

  return lines.map((line) => ({
    code: 'XSD_VALIDATION_FAILED',
    message: line,
    nodePath: nodePathFromXmllint(line, fallbackElement),
    ...lineColumnFromXmllint(line),
  }));
}

function nodePathFromXmllint(line: string, fallbackElement: string): string {
  const expandedElement = line.match(/Element '\{[^}]+[}]([^']+)'/u)?.[1];
  if (expandedElement) return `//${expandedElement}`;
  const simpleElement = line.match(/Element '([^']+)'/u)?.[1];
  if (simpleElement) return `//${simpleElement}`;
  return `//${fallbackElement}`;
}

function lineColumnFromXmllint(
  line: string,
): { line?: number | undefined; column?: number } {
  const match = line.match(/:(\d+):(?: element| parser| Schemas)/u);
  if (!match) return {};
  return { line: Number(match[1]) };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SIGNATURE_STUB = [
  '<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">',
  '<ds:SignedInfo>',
  '<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>',
  '<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>',
  '<ds:Reference URI="#ID0000000000000000000000000000000000">',
  '<ds:Transforms>',
  '<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>',
  '<ds:Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>',
  '</ds:Transforms>',
  '<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>',
  '<ds:DigestValue>AA==</ds:DigestValue>',
  '</ds:Reference>',
  '</ds:SignedInfo>',
  '<ds:SignatureValue>AA==</ds:SignatureValue>',
  '<ds:KeyInfo>',
  '<ds:X509Data>',
  '<ds:X509Certificate>AA==</ds:X509Certificate>',
  '</ds:X509Data>',
  '</ds:KeyInfo>',
  '</ds:Signature>',
].join('');

const ACTIVE_XSD_BINDINGS: Readonly<Record<string, string>> = {
  'packages/domain/src/sgp-lifted/esocial-worker/xsd/evtInfoEmpregador.xsd':
    'packages/domain/src/xml/xsd/tables/evtInfoEmpregador.xsd',
  'packages/domain/src/sgp-lifted/esocial-worker/xsd/evtTabEstab.xsd':
    'packages/domain/src/xml/xsd/tables/evtTabEstab.xsd',
  'packages/domain/src/sgp-lifted/esocial-worker/xsd/evtTabRubrica.xsd':
    'packages/domain/src/xml/xsd/tables/evtTabRubrica.xsd',
  'packages/domain/src/sgp-lifted/esocial-worker/xsd/evtTabLotacao.xsd':
    'packages/domain/src/xml/xsd/tables/evtTabLotacao.xsd',
  'packages/domain/src/sgp-lifted/esocial-worker/xsd/evtTabJornada.xsd':
    'packages/domain/src/xml/xsd/tables/evtTabJornada.xsd',
  'packages/domain/src/sgp-lifted/esocial-worker/xsd/evtTabProcesso.xsd':
    'packages/domain/src/xml/xsd/tables/evtTabProcesso.xsd',
  'packages/domain/src/sgp-lifted/esocial-worker/xsd/evtRemun.xsd':
    'packages/domain/src/xml/xsd/periodic/evtRemun.xsd',
  'packages/domain/src/sgp-lifted/esocial-worker/xsd/evtFechaEvPer.xsd':
    'packages/domain/src/xml/xsd/periodic/evtFechaEvPer.xsd',
  'packages/domain/src/sgp-lifted/esocial-worker/xsd/evtAdmissao.xsd':
    'packages/domain/src/xml/xsd/trabalhador/evtAdmissao.xsd',
};

function activeXsdPathFor(metadataPath: string): string {
  return ACTIVE_XSD_BINDINGS[metadataPath] ?? metadataPath;
}
