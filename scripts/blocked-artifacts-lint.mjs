import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const file = join(root, 'docs/release/1.0.0/blocked-artifacts.json');
const blockers = JSON.parse(readFileSync(file, 'utf8'));
const required = ['area', 'status', 'reason', 'owner', 'target_round', 'target_date', 'decision_required'];
const today = process.env.ESOCIAL_BLOCKER_LINT_TODAY ?? '2026-05-06';
const failures = [];

for (const [index, blocker] of blockers.entries()) {
  for (const field of required) {
    if (!blocker[field]) {
      failures.push(`blocker[${index}] ${blocker.area ?? '<unknown>'} missing ${field}`);
    }
  }
  if (blocker.status !== 'blocked') {
    failures.push(`blocker[${index}] ${blocker.area} status must remain blocked until evidence lands`);
  }
  if (blocker.target_date && blocker.target_date < today) {
    failures.push(`blocker[${index}] ${blocker.area} target_date ${blocker.target_date} is stale`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`[blocked-artifacts] ${failure}`);
  process.exit(1);
}

console.log(`[blocked-artifacts] ${blockers.length} blockers have owner, round, date, and decision fields`);
