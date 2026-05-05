import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const candidateDirs = [
  join(root, 'infra/cdk/cdk.synth.out'),
  join(root, 'infra/cdk/cdk.out'),
];
const templateFiles = candidateDirs
  .filter((dir) => existsSync(dir))
  .flatMap((dir) =>
    readdirSync(dir)
      .filter((fileName) => fileName.endsWith('.template.json'))
      .map((fileName) => join(dir, fileName)),
  );

if (templateFiles.length === 0) {
  throw new Error('No synthesized CDK template files found under infra/cdk/cdk.synth.out or infra/cdk/cdk.out.');
}

const failures = [];
let statementCount = 0;

for (const fileName of templateFiles) {
  const template = JSON.parse(readFileSync(fileName, 'utf8'));
  walk(template, (value, path) => {
    if (!isIamStatement(value)) return;
    statementCount += 1;
    const actions = asArray(value.Action);
    const resources = asArray(value.Resource);

    for (const action of actions) {
      if (typeof action === 'string' && isWildcardAction(action)) {
        failures.push(`${fileName}:${path}.Action uses wildcard action ${action}`);
      }
    }

    for (const resource of resources) {
      if (resource === '*') {
        failures.push(`${fileName}:${path}.Resource uses Resource "*"`);
      }
    }
  });
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  throw new Error(`CDK IAM scope assertion failed with ${failures.length} issue(s).`);
}

console.log(`[cdk:iam-scope] scanned ${statementCount} IAM statement(s) across ${templateFiles.length} template(s); wildcard actions/resources: 0`);

function isIamStatement(value) {
  return value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.hasOwn(value, 'Effect') &&
    Object.hasOwn(value, 'Action');
}

function asArray(value) {
  return Array.isArray(value) ? value : [value];
}

function isWildcardAction(action) {
  if (!action.includes('*')) return false;
  // CloudWatch Logs resource ARNs may contain trailing wildcards, but actions must
  // remain scoped to explicit verbs.
  return true;
}

function walk(value, visit, path = '$') {
  visit(value, path);
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visit, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    walk(child, visit, `${path}.${key}`);
  }
}
