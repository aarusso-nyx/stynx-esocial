# A2 — Real-Endpoint Traffic Owner Sign-Off

> **Round-7 Batch A2.** Runs after A1 real endpoint round-trip.

## Authorization required

- ☐ Owner from [`../owners.md`](../owners.md) A2 row named (not TBD).
- ☐ Round 7 A1 evidence exists at
      `docs/release/1.3.0/qualification/<family>/`.
- ☐ Owner has reviewed the Round 7 A1 evidence (request hashes, response
      hashes, redacted CNPJs, regulatory codes).

If any checkbox is unchecked, the prompt does not start.

## Read first

- [`../plan.md`](../plan.md) — A2 closure-target row.
- R5 prompt `B1-threat-model.md` — original "owner sign-off for real
  endpoint traffic" finding.
- Round 7 A1 evidence under `docs/release/1.3.0/qualification/`.

## Tasks

1. **Authorization record** at
   `docs/release/1.3.0/authorizations/A2.md`:
   - Owner name + role (no "TBD").
   - Date signed.
   - List of Round 7 A1 evidence files reviewed, with their `sha256`
     hashes pinned.
   - Per-category statement: "I authorize real-endpoint traffic for
     <category> against <stage>." One row per category covered by
     Round 7 A1.
   - Roll-back conditions: under what observed signal the
     authorization is revoked (e.g., > N % rejected over M minutes,
     regulatory error category `regulatory:critical`, etc.).
2. **Cross-link** the threat-model row in
   `docs/security/threat-model.md` that flagged this gap; mark the
   row resolved with date + authorization-file path.
3. **Update `blocked-artifacts.json`**: flip the A2 entry from
   `resolved external item` to `resolved` with `resolved_at` + the
   authorization-file path.
4. **Notify**: post to `docs/release/1.3.0/round-5-status.md`
   "Deferred to R7" section that A2 closed.

## Primary write scope

- `docs/release/1.3.0/authorizations/A2.md`
- `docs/security/threat-model.md` (one row resolved)
- `docs/release/1.0.0/blocked-artifacts.json` (one entry resolved)
- `docs/release/1.3.0/round-5-status.md`

## Do not touch

- Round 7 A1 evidence (read-only here).
- C2 / C3 (separate prompts).

## Exit criteria

- Authorization file exists with all required fields.
- Threat-model row resolved.
- `blocked-artifacts.json` reflects resolution.
- Owner sign-off captured.

## Verification

```text
test -f docs/release/1.3.0/authorizations/A2.md
jq '.[] | select(.area | test("A2")) | .status' docs/release/1.0.0/blocked-artifacts.json
# expect: "resolved"
```

Report: owner name, Round 7 A1 evidence pinned (file count), categories
authorized, roll-back conditions documented.
