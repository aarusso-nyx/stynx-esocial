# A1 — Baseline and Decisions

> **Wave A (runtime foundation), step 1.** Coordinator scope. Blocks
> everything else in round 0.

## Read first

- [`../plan.md`](../plan.md) — round-0 closure target and worker waves.
- [`../assessment.md`](../assessment.md) — round-0 starting state.
- [`../../inv.md`](../../inv.md), [`../../diag.md`](../../diag.md),
  [`../../plan.md`](../../plan.md) — original assessment docs.

## Why this exists

Two of the four audit passes disagreed about whether the contract package is
already locked. The architecture doc and the active processor disagree on
who owns XML build. Two different schema sets are reported at different
points. Before any other worker touches code, we record what we believe is
true and force a single source of truth.

## Tasks

1. **Run the baseline preflight** and capture the output verbatim into
   `../evidence/A1-baseline.txt` (create the dir):
   ```text
   pwd
   git status --short --branch
   git log --oneline -10
   node --version
   npm --version
   npm test
   npm run lint
   npm run build
   npm run coverage
   npm run test:db
   npm run migrate:dev
   npm run integration:localstack
   npm run test:integration
   npm run cdk:synth
   ```
   Do not modify anything.
2. **Reconcile the contracts question.** Read
   `packages/contracts/src/kinds.ts`, `packages/contracts/src/index.ts`, and
   every payload file. Record in `../decisions.md`:
   - Exact list of `EsocialRelayEventClass` members.
   - Exact list of status values exported.
   - Whether `buildEsocialIdempotencyKey` exists and what fields it takes.
   - Whether per-envelope JSON Schemas exist.
   This determines whether prompt A3 expands or merely freezes the contract.
3. **Reconcile the schema question.** List every migration file under
   `infra/migrations/` and the relations each one creates. Record the
   actual relation set in `../decisions.md`. This determines whether A4
   adds many migrations or just a few.
4. **Resolve the architectural ambiguity.** Update `docs/architecture.md`
   to state explicitly: **eSocial accepts typed DTOs from SGP, builds XML,
   validates against XSD, signs, submits via SOAP, parses returns, and
   publishes status. SGP never sees XML.** Remove or rewrite any text that
   says SGP sends pre-signed envelopes. Cite this prompt in the change.
5. **Decide on `infra/cdk/cdk.out/*.json` commitment.** Record the choice
   in `../decisions.md`: either "committed templates with reproducibility
   check" or "regenerated, gitignored". Round-0 prompt C3 implements the
   choice.
6. **Restore a comprehensive `.gitignore`** if the current root file is the
   3-line minimal version. The set must cover: `node_modules/`, `dist/`,
   `coverage/`, `.nyc_output/`, `*.log`, `.env*`, IDE files, macOS files,
   `*.pem` / `*.key` / `*.crt` / `*.pfx` / `*.p12`, `infra/cdk/cdk.out/`
   (if the C3 decision says regenerated), `.localstack/`. Record the
   choice in `../decisions.md` so C3 stays consistent.

## Primary write scope

- `docs/work/round-0/decisions.md` (new)
- `docs/work/round-0/evidence/A1-baseline.txt` (new)
- `docs/architecture.md` (only the SGP/eSocial-ownership paragraph)
- `.gitignore`

## Do not touch

- Any file under `packages/`, `services/`, `infra/migrations/`, `tests/`,
  `scripts/`.
- The dirty worktree state at the assessment commit.

## Exit criteria

- `decisions.md` answers: contract surface (full or narrowed), schema state
  (which relations exist), CDK-output commitment policy, gitignore policy,
  and the eSocial XML-ownership architectural decision.
- `evidence/A1-baseline.txt` reproduces the preflight without redaction.
- `docs/architecture.md` says exactly one thing about XML ownership.
- `.gitignore` covers the categories above.
- No source code is modified.

## Verification

Re-run the preflight after the prompt; output must match the captured baseline.
