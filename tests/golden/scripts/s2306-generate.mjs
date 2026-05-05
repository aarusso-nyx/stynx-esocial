import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildS2306 } from '../../../packages/domain/dist/index.js';

const root = new URL('../../..', import.meta.url).pathname;
const dto = JSON.parse(
  readFileSync(join(root, 'tests/golden/fixtures/s2306.dto.json'), 'utf8'),
);
const built = buildS2306(dto);

writeFileSync(
  join(root, 'docs/templates/golden/builders/s2306.golden.xml'),
  built.xml,
);
