import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;

test('contracts package uses locked stynx-esocial naming and class taxonomy', () => {
  const kinds = readFileSync(
    join(root, 'packages/contracts/src/kinds.ts'),
    'utf8',
  );
  for (const token of [
    'submit',
    'tabelas',
    'trabalhador',
    'folha',
    'fechamento',
    'exclusao',
    'retorno',
    'certificado',
  ]) {
    assert.match(kinds, new RegExp(`'${token}'`));
  }
});

test('migrations do not reference SGP schemas or cross-database access', () => {
  const migration = readFileSync(
    join(root, 'infra/migrations/001-stynx-esocial-core.sql'),
    'utf8',
  );
  assert.doesNotMatch(migration, /REFERENCES\s+(public|hr|payroll|esocial)\./i);
  assert.doesNotMatch(migration, /postgres_fdw|CREATE\s+SERVER|USER\s+MAPPING/i);
});
