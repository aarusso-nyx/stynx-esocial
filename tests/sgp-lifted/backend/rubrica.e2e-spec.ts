import { RubricaController } from '../../backend/src/folha-pagamento/accounting/rubrica/rubrica.controller';
import { RubricaService } from '../../backend/src/folha-pagamento/accounting/rubrica/rubrica.service';

describe('Rubrica API contract (e2e)', () => {
  it('creates rubrica, validates formula, previews numeric value, and links cargo', async () => {
    const service = {
      createRubrica: jest.fn().mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        code: 'VENC',
        formulaReady: true,
        attributes: [{ name: 'percentual', type: 'decimal' }],
      }),
      compileFormula: jest.fn().mockResolvedValue({
        ready: true,
        error: null,
        dependencies: [],
      }),
      previewRubrica: jest.fn().mockResolvedValue({
        rubricaId: '11111111-1111-4111-8111-111111111111',
        employeeId: '22222222-2222-4222-8222-222222222222',
        competence: '2026-05',
        amount: '1234.56',
        attributes: { percentual: '100.00' },
      }),
      createJobPositionRubrica: jest.fn().mockResolvedValue({
        id: '33333333-3333-4333-8333-333333333333',
        rubricaId: '11111111-1111-4111-8111-111111111111',
        jobPositionId: '44444444-4444-4444-8444-444444444444',
      }),
    } as unknown as RubricaService;
    const audit = {
      auditMutation: jest.fn().mockResolvedValue(undefined),
      appendEvent: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new RubricaController(service, audit as never);
    const request = { actor: { username: 'folha-user' } } as never;

    const created = await controller.createRubrica(request, {
      code: 'VENC',
      description: 'Vencimento basico',
      type: 'provento',
      formulaExpression:
        'base_salary(p_employee_id, make_date(p_year, p_month, 1))',
      attributes: [{ name: 'percentual', type: 'decimal' }],
    });
    const compile = await controller.compileFormula(request, {
      expression: 'base_salary(p_employee_id, make_date(p_year, p_month, 1))',
    });
    const preview = await controller.previewRubrica(
      request,
      '11111111-1111-4111-8111-111111111111',
      {
        employeeId: '22222222-2222-4222-8222-222222222222',
        competenceYear: 2026,
        competenceMonth: 5,
        attributes: { percentual: '100.00' },
      },
    );
    const link = await controller.createJobPositionRubrica(request, {
      rubricaId: '11111111-1111-4111-8111-111111111111',
      jobPositionId: '44444444-4444-4444-8444-444444444444',
      startsOn: '2026-05-01',
    });

    expect(created).toMatchObject({ code: 'VENC', formulaReady: true });
    expect(compile).toMatchObject({ ready: true });
    expect(Number(preview.amount)).toBeGreaterThan(0);
    expect(link).toMatchObject({
      rubricaId: '11111111-1111-4111-8111-111111111111',
      jobPositionId: '44444444-4444-4444-8444-444444444444',
    });
    expect(audit.auditMutation).toHaveBeenCalledWith(
      request,
      'CREATE',
      'folha.rubrica',
      expect.objectContaining({
        metadata: expect.objectContaining({ event: 'folha.rubrica.created' }),
      }),
    );
  });
});
