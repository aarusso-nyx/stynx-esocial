# Manual Entry Import XLSX Golden v01

Structural byte-stable golden for F-FOL-007, the manual payroll entry importer.
The XLSX is intentionally small: one header row and one fictitious accepted row
for `POST /api/v1/folhas/:folha_id/importar/lancamento-manual`.

The binary is deterministic OOXML: fixed ZIP entry order, no timestamps,
uncompressed XML parts, and inline string cells. Regenerate only for an
intentional importer contract change, then update `expected.xlsx`,
`expected.sha256`, and `input.json` together.

This fixture does not claim legacy-template byte parity because no legacy XLSX
template artifact is stored in the repository.
