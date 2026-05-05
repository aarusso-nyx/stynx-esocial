import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App as SupertestApp } from 'supertest/types';

import { DatabaseService } from '../../backend/src/database/database.service';
import { DocumentsStorageService } from '../../backend/src/documents/documents-storage.service';
import {
  PERMISSIONS,
  Permission,
} from '../../backend/src/iam/permissions/permission-catalog.generated';
import { AppModule } from './../../backend/src/app.module';

interface FakeJobPositionRow {
  id: string;
  code: string;
  name: string;
  description: string;
  active: boolean;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

interface FakeDocumentAttachmentRow {
  id: string;
  owner_type: string;
  owner_id: string | null;
  file_name: string;
  content_type: string;
  size_bytes: number | null;
  storage_kind: string;
  storage_key: string;
  created_at: Date;
}

const fakeProfilePermissions: Record<string, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  AUDITORIA: ['auth.read', 'auditoria.read'],
  CONVENIO: ['auth.read', 'convenio.read', 'convenio.write'],
  FOLHA: [
    'auth.read',
    'gestao.read',
    'rh.read',
    'folha.read',
    'folha.write',
    'relatorio.generate',
  ],
  RELATORIO: ['auth.read', 'relatorio.read', 'relatorio.generate'],
  RH: ['auth.read', 'gestao.read', 'rh.read', 'rh.write', 'relatorio.generate'],
};

class FakeDatabaseService {
  readonly configured = true;
  private readonly uploadSessionId = '00000000-0000-4000-8000-000000000111';

  private readonly jobPositions: FakeJobPositionRow[] = [
    this.row(
      'cargo-analista',
      'ANL',
      'Analista',
      'Cargo administrativo observado.',
    ),
    this.row('cargo-tecnico', 'TEC', 'Tecnico', 'Cargo operacional observado.'),
  ];

  private readonly documentAttachments: FakeDocumentAttachmentRow[] = [
    {
      id: 'doc-1',
      owner_type: 'report_request',
      owner_id: 'report-1',
      file_name: 'report.pdf',
      content_type: 'application/pdf',
      size_bytes: 20,
      storage_kind: 'S3',
      storage_key: 'documents/report_request/doc-1-report.pdf',
      created_at: new Date('2026-04-16T00:00:00.000Z'),
    },
  ];

