import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const lineThreshold = numberFromEnv('ESOCIAL_COVERAGE_LINE_THRESHOLD', 70);
const functionThreshold = numberFromEnv('ESOCIAL_COVERAGE_FUNCTION_THRESHOLD', lineThreshold);
const branchThreshold = numberFromEnv('ESOCIAL_COVERAGE_BRANCH_THRESHOLD', 70);
const strictTarget = {
  line: numberFromEnv('ESOCIAL_COVERAGE_STRICT_LINE_TARGET', 95),
  branch: numberFromEnv('ESOCIAL_COVERAGE_STRICT_BRANCH_TARGET', 90),
  functions: numberFromEnv('ESOCIAL_COVERAGE_STRICT_FUNCTION_TARGET', 95),
};
const COVERAGE_TESTS = [
  'services/retorno/__tests__/*.test.mjs',
  'tests/contract/*.test.mjs',
  'tests/certificado/*.test.mjs',
  'tests/golden/*.test.mjs',
  'tests/handler/*.test.mjs',
  'tests/operations/*.test.mjs',
  'tests/pki/*.test.mjs',
  'tests/property/*.test.mjs',
  'tests/returns/*.test.mjs',
  'tests/xml/*.test.mjs',
];

const result = spawnSync(
  process.execPath,
  ['--test', '--experimental-test-coverage', ...COVERAGE_TESTS],
  {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
process.stdout.write(output);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const summary = parseAllFilesSummary(output);
if (!summary) {
  throw new Error('Could not parse node --test coverage summary.');
}

const failures = [
  ['line', summary.line, lineThreshold],
  ['branch', summary.branch, branchThreshold],
  ['function', summary.functions, functionThreshold],
].filter(([, value, threshold]) => value < threshold);

if (failures.length > 0) {
  for (const [metric, value, threshold] of failures) {
    console.error(
      `[coverage] ${metric} coverage ${value.toFixed(2)}% is below ${threshold.toFixed(2)}%.`,
    );
  }
  writeEvidence(summary, failures);
  process.exit(1);
}

writeEvidence(summary, []);
console.log(
  [
    '[coverage] active node:test suite passed configured thresholds',
    `(line=${summary.line.toFixed(2)}%, branch=${summary.branch.toFixed(2)}%, functions=${summary.functions.toFixed(2)}%).`,
  ].join(' '),
);

function parseAllFilesSummary(outputText) {
  const line = outputText
    .split(/\r?\n/u)
    .reverse()
    .find((candidate) => /\ball files\b/u.test(candidate));
  if (!line) return undefined;

  const values = [...line.matchAll(/\b\d+\.\d{2}\b/gu)].map((match) => Number(match[0]));
  if (values.length < 3) return undefined;

  return {
    line: values[0],
    branch: values[1],
    functions: values[2],
  };
}

function writeEvidence(summary, failures) {
  const outDir = join(root, 'docs/release/1.1.0/coverage');
  mkdirSync(outDir, { recursive: true });
  const payload = {
    generated_at: '2026-05-06T13:00:00.000Z',
    active_thresholds: {
      line: lineThreshold,
      branch: branchThreshold,
      functions: functionThreshold,
    },
    round4_target: strictTarget,
    measured: summary,
    target_gap: {
      line: Number((strictTarget.line - summary.line).toFixed(2)),
      branch: Number((strictTarget.branch - summary.branch).toFixed(2)),
      functions: Number((strictTarget.functions - summary.functions).toFixed(2)),
    },
    failures: failures.map(([metric, value, threshold]) => ({
      metric,
      value,
      threshold,
    })),
  };
  writeFileSync(join(outDir, 'summary.json'), `${JSON.stringify(payload, null, 2)}\n`);
}

function numberFromEnv(name, fallback) {
  const raw = process.env[name] ?? process.env.ESOCIAL_COVERAGE_THRESHOLD;
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be numeric.`);
  }
  return parsed;
}
