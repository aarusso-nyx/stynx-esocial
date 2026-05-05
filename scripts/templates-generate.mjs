import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const outDir = join(root, 'infra/cdk/cdk.out');
const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');
const requestedStage = valueAfter('--stage');
const includeProduction = requestedStage === 'production' ||
  args.has('--include-production') ||
  process.env.ESOCIAL_CONFIRM_PRODUCTION_TEMPLATE === '1';
const stages = stageConfigs().filter((stage) =>
  requestedStage
    ? stage.name === requestedStage
    : includeProduction || stage.name !== 'production',
);

if (requestedStage && stages.length === 0) {
  throw new Error(`Unknown template stage: ${requestedStage}`);
}
if (stages.some((stage) => stage.name === 'production') &&
    process.env.ESOCIAL_CONFIRM_PRODUCTION_TEMPLATE !== '1' &&
    !args.has('--confirm-production')) {
  throw new Error(
    'Production template generation requires ESOCIAL_CONFIRM_PRODUCTION_TEMPLATE=1 or --confirm-production.',
  );
}

mkdirSync(outDir, { recursive: true });
if (!checkOnly) {
  for (const fileName of readdirSync(outDir)) {
    if (/^esocial-.*\.template\.json$/u.test(fileName)) {
      unlinkSync(join(outDir, fileName));
    }
  }
}

const outputs = stages.map((stage) => ({
  stage,
  fileName: join(outDir, `esocial-${stage.name}.template.json`),
  body: `${JSON.stringify(templateFor(stage), null, 2)}\n`,
}));

for (const output of outputs) {
  if (checkOnly) {
    if (!existsSync(output.fileName)) {
      throw new Error(`Missing generated template: ${output.fileName}`);
    }
    const actual = readFileSync(output.fileName, 'utf8');
    if (actual !== output.body) {
      throw new Error(`Generated template is stale: ${output.fileName}`);
    }
    continue;
  }

  writeFileSync(output.fileName, output.body);
}

console.log(
  `[templates:${checkOnly ? 'check' : 'generate'}] ${outputs
    .map((output) => output.stage.name)
    .join(', ')} templates ${checkOnly ? 'verified' : 'written'} in ${outDir}`,
);

function valueAfter(name) {
  const argsArray = process.argv.slice(2);
  const index = argsArray.indexOf(name);
  return index >= 0 ? argsArray[index + 1] : undefined;
}

function stageConfigs() {
  return [
    {
      name: 'qualification',
      endpointHost: 'esocial-qualification.local',
      cidrBlock: '10.42.0.0/16',
      subnetCidrs: ['10.42.1.0/24', '10.42.2.0/24'],
      retentionDays: 14,
      alarmThreshold: 1,
      removalPolicy: 'Delete',
      production: false,
    },
    {
      name: 'restricted-production',
      endpointHost: 'esocial-restricted.local',
      cidrBlock: '10.43.0.0/16',
      subnetCidrs: ['10.43.1.0/24', '10.43.2.0/24'],
      retentionDays: 30,
      alarmThreshold: 1,
      removalPolicy: 'Retain',
      production: false,
    },
    {
      name: 'production',
      endpointHost: 'webservices.esocial.gov.br',
      cidrBlock: '10.44.0.0/16',
      subnetCidrs: ['10.44.1.0/24', '10.44.2.0/24'],
      retentionDays: 365,
      alarmThreshold: 1,
      removalPolicy: 'Retain',
      production: true,
    },
  ];
}

