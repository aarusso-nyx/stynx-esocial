# CodeQL Baseline

Workflow: `.github/workflows/codeql.yml`.

Query suite: `security-extended` for `javascript-typescript`.

Baseline status: pending first GitHub-hosted run. Local CI can validate the
workflow file exists and the repository builds, but CodeQL analysis evidence
must come from GitHub code scanning after the workflow runs on `main` or a pull
request. Initial `security-extended` findings are advisory until a release
owner records the first successful scan and decides which categories block PRs.
