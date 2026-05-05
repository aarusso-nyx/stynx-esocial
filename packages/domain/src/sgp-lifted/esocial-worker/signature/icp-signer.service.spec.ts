import {
  createPkcs12Fixture,
  S1000_VALID_XML,
} from '../testing/esocial-fixtures';
import { IcpSignerService } from './icp-signer.service';

describe('IcpSignerService', () => {
  it('signs XML-DSig enveloped with an A1 PKCS#12 fixture and verifies with the paired public certificate', () => {
    const signer = new IcpSignerService();
    const fixture = createPkcs12Fixture();

    const signed = signer.sign({
      xml: S1000_VALID_XML,
      pkcs12: fixture.pkcs12,
      password: fixture.password,
    });

    expect(signed.xml).toContain(
      '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">',
    );
    expect(signer.verify(signed.xml, signed.certificatePem)).toBe(true);
  });
});
