import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = new URL('../..', import.meta.url).pathname;

const activeEvents = [
  's1000',
  's1005',
  's1010',
  's1020',
  's1050',
  's1070',
  's1200',
  's1202',
  's1207',
  's1210',
  's1298',
  's1299',
  's2200',
  's2205',
  's2206',
  's2210',
  's2220',
  's2230',
  's2240',
  's2298',
  's2299',
  's2300',
  's2306',
  's2399',
  's2400',
  's2405',
  's2410',
  's2416',
  's2418',
  's2420',
  's2501',
  's3000',
];

test('active builder golden variant folders retain at least two committed variants each', () => {
  for (const event of activeEvents) {
    const dir = join(root, 'docs/templates/golden/builders', event);
    const files = readdirSync(dir).filter((fileName) =>
      new RegExp(`^${event}\\.[a-z0-9-]+\\.golden\\.xml$`, 'u').test(fileName),
    );

    assert.equal(files.length >= 2, true, `${event} has ${files.length} variants`);
    for (const fileName of files) {
      const xml = readFileSync(join(dir, fileName), 'utf8');
      assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n/u, fileName);
      assert.match(xml, /<eSocial xmlns=/u, fileName);
      assert.equal(xml.endsWith('\n'), true, fileName);
    }
  }
});
