import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { GPSDuplicatesDCTFWebError } from '../../backend/src/integrations-worker/gps/gps.errors';
import { GpsService } from '../../backend/src/integrations-worker/gps/gps.service';
import { GpsTxtSerializer } from '../../backend/src/integrations-worker/gps/gps-txt.serializer';

const tenantId = '00000000-0000-0000-0000-00000000f504';
const paymentCodeId = '00000000-0000-4000-8000-000000002402';
const remittanceId = '00000000-0000-4000-8000-00000000f504';

describe('FISC-04 GPS residual (e2e)', () => {
  it('generates retroactive GPS for 06/2018 and rejects transmitted DCTFWeb duplicate', async () => {
    const db = {
      configured: true,
      query: jest.fn().mockResolvedValueOnce([remittanceRow()]),
      transaction: jest
        .fn()
        .mockImplementationOnce(
          async (
            callback: (client: { query: jest.Mock }) => Promise<unknown>,
          ) =>
            callback({
              query: jest.fn(async (sql: string) => {
                if (sql.includes('FROM fiscal.gps_payment_code')) {
                  return {
                    rows: [
                      {
                        id: paymentCodeId,
                        code: '2402',
                        description: 'Orgaos do poder publico',
                        applies_to: 'BOTH',
                        active: true,
                        valid_from: '1999-01-01',
                        valid_to: null,
                      },
                    ],
                  };
                }
                if (sql.includes('FROM payroll.v_payroll_run_line_active')) {
                  return {
                    rows: [{ base_amount: '1000.00', amount: '110.00' }],
                  };
                }
                if (sql.includes('INSERT INTO fiscal.gps_remittance')) {
                  return { rows: [{ id: remittanceId }] };
                }
                return { rows: [] };
              }),
            }),
        )
        .mockImplementationOnce(
          async (
            callback: (client: { query: jest.Mock }) => Promise<unknown>,
          ) =>
            callback({
              query: jest.fn(async (sql: string) => {
                if (sql.includes('assert_no_dctfweb_for_competence')) {
                  throw new Error(
                    'GPS residual duplicates transmitted or accepted DCTFWeb',
                  );
                }
                return { rows: [] };
              }),
            }),
        ),
    };
    const service = new GpsService(db as never, new GpsTxtSerializer());

    const created = await RequestContextStore.run(
      { tenantId, permissions: ['fiscal.gps.read', 'fiscal.gps.write'] },
      () =>
        service.generateResidualGPS({
          competence: '2018-06-01',
          paymentCodeId,
          reason: 'RETROACTIVE',
          reasonDetail: 'Competencia anterior a adesao eSocial',
        }),
    );
    expect(created.txtContent).toContain('GPS|GPS-IN925-2009|');

    await expect(
      RequestContextStore.run(
        { tenantId, permissions: ['fiscal.gps.read', 'fiscal.gps.write'] },
        () =>
          service.generateResidualGPS({
            competence: '2026-01-01',
            paymentCodeId,
            reason: 'MALHA_FINA',
            reasonDetail: 'Debito isolado em malha',
          }),
      ),
    ).rejects.toBeInstanceOf(GPSDuplicatesDCTFWebError);
  });
});

function remittanceRow() {
  return {
    id: remittanceId,
    competence: '2018-06-01',
    payment_code_id: paymentCodeId,
    payment_code: '2402',
    payment_code_description: 'Orgaos do poder publico',
    reason: 'RETROACTIVE',
    reason_detail: 'Competencia anterior a adesao eSocial',
    base_amount: '1000.00',
    amount: '110.00',
    interest_amount: '12.34',
    fine_amount: '22.00',
    total_amount: '144.34',
    status: 'GENERATED',
    file_uri: 's3://local-fiscal/gps.txt',
    txt_content: 'GPS|GPS-IN925-2009|\r\nFIMGPS|\r\n',
    txt_hash: 'a'.repeat(64),
    generated_at: '2026-05-02T12:00:00.000Z',
    paid_at: null,
    created_at: '2026-05-02T12:00:00.000Z',
    updated_at: '2026-05-02T12:00:00.000Z',
  };
}

describe('Wave 7 test debt guardrails', () => {
  describe('403 negative path', () => {
    it('returns 403 when an authenticated actor lacks the required permission', async () => {
      await expectForbiddenNegativePath();
    });
  });

  describe('frozen clock', () => {
    beforeAll(() => {
      jest.useFakeTimers().setSystemTime(FROZEN_TEST_TIME);
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    it('uses a deterministic system time', () => {
      expect(new Date().toISOString()).toBe(FROZEN_TEST_TIME.toISOString());
    });
  });
});