  query<T>(sql: string, values: readonly unknown[] = []): Promise<T[]> {
    if (sql.includes('SELECT gen_random_uuid()::text AS id')) {
      return Promise.resolve([{ id: 'doc-upload-1' }] as T[]);
    }

    if (
      sql.includes('FROM public.access_profile ap') &&
      sql.includes('JOIN public.profile_permission pp') &&
      sql.includes('JOIN public.permission p') &&
      sql.includes('SELECT DISTINCT p.key')
    ) {
      return Promise.resolve(this.permissionRowsForGroups(values[0]) as T[]);
    }

    if (
      sql.includes('FROM public.access_profile ap') &&
      sql.includes('LEFT JOIN public.profile_permission pp') &&
      sql.includes('LEFT JOIN public.permission p') &&
      sql.includes('GROUP BY ap.code')
    ) {
      return Promise.resolve(this.groupMappingRows() as T[]);
    }

    if (
      sql.includes('SELECT count(*)::text AS total') &&
      sql.includes('FROM public.document_attachment')
    ) {
      return Promise.resolve([
        { total: String(this.documentAttachments.length) },
      ] as T[]);
    }

    if (
      sql.includes('SELECT id, owner_type, owner_id::text, file_name') &&
      sql.includes('FROM public.document_attachment d')
    ) {
      return Promise.resolve(this.documentAttachments as T[]);
    }

    if (sql.includes('INSERT INTO public.document_upload_session')) {
      return Promise.resolve([{ id: this.uploadSessionId }] as T[]);
    }

    if (
      sql.includes('FROM public.document_upload_session') &&
      sql.includes('WHERE id = $1::uuid')
    ) {
      return Promise.resolve([
        {
          id: this.uploadSessionId,
          document_id: 'doc-upload-1',
          status: 'PENDING',
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          owner_type: 'report_request',
          owner_id: 'report-1',
          file_name: 'upload.pdf',
          content_type: 'application/pdf',
          size_bytes: 50,
          storage_key: 'documents/report_request/doc-upload-1-upload.pdf',
        },
      ] as T[]);
    }

    if (sql.includes('INSERT INTO public.document_attachment')) {
      const created: FakeDocumentAttachmentRow = {
        id: this.valueAsString(values[0]),
        owner_type: this.valueAsString(values[1]),
        owner_id: this.valueAsString(values[2]) || null,
        file_name: this.valueAsString(values[3]),
        content_type: this.valueAsString(values[4]),
        size_bytes: Number(values[5] ?? 0),
        storage_kind: 'S3',
        storage_key: this.valueAsString(values[6]),
        created_at: new Date('2026-04-16T00:00:00.000Z'),
      };
      this.documentAttachments.unshift(created);
      return Promise.resolve([created] as T[]);
    }

    if (
      sql.includes('SELECT') &&
      sql.includes('FROM public.document_attachment') &&
      sql.includes('WHERE id = $1::uuid')
    ) {
      const found = this.documentAttachments.find(
        (row) => row.id === values[0],
      );
      return Promise.resolve((found ? [found] : []) as T[]);
    }

    if (sql.includes('INSERT INTO public.document_download_audit')) {
      return Promise.resolve([] as T[]);
    }

    if (sql.includes('SELECT count(*)::text AS total FROM hr.job_position')) {
      return Promise.resolve([
        { total: String(this.filtered(values).length) },
      ] as T[]);
    }

    if (sql.includes('FROM hr.job_position')) {
      const pageSize = Number(values.at(-2) ?? 20);
      const offset = Number(values.at(-1) ?? 0);
      return Promise.resolve(
        this.filtered(values).slice(offset, offset + pageSize) as T[],
      );
    }

    if (sql.includes('INSERT INTO hr.job_position')) {
      const duplicate = this.jobPositions.find((row) => row.code === values[0]);
      if (duplicate)
        throw Object.assign(new Error('duplicate key'), { code: '23505' });
      const created = this.row(
        '00000000-0000-4000-8000-000000000001',
        this.valueAsString(values[0]),
        this.valueAsString(values[1]),
        this.valueAsString(values[2]),
        values[3] !== 'INACTIVE',
      );
      this.jobPositions.unshift(created);
      return Promise.resolve([created] as T[]);
    }

    if (sql.includes('UPDATE hr.job_position') && sql.includes('status = $5')) {
      const found = this.jobPositions.find((row) => row.id === values[0]);
      if (!found) return Promise.resolve([] as T[]);
      found.code = this.valueAsString(values[1]);
      found.name = this.valueAsString(values[2]);
      found.description = this.valueAsString(values[3]);
      found.active = values[4] !== 'INACTIVE';
      found.updated_at = new Date();
      return Promise.resolve([found] as T[]);
    }

    if (sql.includes('UPDATE hr.job_position') && sql.includes("'INACTIVE'")) {
      const found = this.jobPositions.find((row) => row.id === values[0]);
      if (!found) return Promise.resolve([] as T[]);
      found.active = false;
      found.updated_at = new Date();
      return Promise.resolve([found] as T[]);
    }

    return Promise.resolve([] as T[]);
  }

  private permissionRowsForGroups(
    groupsValue: unknown,
  ): Array<{ key: string }> {
    const groups = Array.isArray(groupsValue) ? groupsValue : [];
    const keys = new Set<Permission>();
    for (const group of groups) {
      if (typeof group !== 'string') continue;
      for (const permission of fakeProfilePermissions[group] ?? []) {
        keys.add(permission);
      }
    }
    return [...keys].sort().map((key) => ({ key }));
  }

