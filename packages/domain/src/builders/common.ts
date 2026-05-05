import { createHash } from 'node:crypto';

export type BuilderMetadata = Readonly<{
  eventCode:
    | 'S-1000'
    | 'S-1005'
    | 'S-1010'
    | 'S-1020'
    | 'S-1050'
    | 'S-1070'
    | 'S-1200'
    | 'S-1202'
    | 'S-1207'
    | 'S-1210'
    | 'S-1298'
    | 'S-1299'
    | 'S-2200'
    | 'S-2205'
    | 'S-2206'
    | 'S-2210'
    | 'S-2220'
    | 'S-2230'
    | 'S-2240'
    | 'S-2298'
    | 'S-2299'
    | 'S-2300'
    | 'S-2306'
    | 'S-2399';
  leiauteVersion: 'S-1.3';
  xmlRoot: 'eSocial';
  eventElement:
    | 'evtInfoEmpregador'
    | 'evtTabEstab'
    | 'evtTabRubrica'
    | 'evtTabLotacao'
    | 'evtTabJornada'
    | 'evtTabProcesso'
    | 'evtRemun'
    | 'evtRmnRPPS'
    | 'evtBenPrRP'
    | 'evtPgtos'
    | 'evtReabreEvPer'
    | 'evtFechaEvPer'
    | 'evtAdmissao'
    | 'evtAltCadastral'
    | 'evtAltContratual'
    | 'evtCAT'
    | 'evtMonit'
    | 'evtAfastTemp'
    | 'evtExpRisco'
    | 'evtReintegr'
    | 'evtDeslig'
    | 'evtTSVInicio'
    | 'evtTSVAltContr'
    | 'evtTSVTermino';
  namespace: string;
  xsdBinding: string;
  tableVersionDependencies: readonly string[];
  receiptDependencies?: readonly string[] | undefined;
}>;

export type BuilderContext = Readonly<{
  processVersion?: string | undefined;
  environment?: 'qualification' | 'restricted_production' | 'production' | undefined;
}>;

export type BuiltXml = Readonly<{
  xml: string;
  metadata: BuilderMetadata;
  eventIds: readonly string[];
  xmlSha256: string;
}>;

export class DtoValidationError extends Error {
  readonly fieldPaths: readonly string[];

  constructor(fieldPaths: readonly string[]) {
    super(`Invalid eSocial DTO fields: ${fieldPaths.join(', ')}`);
    this.name = 'DtoValidationError';
    this.fieldPaths = fieldPaths;
  }
}

export const DEFAULT_PROCESS_VERSION = 'SGP-0.0.1';

export function eventId(
  eventClass: BuilderMetadata['eventCode'],
  tenantId: string,
  sourceId: string,
): string {
  const digits = sha256(`${eventClass}:${tenantId}:${sourceId}`)
    .replace(/[a-f]/g, (char) => String(char.charCodeAt(0) - 97))
    .slice(0, 34);
  return `ID${digits}`;
}

export function builtXml(
  xml: string,
  metadata: BuilderMetadata,
  eventIds: readonly string[],
): BuiltXml {
  return {
    xml,
    metadata,
    eventIds,
    xmlSha256: sha256(xml),
  };
}

export function validateRequired(
  input: Record<string, unknown>,
  fieldPaths: readonly string[],
): void {
  const missing = fieldPaths.filter((path) => isMissing(readPath(input, path)));
  if (missing.length > 0) throw new DtoValidationError(missing);
}

export function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function requireNonEmptyArray<T>(
  value: readonly T[] | undefined,
  fieldPath: string,
): readonly T[] {
  if (Array.isArray(value) && value.length > 0) return value;
  throw new DtoValidationError([fieldPath]);
}

export function requireEmptyArray<T>(
  value: readonly T[] | undefined,
  fieldPath: string,
): void {
  if (Array.isArray(value) && value.length === 0) return;
  throw new DtoValidationError([fieldPath]);
}

export function readPath(
  input: Record<string, unknown>,
  path: string,
): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object' && segment in current) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, input);
}

export function ideEvento(
  ctx: BuilderContext,
  options: Readonly<{
    includeRetification?: boolean | undefined;
    includePeriod?: string | undefined;
  }> = {},
): string {
  const pieces: string[] = [];
  if (options.includeRetification) pieces.push('<indRetif>1</indRetif>');
  if (options.includePeriod) {
    pieces.push('<indApuracao>1</indApuracao>');
    pieces.push(`<perApur>${xmlEscape(options.includePeriod)}</perApur>`);
  }
  pieces.push(`<tpAmb>${environmentCode(ctx.environment)}</tpAmb>`);
  pieces.push('<procEmi>1</procEmi>');
  pieces.push(
    `<verProc>${xmlEscape(ctx.processVersion ?? DEFAULT_PROCESS_VERSION)}</verProc>`,
  );
  return `<ideEvento>${pieces.join('')}</ideEvento>`;
}

export function ideEmpregadorXml(employerCnpj: string): string {
  return `<ideEmpregador><tpInsc>1</tpInsc><nrInsc>${employerRegistration(
    employerCnpj,
  )}</nrInsc></ideEmpregador>`;
}

export function employerRegistration(value: string): string {
  const digits = onlyDigits(value);
  return (digits.length >= 8 ? digits.slice(0, 8) : '12345678').padStart(8, '0');
}

export function fullRegistration(value: string): string {
  const digits = onlyDigits(value);
  return (digits.length >= 14 ? digits.slice(0, 14) : '12345678000199').padStart(
    14,
    '0',
  );
}

export function cpf(value: string): string {
  return onlyDigits(value).padStart(11, '0').slice(0, 11);
}

export function onlyDigits(value: string | number | undefined): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function moneyFromCents(value: number): string {
  if (!Number.isInteger(value)) throw new DtoValidationError(['amount']);
  const cents = BigInt(value);
  const reais = cents / 100n;
  const centavos = cents < 0n ? -(cents % 100n) : cents % 100n;
  return `${reais.toString()}.${centavos.toString().padStart(2, '0')}`;
}

export function quantity(value: number | undefined): string {
  if (value === undefined) return '1.0000';
  return value.toFixed(4);
}

export function xmlEscape(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function withFinalNewline(xml: string): string {
  return `${xml}\n`;
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function environmentCode(
  value: BuilderContext['environment'],
): '1' | '2' {
  return value === 'production' ? '1' : '2';
}

function isMissing(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}
