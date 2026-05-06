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
        ESOCIAL_PROD_CONFIRM: '',
      },
    },
  );
  const productionAllowed = spawnSync(
    process.execPath,
    ['scripts/templates-generate.mjs', '--stage', 'production', '--dry-run'],
    {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ESOCIAL_CONFIRM_PRODUCTION_TEMPLATE: '',
        ESOCIAL_PROD_CONFIRM: '1',
      },
    },
  );

  assert.equal(qualification.Metadata.stage, 'qualification');
  assert.equal(restrictedProduction.Metadata.stage, 'restricted-production');
  assert.equal(lambdaCount(qualification), 4);
  assert.equal(lambdaCount(restrictedProduction), 4);
  assert.equal(lambdaRoleCount(qualification), 4);
  assert.equal(lambdaRoleCount(restrictedProduction), 4);
  assert.deepEqual(lambdaNames(qualification), [
    'esocial-qualification-certificado',
    'esocial-qualification-http-gateway',
    'esocial-qualification-retorno',
    'esocial-qualification-submission',
  ]);
  assert.equal(qualification.Metadata.boundary.endpointHostEnv, 'ESOCIAL_QUALIFICATION_ENDPOINT_HOST');
  assert.equal(
    restrictedProduction.Metadata.boundary.endpointHostEnv,
    'ESOCIAL_RESTRICTED_PRODUCTION_ENDPOINT_HOST',
  );
  assert.doesNotMatch(JSON.stringify(qualification), /gov\.br/u);
  assert.doesNotMatch(JSON.stringify(restrictedProduction), /gov\.br/u);
  assert.equal(productionDenied.status, 1);
  assert.match(
    productionDenied.stderr,
    /Production template generation requires ESOCIAL_PROD_CONFIRM=1/u,
  );
  assert.equal(productionAllowed.status, 0, productionAllowed.stderr);
});

test('generated templates use scoped IAM resources and actions', () => {
  for (const fileName of [
    'esocial-qualification.template.json',
    'esocial-restricted-production.template.json',
  ]) {
    const findings = collectIamWildcardFindings(readTemplate(fileName));
    assert.deepEqual(findings, [], `${fileName} should not contain wildcard IAM grants`);
  }
});

function readTemplate(fileName) {
  return JSON.parse(readFileSync(join(root, 'infra/cdk/cdk.out', fileName), 'utf8'));
}

function lambdaCount(template) {
  return Object.values(template.Resources)
    .filter((resource) => resource.Type === 'AWS::Lambda::Function')
    .length;
}

function lambdaNames(template) {
  return Object.values(template.Resources)
    .filter((resource) => resource.Type === 'AWS::Lambda::Function')
    .map((resource) => resource.Properties.FunctionName)
    .sort();
}

function lambdaRoleCount(template) {
  return Object.values(template.Resources)
    .filter((resource) => resource.Type === 'AWS::IAM::Role')
    .filter((resource) =>
      resource.Properties.AssumeRolePolicyDocument.Statement.some((statement) =>
        statement.Principal?.Service === 'lambda.amazonaws.com',
      ),
    )
    .length;
}

function collectIamWildcardFindings(template) {
  const findings = [];
  for (const [logicalId, resource] of Object.entries(template.Resources)) {
    if (resource.Type !== 'AWS::IAM::Role') continue;
    for (const policy of resource.Properties.Policies ?? []) {
      const statements = arrayOf(policy.PolicyDocument.Statement);
      for (const [index, statement] of statements.entries()) {
        const actions = arrayOf(statement.Action);
        const resources = arrayOf(statement.Resource);
        if (actions.some((action) => typeof action === 'string' && action.endsWith(':*'))) {
          findings.push(`${logicalId}.${policy.PolicyName}[${index}] action wildcard`);
        }
        if (resources.some((value) => value === '*')) {
          findings.push(`${logicalId}.${policy.PolicyName}[${index}] resource wildcard`);
        }
      }
    }
  }
  return findings;
}

function arrayOf(value) {
  return Array.isArray(value) ? value : [value];
}
