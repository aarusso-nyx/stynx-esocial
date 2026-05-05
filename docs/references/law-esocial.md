# FACTS-01-LAW-ESOCIAL — eSocial, EFD-Reinf, DCTFWeb and MIT

**Status:** authoritative | **Scope:** regulatory developer facts and semantic contracts | **Last reviewed:** 2026-05-03

This document is the engineering authority for translating the referenced legal and regulatory material into developer-facing facts and acceptance contracts. Raw retained source text lives under `docs/refs/esocial/law/`; topic reference notes remain under `docs/refs/esocial/`.

## Source Index

| Marker | Primary source                                                                                                                                |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [1]    | https://www.gov.br/esocial/pt-br/documentacao-tecnica/manuais/mos-s-1-3-consolidada-ate-a-no-s-1-3-08-2026.pdf                                |
| [2]    | https://www.gov.br/esocial/pt-br/documentacao-tecnica/leiautes-esocial-versao-s-1-3-nt-06-2026/tabelas.html                                   |
| [3]    | https://www.gov.br/esocial/pt-br/acesso-ao-sistema/ambiente-de-producao-restrita/ambiente-de-producao-restrita                                |
| [4]    | https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/DCTFWeb                                   |
| [5]    | https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/declaracoes-e-demonstrativos/DCTFWeb/arquivos/manual-mit-1-0-14-02.pdf |
| [6]    | https://www.gov.br/esocial/pt-br/noticias/receita-federal/publicada-nova-versao-do-manual-de-orientacao-da-efd-reinf-2013-versao-1.5          |

## Developer Facts

| ID      | Fact                                                                                                                     | Developer consequence                                                                                                                                     | Sources  |
| ------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| ESO-F01 | eSocial events are versioned XML events governed by MOS, leiautes, tables, XSDs, and validation rules.                   | Event builders must be version-bound and schema-bound; event payloads cannot be treated as generic JSON.                                                  | [1], [2] |
| ESO-F02 | Table events establish domain codes used by later non-periodic and periodic events.                                      | Builders must validate table-code existence and effective dates before generating dependent events.                                                       | [1], [2] |
| ESO-F03 | Non-periodic events carry worker lifecycle, changes, SST, termination, reinstatement, TSVE and public-beneficiary facts. | Domain changes must map to explicit event families and preserve event-causing dates separately from processing dates.                                     | [1]      |
| ESO-F04 | Periodic events, closing, reopening and totalizers form the monthly payroll/fiscal cycle.                                | A monthly close workflow must gate finalization on accepted events and must store totalizer returns.                                                      | [1]      |
| ESO-F05 | Production-restricted environment is the official testing surface.                                                       | External integration tests must distinguish sandbox/prod-restricted/prod endpoint and certificate configuration.                                          | [3]      |
| ESO-F06 | DCTFWeb consolidates accepted eSocial and related fiscal totalizers for declaration and payment workflow.                | DCTFWeb generation must depend on accepted upstream totalizers and preserve receipt, competence and declaration type.                                     | [4]      |
| ESO-F07 | MIT covers inclusion of tax debts in the DCTFWeb flow under the Receita Federal manual.                                  | MIT import/export must carry establishment identifier, tax code, period, base, amount, CSLL adicional when present, due date and stable debt identifiers. | [5]      |
| ESO-F08 | EFD-Reinf handles fiscal events that complement eSocial and feed DCTFWeb.                                                | Split ownership between worker payroll events and non-payroll retention events; never duplicate a tax fact in both streams.                               | [6]      |

## Semantic Contracts

| Contract                          | Rule                                                                                                                                   | Observable acceptance                                                                                                         | Sources  |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------- |
| ESO-C01-versioned-builder         | Every event builder MUST declare the leiaute version, event code, XML root, XSD binding, and table-version dependency.                 | Static tests enumerate builders and fail on missing version/event/XSD metadata.                                               | [1], [2] |
| ESO-C02-schema-before-submit      | No event may be signed or transmitted before local schema validation succeeds.                                                         | Tests feed invalid required fields, invalid enum values, and malformed dates and assert validation blocks signing/submission. | [1], [2] |
| ESO-C03-idempotent-event-key      | Event generation MUST be idempotent for the same legal fact and competence unless a rectification or exclusion fact is explicit.       | Re-running generation for unchanged input returns the existing pending/sent event instead of creating duplicates.             | [1]      |
| ESO-C04-environment-bound-routing | Submission endpoints MUST be selected by explicit environment, with production-restricted separated from production.                   | Configuration tests prove prod credentials cannot be used by sandbox/prod-restricted jobs by default.                         | [3]      |
| ESO-C05-closing-gate              | Monthly closing MUST require accepted periodic events or explicit no-movement semantics before final totalizer-dependent declarations. | End-to-end tests reject declaration generation when S-1299 or required totalizers are absent or not accepted.                 | [1], [4] |
| ESO-C06-dctfweb-totalizer-source  | DCTFWeb items MUST retain source totalizer identifiers and receipt/protocol evidence.                                                  | Generated declarations can be traced back to accepted S-5011, S-5012, S-5013, Reinf totalizer, or MIT item.                   | [4], [5] |
| ESO-C07-xml-security              | XML parsing and signing MUST disable unsafe XML expansion and must preserve canonical signed bytes for hash/audit evidence.            | Security tests cover XXE payload rejection and hash equality between signed and transmitted XML bytes.                        | [1]      |
