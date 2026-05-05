import {
  createPkcs12Fixture,
  S1000_VALID_XML,
} from '../testing/esocial-fixtures';
import { IcpSignerService } from '../signature/icp-signer.service';
import { SoapClientService } from './soap-client.service';

describe('SoapClientService', () => {
  it('builds a deterministic WS-Security signed SOAP envelope verifiable with the fixture public key', () => {
    const signer = new IcpSignerService();
    const fixture = createPkcs12Fixture();
    const certificate = signer.readPkcs12(fixture.pkcs12, fixture.password);
    const service = new SoapClientService(signer);
    const eventXml = S1000_VALID_XML.replace(/^<\?xml[^>]*>\s*/u, '');
    const input = {
      batchXml: `<eSocial xmlns="http://www.esocial.gov.br/schema/lote/eventos/envio/v1_1_0"><envioLoteEventos grupo="1"><eventos><evento Id="ID1">${eventXml}</evento></eventos></envioLoteEventos></eSocial>`,
      certificate,
      createdAt: new Date('2026-05-02T12:00:00.000Z'),
      expiresAt: new Date('2026-05-02T12:10:00.000Z'),
      idSeed: 'fixture',
    };

    const envelope = service.buildSignedEnviarLoteEnvelope(input);
    const secondEnvelope = service.buildSignedEnviarLoteEnvelope(input);

    expect(envelope).toBe(secondEnvelope);
    expect(envelope).toContain('<wsse:Security');
    expect(envelope).toContain('BinarySecurityToken');
    expect(envelope).toContain('EnviarLoteEventos');
    expect(
      service.verifyWsSecurityEnvelope(envelope, certificate.certificatePem),
    ).toBe(true);
  });

  it('blocks gov.br endpoints under Jest to prevent real CI network calls', async () => {
    const service = new SoapClientService(new IcpSignerService());

    await expect(
      service.sendBatch({
        endpointUrl:
          'https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/enviarloteeventos/WsEnviarLoteEventos.svc',
        batchXml: '<eSocial/>',
        pkcs12: Buffer.from('00', 'hex'),
      }),
    ).rejects.toThrow('local eSocial WSDL stub');
  });
});
