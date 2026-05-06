# Service Surface Triage

Round 4 confirmed that the active Lambda service surface remains:

- `submission`
- `retorno`
- `certificado`
- `http-gateway`

The previously planned family-named placeholders (`tabelas`, `trabalhador`,
`folha`, `fechamento`, `exclusao`) are not present under `services/`, not
declared as workspaces, and not emitted by the CDK template generator.

Verification:

- `npm run cdk:synth:qualification` passed.
- `node scripts/assert-cdk-iam-scoped.mjs` scanned 175 IAM statements across 5
  templates with zero wildcard actions/resources.
