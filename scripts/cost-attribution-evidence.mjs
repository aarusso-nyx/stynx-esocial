import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const templateDir = join(root, 'infra/cdk/cdk.out');
const evidenceDir = join(root, 'docs/release/1.2.0/cost');
const files = readdirSync(templateDir)
  .filter((fileName) => /^esocial-.*\.template\.json$/u.test(fileName))
  .sort();
const requiredTags = ['Name'];
const resourceFindings = [];

for (const fileName of files) {
  const template = JSON.parse(readFileSync(join(templateDir, fileName), 'utf8'));
  for (const [logicalId, resource] of Object.entries(template.Resources ?? {})) {
    const tags = resource.Properties?.Tags ?? [];
    if (!Array.isArray(tags)) continue;
    resourceFindings.push({
      template: fileName,
      logicalId,
      type: resource.Type,
      tags: tags.map((tag) => tag.Key).sort(),
      missing: requiredTags.filter((tagName) => !tags.some((tag) => tag.Key === tagName)),
    });
  }
}

const missing = resourceFindings.filter((finding) => finding.missing.length > 0);
mkdirSync(evidenceDir, { recursive: true });
writeFileSync(
  join(evidenceDir, 'tag-coverage.json'),
  `${JSON.stringify({
    status: missing.length === 0 ? 'passed' : 'partial',
    requiredTags,
    taggableResourcesChecked: resourceFindings.length,
    missing,
    note: 'Round 5 local-safe check covers generated template tags. Full AWS Cost Explorer CUR validation remains external.',
  }, null, 2)}\n`,
);

console.log(`[cost:evidence] ${resourceFindings.length} taggable resource declaration(s) scanned`);
