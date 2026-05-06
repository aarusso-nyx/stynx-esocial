import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const checks = [
  ['blocked artifacts lifecycle', ['node', ['scripts/blocked-artifacts-lint.mjs']]],
  ['boundary canaries', ['node', ['scripts/check.mjs', 'lint']]],
  ['migration canaries', ['node', ['scripts/check-migrations.mjs', 'lint:migrations']]],
  ['template reproducibility', ['node', ['scripts/templates-generate.mjs', '--check']]],
  ['IAM scope script present', null],
  ['ADR index present', null],
  ['SBOM script present', null],
];
const results = [];

for (const [name, command] of checks) {
  if (command) {
    const [bin, args] = command;
    const result = spawnSync(bin, args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    results.push({ name, ok: result.status === 0, output: `${result.stdout}${result.stderr}`.trim() });
  } else {
    results.push({ name, ok: staticCheck(name), output: '' });
  }
}

const failed = results.filter((result) => !result.ok);
console.log(JSON.stringify({ generated_at: '2026-05-06T13:00:00.000Z', results }, null, 2));
if (failed.length > 0) process.exit(1);

function staticCheck(name) {
  if (name === 'IAM scope script present') return existsSync(join(root, 'scripts/assert-cdk-iam-scoped.mjs'));
  if (name === 'ADR index present') return existsSync(join(root, 'docs/adrs/README.md'));
  if (name === 'SBOM script present') {
    return readFileSync(join(root, 'scripts/sbom.mjs'), 'utf8').includes('spdxVersion');
  }
  return false;
}
