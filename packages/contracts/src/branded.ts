import {
  ESOCIAL_RELAY_EVENT_CLASSES,
} from './kinds.js';
import type { EsocialRelayEventClass } from './kinds.js';

export type Brand<K, T extends string> = K & { readonly __brand: T };

export type TenantId = Brand<string, 'TenantId'>;
export type EventClass = Brand<EsocialRelayEventClass, 'EventClass'>;
export type IdempotencyKey = Brand<string, 'IdempotencyKey'>;
export type CorrelationId = Brand<string, 'CorrelationId'>;
export type ProtocolNumber = Brand<string, 'ProtocolNumber'>;
export type Receipt = Brand<string, 'Receipt'>;
export type Cnpj = Brand<string, 'Cnpj'>;
export type Cpf = Brand<string, 'Cpf'>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PROTOCOL_PATTERN = /^\d+\.\d+\.\d{6}\.\d{18}$/u;
const RECEIPT_PATTERN = /^\d+\.\d+\.\d{18}$/u;

export function makeTenantId(value: string): TenantId {
  const normalized = value.trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error('tenantId must be a UUID.');
  }
  return normalized as TenantId;
}

export function makeEventClass(value: string): EventClass {
  if (!isEventClass(value)) {
    throw new Error(`Unsupported eSocial event class: ${value}`);
  }
  return value as EventClass;
}

export function makeIdempotencyKey(value: string): IdempotencyKey {
  const normalized = value.trim();
  if (!/^esocial:v\d+:[A-Za-z0-9._~:%-]+/u.test(normalized)) {
    throw new Error('idempotency key must be a versioned eSocial key.');
  }
  return normalized as IdempotencyKey;
}

export function makeCorrelationId(value: string): CorrelationId {
  const normalized = value.trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error('correlationId must be a UUID.');
  }
  return normalized as CorrelationId;
}

export function makeProtocolNumber(value: string): ProtocolNumber {
  const normalized = value.trim();
  if (!PROTOCOL_PATTERN.test(normalized)) {
    throw new Error('protocolNumber must match the eSocial protocol format.');
  }
  return normalized as ProtocolNumber;
}

export function makeReceipt(value: string): Receipt {
  const normalized = value.trim();
  if (!RECEIPT_PATTERN.test(normalized)) {
    throw new Error('receipt must match the eSocial receipt format.');
  }
  return normalized as Receipt;
}

export function makeCnpj(value: string): Cnpj {
  const digits = onlyDigits(value);
  if (!hasValidCnpjDigits(digits)) {
    throw new Error('CNPJ must contain valid check digits.');
  }
  return digits as Cnpj;
}

export function makeCpf(value: string): Cpf {
  const digits = onlyDigits(value);
  if (!hasValidCpfDigits(digits)) {
    throw new Error('CPF must contain valid check digits.');
  }
  return digits as Cpf;
}

export type BrandedEnvelopeIds = Readonly<{
  tenantId: TenantId;
  eventClass: EventClass;
  idempotencyKey: IdempotencyKey;
  correlationId: CorrelationId;
}>;

export function parseBrandedEnvelopeIds(input: Readonly<{
  tenant_id: string;
  event_class: string;
  'idempotency-key': string;
  'correlation-id': string;
}>): BrandedEnvelopeIds {
  return {
    tenantId: makeTenantId(input.tenant_id),
    eventClass: makeEventClass(input.event_class),
    idempotencyKey: makeIdempotencyKey(input['idempotency-key']),
    correlationId: makeCorrelationId(input['correlation-id']),
  };
}

function isEventClass(value: string): value is EsocialRelayEventClass {
  return ESOCIAL_RELAY_EVENT_CLASSES.includes(value as EsocialRelayEventClass);
}

function onlyDigits(value: string): string {
  return value.replace(/\D/gu, '');
}

function hasValidCpfDigits(value: string): boolean {
  if (!/^\d{11}$/u.test(value) || /^(\d)\1{10}$/u.test(value)) return false;
  const first = cpfCheckDigit(value.slice(0, 9), 10);
  const second = cpfCheckDigit(`${value.slice(0, 9)}${first}`, 11);
  return value.endsWith(`${first}${second}`);
}

function cpfCheckDigit(base: string, initialWeight: number): number {
  const sum = [...base].reduce(
    (total, digit, index) => total + Number(digit) * (initialWeight - index),
    0,
  );
  const remainder = (sum * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

function hasValidCnpjDigits(value: string): boolean {
  if (!/^\d{14}$/u.test(value) || /^(\d)\1{13}$/u.test(value)) return false;
  const first = cnpjCheckDigit(value.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = cnpjCheckDigit(
    `${value.slice(0, 12)}${first}`,
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  return value.endsWith(`${first}${second}`);
}

function cnpjCheckDigit(base: string, weights: readonly number[]): number {
  const sum = [...base].reduce(
    (total, digit, index) => total + Number(digit) * (weights[index] ?? 0),
    0,
  );
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}
