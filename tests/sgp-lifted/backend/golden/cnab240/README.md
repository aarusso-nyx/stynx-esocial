# CNAB 240 Golden Fixtures

These fixtures pin the byte-level output of CNAB 240 emission for the five supported bank strategies. Each bank directory contains:

- input.json: deterministic Cnab240BuildInput data. Tests parse generatedAt as a Date before calling the builder.
- expected.rem: exact ASCII CNAB 240 flat-file bytes, 240 bytes per record, with no line separators.

Downstream return fixtures should reuse this shape: one bank-named directory per strategy, input.json for the deterministic scenario, and expected.\* for the exact flat-file bytes under test. Keep generatedAt, paymentDate, remittanceNumber, company fields, and sample payment ordering stable unless the layout contract intentionally changes.

Retorno fixtures live under return/{bb,bradesco,caixa,itau,santander}/ and contain:

- input.json: expected parser output for every supported occurrence code for that bank.
- expected.ret: exact ASCII CNAB 240 retorno bytes, 240 bytes per record, with no line separators.