  private groupMappingRows(): Array<{
    group_code: string;
    permissions: string[];
  }> {
    return Object.entries(fakeProfilePermissions)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([group_code, permissions]) => ({
        group_code,
        permissions: [...permissions].sort(),
      }));
  }

  private filtered(values: readonly unknown[]): FakeJobPositionRow[] {
    const search = this.valueAsString(values[0])
      .replaceAll('%', '')
      .toLowerCase();
    const rows = [...this.jobPositions].sort((left, right) =>
      left.code.localeCompare(right.code),
    );
    if (!search) return rows;
    return rows.filter((row) =>
      `${row.code} ${row.name} ${row.description}`
        .toLowerCase()
        .includes(search),
    );
  }

  private valueAsString(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean')
      return String(value);
    return '';
  }

  private row(
    id: string,
    code: string,
    name: string,
    description: string,
    active = true,
  ): FakeJobPositionRow {
    const now = new Date('2026-04-16T00:00:00.000Z');
    return {
      id,
      code,
      name,
      description,
      active,
      metadata: {},
      created_at: now,
      updated_at: now,
    };
  }
}

class FakeDocumentsStorageService {
  readonly bucket = 'sgp-docs-test';
  readonly keyPrefix = 'documents';

  configured(): boolean {
    return true;
  }

  createPresignedUpload(input: {
    storageKey: string;
    contentType: string;
  }): Promise<{
    url: string;
    requiredHeaders: Record<string, string>;
    expiresAt: string;
  }> {
    return Promise.resolve({
      url: `https://s3.example/upload/${input.storageKey}`,
      requiredHeaders: { 'content-type': input.contentType },
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    });
  }

  createPresignedDownload(
    storageKey: string,
  ): Promise<{ url: string; expiresAt: string }> {
    return Promise.resolve({
      url: `https://s3.example/download/${storageKey}`,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    });
  }

  ensureObjectExists(): Promise<void> {
    return Promise.resolve();
  }
}

interface HealthResponseBody {
  ok: boolean;
  service: string;
}

interface ReadyResponseBody {
  checks: {
    config: {
      ok: boolean;
      auth: {
        jwksConfigured: boolean;
        issuerConfigured: boolean;
        audienceConfigured: boolean;
        unsignedTestTokensEnabled: boolean;
      };
    };
  };
}

interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    status: number;
    path?: string;
    requestId?: string;
    details?: string[];
  };
}

interface SessionResponseBody {
  authenticated: boolean;
  actor: {
    username: string;
    groups: string[];
    permissions: string[];
  };
}

interface PagedResponseBody<T> {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: T[];
}

interface MasterDataResourceBody {
  key: string;
  status: string;
  columns: { key: string; label: string }[];
}

interface MasterDataRecordBody {
  id: string;
  code: string;
  name: string;
  description: string;
  active: boolean;
  metadata: Record<string, unknown>;
}

interface GenericPagedBody {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: unknown[];
}

