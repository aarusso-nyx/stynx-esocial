# F1 — Round-4 Carryover

> **Round-6 Batch F1.** Closure owner. Runs in parallel with A1–C2;
> must complete before D2 (reference site) publishes.

## Read first

- [`../plan.md`](../plan.md) — Round-4 carryover backlog table.
- R4 closure report (the four items below).
- R4 prompts that scaffolded each item:
  - `../../round-4/prompts/A1-coverage-and-property.md`
  - `../../round-4/prompts/B1-dev-up-and-codegen.md`
  - `../../round-4/prompts/C3-onboarding-and-glossary.md`
  - `../../round-4/prompts/D2-sbom-scanners-sla.md`

## Why this exists

Round 4 shipped scaffolds for four items but stopped short of full
closure. The repo is green only because each item carries an explicit
relaxation (CI gate at 70 % instead of 95 %, dry-run skipped, scanner
CI not exercised, cold-start untimed). F1 closes the relaxations so
the round-3 closure-target items can flip from 🟡 partial to ✅ shipped.

## Tasks

### F1.1 — Coverage push to 95 / 95 / 90

**Current:** 78.97 % line / 70.98 % branch / 79.84 % function. CI gate
at 70 % via `ESOCIAL_COVERAGE_THRESHOLD` override.

**Desired:** ≥ 95 % line / ≥ 95 % function / ≥ 90 % branch with the
override removed.

Steps:

1. Run `npm run coverage`; load `coverage/coverage-summary.json` into
   a triage table.
2. Per uncovered branch:
   - **Reachable** — write a real test that exercises it.
   - **Unreachable / dead** — delete the code with a one-line PR note.
     **No artificial coverage hacks** (no `it.skip`, no comment-out,
     no exclusion patterns).
3. Once the lcov report shows ≥ 95 / 95 / 90, lift the gate:
   - In `scripts/coverage-check.mjs`, remove the
     `process.env.ESOCIAL_COVERAGE_THRESHOLD` override.
   - Set `LINE_PCT_MIN = 95`, `FUNC_PCT_MIN = 95`,
     `BRANCH_PCT_MIN = 90`.
4. Demonstrate the gate by deliberately reverting one test commit on
   a feature branch; CI must fail; restore the test.
5. Update `docs/release/1.2.0/coverage/` with the lcov + summary
   from a clean run on the closing commit.

### F1.2 — Onboarding doc external dry-run

**Current:** `docs/onboarding.md` is written; no external engineer has
walked through Day 1 yet.

**Desired:** an engineer outside the project completes Day-1 within
4 hours; friction log captured.

Steps:

1. Recruit a reviewer outside the immediate project (an engineer from
   a sister team is sufficient; a fresh hire is ideal).
2. Hand them only the URL of `docs/onboarding.md` and the repo
   clone command. Time-box: 4 hours.
3. Reviewer captures:
   - Steps that worked the first time.
   - Steps that needed clarification.
   - Steps that failed.
   - Time from clone to first golden test passing.
4. Update `docs/onboarding.md` with the friction-driven fixes.
5. Commit `docs/release/1.2.0/onboarding/dry-run.md` with the timeline,
   reviewer's notes (anonymized), and total elapsed time.

### F1.3 — External scanner CI proof

**Current:** SBOM generation locally green. OSV + Trivy workflow added
but never exercised. No local scanner binaries.

**Desired:** one CI run with `osv-scanner` + `trivy fs .` green;
SBOMs in CycloneDX + SPDX; workflow log archived.

Steps:

1. Verify the OSV/Trivy job in `.github/workflows/security.yml` (or
   wherever it landed in R4 D2) actually runs:
   - GitHub-hosted runner has `osv-scanner` + `trivy` available
     (use `setup-osv-scanner` / `aquasecurity/trivy-action`).
   - Provenance + SBOM upload steps execute.
