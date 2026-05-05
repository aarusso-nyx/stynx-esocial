import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = new URL('../../..', import.meta.url).pathname;

test('generated templates enforce stages and production confirmation', () => {
  const qualification = readTemplate('esocial-qualification.template.json');
  const restrictedProduction = readTemplate('esocial-restricted-production.template.json');
  const productionDenied = spawnSync(
    process.execPath,
    ['scripts/templates-generate.mjs', '--stage', 'production', '--check'],
    {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ESOCIAL_CONFIRM_PRODUCTION_TEMPLATE: '',
      },
    },
  );

  assert.equal(qualification.Metadata.stage, 'qualification');
  assert.equal(restrictedProduction.Metadata.stage, 'restricted-production');
  assert.equal(lambdaCount(qualification), 9);
  assert.equal(lambdaCount(restrictedProduction), 9);
  assert.doesNotMatch(JSON.stringify(qualification), /gov\.br/u);
  assert.doesNotMatch(JSON.stringify(restrictedProduction), /gov\.br/u);
  assert.equal(productionDenied.status, 1);
  assert.match(
    productionDenied.stderr,
    /Production template generation requires ESOCIAL_CONFIRM_PRODUCTION_TEMPLATE=1/u,
  );
});

function readTemplate(fileName) {
  return JSON.parse(readFileSync(join(root, 'infra/cdk/cdk.out', fileName), 'utf8'));
}

function lambdaCount(template) {
  return Object.values(template.Resources)
    .filter((resource) => resource.Type === 'AWS::Lambda::Function')
    .length;
}
