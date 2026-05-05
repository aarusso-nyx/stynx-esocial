# C4 — CI and Release

> **Wave C, step 4.** Infra/Release worker. Blocked by C1 + C2 + C3.

## Read first

- [`../plan.md`](../plan.md) — round-0 closure target items 10 and 11.
- All prior round-0 prompt outputs (every renamed/added script).

## Why this exists

There is no CI today. Every "passing" gate has been a manual local
invocation of structural-only scripts. Round 0 is "done" only when CI
runs the real gates on every PR and an `@esocial/contracts@1.0.0`
release is publishable from `main`.

## Tasks

1. **`.github/workflows/ci.yml`** with two jobs:
   - `unit`: triggered on every push and PR. Runs:
     - `npm ci`
     - `npm run build`
     - `npm run lint`
     - `npm test`
     - `npm run coverage` with thresholds enforced
     - `npm audit --omit=dev` (high+ severity = fail)
   - `integration`: triggered on PR to `main` and on `main` push. Runs:
     - Postgres service container.
     - `DATABASE_URL=… npm run migrate:dev`
     - `DATABASE_URL=… npm run test:db`
     - `npm run test:integration`
     - LocalStack service container.
     - `npm run integration:localstack`
     - `npm run cdk:synth` (qualification + restricted-production;
       production gated by `ESOCIAL_PROD_CONFIRM=1` and not run in PR
       CI).
   - All jobs run with `actions/setup-node@v4` pinned by SHA.
2. **Branch protection.** Document required checks in
   `docs/operations.md` (since GitHub branch-protection is configured
   out-of-band): `unit`, `integration`, signed commits.
3. **Release workflow** at `.github/workflows/release.yml`:
   - Trigger on `push` to `main` for paths under
     `packages/contracts/**` or on tag `contracts-v*`.
   - Build, run unit job.
   - `npm publish --workspace @esocial/contracts` (with
     `NODE_AUTH_TOKEN` from GH secrets; do not hardcode).
   - On success, tag `contracts-v<semver>` and create a GitHub Release
     with the CHANGELOG entry.
4. **SBOM and audit.** Generate CycloneDX SBOM for `packages/contracts`
   and the active services. Attach to the GitHub Release.
5. **Renovate or Dependabot config.** Pin a config file for weekly
   dependency PRs. Group AWS SDK updates; keep `xml-crypto`,
   `node-forge`, SOAP client, XML parser ungrouped (security-sensitive).
6. **Status badges** in `README.md` for: CI status, contract version,
   coverage. Use the round-0 commit's status URL.
7. **Boundary CI grep.** A dedicated `lint:boundaries` step in CI runs
   `scripts/check.mjs` and `scripts/check-migrations.mjs` and fails on
   any active-code hit for `hr.*`, `payroll.*`, `saude.*`,
   `public.esocial_event`, `@nestjs/`, `backend/src/`.

## Primary write scope

- `.github/workflows/ci.yml`, `release.yml`
- `.github/dependabot.yml` (or `renovate.json`)
- `README.md` (status badges)
- `docs/operations.md` (branch-protection note)
- `scripts/sbom.mjs`

## Do not touch

- Source code semantics. C4 only adds CI orchestration.

## Exit criteria

- CI runs every advertised gate on every PR and exits non-zero on
  failure.
- Contracts can be published from CI on a tag without manual steps.
- SBOM attached to releases.
- README badges reflect real CI state.
- Branch-protection requirements documented.

## Verification

```text
gh workflow list
gh workflow run ci.yml --ref <branch>
gh run watch
```

Report: workflow files added, average CI runtime, audit findings (none
allowed at high+ severity to ship), and the dependency-update cadence.
