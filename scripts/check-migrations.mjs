import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const mode = process.argv[2] ?? 'test:db';
const migrationDir = join(root, 'infra/migrations');
const sql = readdirSync(migrationDir)
  .filter((fileName) => fileName.endsWith('.sql'))
  .sort()
  .map((fileName) => readFileSync(join(migrationDir, fileName), 'utf8'))
  .join('\n');

if (/REFERENCES\s+(public|hr|payroll|esocial)\./iu.test(sql)) {
  throw new Error(`[${mode}] migration contains an SGP schema foreign key`);
}
if (/postgres_fdw|CREATE\s+SERVER|CREATE\s+USER\s+MAPPING/iu.test(sql)) {
  throw new Error(`[${mode}] forbidden cross-database access primitive found`);
}
if (!/ENABLE\s+ROW\s+LEVEL\s+SECURITY/iu.test(sql)) {
  throw new Error(`[${mode}] migrations must preserve tenant RLS posture`);
}
if (!/sgp\.esocial\.audit/u.test(sql)) {
  throw new Error(`[${mode}] audit publishing topic must be documented`);
}

console.log(`[${mode}] stynx-esocial migration checks passed`);
