import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const outDir = join(root, 'infra/cdk/cdk.out');
mkdirSync(outDir, { recursive: true });

for (const stage of ['dev', 'qa']) {
  const template = {
    AWSTemplateFormatVersion: '2010-09-09',
    Description: `stynx-esocial ${stage} isolated account skeleton`,
    Resources: {
      EventsBus: {
        Type: 'AWS::Events::EventBus',
        Properties: { Name: 'stynx-esocial-events' },
      },
      SubmitRequestQueue: {
        Type: 'AWS::SQS::Queue',
        Properties: {
          QueueName: `sgp.esocial.submit.request.${stage}.fifo`,
          FifoQueue: true,
          ContentBasedDeduplication: false,
        },
      },
      SubmitResponseQueue: {
        Type: 'AWS::SQS::Queue',
        Properties: {
          QueueName: `sgp.esocial.submit.response.${stage}.fifo`,
          FifoQueue: true,
          ContentBasedDeduplication: false,
        },
      },
      SubmitDlq: {
        Type: 'AWS::SQS::Queue',
        Properties: {
          QueueName: `sgp.esocial.submit.dlq.${stage}.fifo`,
          FifoQueue: true,
        },
      },
    },
  };
  writeFileSync(
    join(outDir, `stynx-esocial-${stage}.template.json`),
    `${JSON.stringify(template, null, 2)}\n`,
  );
}

console.log(`[cdk:synth] wrote templates to ${outDir}`);