function encodePart(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function tokenFor(
  groups: string[],
  overrides: Record<string, unknown> = {},
): string {
  const payload = {
    sub: 'test-subject',
    'cognito:username': 'test.user',
    'cognito:groups': groups,
    'custom:tenant_id': '00000000-0000-0000-0000-000000000100',
    exp: Math.floor(Date.now() / 1000) + 3600,
    token_use: 'access',
    ...overrides,
  };

  return `${encodePart({ alg: 'none', typ: 'JWT' })}.${encodePart(payload)}.`;
}

describe('SGP backend foundation (e2e)', () => {
  let app: INestApplication;
  const originalUnsigned = process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS;
  const originalS3Region = process.env.S3_REGION;
  const originalS3Bucket = process.env.S3_DOCUMENTS_BUCKET;
  const originalS3UploadExpires =
    process.env.S3_DOCUMENTS_PRESIGN_EXPIRES_SECONDS;
  const originalS3DownloadExpires =
    process.env.S3_DOCUMENTS_DOWNLOAD_EXPIRES_SECONDS;
  const originalS3Prefix = process.env.S3_DOCUMENTS_KEY_PREFIX;

  function server(): SupertestApp {
    return app.getHttpAdapter().getInstance() as SupertestApp;
  }

  function bodyAs<T>(response: request.Response): T {
    return response.body as unknown as T;
  }

  beforeEach(async () => {
    process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS = 'true';
    process.env.S3_REGION = 'us-east-1';
    process.env.S3_DOCUMENTS_BUCKET = 'sgp-docs-test';
    process.env.S3_DOCUMENTS_PRESIGN_EXPIRES_SECONDS = '900';
    process.env.S3_DOCUMENTS_DOWNLOAD_EXPIRES_SECONDS = '300';
    process.env.S3_DOCUMENTS_KEY_PREFIX = 'documents';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useClass(FakeDatabaseService)
      .overrideProvider(DocumentsStorageService)
      .useClass(FakeDocumentsStorageService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    if (originalUnsigned === undefined) {
      delete process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS;
    } else {
      process.env.AUTH_ALLOW_UNSIGNED_TEST_TOKENS = originalUnsigned;
    }
    if (originalS3Region === undefined) delete process.env.S3_REGION;
    else process.env.S3_REGION = originalS3Region;
    if (originalS3Bucket === undefined) delete process.env.S3_DOCUMENTS_BUCKET;
    else process.env.S3_DOCUMENTS_BUCKET = originalS3Bucket;
    if (originalS3UploadExpires === undefined)
      delete process.env.S3_DOCUMENTS_PRESIGN_EXPIRES_SECONDS;
    else
      process.env.S3_DOCUMENTS_PRESIGN_EXPIRES_SECONDS =
        originalS3UploadExpires;
    if (originalS3DownloadExpires === undefined)
      delete process.env.S3_DOCUMENTS_DOWNLOAD_EXPIRES_SECONDS;
    else
      process.env.S3_DOCUMENTS_DOWNLOAD_EXPIRES_SECONDS =
        originalS3DownloadExpires;
    if (originalS3Prefix === undefined)
      delete process.env.S3_DOCUMENTS_KEY_PREFIX;
    else process.env.S3_DOCUMENTS_KEY_PREFIX = originalS3Prefix;
  });

  it('returns health and propagates a request id', async () => {
    const response = await request(server())
      .get('/api/v1/health')
      .set('x-request-id', 'test-request-0001')
      .expect(200)
      .expect('x-request-id', 'test-request-0001');
    const body = bodyAs<HealthResponseBody>(response);

    expect(body.ok).toBe(true);
    expect(body.service).toBe('sgp-core-api');
  });

  it('returns readiness without exposing secrets', async () => {
    const response = await request(server())
      .get('/api/v1/health/ready')
      .expect(200);
    const body = bodyAs<ReadyResponseBody>(response);

    expect(body.checks.config.ok).toBe(true);
    expect(typeof body.checks.config.auth.jwksConfigured).toBe('boolean');
    expect(typeof body.checks.config.auth.issuerConfigured).toBe('boolean');
    expect(typeof body.checks.config.auth.audienceConfigured).toBe('boolean');
    expect(body.checks.config.auth.unsignedTestTokensEnabled).toBe(true);
  });

  it('rejects missing auth with the standard error shape', async () => {
    const response = await request(server()).get('/api/v1/auth/me').expect(401);
    const body = bodyAs<ErrorResponseBody>(response);

    expect(body.error).toEqual(
      expect.objectContaining({
        code: 'UNAUTHORIZED',
        message: 'Missing bearer token',
        status: 401,
        path: '/api/v1/auth/me',
      }),
    );
    expect(body.error.requestId).toEqual(expect.any(String));
  });

  it('maps Cognito groups to permissions in the session endpoint', async () => {
    const response = await request(server())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${tokenFor(['SGP_RH'])}`)
      .expect(200);
    const body = bodyAs<SessionResponseBody>(response);

    expect(body.authenticated).toBe(true);
    expect(body.actor.username).toBe('test.user');
    expect(body.actor.groups).toEqual(['SGP_RH']);
    expect(body.actor.permissions).toEqual(
      expect.arrayContaining([
        'auth.read',
        'gestao.read',
        'rh.read',
        'rh.write',
      ]),
    );
  });

  it('enforces permissions on protected domain endpoints', async () => {
    const response = await request(server())
      .get('/api/v1/master-data')
      .set('Authorization', `Bearer ${tokenFor(['SGP_CONVENIO'])}`)
      .expect(403);
    const body = bodyAs<ErrorResponseBody>(response);

    expect(body.error).toEqual(
      expect.objectContaining({
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
        status: 403,
      }),
    );
  });

  it('returns a representative paged master-data endpoint', async () => {
    const response = await request(server())
      .get('/api/v1/master-data?page=1&pageSize=2&search=gestao')
      .set('Authorization', `Bearer ${tokenFor(['SGP_ADMIN'])}`)
      .expect(200);
    const body = bodyAs<PagedResponseBody<MasterDataResourceBody>>(response);

    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(2);
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.totalPages).toBeGreaterThanOrEqual(1);
    expect(body.items.length).toBeLessThanOrEqual(2);
    expect(body.items[0]).toEqual(
      expect.objectContaining({ status: 'observed' }),
    );
  });

  it('creates, updates, and deactivates a Gestao master-data record', async () => {
    const token = tokenFor(['SGP_ADMIN']);
    const createResponse = await request(server())
      .post('/api/v1/master-data/cargo')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'QA',
        name: 'Cargo QA',
        description: 'Criado pelo teste e2e',
        active: true,
        metadata: { source: 'e2e' },
      })
      .expect(201);
    const created = bodyAs<MasterDataRecordBody>(createResponse);

    expect(created.id).toEqual(expect.any(String));
    expect(created.code).toBe('QA');
    expect(created.active).toBe(true);

    const updateResponse = await request(server())
      .patch(`/api/v1/master-data/cargo/${created.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'QA2',
        name: 'Cargo QA atualizado',
        description: 'Atualizado pelo teste e2e',
        active: true,
        metadata: { source: 'e2e', revised: true },
      })
      .expect(200);
    const updated = bodyAs<MasterDataRecordBody>(updateResponse);

    expect(updated.code).toBe('QA2');
    expect(updated.name).toBe('Cargo QA atualizado');
    expect(updated.metadata).toEqual({});

    const deleteResponse = await request(server())
      .delete(`/api/v1/master-data/cargo/${created.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const deactivated = bodyAs<MasterDataRecordBody>(deleteResponse);

    expect(deactivated.active).toBe(false);
  });

  it('requires Gestao write permission for master-data mutations', async () => {
    const response = await request(server())
      .post('/api/v1/master-data/cargo')
      .set('Authorization', `Bearer ${tokenFor(['SGP_RH'])}`)
      .send({ code: 'NOPE', name: 'Sem permissao' })
      .expect(403);
    const body = bodyAs<ErrorResponseBody>(response);

    expect(body.error).toEqual(
      expect.objectContaining({
        code: 'FORBIDDEN',
        message: 'Insufficient permissions',
        status: 403,
      }),
    );
  });

  it('validates standard pagination input', async () => {
    const response = await request(server())
      .get('/api/v1/master-data?page=0&pageSize=2')
      .set('Authorization', `Bearer ${tokenFor(['SGP_ADMIN'])}`)
      .expect(400);
    const body = bodyAs<ErrorResponseBody>(response);

    expect(body.error).toEqual(
      expect.objectContaining({
        code: 'BAD_REQUEST',
        message: 'Request validation failed',
        status: 400,
      }),
    );
    expect(body.error.details).toEqual(
      expect.arrayContaining(['page must not be less than 1']),
    );
  });

  it('returns paged RH workflow records for RH readers', async () => {
    const response = await request(server())
      .get('/api/v1/rh/afastamentos')
      .set('Authorization', `Bearer ${tokenFor(['SGP_RH'])}`)
      .expect(200);
    const body = bodyAs<GenericPagedBody>(response);
    expect(body).toEqual(
      expect.objectContaining({
        page: 1,
        pageSize: 20,
      }),
    );
  });

  it('returns another RH workflow route for RH readers', async () => {
    const response = await request(server())
      .get('/api/v1/rh/processos')
      .set('Authorization', `Bearer ${tokenFor(['SGP_RH'])}`)
      .expect(200);
    const body = bodyAs<GenericPagedBody>(response);

    expect(Array.isArray(body.items)).toBe(true);
  });

  it('returns paged payroll runs for Folha readers', async () => {
    const response = await request(server())
      .get('/api/v1/folhas')
      .set('Authorization', `Bearer ${tokenFor(['SGP_FOLHA'])}`)
      .expect(200);
    const body = bodyAs<GenericPagedBody>(response);
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('returns paged agreements for Convenio readers', async () => {
    const response = await request(server())
      .get('/api/v1/convenios')
      .set('Authorization', `Bearer ${tokenFor(['SGP_CONVENIO'])}`)
      .expect(200);
    const body = bodyAs<GenericPagedBody>(response);
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('returns report catalog for Relatorio readers', async () => {
    const response = await request(server())
      .get('/api/v1/relatorios')
      .set('Authorization', `Bearer ${tokenFor(['SGP_RELATORIO'])}`)
      .expect(200);
    const body = bodyAs<GenericPagedBody>(response);
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('returns audit events for Auditoria readers', async () => {
    const response = await request(server())
      .get('/api/v1/auditoria/logs')
      .set('Authorization', `Bearer ${tokenFor(['SGP_AUDITORIA'])}`)
      .expect(200);
    const body = bodyAs<GenericPagedBody>(response);
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('returns notifications and documents endpoints', async () => {
    const token = tokenFor(['SGP_ADMIN']);

    await request(server())
      .get('/api/v1/notificacoes')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(server())
      .get('/api/v1/notificacoes/unread-count')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(server())
      .get('/api/v1/arquivos')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('creates and registers document uploads with relatorio generate permission', async () => {
    const token = tokenFor(['SGP_ADMIN']);

    const presignResponse = await request(server())
      .post('/api/v1/arquivos/presigned-upload')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ownerType: 'report_request',
        ownerId: 'report-1',
        fileName: 'upload.pdf',
        contentType: 'application/pdf',
        sizeBytes: 50,
      })
      .expect(201);
    const presignBody = bodyAs<{ uploadSessionId: string; documentId: string }>(
      presignResponse,
    );
    expect(presignBody.uploadSessionId).toEqual(expect.any(String));
    expect(presignBody.documentId).toBe('doc-upload-1');

    const registerResponse = await request(server())
      .patch(`/api/v1/arquivos/${presignBody.uploadSessionId}/confirmar`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const registerBody = bodyAs<{ id: string }>(registerResponse);
    expect(registerBody.id).toBe('doc-upload-1');
  });

  it('creates document presigned download links and enforces iam catalog permissions', async () => {
    const adminToken = tokenFor(['SGP_ADMIN']);
    const noIamToken = tokenFor(['SGP_RH']);

    await request(server())
      .get('/api/v1/arquivos/doc-1/download')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    await request(server())
      .get('/api/v1/iam/permissions')
      .set('Authorization', `Bearer ${noIamToken}`)
      .expect(403);
  });
});
