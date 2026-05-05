import { ServidorImportController } from '../../backend/src/folha-pagamento/import/servidor-import.controller';
import { buildSimpleXlsx } from './helpers/simple-xlsx-fixture';

describe('Servidor verba XLSX import API contract (e2e)', () => {
  it('exposes the folha-scoped servidor import and audits each accepted row', async () => {
    const xlsx = buildSimpleXlsx([
      ['matricula', 'verba_codigo', 'valor'],
      ['MAT-001', 'HORA_EXTRA', '250.00'],
    ]);
    const importFile = jest.fn().mockResolvedValue({
      payrollRunId: 'run-1',
      fileName: 'servidores.xlsx',
      fileHash: 'hash-1',
      totalRows: 1,
      acceptedRows: 1,
      rejectedRows: 0,
      accepted: [
        {
          rowNumber: 2,
          payrollItemId: 'item-1',
          employeeId: 'emp-1',
          employeeRegistration: 'MAT-001',
          earningDeductionId: 'rubrica-1',
          earningDeductionCode: 'HORA_EXTRA',
          amount: '250.00',
          idempotencyKey: 'tenant:2026:05:run-1:emp-1:rubrica-1:IMPORTED',
          operation: 'created',
        },
      ],
      errors: [],
    });
    const auditMutation = jest.fn().mockResolvedValue(undefined);
    const controller = new ServidorImportController(
      { importFile } as never,
      { auditMutation } as never,
    );
    const request = {
      method: 'POST',
      url: '/api/v1/folhas/run-1/importar/servidor',
      headers: {},
      actor: { username: 'folha-user' },
    } as never;

    const result = await controller.importServidor(request, 'run-1', {
      buffer: xlsx,
      originalname: 'servidores.xlsx',
      size: xlsx.length,
    });

    expect(importFile).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ originalname: 'servidores.xlsx' }),
    );
    expect(result).toMatchObject({ acceptedRows: 1, rejectedRows: 0 });
    expect(auditMutation).toHaveBeenCalledWith(
      request,
      'IMPORT',
      'payroll.employee_payroll_item',
      expect.objectContaining({
        resourceId: 'item-1',
        metadata: expect.objectContaining({
          event: 'folha.servidor_import.row_accepted',
          rowNumber: 2,
        }),
      }),
    );
    expect(auditMutation).toHaveBeenCalledTimes(2);
  });
});
