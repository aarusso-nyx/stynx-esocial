import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const migrationDir = join(root, 'infra/migrations');
const databaseUrl =
  process.env.DATABASE_URL ??
  process.env.ESOCIAL_DATABASE_URL ??
  defaultDevDatabaseUrl();
const migrationFiles = readdirSync(migrationDir)
  .filter((fileName) => fileName.endsWith('.sql'))
  .sort()
  .map((fileName) => join(migrationDir, fileName));

const migrationSources = migrationFiles.map((fileName) => ({
  fileName,
  source: readFileSync(fileName, 'utf8'),
}));

assertMigrationCanaries(migrationSources.map((migration) => migration.source).join('\n'));
ensureTargetDatabase(databaseUrl);
ensureMigrationLedger(databaseUrl);

let appliedCount = 0;
let skippedCount = 0;

for (const migration of migrationSources) {
  const fileLabel = basename(migration.fileName);
  const checksum = sha256(migration.source);
  const existingChecksum = appliedChecksum(databaseUrl, fileLabel);

  if (existingChecksum) {
    if (existingChecksum !== checksum) {
      throw new Error(`[migrate:dev] applied migration checksum changed for ${fileLabel}`);
    }
    skippedCount += 1;
    continue;
  }

  runPsql(databaseUrl, ['-f', migration.fileName], fileLabel);
  recordAppliedMigration(databaseUrl, fileLabel, checksum);
  appliedCount += 1;
}

console.log(
  `[migrate:dev] applied ${appliedCount} migrations, skipped ${skippedCount} already-applied migrations on ${redactDatabaseUrl(databaseUrl)}`,
);

function assertMigrationCanaries(source) {
  if (/stynx_esocial/iu.test(source)) {
    throw new Error('[migrate:dev] migration reintroduces stynx_esocial schema naming');
  }
  if (/REFERENCES\s+(public|hr|payroll|esocial)\./iu.test(source)) {
    throw new Error('[migrate:dev] migration contains an SGP schema foreign key');
  }
  if (/postgres_fdw|CREATE\s+SERVER|CREATE\s+USER\s+MAPPING/iu.test(source)) {
    throw new Error('[migrate:dev] forbidden cross-database access primitive found');
  }
  if (!/ENABLE\s+ROW\s+LEVEL\s+SECURITY/iu.test(source)) {
    throw new Error('[migrate:dev] migrations must preserve tenant RLS posture');
  }
  if (!/app\.current_tenant_id/u.test(source)) {
    throw new Error('[migrate:dev] migrations must document the tenant RLS context');
  }
  if (!/esocial_worker/u.test(source)) {
    throw new Error('[migrate:dev] migrations must define the worker-role bypass');
  }
  if (!/sgp\.esocial\.audit/u.test(source)) {
    throw new Error('[migrate:dev] audit publishing topic must be documented');
  }
  if (/certificate_(?:pem|pfx|bytes)|private_key|(?:pem|pfx)_bytes/iu.test(source)) {
    throw new Error('[migrate:dev] migrations must not store certificate bytes or private keys');
  }
}

function runPsql(url, args, label) {
  const result = spawnSync(
    'psql',
    ['-X', '-v', 'ON_ERROR_STOP=1', url, ...args],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  if (result.error) {
    throw new Error(`[migrate:dev] failed to run psql: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(
      `[migrate:dev] psql failed while applying ${label}\n${result.stderr.trim()}`,
    );
  }

  return result;
}

function ensureTargetDatabase(url) {
  const parsed = new URL(url);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//u, ''));

  if (!databaseName || databaseName === 'postgres') return;

  const maintenanceUrl = new URL(url);
  maintenanceUrl.pathname = '/postgres';
  const exists = runPsql(maintenanceUrl.toString(), [
    '-Atc',
    `SELECT 1 FROM pg_database WHERE datname = ${quoteLiteral(databaseName)}`,
  ], `database lookup ${databaseName}`).stdout.trim();

  if (exists === '1') return;

  runPsql(maintenanceUrl.toString(), [
    '-c',
    `CREATE DATABASE ${quoteIdent(databaseName)}`,
  ], `database create ${databaseName}`);
}

function ensureMigrationLedger(url) {
  runPsql(url, [
    '-c',
    `
      CREATE SCHEMA IF NOT EXISTS esocial;
      CREATE TABLE IF NOT EXISTS esocial.schema_migration (
        file_name text PRIMARY KEY,
        checksum_sha256 text NOT NULL,
        applied_at timestamp with time zone NOT NULL DEFAULT now()
      );
    `,
  ], 'schema_migration ledger');
}

function appliedChecksum(url, fileLabel) {
  return runPsql(url, [
    '-Atc',
    `
      SELECT checksum_sha256
      FROM esocial.schema_migration
      WHERE file_name = ${quoteLiteral(fileLabel)}
    `,
  ], `schema_migration lookup ${fileLabel}`).stdout.trim();
}

function recordAppliedMigration(url, fileLabel, checksum) {
  runPsql(url, [
    '-c',
    `
      INSERT INTO esocial.schema_migration (file_name, checksum_sha256)
      VALUES (${quoteLiteral(fileLabel)}, ${quoteLiteral(checksum)})
    `,
  ], `schema_migration record ${fileLabel}`);
}

function sha256(source) {
  return createHash('sha256').update(source).digest('hex');
}

function quoteLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function quoteIdent(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function redactDatabaseUrl(url) {
  const parsed = new URL(url);
  if (parsed.password) {
    parsed.password = '***';
  }
  return parsed.toString();
}

function defaultDevDatabaseUrl() {
  const user = encodeURIComponent(process.env.USER ?? 'postgres');
  return `postgresql://${user}@localhost:5432/esocial_round0_dev`;
}
