# Contributing

## Commits And Done Criteria

Keep changes scoped to the owning package or service, run the repository gates
that match the touched surface, and do not commit secrets, real certificates,
production payloads, or production personal data. Public contract changes must
include source, generated artifacts, tests, documentation, and consumer notes
in the same change.

Architecture Decision Records live under `docs/adrs/` and use
`docs/adrs/0000-template.md` as the convention. New or changed ADRs must record
an explicit status (`Accepted`, `Superseded`, `Deprecated`, or `Proposed`) and
update `docs/adrs/README.md` in the same change.

Pull requests that touch `packages/contracts/src/**` must also update
`packages/contracts/CHANGELOG.md`. The `contracts-changelog` CI job enforces
that rule by diffing the PR base and head. Refactor-only PRs may opt out with
the `skip-contract-changelog` label; that label should be reserved for changes
that do not alter the published contract surface.

Dependency review runs on every PR into `main`. High-severity CVEs fail the PR,
and AGPL-1.0 or AGPL-3.0 additions are blocked at policy level.
