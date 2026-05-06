import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const templateDir = join(root, 'infra/cdk/cdk.out');
const evidenceDir = join(root, 'docs/release/1.2.0/secrets');
const files = readdirSync(templateDir)
  .filter((fileName) => /^esocial-.*\.template\.json$/u.test(fileName))
  .sort();

const findings = [];
for (const fileName of files) {
  const template = JSON.parse(readFileSync(join(templateDir, fileName), 'utf8'));
  for (const [logicalId, resource] of Object.entries(template.Resources ?? {})) {
    if (resource.Type !== 'AWS::KMS::Key') continue;
    findings.push({
      template: fileName,
      logicalId,
      enableKeyRotation: resource.Properties?.EnableKeyRotation === true,
    });
  }
}

const failures = findings
  .filter((finding) => !finding.enableKeyRotation)
  .map((finding) => `${finding.template}:${finding.logicalId} missing EnableKeyRotation=true`);

mkdirSync(evidenceDir, { recursive: true });
writeFileSync(
  join(evidenceDir, 'kms-rotation.json'),
  `${JSON.stringify({
    status: failures.length === 0 ? 'passed' : 'failed',
    templates: files,
    keysChecked: findings.length,
    findings,
    failures,
  }, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`[secrets:rotation] ${failure}`);
  process.exit(1);
}

console.log(`[secrets:rotation] ${findings.length} KMS key declaration(s) enforce rotation`);
