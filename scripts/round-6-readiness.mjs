import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const allowBlocked = process.argv.includes('--allow-blocked');
const evidence = [
  ['mutation', 'docs/release/1.2.0/mutation/summary.json'],
  ['chaos', 'docs/release/1.2.0/chaos/summary.json'],
  ['load', 'docs/release/1.2.0/load/smoke/summary.json'],
  ['security', 'docs/release/1.2.0/security/summary.json'],
  ['lgpd', 'docs/release/1.2.0/lgpd/summary.json'],
  ['soc2', 'docs/release/1.2.0/soc2/2026-Q2/manifest.json'],
  ['secrets', 'docs/release/1.2.0/secrets/kms-rotation.json'],
  ['audit', 'docs/release/1.2.0/audit/verification.json'],
  ['cost', 'docs/release/1.2.0/cost/tag-coverage.json'],
  ['slo', 'docs/release/1.2.0/slo/alarm-assertions.json'],
  ['reference-site', 'docs/release/1.2.0/reference-site/build.json'],
  ['events', 'docs/release/1.2.0/events/s1030-s1040-s1060.md'],
];

const results = evidence.map(([name, relativePath]) => {
  const absolutePath = join(root, relativePath);
  if (!existsSync(absolutePath)) {
    return { name, path: relativePath, status: 'missing' };
  }
  const text = readFileSync(absolutePath, 'utf8');
  const parsed = relativePath.endsWith('.json') || text.trimStart().startsWith('{')
    ? JSON.parse(text)
    : { status: 'present' };
  return { name, path: relativePath, status: parsed.status ?? 'present' };
});

const blockingStatuses = new Set(['blocked', 'failed', 'missing']);
const blocked = results.filter((result) => blockingStatuses.has(result.status));
const report = {
  status: blocked.length === 0 ? 'ready' : 'not-ready',
  generatedAt: '2026-05-06T00:00:00.000Z',
  blocked,
  results,
};
writeFileSync(
  join(root, 'docs/release/1.2.0/round-6-entry.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);

console.log(`[round6:readiness] ${report.status}; ${blocked.length} blocking evidence item(s)`);
if (blocked.length > 0 && !allowBlocked) {
  process.exit(1);
}
