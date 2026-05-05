export type PadesEnvelopeDigest = Readonly<{
  payloadSha256: string;
  pkcs7Sha256: string;
}>;

export function describePadesBoundary(): string {
  return '@stynx/pki-pades will own eSocial PAdES/PKCS#7 signing after R7.';
}
