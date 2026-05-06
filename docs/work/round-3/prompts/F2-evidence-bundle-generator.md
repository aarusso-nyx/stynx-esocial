# F2 — Evidence-Bundle Generator

> **Wave F.** Release worker. Parallel with F1; F3 last.

## Read first

- [`../plan.md`](../plan.md) — closure item 19.
- Round-0 / round-1 evidence bundle layouts (`docs/release/0.1.0/`,
  `0.2.0/`).
- All round-3 prompts — each declares an artifact target under
  `docs/release/1.0.0/<area>/`.

## Tasks

1. **`scripts/release-evidence.mjs`** that, given a version:
   - Collects every required artifact (coverage, mutation, perf,
     chaos, DR, multi-region, threat model, pen test, LGPD,
     SOC 2, cert rotation, secrets rotation, SBOM, audit anchor,
     SDK, operator console, canary, OpenAPI, AsyncAPI, ADRs,
     docs build).
   - Writes a single `evidence-manifest.json` with: artifact path,
     hash, source commit, generation timestamp.
   - Validates that every closure-target item points at an
     artifact in the manifest; missing artifacts → script fails.
2. **CI integration**:
   - On a release tag, the script runs and uploads the bundle as
     a release artifact.
   - On `main` push, runs in dry-run mode and posts the would-be
     manifest to a `docs/release/<next>/` directory marked
     "preview".
3. **Reproducibility check**:
   - Running the script twice produces the same manifest hash.
   - CI gates on reproducibility.
4. **Round-3 closing run**: produces `docs/release/1.0.0/`
   end-to-end; archives the bundle alongside the GitHub Release.

## Primary write scope

- `scripts/release-evidence.mjs`
- `.github/workflows/release.yml` (extension)
- `docs/release/1.0.0/evidence-manifest.json`
- `docs/operations.md` — release-evidence runbook

## Do not touch

- Per-area artifact contents (each round-3 prompt owns its own
  artifact). F2 only collects.

## Exit criteria

- Generator script ships and runs reproducibly.
- 1.0.0 manifest covers every closure-target item.
- CI gate live.

## Verification

```text
node scripts/release-evidence.mjs --version 1.0.0
node scripts/release-evidence.mjs --version 1.0.0  # second run
diff <(jq -S . docs/release/1.0.0/evidence-manifest.json) <(jq -S . docs/release/1.0.0/evidence-manifest.json)
```

Report: artifacts indexed, manifest size, reproducibility check
result, gaps surfaced.
