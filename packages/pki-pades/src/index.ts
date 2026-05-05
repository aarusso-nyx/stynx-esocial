import {
  createHash,
  createSign,
  createVerify,
  timingSafeEqual,
} from 'node:crypto';

export type CertificateReference = Readonly<{
  tenantId: string;
  environment: string;
  label: string;
  secretRef: string;
  version?: string | undefined;
}>;

export type CertificateHandle = Readonly<{
  reference: CertificateReference;
  privateKeyPem: string;
  publicKeyPem: string;
  certificatePem?: string | undefined;
  subjectName?: string | undefined;
  issuerName?: string | undefined;
  serialNumber?: string | undefined;
  validFrom?: string | undefined;
  validUntil?: string | undefined;
  revokedAt?: string | undefined;
}>;

export type SignedXmlBytes = Readonly<{
  signedBytes: Buffer;
  requestXmlSha256: string;
  signedPayloadSha256: string;
  signatureHash: string;
  certificateFingerprintSha256: string;
  algorithm: 'RSA-SHA256';
  signedAt: string;
  certificateRef: CertificateReference;
}>;

export type SignXmlInput = Readonly<{
  xmlBytes: string | Buffer | Uint8Array;
  certificate: CertificateHandle;
  now?: Date | undefined;
}>;

export type VerifySignedXmlInput = Readonly<{
  signedBytes: string | Buffer | Uint8Array;
  certificate: Pick<CertificateHandle, 'publicKeyPem' | 'certificatePem'>;
}>;

export class PkiSigningError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'PkiSigningError';
  }
}

export function signXmlBytes(input: SignXmlInput): SignedXmlBytes {
  const now = input.now ?? new Date();
  assertCertificateUsable(input.certificate, now);

  const unsignedBytes = toBuffer(input.xmlBytes);
  const unsignedXml = unsignedBytes.toString('utf8');
  assertXmlSigningCandidate(unsignedXml);

  const signer = createSign('RSA-SHA256');
  signer.update(unsignedBytes);
  signer.end();
  const signatureValue = signer.sign(input.certificate.privateKeyPem);
  const requestXmlSha256 = sha256Hex(unsignedBytes);
  const certificateFingerprintSha256 = sha256Hex(
    input.certificate.certificatePem ?? input.certificate.publicKeyPem,
  );
  const signedXml = appendDetachedXmlSignature(unsignedXml, {
    digestValue: base64FromHex(requestXmlSha256),
    certificateFingerprintSha256,
    signatureValue: signatureValue.toString('base64'),
  });
  const signedBytes = Buffer.from(signedXml, 'utf8');
  const signedPayloadSha256 = sha256Hex(signedBytes);
  const signatureHash = sha256Hex(signatureValue);

  return {
    signedBytes,
    requestXmlSha256,
    signedPayloadSha256,
    signatureHash,
    certificateFingerprintSha256,
    algorithm: 'RSA-SHA256',
    signedAt: now.toISOString(),
    certificateRef: input.certificate.reference,
  };
}

export function verifySignedXmlBytes(input: VerifySignedXmlInput): boolean {
  const signedXml = toBuffer(input.signedBytes).toString('utf8');
  assertXmlIsHardened(signedXml);

  const signatureBlock = signedXml.match(
    /<ds:Signature\b[\s\S]*?<\/ds:Signature>/u,
  )?.[0];
  if (!signatureBlock) return false;

  const unsignedXml = signedXml.replace(signatureBlock, '');
  const expectedDigest = base64FromHex(sha256Hex(unsignedXml));
  const actualDigest = textBetween(signatureBlock, 'ds:DigestValue');
  const signatureValue = textBetween(signatureBlock, 'ds:SignatureValue');
  if (!actualDigest || !signatureValue) return false;
  if (!constantTimeEqual(actualDigest, expectedDigest)) return false;

  const verifier = createVerify('RSA-SHA256');
  verifier.update(Buffer.from(unsignedXml, 'utf8'));
  verifier.end();
  return verifier.verify(input.certificate.publicKeyPem, signatureValue, 'base64');
}

