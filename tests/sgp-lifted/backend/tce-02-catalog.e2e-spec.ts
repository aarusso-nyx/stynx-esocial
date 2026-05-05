import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { AuditService } from '../../backend/src/audit/audit.service';
import { DatabaseService } from '../../backend/src/database/database.service';
import { TceModule } from '../../backend/src/tce/tce.module';

describe('TCE-02 catalog (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), TceModule.register()],
    })
      .overrideProvider(DatabaseService)
      .useValue(new FakeCatalogE2eDatabase())
      .overrideProvider(AuditService)
      .useValue({ auditMutation: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /tce/states/SP/layouts returns the AUDESP placeholder', async () => {
    const response = await request(app.getHttpServer() as SupertestApp)
      .get('/v1/tce/states/SP/layouts')
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({
        stateCode: 'SP',
        systemName: 'AUDESP',
        version: '0.0.1',
        status: 'DRAFT',
      }),
    ]);
  });
});

class FakeCatalogE2eDatabase {
  readonly configured = true;

  async query<T>(sql: string): Promise<T[]> {
    if (sql.includes('FROM tce.layout_version layout')) {
      return [
        {
          id: 'layout-audesp',
          state_id: 'state-sp',
          state_code: 'SP',
          system_name: 'AUDESP',
          version: '0.0.1',
          effective_from: '2026-01-01',
          effective_to: null,
          status: 'DRAFT',
          publication_url: 'https://www.tce.sp.gov.br/audesp',
          notes: 'Placeholder publico: campos nao embarcados.',
        },
      ] as T[];
    }
    return [] as T[];
  }
}
