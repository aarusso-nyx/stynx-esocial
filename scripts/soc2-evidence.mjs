import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const controlsFile = join(root, 'docs/compliance/soc2-control-matrix.md');
const evidenceDir = join(root, 'docs/release/1.2.0/soc2/2026-Q2');
const source = readFileSync(controlsFile, 'utf8');
const controlIds = [...source.matchAll(/\|\s*(SOC2-[A-Z0-9-]+)\s*\|/gu)]
  .map((match) => match[1])
  .filter((id, index, ids) => ids.indexOf(id) === index);

mkdirSync(evidenceDir, { recursive: true });
writeFileSync(
  join(evidenceDir, 'manifest.json'),
  `${JSON.stringify({
    generatedAt: '2026-05-06T00:00:00.000Z',
    status: 'partial',
    controls: controlIds,
    controlCount: controlIds.length,
    source: 'docs/compliance/soc2-control-matrix.md',
    limitation: 'Local repository evidence only; auditor-owned AWS, ticketing, and access review exports are not present.',
  }, null, 2)}\n`,
);

console.log(`[soc2:evidence] ${controlIds.length} control(s) snapshotted`);