export function assertXmlSigningCandidate(xml: string): void {
  assertXmlIsHardened(xml);
  if (!/<eSocial\b/u.test(xml)) {
    throw new PkiSigningError(
      'eSocial XML signing candidate must include an eSocial root element.',
      'PKI_ESOCIAL_ROOT_REQUIRED',
    );
  }
  if (!/\sId="ID[0-9A-Za-z]+"/u.test(xml)) {
    throw new PkiSigningError(
      'eSocial XML signing candidate must include an event Id attribute.',
      'PKI_EVENT_ID_REQUIRED',
    );
  }
  if (/<(?:\w+:)?Signature\b/u.test(xml)) {
    throw new PkiSigningError(
      'eSocial XML signing candidate is already signed.',
      'PKI_XML_ALREADY_SIGNED',
    );
  }
}

export function assertXmlIsHardened(xml: string): void {
  if (/<!DOCTYPE\b/iu.test(xml)) {
    throw new PkiSigningError(
      'XML DTD declarations are not accepted by the signing boundary.',
      'XML_DTD_FORBIDDEN',
    );
  }
  if (/<!ENTITY\b/iu.test(xml)) {
    throw new PkiSigningError(
      'XML entity declarations are not accepted by the signing boundary.',
      'XML_ENTITY_FORBIDDEN',
    );
  }
  if (/<\?xml-stylesheet\b/iu.test(xml)) {
    throw new PkiSigningError(
      'XML stylesheet processing instructions are not accepted.',
      'XML_STYLESHEET_FORBIDDEN',
    );
  }
  if (/\b(?:SYSTEM|PUBLIC)\s+["']/iu.test(xml)) {
    throw new PkiSigningError(
      'XML external identifiers are not accepted.',
      'XML_EXTERNAL_IDENTIFIER_FORBIDDEN',
    );
  }
  const unresolvedEntity = xml.match(
    /&(?!amp;|lt;|gt;|quot;|apos;|#[0-9]+;|#x[0-9a-f]+;)([A-Za-z_][\w.-]*);/iu,
  );
  if (unresolvedEntity) {
    throw new PkiSigningError(
      `XML entity reference ${unresolvedEntity[0]} is not accepted.`,
      'XML_ENTITY_REFERENCE_FORBIDDEN',
    );
  }
}

export function sha256Hex(value: string | Buffer | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function assertCertificateUsable(
  certificate: CertificateHandle,
  now: Date,
): void {
  if (certificate.revokedAt) {
    throw new PkiSigningError(
      'Certificate has been revoked and cannot sign eSocial XML.',
      'PKI_CERTIFICATE_REVOKED',
    );
  }
  if (certificate.validFrom && now < new Date(certificate.validFrom)) {
    throw new PkiSigningError(
      'Certificate is not valid yet.',
      'PKI_CERTIFICATE_NOT_YET_VALID',
    );
  }
  if (certificate.validUntil && now > new Date(certificate.validUntil)) {
    throw new PkiSigningError(
      'Certificate is expired.',
      'PKI_CERTIFICATE_EXPIRED',
    );
  }
}

function appendDetachedXmlSignature(
  xml: string,
  values: {
    digestValue: string;
    certificateFingerprintSha256: string;
    signatureValue: string;
  },
): string {
  const signatureXml = [
    '<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">',
    '<ds:SignedInfo>',
    '<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>',
    '<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>',
    '<ds:Reference URI="">',
    '<ds:Transforms>',
    '<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>',
    '<ds:Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>',
    '</ds:Transforms>',
    '<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>',
    `<ds:DigestValue>${values.digestValue}</ds:DigestValue>`,
    '</ds:Reference>',
    '</ds:SignedInfo>',
    `<ds:SignatureValue>${values.signatureValue}</ds:SignatureValue>`,
    '<ds:KeyInfo>',
    '<ds:KeyName>',
    values.certificateFingerprintSha256,
    '</ds:KeyName>',
    '</ds:KeyInfo>',
    '</ds:Signature>',
  ].join('');

  const closingMatch = xml.match(/<\/eSocial>(\s*)$/u);
  if (!closingMatch || closingMatch.index === undefined) {
    throw new PkiSigningError(
      'eSocial XML signing candidate must include a closing eSocial root element.',
      'PKI_ESOCIAL_ROOT_REQUIRED',
    );
  }

  return `${xml.slice(0, closingMatch.index)}${signatureXml}</eSocial>${closingMatch[1]}`;
}

function toBuffer(value: string | Buffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  return Buffer.from(value);
}

function textBetween(xml: string, tagName: string): string | undefined {
  return xml.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'u'))
    ?.[1]
    ?.trim();
}

function base64FromHex(value: string): string {
  return Buffer.from(value, 'hex').toString('base64');
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer);
}
