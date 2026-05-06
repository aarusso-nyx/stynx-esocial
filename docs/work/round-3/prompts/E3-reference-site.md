# E3 — Reference Site

> **Wave E.** Docs worker. Blocked by D5 (specs feed content).

## Read first

- [`../plan.md`](../plan.md) — closure item 16.
- D5 specs.
- E1 ADRs.

## Tasks

1. **Docusaurus 3** site under `docs-site/`:
   - **Event catalog**: one page per event class auto-generated
     from `docs/events.md`, JSON Schemas, golden XML examples.
   - **API reference**: OpenAPI rendered via `redocusaurus`;
     AsyncAPI rendered via the AsyncAPI React component.
   - **Runbooks**: `docs/operations.md` rehosted page-per-runbook.
   - **ADRs**: linked from a sidebar, latest-first.
   - **Onboarding**: E2 doc rendered as a guided tour.
   - **Release notes**: contracts + service CHANGELOGs.
2. **Auto-generation**:
   - Build pipeline runs `npm run docs:build` → static site under
     `docs-site/build/`.
   - CI fails if any auto-generated page is stale (re-run
     reproducibility check).
3. **Hosting**:
   - GitHub Pages or S3 + CloudFront.
   - Preview deployment per PR (Netlify or Vercel preview).
   - Versioned: 1.0 (current), 1.1 (next), main (latest).
4. **Search**: Algolia DocSearch (free for OSS) or local lunr index.
5. **Style**: dark + light theme, accessible, no PII / live-data
   embeds.

## Primary write scope

- `docs-site/**` (new)
- `scripts/build-docs.mjs`
- `.github/workflows/docs.yml`
- `docs/operations.md` — docs publishing

## Do not touch

- Source docs (E3 generates; E1/E2/D5 own the sources).

## Exit criteria

- Site builds; deploys to a stable URL.
- Event catalog covers all 39 classes.
- API reference renders OpenAPI + AsyncAPI.
- Per-PR preview works.
- Re-build idempotent (CI verifies).

## Verification

```text
npm run docs:build
http-server docs-site/build
# expect: full site
```

Report: pages generated, search corpus size, build time, hosting
URL.
