import {
  FROZEN_TEST_TIME,
  expectForbiddenNegativePath,
} from './helpers/test-debt-coverage';
import { Controller, INestApplication, Module, Post } from '@nestjs/common';
import { APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { AuditService } from '../../backend/src/audit/audit.service';
import { AuditRequiredInterceptor } from '../../backend/src/common/audit/audit-required.interceptor';
import { Public } from '../../backend/src/iam/decorators/require-permission.decorator';

@Controller('/audit-prod-fixture')
class AuditProdFixtureController {
  @Post()
  @Public()
  create() {
    return { ok: true };
  }
}

@Module({
  controllers: [AuditProdFixtureController],
  providers: [
    Reflector,
    {
      provide: AuditService,
      useValue: {
        auditMutation: jest.fn(),
      },
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditRequiredInterceptor,
    },
  ],
})
class AuditProdFixtureModule {}

describe('AuditRequiredInterceptor production enforcement', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  let app: INestApplication<SupertestApp>;

  beforeAll(async () => {
    process.env.NODE_ENV = 'production';

    const moduleRef = await Test.createTestingModule({
      imports: [AuditProdFixtureModule],
    }).compile();

    app = moduleRef.createNestApplication<SupertestApp>();
    await app.init();
  });

  afterAll(async () => {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
    await app.close();
  });

  it('rejects a production mutating route without @AuditMutation', async () => {
    const response = await request(app.getHttpServer())
      .post('/audit-prod-fixture')
      .send({ name: 'missing audit metadata' })
      .expect(500);

    expect(response.body).toEqual(
      expect.objectContaining({
        message:
          'Mutating request completed without sgp_append_audit_event audit entry',
      }),
    );
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
