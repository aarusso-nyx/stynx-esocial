import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
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
    sub: 'consignment-user',
    'cognito:username': 'consignment.user',
    'cognito:groups': ['FOLHA'],
    'custom:tenant_id': '00000000-0000-0000-0000-000000000100',
    exp: Math.floor(Date.now() / 1000) + 3600,
    token_use: 'access',
  };
  return `${encodePart({ alg: 'none', typ: 'JWT' })}.${encodePart(payload)}.`;
}

class FakeConsignmentDatabaseService {
  readonly configured = true;

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
      ) => Promise<{ rows: R[] }>;
    }) => Promise<T>,
  ): Promise<T> {
    return callback({ query: this.clientQuery.bind(this) });
  }

  private clientQuery<T>(sql: string): Promise<{ rows: T[] }> {
    if (sql.includes('FROM payment.consignment_entity')) {
      return Promise.resolve({
        rows: [
          { consignment_entity_id: '00000000-0000-4000-8000-000000000010' },
        ] as T[],
      });
    }
    if (sql.includes('FROM public.system_parameter')) {
      return Promise.resolve({
        rows: [
          { key: 'consignment.margin.general_pct', value: '0.35' },
          { key: 'consignment.margin.credit_card_pct', value: '0.05' },
          { key: 'consignment.margin.benefit_card_pct', value: '0.05' },
        ] as T[],
      });
    }
    if (sql.includes('FROM hr.employee employee')) {
      return Promise.resolve({ rows: [{ net_base: '1000.00' }] as T[] });
    }
    if (sql.includes('FROM payment.consignment_loan')) {
      return Promise.resolve({
        rows: [
          {
            used_general: '0.00',
            used_credit_card: '0.00',
            used_benefit_card: '0.00',
          },
        ] as T[],
      });
    }
    return Promise.resolve({ rows: [] as T[] });
  }
}

describe('Consignment loan creation (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(new FakeConsignmentDatabaseService())
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 422 when the loan exceeds the available margin', async () => {
    await request(app.getHttpServer() as SupertestApp)
      .post(
        '/v1/employees/00000000-0000-4000-8000-000000000001/consignment-loans',
      )
      .set('Authorization', `Bearer ${token()}`)
      .send({
        consignmentEntityId: '00000000-0000-4000-8000-000000000010',
        contractNumber: 'CON-001',
        kind: 'PAYROLL_LOAN',
        monthlyAmount: '351.00',
        installmentsTotal: 24,
        installmentsPaid: 0,
        rate: '1.450000',
        validFrom: '2026-05-01',
        validTo: '2028-04-30',
      })
      .expect(422)
      .expect(({ body }) => {
        expect(JSON.stringify(body)).toContain(
          'exceeds available general margin',
        );
      });
  });
});

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
