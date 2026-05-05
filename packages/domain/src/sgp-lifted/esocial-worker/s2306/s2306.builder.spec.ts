import { S2306Builder } from './s2306.builder';
import { XsdValidatorService } from '../xsd/xsd-validator.service';

describe('S2306Builder', () => {
  it('emits only remuneration when monthly_amount is the only real diff', async () => {
    const builder = new S2306Builder({
      query: jest.fn().mockResolvedValue([
        {
          change_id: '00000000-0000-4000-8000-000000002306',
          tenant_id: '00000000-0000-0000-0000-000000002306',
          contract_id: '00000000-0000-4000-8000-000000002300',
          effective_date: '2026-05-01',
          fields_changed: { monthly_amount: true },
          new_values: { monthly_amount: '1500.00' },
          tsv_category: '901',
          start_date: '2026-04-01',
          role: 'Estagiario',
          monthly_amount: '1500.00',
          weekly_hours: '30.000000',
          education_institution: 'Universidade Municipal',
          internship_plan_uri: null,
          employee_id: '00000000-0000-4000-8000-000000002301',
          employee_registration: 'TSV-2306',
          employee_cpf: '11144477735',
          company_cnpj: '12345678000199',
        },
      ]),
    } as never);

    const result = await builder.build('00000000-0000-4000-8000-000000002306');

    expect(result.xml).toContain('<remuneracao><vrSalFx>1500.00</vrSalFx>');
    expect(result.xml).not.toContain('<cargoFuncao>');
    expect(result.xml).not.toContain('<infoEstagiario>');
    expect(result.xml).not.toContain('<localTrabGeral>');
    expect(() =>
      new XsdValidatorService().assertValid('S-2306', result.xml, {
        allowUnsigned: true,
      }),
    ).not.toThrow();
  });
});
