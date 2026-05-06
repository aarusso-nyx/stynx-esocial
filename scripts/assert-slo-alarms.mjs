import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const templateDir = join(root, 'infra/cdk/cdk.out');
const evidenceDir = join(root, 'docs/release/1.2.0/slo');
const requiredMetrics = ['esocial.dlq', 'esocial.retry', 'esocial.timeout'];
const files = readdirSync(templateDir)
  .filter((fileName) => /^esocial-.*\.template\.json$/u.test(fileName))
  .sort();
const stageFindings = [];

for (const fileName of files) {
  const template = JSON.parse(readFileSync(join(templateDir, fileName), 'utf8'));
  const metrics = Object.values(template.Resources ?? {})
    .filter((resource) => resource.Type === 'AWS::CloudWatch::Alarm')
    .map((resource) => resource.Properties?.MetricName)
    .filter(Boolean)
    .sort();
  stageFindings.push({
    template: fileName,
    metrics,
    missing: requiredMetrics.filter((metric) => !metrics.includes(metric)),
  });
}

const failures = stageFindings.flatMap((finding) =>
  finding.missing.map((metric) => `${finding.template} missing ${metric}`),
);
mkdirSync(evidenceDir, { recursive: true });
writeFileSync(
  join(evidenceDir, 'alarm-assertions.json'),
  `${JSON.stringify({
    status: failures.length === 0 ? 'passed' : 'failed',
    requiredMetrics,
    stageFindings,
    failures,
  }, null, 2)}\n`,
);

if (failures.length > 0) {
  for (const failure of failures) console.error(`[slo:assert] ${failure}`);
  process.exit(1);
}

console.log(`[slo:assert] ${files.length} template(s) include required Round 5 alarms`);
