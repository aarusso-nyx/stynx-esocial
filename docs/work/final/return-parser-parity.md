# Return Parser Parity Audit

Audit subject: `packages/domain/src/returns/parsers.ts` and `tests/returns/`.

| Event | Happy-path test | Malformed-XML test |
| --- | --- | --- |
| S-5001 | `tests/returns/return-parser.test.mjs` covers `s5001-totalizer.golden.xml` | `tests/returns/s5001-malformed.test.mjs` |
| S-5002 | `tests/returns/return-parser.test.mjs` covers `s5002-totalizer.golden.xml` | `tests/returns/s5002-malformed.test.mjs` |
| S-5011 | `tests/returns/return-parser.test.mjs` covers `s5011-totalizer.golden.xml` | `tests/returns/s5011-malformed.test.mjs` |
| S-5012 | `tests/returns/return-parser.test.mjs` covers `s5012-totalizer.golden.xml` | `tests/returns/s5012-malformed.test.mjs` |
| S-5013 | `tests/returns/return-parser.test.mjs` covers `s5013-totalizer.golden.xml` | `tests/returns/s5013-malformed.test.mjs` |

Gaps closed in this pass: malformed XML tests were missing for all five
S-50xx totalizer parsers. Each new test truncates the committed golden XML and
asserts `parseTotalizerXml()` rejects it before producing a parsed totalizer.
