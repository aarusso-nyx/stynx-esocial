import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildS2298Worker } from '../../../packages/domain/dist/index.js';

const root = new URL('../../..', import.meta.url).pathname;
const dto = JSON.parse(
  readFileSync(join(root, 'tests/golden/fixtures/s2298.dto.json'), 'utf8'),
);
const built = buildS2298Worker(dto);

writeFileSync(
  join(root, 'docs/templates/golden/builders/s2298.golden.xml'),
  built.xml,
);
