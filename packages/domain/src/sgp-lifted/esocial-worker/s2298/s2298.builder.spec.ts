import { S2298Builder } from './s2298.builder';
import { XsdValidatorService } from '../xsd/xsd-validator.service';

describe('S2298Builder', () => {
  it('emits XSD-valid reintegration XML with original S-2299 receipt reference', async () => {
    const builder = new S2298Builder({
      query: jest.fn().mockResolvedValue([
        {
          order_id: '00000000-0000-4000-8000-000000002298',
          tenant_id: '00000000-0000-0000-0000-000000002298',
          employment_link_id: '00000000-0000-4000-8000-000000009298',
          employee_id: '00000000-0000-4000-8000-000000002200',
          employee_registration: 'MAT-2298',
          employee_cpf: '11122233344',
          reinstatement_date: '2025-11-16',
          decision_date: '2026-05-01',
          kind: 'JUDICIAL',
          process_number: '12345678901234567890',
          original_s2299_receipt: '1.2.0000000000000000001',
          company_cnpj: '12345678000199',
        },
      ]),
    } as never);

    const result = await builder.build('00000000-0000-4000-8000-000000002298');

    expect(result.xml).toContain(
      '<nrRecibo>1.2.0000000000000000001</nrRecibo>',
    );
    expect(result.xml).toContain('<dtEfetRetorno>2025-11-16</dtEfetRetorno>');
    expect(result.xml).toContain('<tpReint>1</tpReint>');
    expect(() =>
      new XsdValidatorService().assertValid('S-2298', result.xml, {
        allowUnsigned: true,
      }),
    ).not.toThrow();
  });
});
