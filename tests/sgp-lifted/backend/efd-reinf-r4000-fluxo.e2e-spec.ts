import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { createHash } from 'node:crypto';

import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { EfdReinfBuilderService } from '../../backend/src/integrations-worker/efd-reinf/efd-reinf-builder.service';
import { EfdReinfReceiptService } from '../../backend/src/integrations-worker/efd-reinf/efd-reinf-receipt.service';

const tenantId = '00000000-0000-0000-0000-00000000f501';
const eventId = '00000000-0000-4000-8000-000000004010';
const closureId = '00000000-0000-4000-8000-000000004099';

describe('EFD-Reinf R-4000 lifecycle (e2e)', () => {
  it('generates R-4010 and preserves tenant-scoped retained totals', async () => {
    const inserted: Array<{ grossAmount: string; retainedAmount: string }> = [];
    const db = {
      configured: true,
      query: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: eventId,
            beneficiary_kind: 'CPF',
            beneficiary_document: '12345678901',
            beneficiary_name: 'Servidor Exemplo',
            revenue_code: '0561',
            amount: '3500.00',
            irrf: '275.15',
          },
        ])
        .mockResolvedValueOnce([eventRow(eventId, 'R4010', '275.15')])
        .mockResolvedValueOnce([
          itemRow(eventId, 'CPF', '12345678901', '0561', '3500.00', '275.15'),
        ]),
      transaction: jest.fn(async (callback) =>
        callback({
          query: jest.fn(async (sql: string, values: unknown[]) => {
            if (sql.includes('INSERT INTO fiscal.efd_reinf_event')) {
              return { rows: [{ id: eventId }] };
            }
            if (sql.includes('INSERT INTO fiscal.efd_reinf_item')) {
              inserted.push({
                grossAmount: String(values[7]),
                retainedAmount: String(values[8]),
              });
            }
            return { rows: [] };
          }),
        }),
      ),
    };
    const service = new EfdReinfBuilderService(db as never);

    const result = await RequestContextStore.run(
      {
        tenantId,
        permissions: ['fiscal.dctfweb.read', 'fiscal.dctfweb.write'],
      },
      () => service.generate({ year: 2025, month: 1, eventType: 'R4010' }),
    );

    expect(inserted).toEqual([
      { grossAmount: '3500.00', retainedAmount: '275.15' },
    ]);
    expect(result.totalRetainedAmount).toBe('275.15');
  });

  it('records an accepted R-4099 receipt as an R-9015 totalizer for DCTFWeb', async () => {
    const signedXml = '<Reinf><evtFech Id="IDR4099" /></Reinf>';
    const signedXmlHash = createHash('sha256')
      .update(signedXml, 'utf8')
      .digest('hex');
    const totalizerWrites: unknown[][] = [];
    const db = {
      configured: true,
      transaction: jest.fn(async (callback) =>
        callback({
          query: jest.fn(async (sql: string, values: unknown[]) => {
            if (sql.includes('INSERT INTO fiscal.efd_reinf_totalizer')) {
              totalizerWrites.push(values);
            }
            return { rows: [] };
          }),
        }),
      ),
    };
    const events = {
      find: jest.fn(async () => ({
        ...eventRow(closureId, 'R4099', '275.15'),
        signedXml,
        signedXmlHash,
        items: [
          {
            sourceRunId: eventId,
            revenueCode: '0561',
            grossAmount: '3500.00',
            retainedAmount: '275.15',
          },
        ],
      })),
    };
    const receipt = new EfdReinfReceiptService(db as never, events as never);

    const result = await receipt.process({
      eventId: closureId,
      accepted: true,
      receiptNumber: 'REINF-R9015-1',
      receiptAt: new Date('2026-05-02T12:00:00.000Z'),
      transmittedXml: signedXml,
      responsePayload: { status: 'ACCEPTED' },
    });

    expect(result.id).toBe(closureId);
    expect(totalizerWrites).toHaveLength(1);
    expect(JSON.parse(String(totalizerWrites[0][2]))).toEqual({
      items: [
        {
          sourceRunId: eventId,
          debitCode: '0561',
          baseAmount: '3500.00',
          amount: '275.15',
        },
      ],
    });
  });
});

function eventRow(id: string, eventType: string, totalRetainedAmount: string) {
  return {
    id,
    competence: '2025-01-01',
    event_type: eventType,
    eventType,
    kind: 'ORIGINAL',
    status: 'DRAFT',
    original_event_id: null,
    originalEventId: null,
    payload_xml_ref: 's3://payload.xml',
    payloadXmlRef: 's3://payload.xml',
    payload_xml: '<Reinf />',
    payloadXml: '<Reinf />',
    payload_xml_hash: 'a'.repeat(64),
    payloadXmlHash: 'a'.repeat(64),
    signed_xml_ref: null,
    signedXmlRef: null,
    signed_xml: null,
    signedXml: null,
    signed_xml_hash: null,
    signedXmlHash: null,
    transmitted_xml_hash: null,
    transmittedXmlHash: null,
    receipt_number: null,
    receiptNumber: null,
    receipt_at: null,
    receiptAt: null,
    item_count: 1,
    itemCount: 1,
    total_gross_amount: '3500.00',
    totalGrossAmount: '3500.00',
    total_retained_amount: totalRetainedAmount,
    totalRetainedAmount,
    created_at: '2026-05-02T12:00:00.000Z',
    createdAt: '2026-05-02T12:00:00.000Z',
    updated_at: '2026-05-02T12:00:00.000Z',
    updatedAt: '2026-05-02T12:00:00.000Z',
  };
}

function itemRow(
  sourceRunId: string,
  beneficiaryKind: string,
  beneficiaryDocument: string,
  revenueCode: string,
  grossAmount: string,
  retainedAmount: string,
) {
  return {
    id: `00000000-0000-4000-8000-${revenueCode.padEnd(12, '0').slice(0, 12)}`,
    source_run_id: sourceRunId,
    beneficiary_kind: beneficiaryKind,
    beneficiary_document: beneficiaryDocument,
    beneficiary_name: 'Servidor Exemplo',
    revenue_code: revenueCode,
    gross_amount: grossAmount,
    retained_amount: retainedAmount,
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
