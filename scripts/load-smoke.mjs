import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const loadDir = join(root, 'tests/load');
const evidenceDir = join(root, 'docs/release/1.2.0/load/smoke');
const scripts = readdirSync(loadDir)
  .filter((fileName) => fileName.endsWith('.js'))
  .sort();

if (scripts.length === 0) {
  throw new Error('[load:smoke] no k6 scripts found under tests/load');
}

const checks = scripts.map((fileName) => {
  const body = readFileSync(join(loadDir, fileName), 'utf8');
  return {
    fileName,
    hasK6Imports: /from ['"]k6(?:\/http)?['"]/u.test(body),
    hasThresholds: /thresholds\s*:/u.test(body),
    hasChecks: /check\s*\(/u.test(body),
  };
});
const failures = checks.flatMap((check) => [
  ...(!check.hasK6Imports ? [`${check.fileName} missing k6 imports`] : []),
  ...(!check.hasThresholds ? [`${check.fileName} missing thresholds`] : []),
  ...(!check.hasChecks ? [`${check.fileName} missing check assertions`] : []),
]);

mkdirSync(evidenceDir, { recursive: true });
writeFileSync(
  join(evidenceDir, 'summary.json'),
  `${JSON.stringify({
    status: failures.length === 0 ? 'passed' : 'failed',
    scripts: checks,
    failures,
    fullRunCommand: 'k6 run tests/load/submit-status.k6.js',
  }, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`[load:smoke] ${failure}`);
  process.exit(1);
}

console.log(`[load:smoke] ${scripts.length} k6 script(s) passed static smoke checks`);
