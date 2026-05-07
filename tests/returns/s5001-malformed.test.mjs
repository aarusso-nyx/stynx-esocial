import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { parseTotalizerXml } from '../../packages/domain/dist/index.js';

const root = new URL('../..', import.meta.url).pathname;

test('S-5001 totalizer parser rejects malformed XML', () => {
  assert.throws(
    () => parseTotalizerXml(malformed('s5001-totalizer.golden.xml')),
    /Invalid eSocial totalizer XML/u,
  );
});

function malformed(fileName) {
  return readFileSync(join(root, 'docs/templates/golden/returns', fileName), 'utf8')
    .replace(/<\/eSocial>\s*$/u, '');
}
