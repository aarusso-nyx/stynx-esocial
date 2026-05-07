import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = new URL('../..', import.meta.url).pathname;
const adrDir = join(root, 'docs/adrs');
const allowedStatuses = new Set(['Accepted', 'Superseded', 'Deprecated', 'Proposed']);

test('ADR index lists every ADR file and points only to existing ADR files', () => {
  const files = readdirSync(adrDir)
    .filter((fileName) => /^[0-9]{4}-.+\.md$/u.test(fileName))
    .sort();
  const rows = parseIndexRows();
  const indexedFiles = rows.map((row) => row.fileName).sort();

  assert.deepEqual(indexedFiles, files);

  for (const row of rows) {
    assert.ok(files.includes(row.fileName), `${row.fileName} is indexed but does not exist`);
    assert.match(row.number, /^[0-9]{4}$/u);
  }
});

test('ADR index status matches each ADR status section', () => {
  const rows = parseIndexRows();

  for (const row of rows) {
    const adr = readFileSync(join(adrDir, row.fileName), 'utf8');
    const status = normalizeStatus(statusFromAdr(adr));

    assert.notEqual(status, '', `${row.fileName} must declare a status`);
    assert.equal(allowedStatuses.has(status), true, `${row.fileName} uses unsupported status ${status}`);
    assert.equal(row.status, status, `${row.fileName} index status mismatch`);
  }
});

function parseIndexRows() {
  const index = readFileSync(join(adrDir, 'README.md'), 'utf8');
  return index
    .split('\n')
    .filter((line) => /^\| \[[0-9]{4}\]\(/u.test(line))
    .map((line) => {
      const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
      const [numberCell, title, status, date, supersedes] = cells;
      const match = /^\[([0-9]{4})\]\(([^)]+)\)$/u.exec(numberCell);
      assert.ok(match, `Invalid ADR index number/link cell: ${numberCell}`);
      assert.equal(allowedStatuses.has(status), true, `Unsupported index status ${status}`);
      assert.match(date, /^\d{4}-\d{2}-\d{2}$/u);
      assert.notEqual(title, '');
      assert.notEqual(supersedes, '');
      return {
        number: match[1],
        fileName: match[2],
        title,
        status,
      };
    });
}

function statusFromAdr(markdown) {
  const match = /## Status\s+([^\n]+)/u.exec(markdown);
  return match?.[1] ?? '';
}

function normalizeStatus(value) {
  const normalized = value.trim().replace(/[.。]+$/u, '');
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
