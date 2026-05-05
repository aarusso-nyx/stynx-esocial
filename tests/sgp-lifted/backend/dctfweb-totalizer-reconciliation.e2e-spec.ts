import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { ConfigService } from '@nestjs/config';

import { RequestContextStore } from '../../backend/src/common/request-context/request-context.store';
import { DctfwebBuilderService } from '../../backend/src/integrations-worker/dctfweb/dctfweb-builder.service';
import { DctfwebTransmitterService } from '../../backend/src/integrations-worker/dctfweb/dctfweb-transmitter.service';
import {
  DctfwebDeclarationDetailsDto,
  DctfwebSourceEvent,
} from '../../backend/src/integrations-worker/dctfweb/dctfweb.dto';

const tenantId = '00000000-0000-0000-0000-00000000f522';
const declarationId = '00000000-0000-4000-8000-00000000f522';
const competence = '2026-01-01';

type TotalizerKind = 'S-5011' | 'S-5013';

interface TotalizerRow {
  kind: TotalizerKind;
  source_event_recibo: string;
  payload: {
    items: Array<{
      sourceRunId: string;
      debitCode: string;
      baseAmount: string;
      amount: string;
    }>;
  };
}

interface InsertedItem {
  id: string;
  sourceEvent: DctfwebSourceEvent;
  sourceRunId: string;
  debitCode: string;
  baseAmount: string;
  amount: string;
}

interface TestDbClient {
  query(
    sql: string,
    values: unknown[],
  ): Promise<{ rows: Array<{ id: string }> }>;
}

describe('DCTFWeb totalizer reconciliation (e2e)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('transmits S-5011 and S-5013 totals equal to accepted eSocial totalizers for the same competence', async () => {
    const totalizers = acceptedTotalizers();
    const inserted: InsertedItem[] = [];
    let payloadXml = '';
    let payloadXmlHash = '';

    const database = {
      configured: true,
      query: jest.fn(async (sql: string, values: unknown[]) => {
        if (sql.includes('FROM esocial.esocial_totalizer')) {
          expect(values).toEqual([tenantId, competence]);
          return totalizers;
        }

        if (sql.includes('FROM fiscal.dctfweb_declaration')) {
          return [
            declarationRow({
              payloadXml,
              payloadXmlHash,
              totalBaseAmount: moneyFromCents(
                sumItems(inserted, (item) => item.baseAmount),
              ),
              totalAmount: moneyFromCents(
                sumItems(inserted, (item) => item.amount),
              ),
            }),
          ];
        }

        if (sql.includes('FROM fiscal.dctfweb_item')) {
          return inserted.map(itemRow);
        }

        return [];
      }),
      transaction: jest.fn(
        async (callback: (client: TestDbClient) => Promise<string>) =>
          callback({
            query: jest.fn(async (sql: string, values: unknown[]) => {
              if (sql.includes('INSERT INTO fiscal.dctfweb_declaration')) {
                payloadXml = String(values[5]);
                payloadXmlHash = String(values[6]);
                return { rows: [{ id: declarationId }] };
              }

              if (sql.includes('INSERT INTO fiscal.dctfweb_item')) {
                inserted.push({
                  id: `00000000-0000-4000-8000-${String(inserted.length + 1)
                    .padStart(12, '0')
                    .slice(0, 12)}`,
                  sourceEvent: values[2] as DctfwebSourceEvent,
                  sourceRunId: String(values[3]),
                  debitCode: String(values[4]),
                  baseAmount: String(values[5]),
                  amount: String(values[6]),
                });
              }

              return { rows: [] };
            }),
          }),
      ),
    };
    const builder = new DctfwebBuilderService(database as never);

    const generated = await RequestContextStore.run(
      {
        tenantId,
        permissions: ['fiscal.dctfweb.read', 'fiscal.dctfweb.write'],
      },
      () => builder.generate({ year: 2026, month: 1 }),
    );
    const signed = signedDeclaration(generated);
    const declarations = { find: jest.fn(async () => signed) };
    const receiptService = {
      process: jest.fn(async (input) => ({
        ...signed,
        status: input.accepted ? 'ACCEPTED' : 'REJECTED',
        transmittedXmlHash: 'c'.repeat(64),
        receiptNumber: input.receiptNumber,
        receiptAt: input.receiptAt.toISOString(),
      })),
    };
    const transmitter = new DctfwebTransmitterService(
      config({ DCTFWEB_RFB_ENDPOINT_URL: 'http://rfb.test/dctfweb' }),
      declarations as never,
      receiptService as never,
    );

    let transmittedXml = '';
    jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      transmittedXml = String(init?.body ?? '');
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ accepted: true, receiptNumber: 'RFB-5011-5013' }),
      } as Response;
    });

    const transmitted = await transmitter.transmit(declarationId);

    expect(transmitted.status).toBe('ACCEPTED');
    expect(generated.competence).toBe(competence);
    expect(transmittedXml).toContain('<competencia>2026-01</competencia>');
    expect(transmittedTotalsByEvent(transmittedXml)).toEqual(
      expectedTotalsByEvent(totalizers),
    );
    expect(transmitted.totalAmount).toBe(
      moneyFromCents(sumTotalizers(totalizers, (item) => item.amount)),
    );
  });
});