function templateFor(stage) {
  const serviceNames = [
    'submission',
    'retorno',
    'certificado',
    'http-gateway',
    'tabelas',
    'trabalhador',
    'folha',
    'fechamento',
    'exclusao',
  ];
  const resources = {
    EsocialKmsKey: {
      Type: 'AWS::KMS::Key',
      Properties: {
        Description: `esocial ${stage.name} encryption key`,
        EnableKeyRotation: true,
      },
    },
    EsocialVpc: {
      Type: 'AWS::EC2::VPC',
      Properties: {
        CidrBlock: stage.cidrBlock,
        EnableDnsHostnames: true,
        EnableDnsSupport: true,
        Tags: [{ Key: 'Name', Value: `esocial-${stage.name}` }],
      },
    },
    EsocialPrivateSubnetA: privateSubnet(stage, 'a', stage.subnetCidrs[0], 0),
    EsocialPrivateSubnetB: privateSubnet(stage, 'b', stage.subnetCidrs[1], 1),
    EsocialLambdaSecurityGroup: {
      Type: 'AWS::EC2::SecurityGroup',
      Properties: {
        GroupDescription: `esocial ${stage.name} lambda egress`,
        VpcId: { Ref: 'EsocialVpc' },
        SecurityGroupEgress: [
          {
            IpProtocol: '-1',
            CidrIp: '0.0.0.0/0',
            Description: 'Outbound only; no SGP database ingress is allowed.',
          },
        ],
      },
    },
    EsocialDatabaseSecurityGroup: {
      Type: 'AWS::EC2::SecurityGroup',
      Properties: {
        GroupDescription: `esocial ${stage.name} database ingress from service lambdas`,
        VpcId: { Ref: 'EsocialVpc' },
        SecurityGroupIngress: [
          {
            IpProtocol: 'tcp',
            FromPort: 5432,
            ToPort: 5432,
            SourceSecurityGroupId: { Ref: 'EsocialLambdaSecurityGroup' },
            Description: 'PostgreSQL from eSocial service compute only.',
          },
        ],
      },
    },
    EsocialDatabaseSubnetGroup: {
      Type: 'AWS::RDS::DBSubnetGroup',
      Properties: {
        DBSubnetGroupDescription: `esocial ${stage.name} private database subnets`,
        SubnetIds: [
          { Ref: 'EsocialPrivateSubnetA' },
          { Ref: 'EsocialPrivateSubnetB' },
        ],
      },
    },
    EsocialEventsBus: {
      Type: 'AWS::Events::EventBus',
      Properties: { Name: `esocial-${stage.name}-events` },
    },
    EsocialDatabaseSecret: secretResource(`esocial/${stage.name}/database`),
    EsocialCertificateSecret: secretResource(`esocial/${stage.name}/certificate/local-test-placeholder`),
    EsocialDatabase: {
      Type: 'AWS::RDS::DBInstance',
      DeletionPolicy: stage.removalPolicy,
      Properties: {
        DBInstanceIdentifier: `esocial-${stage.name}`,
        Engine: 'postgres',
        EngineVersion: '16',
        DBName: 'esocial',
        DBInstanceClass: stage.production ? 'db.t4g.medium' : 'db.t4g.micro',
        AllocatedStorage: stage.production ? '100' : '20',
        StorageEncrypted: true,
        KmsKeyId: { Ref: 'EsocialKmsKey' },
        DBSubnetGroupName: { Ref: 'EsocialDatabaseSubnetGroup' },
        VPCSecurityGroups: [{ Ref: 'EsocialDatabaseSecurityGroup' }],
        BackupRetentionPeriod: stage.production ? 35 : 7,
        MasterUsername: '{{resolve:secretsmanager:esocial-db:SecretString:username}}',
        MasterUserPassword: '{{resolve:secretsmanager:esocial-db:SecretString:password}}',
      },
    },
    EsocialMigrationProjectRole: serviceRoleResource(stage, 'migration-project', 'codebuild.amazonaws.com'),
    EsocialMigrationProject: {
      Type: 'AWS::CodeBuild::Project',
      Properties: {
        Name: `esocial-${stage.name}-migrations`,
        ServiceRole: { 'Fn::GetAtt': ['EsocialMigrationProjectRole', 'Arn'] },
        Artifacts: { Type: 'NO_ARTIFACTS' },
        Environment: {
          Type: 'LINUX_CONTAINER',
          ComputeType: 'BUILD_GENERAL1_SMALL',
          Image: 'aws/codebuild/standard:7.0',
          EnvironmentVariables: [
            { Name: 'ESOCIAL_SCHEMA', Value: 'esocial' },
            { Name: 'ESOCIAL_STAGE', Value: stage.name },
          ],
        },
        Source: {
          Type: 'NO_SOURCE',
          BuildSpec: 'version: 0.2\nphases:\n  build:\n    commands:\n      - npm run migrate:dev\n',
        },
      },
    },
    SubmitRequestQueue: fifoQueue(`sgp.esocial.submit.request.${stage.name}.fifo`, 'SubmitDlq'),
    SubmitResponseQueue: fifoQueue(`sgp.esocial.submit.response.${stage.name}.fifo`),
    SpoolQueue: fifoQueue(`sgp.esocial.spool.update.${stage.name}.fifo`),
    RetryQueue: fifoQueue(`sgp.esocial.retry.${stage.name}.fifo`, 'SubmitDlq'),
    ReplayQueue: fifoQueue(`sgp.esocial.replay.${stage.name}.fifo`, 'SubmitDlq'),
    SubmitDlq: fifoQueue(`sgp.esocial.submit.dlq.${stage.name}.fifo`),
    ReturnDlq: fifoQueue(`sgp.esocial.return.dlq.${stage.name}.fifo`),
    EsocialLambdaRole: serviceRoleResource(stage, 'lambda', 'lambda.amazonaws.com'),
  };

  for (const serviceName of serviceNames) {
    const id = logicalId(serviceName);
    resources[`${id}LogGroup`] = {
      Type: 'AWS::Logs::LogGroup',
      Properties: {
        LogGroupName: `/aws/lambda/esocial-${stage.name}-${serviceName}`,
        RetentionInDays: stage.retentionDays,
      },
    };
    resources[`${id}Function`] = {
      Type: 'AWS::Lambda::Function',
      Properties: {
        FunctionName: `esocial-${stage.name}-${serviceName}`,
        Runtime: 'nodejs22.x',
        Handler: 'dist/handler.handler',
        Role: { 'Fn::GetAtt': ['EsocialLambdaRole', 'Arn'] },
        Timeout: serviceName === 'submission' || serviceName === 'retorno' ? 60 : 30,
        MemorySize: serviceName === 'submission' || serviceName === 'retorno' ? 512 : 256,
        Environment: {
          Variables: {
            ESOCIAL_STAGE: stage.name,
            ESOCIAL_SCHEMA: 'esocial',
            ESOCIAL_ENDPOINT_HOST: stage.endpointHost,
            ESOCIAL_EVENT_BUS_NAME: { Ref: 'EsocialEventsBus' },
            ESOCIAL_SPOOL_QUEUE_URL: { Ref: 'SpoolQueue' },
            ESOCIAL_DLQ_QUEUE_URL: { Ref: serviceName === 'retorno' ? 'ReturnDlq' : 'SubmitDlq' },
          },
        },
        VpcConfig: {
          SecurityGroupIds: [{ Ref: 'EsocialLambdaSecurityGroup' }],
          SubnetIds: [
            { Ref: 'EsocialPrivateSubnetA' },
            { Ref: 'EsocialPrivateSubnetB' },
          ],
        },
        Code: {
          ZipFile: `exports.handler = async () => ({ service: "esocial-${serviceName}", stage: "${stage.name}" });`,
        },
      },
    };
  }

  resources.SubmissionEventSource = eventSource('SubmissionFunction', 'SubmitRequestQueue');
  resources.RetornoEventSource = eventSource('RetornoFunction', 'SubmitResponseQueue');
  resources.AuditRule = {
    Type: 'AWS::Events::Rule',
    Properties: {
      EventBusName: { Ref: 'EsocialEventsBus' },
      EventPattern: { source: ['esocial.submission', 'esocial.retorno'] },
      Targets: [{ Arn: { 'Fn::GetAtt': ['SpoolQueue', 'Arn'] }, Id: 'SpoolQueueTarget' }],
    },
  };
  resources.SpoolQueuePolicy = {
    Type: 'AWS::SQS::QueuePolicy',
    Properties: {
      Queues: [{ Ref: 'SpoolQueue' }],
      PolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { Service: 'events.amazonaws.com' },
            Action: 'sqs:SendMessage',
            Resource: { 'Fn::GetAtt': ['SpoolQueue', 'Arn'] },
            Condition: {
              ArnEquals: { 'aws:SourceArn': { 'Fn::GetAtt': ['AuditRule', 'Arn'] } },
            },
          },
        ],
      },
    },
  };
  resources.DlqAlarm = alarmResource(stage, 'esocial.dlq', stage.alarmThreshold);
  resources.RetryAlarm = alarmResource(stage, 'esocial.retry', 25);
  resources.TimeoutAlarm = alarmResource(stage, 'esocial.timeout', 5);
  resources.ObservabilityDashboard = {
    Type: 'AWS::CloudWatch::Dashboard',
    Properties: {
      DashboardName: `esocial-${stage.name}`,
      DashboardBody: JSON.stringify({
        widgets: [
          {
            type: 'metric',
            properties: {
              title: 'eSocial outcomes',
              metrics: [
                ['Stynx/eSocial', 'esocial.accepted'],
                ['Stynx/eSocial', 'esocial.rejected'],
                ['Stynx/eSocial', 'esocial.retry'],
                ['Stynx/eSocial', 'esocial.dlq'],
              ],
            },
          },
        ],
      }),
    },
  };

  return {
    AWSTemplateFormatVersion: '2010-09-09',
    Description: `esocial ${stage.name} deterministic CloudFormation template generated by scripts/templates-generate.mjs`,
    Metadata: {
      generator: 'scripts/templates-generate.mjs',
      stage: stage.name,
      stacks: [
        'EsocialNetworkStack',
        'EsocialDatabaseStack',
        'EsocialMessagingStack',
        'EsocialComputeStack',
        'EsocialSecretsStack',
        'EsocialObservabilityStack',
      ],
      productionGenerationRequiresConfirmation: stage.production,
      boundary: {
        schema: 'esocial',
        noSgpDatabaseAccess: true,
        endpointHost: stage.endpointHost,
      },
      lambdaServices: serviceNames,
    },
    Parameters: {
      EsocialDatabaseUrlSecretArn: {
        Type: 'String',
        Description: 'Secrets Manager ARN for the esocial database URL.',
      },
      EsocialCertificateSecretPrefix: {
        Type: 'String',
        Description: 'Secrets Manager prefix for tenant certificate references.',
      },
    },
    Resources: resources,
    Outputs: {
      VpcId: { Value: { Ref: 'EsocialVpc' } },
      EventBusName: { Value: { Ref: 'EsocialEventsBus' } },
      SubmitRequestQueueUrl: { Value: { Ref: 'SubmitRequestQueue' } },
      SpoolQueueUrl: { Value: { Ref: 'SpoolQueue' } },
      LambdaCount: { Value: String(serviceNames.length) },
    },
  };
}

