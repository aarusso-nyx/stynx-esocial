import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { AuditService } from '../../backend/src/audit/audit.service';
import { DatabaseService } from '../../backend/src/database/database.service';
import { TceModule } from '../../backend/src/tce/tce.module';
import { FakeTceDatabase } from '../../backend/src/tce/registry/adapter-registry.service.spec';

describe('TCE-01 adapter contract (e2e)', () => {
  let app: INestApplication;
  const database = new FakeTceDatabase();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), TceModule.register()],
    })
      .overrideProvider(DatabaseService)
      .useValue(database)
      .overrideProvider(AuditService)
      .useValue({ auditMutation: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('boots, discovers noop, and returns the registered adapter', async () => {
    const response = await request(app.getHttpServer() as SupertestApp)
      .get('/v1/tce/adapters')
      .expect(200);

    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          adapterId: 'noop',
          stateCode: 'XX',
          organKind: 'TCE',
          version: '0.0.1',
        }),
      ]),
    );
    expect(response.body.length).toBeGreaterThanOrEqual(1);
    expect(database.registryRows).toEqual(
      expect.arrayContaining([expect.objectContaining({ adapter_id: 'noop' })]),
    );
    expect(
      response.body.map((adapter: { adapterId: string }) => adapter.adapterId),
    ).toEqual(
      expect.arrayContaining([
        'tce-ba',
        'tce-ce',
        'tce-df',
        'tce-go',
        'tce-mg',
        'tce-pe',
        'tce-pr',
        'tce-rj',
        'tce-rs',
        'tce-sc',
      ]),
    );
  });
});