2. If runners cannot install the binaries, add explicit install steps.
3. Trigger one workflow run on `main` (or a closing PR). Capture:
   - The workflow URL.
   - The `osv-scanner` output.
   - The `trivy fs .` output.
   - The CycloneDX SBOM artifact.
   - The SPDX SBOM artifact.
4. Attach all five to `docs/release/1.2.0/sbom/scanners/`.
5. **If critical / high CVEs found**: triage per the round-5 B1 SLA
   (critical < 7 d, high < 30 d). The CI gate must remain
   "fail on critical / high" — do not lower it to ship F1.3. Close
   the CVE first.

### F1.4 — Fresh-clone Docker cold-start benchmark

**Current:** `dev:up` / `dev:down` / `dev:reset` / `dev:logs` and
`docker-compose.dev.yml` implemented; no Docker-runtime measurement
yet.

**Desired:** a clean-clone run on a Docker-enabled host boots the
full stack in < 5 min; timing recorded.

Steps:

1. On a Docker-enabled host (CI runner, dedicated dev box, or any
   reproducible environment), run:
   ```bash
   git clone <repo> /tmp/cold-start-test
   cd /tmp/cold-start-test
   time npm ci
   time npm run dev:up
   curl --retry 30 --retry-delay 10 http://localhost:3000/healthz
   time npm run dev:down
   ```
2. Capture:
   - Host CPU + RAM + Docker version.
   - `npm ci` wall-clock.
   - `dev:up` wall-clock.
   - First-200 healthcheck wall-clock from invocation.
   - `dev:down` wall-clock.
3. **Total `dev:up` + healthcheck must be < 5 min.** If not, profile
   and tune (image pulls in parallel, layer caching, etc.).
4. Commit `docs/release/1.2.0/dx/cold-start.md` with the captured
   timings + host fingerprint + remediation notes.
5. Add a CI smoke job (`dev-up.yml`, scheduled weekly) that runs the
   same sequence on a fresh runner and uploads the timing artifact —
   so cold-start drift is detected automatically going forward.

## Primary write scope

- F1.1: tests across packages, dead-code deletions,
  `scripts/coverage-check.mjs`, `docs/release/1.2.0/coverage/`.
- F1.2: `docs/onboarding.md` (friction-driven fixes only),
  `docs/release/1.2.0/onboarding/dry-run.md`.
- F1.3: `.github/workflows/security.yml` (only if installs are
  missing), `docs/release/1.2.0/sbom/scanners/`. CVE remediation PRs
  routed to the affected code area.
- F1.4: profiling tweaks under `docker-compose.dev.yml` /
  `scripts/dev-up.mjs` only if cold-start exceeds 5 min,
  `.github/workflows/dev-up.yml` (new), `docs/release/1.2.0/dx/cold-start.md`.

## Do not touch

- Round-3 / round-4 / round-5 evidence bundles under
  `docs/release/1.0.0/`, `1.1.0/`.
- Other R6 batches (A1–E1).
- Production code semantics in F1.2 / F1.3 / F1.4 (those are
  measurement / dry-run prompts).

## Exit criteria

- F1.1: lcov ≥ 95 / 95 / 90; CI gate at 95 / 95 / 90 with no override
  required for green.
- F1.2: external dry-run captured; friction-driven doc update merged.
- F1.3: one green CI run with both scanners; both SBOM formats
  attached.
- F1.4: real Docker timing < 5 min recorded; weekly smoke job live.

## Verification

```text
npm run coverage
jq '.total | {line: .lines.pct, branch: .branches.pct, fn: .functions.pct}' coverage/coverage-summary.json
ls docs/release/1.2.0/coverage/ docs/release/1.2.0/onboarding/ docs/release/1.2.0/sbom/scanners/ docs/release/1.2.0/dx/
gh workflow list | grep -E "security|dev-up"
```

Report:
- Coverage delta (78.97 → ≥ 95 line; 70.98 → ≥ 90 branch; 79.84 →
  ≥ 95 function).
- External-reviewer dry-run elapsed time.
- Scanner CI run URL + critical/high CVE count + triage SLA status.
- Cold-start total time + host fingerprint.
