import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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
  runMigrationScript();
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

function runMigrationScript() {
  const result = spawnSync(
    process.execPath,
    ['scripts/migrate-dev.mjs'],
    {
      cwd: root,
      encoding: 'utf8',
      env: process.env,
      stdio: 'inherit',
    },
  );

  if (result.error) {
    throw new Error(`[${mode}] failed to start migrate-dev script: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`[${mode}] migrate-dev script failed with exit code ${result.status}`);
  }
}
