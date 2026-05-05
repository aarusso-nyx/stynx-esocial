const XML_REDACTION = '[REDACTED_XML_PAYLOAD]';
const SALARY_REDACTION = '[REDACTED_SALARY]';
const CERTIFICATE_REDACTION = '[REDACTED_CERTIFICATE_MATERIAL]';

const XML_FIELD_PATTERN = /(^|_)(rawresponsexml|responsexml|xml|signedpayload|soaprequest|soapresponse)$/iu;
const CERTIFICATE_MATERIAL_FIELD_PATTERN = /(privatekey|certificatepem|publickeypem|pfx|p12|secretmaterial)/iu;
const FINGERPRINT_FIELD_PATTERN = /(certificatefingerprint|fingerprint)/iu;
const CPF_FIELD_PATTERN = /cpf/iu;
const CNPJ_FIELD_PATTERN = /cnpj/iu;
const SALARY_FIELD_PATTERN = /(salary|salario|salário|remuneration|remuneracao|remuneração|wage|basepay|grosspay)/iu;
const XML_STRING_PATTERN = /<\?xml|<eSocial\b|<Envelope\b|<[^>]+>[\s\S]*<\/[^>]+>/iu;
const FORMATTED_CPF_PATTERN = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/gu;
const FORMATTED_CNPJ_PATTERN = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/gu;
const DIGIT_DOCUMENT_PATTERN = /(?<!\d)(\d{11}|\d{14})(?!\d)/gu;

export function redactForLog<T>(value: T): T {
  return redactValue(value, undefined) as T;
}

export function maskCpf(value: string): string {
  const digits = value.replace(/\D/gu, '');
  if (digits.length !== 11) return redactDocumentStrings(value);
  return `${digits.slice(0, 3)}.***.***-${digits.slice(-2)}`;
}

export function maskCnpj(value: string): string {
  const digits = value.replace(/\D/gu, '');
  if (digits.length !== 14) return redactDocumentStrings(value);
  return `${digits.slice(0, 2)}.***.***/****-${digits.slice(-2)}`;
}

export function maskFingerprint(value: string): string {
  const trimmed = value.trim();
  return trimmed.length <= 8 ? '********' : `********${trimmed.slice(-8)}`;
}

function redactValue(value: unknown, key: string | undefined): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return redactString(value, key);
  }

  if (typeof value === 'number') {
    return key && SALARY_FIELD_PATTERN.test(key) ? SALARY_REDACTION : value;
  }

  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, key));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
      entryKey,
      redactValue(entryValue, entryKey),
    ]),
  );
}

function redactString(value: string, key: string | undefined): string {
  if (key && XML_FIELD_PATTERN.test(normalizeKey(key))) return XML_REDACTION;
  if (key && CERTIFICATE_MATERIAL_FIELD_PATTERN.test(normalizeKey(key))) {
    return CERTIFICATE_REDACTION;
  }
  if (key && FINGERPRINT_FIELD_PATTERN.test(normalizeKey(key))) {
    return maskFingerprint(value);
  }
  if (key && CPF_FIELD_PATTERN.test(normalizeKey(key))) return maskCpf(value);
  if (key && CNPJ_FIELD_PATTERN.test(normalizeKey(key))) return maskCnpj(value);
  if (key && SALARY_FIELD_PATTERN.test(normalizeKey(key))) return SALARY_REDACTION;
  if (XML_STRING_PATTERN.test(value)) return XML_REDACTION;
  return redactDocumentStrings(value);
}

function redactDocumentStrings(value: string): string {
  return value
    .replace(FORMATTED_CNPJ_PATTERN, (match) => maskCnpj(match))
    .replace(FORMATTED_CPF_PATTERN, (match) => maskCpf(match))
    .replace(DIGIT_DOCUMENT_PATTERN, (match) =>
      match.length === 11 ? maskCpf(match) : maskCnpj(match),
    );
}

function normalizeKey(key: string): string {
  return key.replace(/[-_\s.]/gu, '').toLowerCase();
}
