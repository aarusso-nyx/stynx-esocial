import forge from 'node-forge';

export const S1000_VALID_XML = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtInfoEmpregador/v_S_01_03_00">
  <evtInfoEmpregador Id="ID1234567890123456789012345678901234">
    <ideEvento>
      <tpAmb>2</tpAmb>
      <procEmi>1</procEmi>
      <verProc>SGP-TEST</verProc>
    </ideEvento>
    <ideEmpregador>
      <tpInsc>1</tpInsc>
      <nrInsc>12345678</nrInsc>
    </ideEmpregador>
    <infoEmpregador>
      <exclusao>
        <idePeriodo>
          <iniValid>2026-01</iniValid>
        </idePeriodo>
      </exclusao>
    </infoEmpregador>
  </evtInfoEmpregador>
</eSocial>`;

export function createPkcs12Fixture(
  validTo = new Date(Date.now() + 86_400_000),
) {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = validTo;
  const attrs = [{ name: 'commonName', value: 'SGP eSocial Test A1' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const password = 'fixture-password';
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, cert, password, {
    algorithm: '3des',
  });
  const der = forge.asn1.toDer(p12Asn1).getBytes();
  return {
    password,
    pkcs12: Buffer.from(der, 'binary'),
  };
}
