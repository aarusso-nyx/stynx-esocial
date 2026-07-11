import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const evidenceDir = join(root, 'docs/release/1.2.0/mutation');
const reportFile = join(evidenceDir, 'domain-stryker.json');
const summaryFile = join(evidenceDir, 'summary.json');
const advisory = process.argv.includes('--advisory');

mkdirSync(evidenceDir, { recursive: true });

const summary = existsSync(reportFile)
  ? summarizeReport(JSON.parse(readFileSync(reportFile, 'utf8')))
  : unavailableSummary();

writeFileSync(summaryFile, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`[mutation:summary] ${summary.status} evidence written to ${summaryFile}`);

if (summary.status === 'failed' && !advisory) {
  process.exit(1);
}

function summarizeReport(report) {
  const mutants = report?.files
    ? Object.values(report.files).flatMap((file) => file?.mutants ?? [])
    : [];
  const killed = countStatus(mutants, 'Killed');
  const survived = countStatus(mutants, 'Survived');
  const timeout = countStatus(mutants, 'Timeout');
  const errors = countStatus(mutants, 'CompileError') + countStatus(mutants, 'RuntimeError');
  const total = killed + survived + timeout;
  const score = total === 0 ? 0 : Number(((killed / total) * 100).toFixed(2));
  const threshold = 70;
  return {
    status: score >= threshold ? 'passed' : advisory ? 'warning' : 'failed',
    enforcement: advisory ? 'advisory-full-domain-evidence' : 'blocking',
    threshold,
    actual: score,
    killed,
    survived,
    timeout,
    errors,
    command: 'npm run mutation:full',
    reason: score >= threshold
      ? undefined
      : 'Below the full-domain threshold; retained as visible non-blocking hardening evidence. The release-critical builder gate remains enforced separately.',
  };
}

function unavailableSummary() {
  return {
    status: advisory ? 'warning' : 'blocked',
    enforcement: advisory ? 'advisory-full-domain-evidence' : 'blocking',
    threshold: 70,
    actual: null,
    reason: 'Stryker is configured, but the full mutation run has not produced domain-stryker.json yet.',
    command: 'npm run mutation:full',
  };
}

function countStatus(mutants, status) {
  return mutants.filter((mutant) => mutant.status === status).length;
}
