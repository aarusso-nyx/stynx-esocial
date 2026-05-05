import { createHash } from 'node:crypto';

export class XmlSecurityError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'XmlSecurityError';
  }
}

export function assertHardenedXml(xml: string): void {
  if (/<!DOCTYPE\b/iu.test(xml)) {
    throw new XmlSecurityError(
      'XML DTD declarations are not accepted.',
      'XML_DTD_FORBIDDEN',
    );
  }
  if (/<!ENTITY\b/iu.test(xml)) {
    throw new XmlSecurityError(
      'XML entity declarations are not accepted.',
      'XML_ENTITY_FORBIDDEN',
    );
  }
  if (/<\?xml-stylesheet\b/iu.test(xml)) {
    throw new XmlSecurityError(
      'XML stylesheet processing instructions are not accepted.',
      'XML_STYLESHEET_FORBIDDEN',
    );
  }
  if (/\b(?:SYSTEM|PUBLIC)\s+["']/iu.test(xml)) {
    throw new XmlSecurityError(
      'XML external identifiers are not accepted.',
      'XML_EXTERNAL_IDENTIFIER_FORBIDDEN',
    );
  }

  const unresolvedEntity = xml.match(
    /&(?!amp;|lt;|gt;|quot;|apos;|#[0-9]+;|#x[0-9a-f]+;)([A-Za-z_][\w.-]*);/iu,
  );
  if (unresolvedEntity) {
    throw new XmlSecurityError(
      `XML entity reference ${unresolvedEntity[0]} is not accepted.`,
      'XML_ENTITY_REFERENCE_FORBIDDEN',
    );
  }
}

export function sha256Prefixed(value: string | Buffer | Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function sha256Hex(value: string | Buffer | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