function acceptedTotalizers(): TotalizerRow[] {
  return [
    {
      kind: 'S-5011',
      source_event_recibo: '1.1.0000000000000001299',
      payload: {
        items: [
          item(
            '00000000-0000-4000-8000-000000005111',
            '1082-01',
            '1000.00',
            '201.23',
          ),
          item(
            '00000000-0000-4000-8000-000000005112',
            '1138-01',
            '50.00',
            '8.77',
          ),
        ],
      },
    },
    {
      kind: 'S-5013',
      source_event_recibo: '1.1.0000000000000001299',
      payload: {
        items: [
          item(
            '00000000-0000-4000-8000-000000005131',
            'FGTS',
            '800.00',
            '64.00',
          ),
        ],
      },
    },
  ];
}

function item(
  sourceRunId: string,
  debitCode: string,
  baseAmount: string,
  amount: string,
) {
  return { sourceRunId, debitCode, baseAmount, amount };
}

function signedDeclaration(
  generated: DctfwebDeclarationDetailsDto,
): DctfwebDeclarationDetailsDto {
  return {
    ...generated,
    status: 'SIGNED',
    signedXmlRef: 's3://signed.xml',
    signedXml: generated.payloadXml,
    signedXmlHash: 'b'.repeat(64),
  };
}

function config(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as ConfigService;
}

function declarationRow(input: {
  payloadXml: string;
  payloadXmlHash: string;
  totalBaseAmount: string;
  totalAmount: string;
}) {
  return {
    id: declarationId,
    competence,
    kind: 'ORIGINAL',
    status: 'DRAFT',
    original_declaration_id: null,
    payload_xml_ref: 's3://payload.xml',
    payload_xml: input.payloadXml,
    payload_xml_hash: input.payloadXmlHash,
    signed_xml_ref: null,
    signed_xml: null,
    signed_xml_hash: null,
    transmitted_xml_hash: null,
    receipt_number: null,
    receipt_at: null,
    item_count: 3,
    total_base_amount: input.totalBaseAmount,
    total_amount: input.totalAmount,
    created_at: '2026-05-02T12:00:00.000Z',
    updated_at: '2026-05-02T12:00:00.000Z',
  };
}

function itemRow(item: InsertedItem) {
  return {
    id: item.id,
    source_event: item.sourceEvent,
    source_run_id: item.sourceRunId,
    debit_code: item.debitCode,
    base_amount: item.baseAmount,
    amount: item.amount,
  };
}

function expectedTotalsByEvent(
  totalizers: TotalizerRow[],
): Record<DctfwebSourceEvent, string> {
  return {
    S5011: moneyFromCents(
      sumTotalizers(
        totalizers.filter((row) => row.kind === 'S-5011'),
        (entry) => entry.amount,
      ),
    ),
    S5012: '0.00',
    S5013: moneyFromCents(
      sumTotalizers(
        totalizers.filter((row) => row.kind === 'S-5013'),
        (entry) => entry.amount,
      ),
    ),
  };
}

function transmittedTotalsByEvent(
  xml: string,
): Record<DctfwebSourceEvent, string> {
  return {
    S5011: moneyFromCents(sumXmlValues(xml, 'S5011')),
    S5012: moneyFromCents(sumXmlValues(xml, 'S5012')),
    S5013: moneyFromCents(sumXmlValues(xml, 'S5013')),
  };
}

function sumXmlValues(xml: string, sourceEvent: DctfwebSourceEvent): number {
  const pattern = new RegExp(
    `<debito\\b(?=[^>]*sourceEvent="${sourceEvent}")(?=[^>]*valor="([^"]+)")[^>]*/>`,
    'g',
  );
  return [...xml.matchAll(pattern)].reduce(
    (sum, match) => sum + cents(match[1]),
    0,
  );
}

function sumTotalizers(
  totalizers: TotalizerRow[],
  select: (item: TotalizerRow['payload']['items'][number]) => string,
): number {
  return totalizers.reduce(
    (sum, totalizer) =>
      sum +
      totalizer.payload.items.reduce(
        (itemSum, totalizerItem) => itemSum + cents(select(totalizerItem)),
        0,
      ),
    0,
  );
}

function sumItems(
  items: InsertedItem[],
  select: (item: InsertedItem) => string,
): number {
  return items.reduce((sum, item) => sum + cents(select(item)), 0);
}

function cents(value: string): number {
  const [reais, centavos = ''] = value.split('.');
  return Number(reais) * 100 + Number(centavos.padEnd(2, '0').slice(0, 2));
}

function moneyFromCents(value: number): string {
  return `${Math.trunc(value / 100)}.${String(value % 100).padStart(2, '0')}`;
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
