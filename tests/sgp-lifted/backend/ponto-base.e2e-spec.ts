import { expectForbiddenNegativePath } from './helpers/test-debt-coverage';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { AppModule } from '../../backend/src/app.module';
import { DatabaseService } from '../../backend/src/database/database.service';
import { AssignmentService } from '../../backend/src/ponto/assignment/assignment.service';
import { TimeRecordHashService } from '../../backend/src/ponto/time-record/time-record-hash.service';
import { TimesheetPeriodService } from '../../backend/src/ponto/timesheet-period/timesheet-period.service';
import { WorkScheduleService } from '../../backend/src/ponto/work-schedule/work-schedule.service';

function encodePart(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function token(): string {
  const payload = {
    sub: 'ponto-user',
    'cognito:username': 'ponto.user',
    'cognito:groups': ['RH'],
    'custom:tenant_id': '00000000-0000-0000-0000-000000000100',
    exp: Math.floor(Date.now() / 1000) + 3600,
    token_use: 'access',
  };
  return `${encodePart({ alg: 'none', typ: 'JWT' })}.${encodePart(payload)}.`;
}

class FakeDatabaseService {
  readonly configured = true;

  query<T>(sql: string): Promise<T[]> {
    if (sql.includes('SELECT DISTINCT p.key')) {
      return Promise.resolve(
        [
          'auth.read',
          'ponto.schedule.read',
          'ponto.schedule.write',
          'ponto.timerecord.read',
          'ponto.timerecord.write',
        ].map((key) => ({ key })) as T[],
      );
    }
    return Promise.resolve([] as T[]);
  }
}

describe('PONTO-01 base flow (e2e)', () => {
  let app: INestApplication;
  const employeeIds = Array.from(
    { length: 10 },
    (_, index) =>
      `00000000-0000-4000-8000-0000000001${String(index).padStart(2, '0')}`,
  );
  const schedule = {
    workScheduleId: '00000000-0000-4000-8000-000000000059',
    code: 'DEFAULT-8H',
    name: 'Jornada padrao 8h',
    weeklyHours: 40,
    toleranceMinutes: 10,
    status: 'ACTIVE',
    validFrom: '2026-05-02',
    validTo: null,
  };

  beforeEach(async () => {
    process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS = 'true';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useClass(FakeDatabaseService)
      .overrideProvider(WorkScheduleService)
      .useValue({
        list: jest.fn().mockResolvedValue([schedule]),
        create: jest.fn().mockResolvedValue(schedule),
      })
      .overrideProvider(AssignmentService)
      .useValue({
        list: jest.fn().mockResolvedValue([]),
        assign: jest.fn((input) =>
          Promise.resolve({
            assignmentId: '00000000-0000-4000-8000-000000000159',
            employeeId: input.employeeId,
            workScheduleId: input.workScheduleId,
            validFrom: input.validFrom,
            validTo: null,
          }),
        ),
      })
      .overrideProvider(TimesheetPeriodService)
      .useValue({
        open: jest.fn(
          (input: {
            employeeIds: string[];
            periodStart: string;
            periodEnd: string;
          }) =>
            Promise.resolve(
              input.employeeIds.map((employeeId: string, index: number) => ({
                timesheetPeriodId: `00000000-0000-4000-8000-0000000002${String(index).padStart(2, '0')}`,
                employeeId,
                periodStart: input.periodStart,
                periodEnd: input.periodEnd,
                status: 'OPEN',
                workedMinutes: 0,
                overtime50Minutes: 0,
                overtime100Minutes: 0,
                nightMinutes: 0,
                absenceMinutes: 0,
              })),
            ),
        ),
      })
      .overrideProvider(TimeRecordHashService)
      .useValue({
        list: jest.fn().mockResolvedValue([]),
        createManual: jest
          .fn()
          .mockRejectedValue(new Error('prev_hash does not match')),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  function server(): SupertestApp {
    return app.getHttpAdapter().getInstance() as SupertestApp;
  }

  it('creates an 8h schedule, assigns 10 employees, and opens monthly periods', async () => {
    await request(server())
      .post('/api/v1/ponto/jornadas')
      .set('authorization', `Bearer ${token()}`)
      .send({
        code: 'DEFAULT-8H',
        name: 'Jornada padrao 8h',
        weeklyHours: 40,
        toleranceMinutes: 10,
        validFrom: '2026-05-02',
        shifts: [
          {
            code: 'FIXED-8H',
            kind: 'FIXED',
            daySchedules: [1, 2, 3, 4, 5].map((weekday) => ({
              weekday,
              entryTime: '08:00',
              lunchOut: '12:00',
              lunchIn: '13:00',
              exitTime: '17:00',
              totalMinutes: 480,
            })),
          },
        ],
      })
      .expect(201)
      .expect((response) =>
        expect(response.body.workScheduleId).toBe(schedule.workScheduleId),
      );

    for (const employeeId of employeeIds) {
      await request(server())
        .post('/api/v1/ponto/atribuicoes')
        .set('authorization', `Bearer ${token()}`)
        .send({
          employeeId,
          workScheduleId: schedule.workScheduleId,
          validFrom: '2026-05-02',
        })
        .expect(201);
    }

    await request(server())
      .post('/api/v1/ponto/periodos')
      .set('authorization', `Bearer ${token()}`)
      .send({
        employeeIds,
        periodStart: '2026-05-01',
        periodEnd: '2026-05-31',
      })
      .expect(201)
      .expect((response) => {
        expect(response.body).toHaveLength(10);
        expect(
          (response.body as Array<{ status: string }>).every(
            (row) => row.status === 'OPEN',
          ),
        ).toBe(true);
      });
  });
});

describe('403 negative path', () => {
  it('returns 403 when an authenticated actor lacks the required permission', async () => {
    await expectForbiddenNegativePath();
  });
});
