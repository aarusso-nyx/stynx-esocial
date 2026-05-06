# IAM And CDK Evidence

Commands:

- `npm run cdk:synth`
- `npm run templates:check`
- `npm run test:integration`

Result: passed.

`npm run cdk:synth` regenerated deterministic review templates and synthesized
the CDK app to `infra/cdk/cdk.synth.out`. The synth output includes
`esocial-qualification`, `esocial-restricted-production`, and guarded
`esocial-production` stack artifacts. `npm run test:integration` also executed
the template IAM assertions that reject wildcard resources and action
wildcards.
