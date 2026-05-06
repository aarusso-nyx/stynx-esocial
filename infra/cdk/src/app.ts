import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { App, Stack } from 'aws-cdk-lib';
import { CfnInclude } from 'aws-cdk-lib/cloudformation-include';

const STAGES = ['qualification', 'restricted-production', 'production'] as const;

const app = new App();
const requestedStage = app.node.tryGetContext('stage') as string | undefined;
const stages = requestedStage
  ? STAGES.filter((stage) => stage === requestedStage)
  : STAGES.filter((stage) => stage !== 'production' || process.env['ESOCIAL_PROD_CONFIRM'] === '1');

if (requestedStage && stages.length === 0) {
  throw new Error(`Unknown eSocial CDK stage: ${requestedStage}`);
}

for (const stage of stages) {
  const templateFile = join(process.cwd(), 'cdk.out', `esocial-${stage}.template.json`);
  if (!existsSync(templateFile)) {
    throw new Error(`Run templates:generate before CDK synth; missing ${templateFile}`);
  }

  const stack = new Stack(app, `esocial-${stage}`, {
    description: `eSocial ${stage} stack synthesized from the governed CloudFormation template.`,
  });
  new CfnInclude(stack, 'GovernedTemplate', { templateFile });
}
