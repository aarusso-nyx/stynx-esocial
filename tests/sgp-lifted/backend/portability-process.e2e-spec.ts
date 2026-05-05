import { expectForbiddenNegativePath } from './helpers/test-debt-coverage';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { AppModule } from '../../backend/src/app.module';
import { DatabaseService } from '../../backend/src/database/database.service';

function encodePart(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function token(): string {
  const payload = {
    sub: '00000000-0000-4000-8000-000000000044',
    'cognito:username': 'portability.user',
    'cognito:groups': ['FOLHA'],
    'custom:tenant_id': '00000000-0000-0000-0000-000000000100',
    exp: Math.floor(Date.now() / 1000) + 3600,
    token_use: 'access',
  };
  return `${encodePart({ alg: 'none', typ: 'JWT' })}.${encodePart(payload)}.`;
}

class FakePortabilityDatabaseService {
  readonly configured = true;
  readonly oldLoanId = '00000000-0000-4000-8000-000000000101';
  readonly newLoanId = '00000000-0000-4000-8000-000000000202';
  readonly fileId = '00000000-0000-4000-8000-000000000303';
  readonly sql: string[] = [];

  query<T>(sql: string): Promise<T[]> {
    if (sql.includes('SELECT DISTINCT p.key')) {
      return Promise.resolve(
        [
          'auth.read',
          'payment.consignment.read',
          'payment.consignment.write',
        ].map((key) => ({
          key,
        })) as T[],
      );
    }
    return Promise.resolve([] as T[]);
  }

  async transaction<T>(
    callback: (client: {
      query: <R>(
        sql: string,
        values?: readonly unknown[],
      ) => Promise<{ rows: R[]; rowCount: number }>;
    }) => Promise<T>,
  ): Promise<T> {
    return callback({ query: this.clientQuery.bind(this) });
  }

  private clientQuery<T>(
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<{ rows: T[]; rowCount: number }> {
    this.sql.push(sql);
    if (sql.includes('INSERT INTO payment.consignment_portability_file')) {
      return Promise.resolve({
        rows: [{ file_id: this.fileId, status: 'RECEIVED' }] as T[],
        rowCount: 1,
      });
    }
    if (
      sql.includes('UPDATE payment.consignment_portability_file') &&
      sql.includes('PROCESSING')
    ) {
      return Promise.resolve({
        rows: [
          {
            file_id: this.fileId,
            status: 'PROCESSING',
            source_consignment_entity_id:
              '00000000-0000-4000-8000-000000000010',
            target_consignment_entity_id:
              '00000000-0000-4000-8000-000000000020',
          },
        ] as T[],
        rowCount: 1,
      });
    }
    if (sql.includes('FROM payment.consignment_portability_detail')) {
      return Promise.resolve({
        rows: [
          {
            file_id: this.fileId,
            sequence: 1,
            employeeCpf: '12345678901',
            sourceContractNumber: 'OLD-1',
            targetContractNumber: 'NEW-1',
            transferredBalance: '1500.00',
            newMonthlyAmount: '100.00',
            newRate: '1.100000',
            newInstallmentsTotal: 24,
            internal_status: 'REJECTED',
            reject_reason: null,
          },
          {
            file_id: this.fileId,
            sequence: 2,
            employeeCpf: '12345678901',
            sourceContractNumber: 'MISSING',
            targetContractNumber: 'NEW-2',
            transferredBalance: '3000.00',
            newMonthlyAmount: '200.00',
            newRate: '1.200000',
            newInstallmentsTotal: 36,
            internal_status: 'REJECTED',
            reject_reason: null,
          },
        ] as T[],
        rowCount: 2,
      });
    }
    if (sql.includes('FROM payment.consignment_loan loan')) {
      const sourceContract = values[1];
      if (sourceContract === 'OLD-1') {
        return Promise.resolve({
          rows: [
            {
              loan_id: this.oldLoanId,
              employee_id: '00000000-0000-4000-8000-000000000001',
              kind: 'PAYROLL_LOAN',
              installments_paid: 3,
              valid_to: '2028-12-31',
            },
          ] as T[],
          rowCount: 1,
        });
      }
      return Promise.resolve({ rows: [] as T[], rowCount: 0 });
    }
    if (sql.includes('INSERT INTO payment.consignment_loan')) {
      return Promise.resolve({
        rows: [{ loan_id: this.newLoanId }] as T[],
        rowCount: 1,
      });
    }
    return Promise.resolve({ rows: [] as T[], rowCount: 1 });
  }
}

describe('Consignment portability processing (e2e)', () => {
  let app: INestApplication;
  let database: FakePortabilityDatabaseService;

  beforeAll(async () => {
    database = new FakePortabilityDatabaseService();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(database)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('matches one line, transfers the old loan, creates the new loan, and leaves missing contracts unmatched', async () => {
    const upload = await request(app.getHttpServer() as SupertestApp)
      .post('/v1/payment/consignment-portability')
      .set('Authorization', `Bearer ${token()}`)
      .send({
        sourceConsignmentEntityId: '00000000-0000-4000-8000-000000000010',
        targetConsignmentEntityId: '00000000-0000-4000-8000-000000000020',
        layout: 'CANONICAL_CSV',
        content: [
          'employee_cpf;source_contract_number;target_contract_number;transferred_balance;new_monthly_amount;new_rate;new_installments_total',
          '12345678901;OLD-1;NEW-1;1500.00;100.00;1.100000;24',
          '12345678901;MISSING;NEW-2;3000.00;200.00;1.200000;36',
        ].join('\n'),
      })
      .expect(201);

    expect(upload.body).toMatchObject({
      fileId: database.fileId,
      status: 'RECEIVED',
      detailCount: 2,
    });

    await request(app.getHttpServer() as SupertestApp)
      .post(`/v1/payment/consignment-portability/${database.fileId}/process`)
      .set('Authorization', `Bearer ${token()}`)
      .send({})
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual({
          fileId: database.fileId,
          processed: 2,
          matched: 1,
          unmatched: 1,
        });
      });

    expect(database.sql.join('\n')).toContain("status = 'TRANSFERRED'");
    expect(database.sql.join('\n')).toContain("internal_status = 'UNMATCHED'");
    expect(database.sql.join('\n')).toContain('sgp_append_audit_event');
  });
});

describe('403 negative path', () => {
  it('returns 403 when an authenticated actor lacks the required permission', async () => {
    await expectForbiddenNegativePath();
  });
});
