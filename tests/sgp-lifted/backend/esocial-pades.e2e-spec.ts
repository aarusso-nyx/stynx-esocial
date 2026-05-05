import forge from 'node-forge';

import { GovBrSignatureSandboxAdapter } from '../../backend/src/auth/govbr/govbr-signature-sandbox.adapter';
import { GovBrSignService } from '../../backend/src/auth/govbr/sign.service';
import { EsocialPadesPkcs7Envelope } from '../../backend/src/auth/govbr/software-pades-pkcs7.signer';

const tenantId = '00000000-0000-0000-0000-000000040101';
const signedAt = '2026-05-03T12:00:00.000Z';

describe('R4-01 eSocial S-1299 PAdES/PKCS#7 software certificate slice (e2e)', () => {
  it('builds a byte-stable detached PKCS#7 envelope with local ICP chain and LTV evidence', () => {
    const service = new GovBrSignService(new GovBrSignatureSandboxAdapter());

    const envelope = service.signEsocialS1299SoftwareCertificate({
      tenantId,
      signedAt,
      xml: s1299Xml,
    });
    const repeated = service.signEsocialS1299SoftwareCertificate({
      tenantId,
      signedAt,
      xml: s1299Xml,
    });

    expect(JSON.stringify(repeated)).toBe(JSON.stringify(envelope));
    expect(envelope).toMatchObject({
      eventKind: 'S-1299',
      profile: 'PAdES-B-B',
      container: 'PKCS7_DETACHED_SIGNED_DATA',
      signerMode: 'SOFTWARE_CERTIFICATE_A1_SANDBOX',
      hsmDecision: 'MUST_DEFER',
      signatureAlgorithm: 'sha256WithRSAEncryption',
      digestAlgorithm: 'sha256',
      certificateChainValidation: {
        status: 'VALID',
        policy: 'local-icp-brasil-sandbox-chain',
      },
      ltv: {
        mode: 'sandbox-ltv',
        timestamp: signedAt,
        ocsp: { status: 'GOOD' },
        crl: { status: 'NOT_REVOKED' },
      },
    });
    expect(envelope.pkcs7DerBase64).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(envelope.certificateChainPem).toHaveLength(3);
    expect(envelope.signer.subject).toContain(
      'CN=SGP eSocial S-1299 Software Certificate',
    );

    const signedData = forge.pkcs7.messageFromAsn1(
      forge.asn1.fromDer(
        Buffer.from(envelope.pkcs7DerBase64, 'base64').toString('binary'),
      ),
    );
    expect(signedData.type).toBe(forge.pki.oids.signedData);
    expect('certificates' in signedData && signedData.certificates.length).toBe(
      3,
    );
    expect(service.verifyEsocialS1299Envelope(envelope)).toBe(true);
  });

  it('rejects tampered payloads and accepts valid envelopes in the local SOAP stub', () => {
    const service = new GovBrSignService(new GovBrSignatureSandboxAdapter());
    const envelope = service.signEsocialS1299SoftwareCertificate({
      tenantId,
      signedAt,
      xml: s1299Xml,
    });

    expect(service.transmitEsocialS1299Sandbox(envelope)).toMatchObject({
      statusCode: 200,
      acceptedAt: signedAt,
      message: 'Accepted by local eSocial PAdES SOAP stub',
    });

    const tampered: EsocialPadesPkcs7Envelope = {
      ...envelope,
      payloadXml: envelope.payloadXml.replace(
        '<perApur>2026-04</perApur>',
        '<perApur>2026-05</perApur>',
      ),
    };

    expect(service.verifyEsocialS1299Envelope(tampered)).toBe(false);
    expect(service.transmitEsocialS1299Sandbox(tampered)).toMatchObject({
      statusCode: 422,
      protocol: null,
      message: 'Rejected by local eSocial PAdES SOAP stub',
    });
  });
});

const s1299Xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtFechaEvPer/v_S_01_03_00">
  <evtFechaEvPer Id="ID1234567890123456789012345678901234">
    <ideEvento>
      <indApuracao>1</indApuracao>
      <perApur>2026-04</perApur>
      <tpAmb>2</tpAmb>
      <procEmi>1</procEmi>
      <verProc>SGP-R4-01</verProc>
    </ideEvento>
    <ideEmpregador>
      <tpInsc>1</tpInsc>
      <nrInsc>12345678</nrInsc>
    </ideEmpregador>
    <infoFech>
      <evtRemun>S</evtRemun>
      <evtPgtos>S</evtPgtos>
      <evtComProd>N</evtComProd>
      <evtContratAvNP>N</evtContratAvNP>
      <evtInfoComplPer>N</evtInfoComplPer>
      <indExcApur1250>N</indExcApur1250>
      <transDCTFWeb>S</transDCTFWeb>
      <naoValid>N</naoValid>
    </infoFech>
  </evtFechaEvPer>
</eSocial>`;
