# Mutation Testing Decision

Decision: full coverage, uniform 80 percent mutation score.

Round 6 keeps the Round 5 decision: `packages/domain` and `packages/pki-pades`
must reach an 80 percent mutation score on the active builder, return,
submission, transport, redaction, and PKI surfaces. No tiered threshold is
accepted.

Current evidence remains below target: `docs/release/1.2.0/mutation/summary.json`
records 0 percent score, 3902 survivors, and 2218 compile/runtime errors from
the existing full run. The first executable task is still Stryker compile
cleanup, followed by semantic tests that kill reachable survivors.