function privateSubnet(stage, suffix, cidrBlock, availabilityZoneIndex) {
  return {
    Type: 'AWS::EC2::Subnet',
    Properties: {
      VpcId: { Ref: 'EsocialVpc' },
      CidrBlock: cidrBlock,
      AvailabilityZone: {
        'Fn::Select': [availabilityZoneIndex, { 'Fn::GetAZs': '' }],
      },
      MapPublicIpOnLaunch: false,
      Tags: [{ Key: 'Name', Value: `esocial-${stage.name}-private-${suffix}` }],
    },
  };
}

function fifoQueue(queueName, deadLetterLogicalId) {
  const properties = {
    QueueName: queueName,
    FifoQueue: true,
    ContentBasedDeduplication: false,
    KmsMasterKeyId: { Ref: 'EsocialKmsKey' },
  };
  if (deadLetterLogicalId) {
    properties.RedrivePolicy = {
      deadLetterTargetArn: { 'Fn::GetAtt': [deadLetterLogicalId, 'Arn'] },
      maxReceiveCount: 3,
    };
  }
  return {
    Type: 'AWS::SQS::Queue',
    Properties: properties,
  };
}

function eventSource(functionLogicalId, queueLogicalId) {
  return {
    Type: 'AWS::Lambda::EventSourceMapping',
    Properties: {
      FunctionName: { Ref: functionLogicalId },
      EventSourceArn: { 'Fn::GetAtt': [queueLogicalId, 'Arn'] },
      BatchSize: 10,
      FunctionResponseTypes: ['ReportBatchItemFailures'],
    },
  };
}

