import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { AppModule } from '../../backend/src/app.module';
import { CognitoJwtService } from '../../backend/src/auth/cognito-jwt.service';
import { DatabaseService } from '../../backend/src/database/database.service';
import {
  LGPD_RIGHT_TYPES,
  LgpdRightType,
} from '../../backend/src/portal/lgpd-rights.dto';

const tenantId = '00000000-0000-0000-0000-000000000100';
const employeeId = '00000000-0000-4000-8000-000000000043';
const flowKey = 'payroll.payslip_pdf';
const createdAt = new Date('2026-05-02T12:00:00.000Z');
const dueAt = new Date('2026-07-31T12:00:00.000Z');

class FakeLgpdRightsDatabase {
  readonly configured = true;
  readonly createdRightTypes: LgpdRightType[] = [];
  auditEvents = 0;

  async query<T>(sql: string, values: readonly unknown[] = []): Promise<T[]> {
    if (sql.includes('sgp_append_audit_event')) {
      this.auditEvents += 1;
      return [{ id: `audit-${this.auditEvents}` }] as T[];
    }
    if (
      sql.includes('FROM lgpd.legal_basis_rule') &&
      !sql.includes('JOIN lgpd.legal_basis_rule')
    ) {
      return [legalBasisRow(String(values[0] ?? flowKey))] as T[];
    }
    if (sql.includes('FROM lgpd.ropa_entry entry')) {
      return [
        {
          ropa_entry_id: '00000000-0000-4000-8000-000000000239',
          legal_basis_rule_id: '00000000-0000-4000-8000-000000000240',
          retention_rule: 'Retain official payslips under fiscal control duty.',
          sharing_scope: 'internal_employee_portal',
        },
      ] as T[];
    }
    if (sql.includes('INSERT INTO lgpd.data_subject_request')) {
      const rightType = values[3] as LgpdRightType;
      this.createdRightTypes.push(rightType);
      return [
        {
          id: `00000000-0000-4000-8000-000000000${String(this.createdRightTypes.length).padStart(3, '0')}`,
          tenant_id: tenantId,
          flow_key: values[2],
          right_type: rightType,
          status: 'PENDING_TRIAGE',
          request_description: values[4],
          requested_by_sub: values[5],
          requested_by_login: values[6],
          data_subject_employee_id: values[7],
          sla_started_at: createdAt,
          sla_due_at: dueAt,
          triage_outcome: values[8],
          retention_rule_snapshot: values[9],
          sharing_scope_snapshot: values[10],
          created_at: createdAt,
          updated_at: createdAt,
        },
      ] as T[];
    }
    return [] as T[];
  }
}

describe('LGPD titular rights portal API (e2e)', () => {
  let app: INestApplication;
  let database: FakeLgpdRightsDatabase;

  beforeAll(async () => {
    database = new FakeLgpdRightsDatabase();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CognitoJwtService)
      .useValue({
        verifyAuthorizationHeader: jest.fn(async () => ({
          sub: 'employee-sub',
          username: 'employee.local',
          tenantId,
          groups: [],
          permissions: ['portal.profile.write'],
          claims: { employee_id: employeeId },
        })),
      })
      .overrideProvider(DatabaseService)
      .useValue(database)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('creates request tickets for all six accepted LGPD Art. 18 right types', async () => {
    for (const rightType of LGPD_RIGHT_TYPES) {
      await request(app.getHttpServer() as SupertestApp)
        .post('/api/portal/v1/lgpd/direitos')
        .set('Authorization', 'Bearer fake')
        .send({
          rightType,
          flowKey,
          description: `Portal request for ${rightType}`,
        })
        .expect(201)
        .expect(({ body }) => {
          expect(body.rightType).toBe(rightType);
          expect(body.flowKey).toBe(flowKey);
          expect(body.status).toBe('PENDING_TRIAGE');
          expect(body.dataSubjectEmployeeId).toBe(employeeId);
          expect(body.sla.startedAt).toBe(createdAt.toISOString());
          expect(body.sla.dueAt).toBe(dueAt.toISOString());
          expect(body.triage.retentionRule).toContain('payslips');
          if (
            rightType === 'ANONYMIZATION_BLOCKING_DELETION' ||
            rightType === 'CONSENT_DELETION'
          ) {
            expect(body.triage.outcome).toBe('RETENTION_RESTRICTED');
          } else {
            expect(body.triage.outcome).toBe('EXECUTABLE');
          }
        });
    }

    expect(database.createdRightTypes).toEqual([...LGPD_RIGHT_TYPES]);
    expect(database.auditEvents).toBe(LGPD_RIGHT_TYPES.length);
  });
});

function legalBasisRow(candidateFlowKey: string) {
  return {
    flow_key: candidateFlowKey,
    flow_name: 'Official payslip PDF/A',
    data_category: 'MIXED',
    legal_basis_code: 'LGPD_ART_7_II',
    legal_basis_article: 'LGPD art. 7, II',
    sensitive_basis_code: 'LGPD_ART_11_II_A',
    sensitive_basis_article: 'LGPD art. 11, II, a',
    purpose: 'Generate payslips.',
    data_subjects: ['public employee'],
    data_categories: ['CPF'],
    source_tables: ['hr.employee'],
    read_surfaces: ['employee portal'],
    retention_rule: 'Retain official payslips under fiscal control duty.',
    sharing_scope: 'internal_employee_portal',
    requires_consent: false,
    requires_dpia: true,
    decision_record_anchor: 'ADR-LGPD-001',
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
