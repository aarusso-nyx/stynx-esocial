# D1 — Reference Site (Docusaurus)

> **Wave D.** Docs. Parallel with D2, A, B, C.

## Read first

- [`../plan.md`](../plan.md) — closure item 11.
- Round-3 prompt `E3-reference-site.md` (the design lives there).
- Existing OpenAPI / AsyncAPI specs (R3 D5).
- ADRs (R4 C2).
- Onboarding (R4 C3).

## Tasks

1. **Docusaurus 3** site under `docs-site/`:
   - **Event catalog** auto-generated from `docs/events.md`,
     `packages/contracts/schemas/v1/`, `docs/templates/golden/`.
   - **API reference**: `redocusaurus` for OpenAPI 3.1; AsyncAPI
     React component for AsyncAPI 3.0.
   - **Runbooks**: `docs/operations.md` rehosted page-per-runbook.
   - **ADRs**: linked from sidebar, latest-first.
   - **Onboarding**: R4 C3 doc as a guided tour.
   - **Release notes**: contracts + service CHANGELOGs.
   - **Compliance**: B1 threat model, B2 DPIA, B3 SOC 2 matrix
     (rendered, not raw).
2. **Auto-generation**:
   - `npm run docs:build` produces a static site at
     `docs-site/build/`.
   - CI verifies re-build idempotency.
3. **Hosting**:
   - GitHub Pages or S3 + CloudFront (decision in ADR — coordinate
     with R4 C2).
   - Per-PR preview deployment (Netlify or Vercel free tier).
   - Versioned: 1.0, 1.1, 1.2, main.
4. **Search**: Algolia DocSearch (free OSS) or local lunr index.
5. **Style**: dark + light, accessible, no PII / live-data embeds.

## Primary write scope

- `docs-site/**` (new)
- `scripts/build-docs.mjs`
- `.github/workflows/docs.yml`
- `docs/operations.md` — docs publishing section
- `docs/release/1.2.0/docs-site/`

## Do not touch

- Source docs (D1 generates; R4 C1/C2/C3 + R3 D5 own the sources).

## Exit criteria

- Site builds; deploys to a stable URL.
- Event catalog covers all 35 non-return classes.
- API reference renders OpenAPI + AsyncAPI.
- Per-PR preview works.
- Re-build idempotent.

## Verification

```text
npm run docs:build
http-server docs-site/build
```

Report: pages generated, search corpus size, build time, hosting URL.
