import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const mode = process.argv[2] ?? 'lint:migrations';
const migrationDir = join(root, 'infra/migrations');
const migrationFiles = readdirSync(migrationDir)
  .filter((fileName) => fileName.endsWith('.sql'))
  .sort()
  .map((fileName) => join(migrationDir, fileName));

const sql = migrationFiles
  .map((fileName) => readFileSync(fileName, 'utf8'))
  .join('\n');

assertMigrationCanaries(sql, mode);

if (mode === 'migrate:dev') {
  const explicitDatabaseUrl = process.env.ESOCIAL_DATABASE_URL
    ?? process.env.DATABASE_URL;
  const databaseUrl = explicitDatabaseUrl ?? defaultDatabaseUrl();
  ensureDatabaseExists(databaseUrl, {
    reset: process.env.ESOCIAL_MIGRATE_RESET === '1' || !explicitDatabaseUrl,
  });
  applyMigrations(databaseUrl);
  console.log(`[${mode}] applied ${migrationFiles.length} migrations to ${redactDatabaseUrl(databaseUrl)}`);
} else {
  console.log(`[${mode}] esocial migration checks passed`);
}

function assertMigrationCanaries(source, checkMode) {
  if (/stynx_esocial/iu.test(source)) {
    throw new Error(`[${checkMode}] migration reintroduces stynx_esocial schema naming`);
  }
  if (/REFERENCES\s+(public|hr|payroll|esocial)\./iu.test(source)) {
    throw new Error(`[${checkMode}] migration contains an SGP schema foreign key`);
  }
  if (/postgres_fdw|CREATE\s+SERVER|CREATE\s+USER\s+MAPPING/iu.test(source)) {
    throw new Error(`[${checkMode}] forbidden cross-database access primitive found`);
  }
  if (!/ENABLE\s+ROW\s+LEVEL\s+SECURITY/iu.test(source)) {
    throw new Error(`[${checkMode}] migrations must preserve tenant RLS posture`);
  }
  if (!/app\.current_tenant_id/u.test(source)) {
    throw new Error(`[${checkMode}] migrations must document the tenant RLS context`);
  }
  if (!/esocial_worker/u.test(source)) {
    throw new Error(`[${checkMode}] migrations must define the worker-role bypass`);
  }
  if (!/sgp\.esocial\.audit/u.test(source)) {
    throw new Error(`[${checkMode}] audit publishing topic must be documented`);
  }
  if (/certificate_(?:pem|pfx|bytes)|private_key|(?:pem|pfx)_bytes/iu.test(source)) {
    throw new Error(`[${checkMode}] migrations must not store certificate bytes or private keys`);
  }
}

function defaultDatabaseUrl() {
  const user = encodeURIComponent(process.env.USER ?? 'postgres');
  return `postgresql://${user}@localhost:5432/esocial_dev`;
}

function ensureDatabaseExists(databaseUrl, options = {}) {
  const target = new URL(databaseUrl);
  const databaseName = target.pathname.replace(/^\//u, '');
  if (!databaseName) {
    throw new Error(`[${mode}] database URL must include a database name`);
  }

  const maintenanceUrl = withDatabase(databaseUrl, 'postgres');
  const exists = runPsql(maintenanceUrl, [
    '-Atc',
    `SELECT 1 FROM pg_database WHERE datname = ${quoteLiteral(databaseName)}`,
  ]).stdout.trim();

  if (exists === '1' && options.reset) {
    runPsql(maintenanceUrl, ['-c', `DROP DATABASE ${quoteIdent(databaseName)} WITH (FORCE)`]);
    runPsql(maintenanceUrl, ['-c', `CREATE DATABASE ${quoteIdent(databaseName)}`]);
    return;
  }

  if (exists === '1') {
    return;
  }

  runPsql(maintenanceUrl, ['-c', `CREATE DATABASE ${quoteIdent(databaseName)}`]);
}

function applyMigrations(databaseUrl) {
  for (const fileName of migrationFiles) {
    runPsql(databaseUrl, ['-f', fileName], {
      label: basename(fileName),
    });
  }
}

function runPsql(databaseUrl, args, options = {}) {
  const result = spawnSync(
    'psql',
    ['-X', '-v', 'ON_ERROR_STOP=1', databaseUrl, ...args],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  if (result.error) {
    throw new Error(`[${mode}] failed to run psql: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const label = options.label ? ` while applying ${options.label}` : '';
    throw new Error(
      `[${mode}] psql failed${label}\n${result.stderr.trim()}`,
    );
  }

  return result;
}

function withDatabase(databaseUrl, databaseName) {
  const parsed = new URL(databaseUrl);
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

function quoteLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function quoteIdent(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function redactDatabaseUrl(databaseUrl) {
  const parsed = new URL(databaseUrl);
  if (parsed.password) {
    parsed.password = '***';
  }
  return parsed.toString();
}