function serviceRoleResource(stage, name, principal) {
  return {
    Type: 'AWS::IAM::Role',
    Properties: {
      RoleName: `esocial-${stage.name}-${name}-role`,
      AssumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { Service: principal },
            Action: 'sts:AssumeRole',
          },
        ],
      },
      Policies: [
        {
          PolicyName: `esocial-${stage.name}-${name}-runtime`,
          PolicyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: [
                  'logs:CreateLogStream',
                  'logs:PutLogEvents',
                  'sqs:SendMessage',
                  'sqs:ReceiveMessage',
                  'sqs:DeleteMessage',
                  'events:PutEvents',
                  'secretsmanager:GetSecretValue',
                  'kms:Decrypt',
                  'cloudwatch:PutMetricData',
                ],
                Resource: '*',
              },
            ],
          },
        },
      ],
    },
  };
}

function secretResource(name) {
  return {
    Type: 'AWS::SecretsManager::Secret',
    Properties: {
      Name: name,
      KmsKeyId: { Ref: 'EsocialKmsKey' },
      Description: `${name} reference placeholder; secret value is provisioned outside git.`,
    },
  };
}

function alarmResource(stage, metricName, threshold) {
  return {
    Type: 'AWS::CloudWatch::Alarm',
    Properties: {
      AlarmName: `esocial-${stage.name}-${metricName}`,
      Namespace: 'Stynx/eSocial',
      MetricName: metricName,
      Statistic: 'Sum',
      Period: 60,
      EvaluationPeriods: 1,
      Threshold: threshold,
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      TreatMissingData: 'notBreaching',
    },
  };
}

function logicalId(value) {
  return value
    .split(/[^a-z0-9]+/iu)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join('');
}
