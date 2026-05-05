import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;

test('contracts package uses locked esocial naming and class taxonomy', () => {
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
    join(root, 'infra/migrations/001-esocial-core.sql'),
    'utf8',
  );
  assert.doesNotMatch(migration, /REFERENCES\s+(public|hr|payroll|esocial)\./i);
  assert.doesNotMatch(migration, /postgres_fdw|CREATE\s+SERVER|USER\s+MAPPING/i);
});

test('documentation lists lifted events and keeps XML examples', () => {
  const eventsDoc = readFileSync(join(root, 'docs/events.md'), 'utf8');
  for (const event of [
    'S-1000',
    'S-1200',
    'S-1299',
    'S-2200',
    'S-2298',
    'S-2306',
    'S-2400',
    'S-2501',
    'S-3000',
    'S-5011',
  ]) {
    assert.match(eventsDoc, new RegExp(`\\b${event}\\b`));
  }

  for (const example of [
    'docs/templates/golden/builders/s1000.golden.xml',
    'docs/templates/golden/builders/s1299.golden.xml',
    'docs/templates/golden/builders/s3000.golden.xml',
    'docs/templates/golden/returns/s5011-totalizer.golden.xml',
  ]) {
    assert.ok(readFileSync(join(root, example), 'utf8').startsWith('<'));
  }
});
