import { spawnSync } from 'node:child_process';

const COVERAGE_THRESHOLD = Number(process.env.ESOCIAL_COVERAGE_THRESHOLD ?? '70');
const COVERAGE_TESTS = [
  'services/retorno/__tests__/*.test.mjs',
  'tests/contract/*.test.mjs',
  'tests/certificado/*.test.mjs',
  'tests/golden/*.test.mjs',
  'tests/handler/*.test.mjs',
  'tests/pki/*.test.mjs',
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
  ['line', summary.line],
  ['function', summary.functions],
].filter(([, value]) => value < COVERAGE_THRESHOLD);

if (failures.length > 0) {
  for (const [metric, value] of failures) {
    console.error(
      `[coverage] ${metric} coverage ${value.toFixed(2)}% is below ${COVERAGE_THRESHOLD.toFixed(2)}%.`,
    );
  }
  process.exit(1);
}

console.log(
  [
    `[coverage] active node:test suite passed ${COVERAGE_THRESHOLD.toFixed(2)}% threshold`,
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
